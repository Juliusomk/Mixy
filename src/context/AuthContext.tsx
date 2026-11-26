import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { apiFetch } from '../lib/api';
import {
  auth,
  db,
  generateId,
  handleFirestoreError,
  OperationType,
  testConnection,
} from '../lib/firebase';
import { setHapticsEnabled, setReducedMotionPreference } from '../lib/haptics';
import { realtimeClient } from '../lib/realtime';
import type {
  AccentColor,
  AppTheme,
  FontSizePref,
  NotificationItem,
  RepostItem,
  UserPrivate,
  UserPublic,
  VerificationType,
} from '../types/mixy';

interface VerificationInfo {
  isVerified: boolean;
  verificationType: VerificationType | null;
}

interface AuthContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  userPublic: UserPublic | null;
  userPrivate: UserPrivate | null;
  usersById: Map<string, UserPublic>;
  usersByUsername: Map<string, UserPublic>;
  getVerificationInfo: (uid?: string | null, fallbackVerified?: boolean) => VerificationInfo;
  needsProfileSetup: boolean;
  needsEmailVerification: boolean;
  isAdmin: boolean;
  followingIds: Set<string>;
  pendingFollowIds: Set<string>;
  repostedKeys: Set<string>;
  savedIds: Map<string, string | undefined>;
  unreadNotifications: number;
  onlineUsers: Record<string, boolean>;
  lastSeenUsers: Record<string, string>;
  sessionId: string;
  // Sleep Mode & Digital Wellness
  isSleeping: boolean;
  enableSleepMode: () => Promise<void>;
  wakeUpSleepMode: () => Promise<void>;
  dailyUsageMinutes: number;
  screenTimeAlertDue: boolean;
  dismissScreenTimeAlert: () => void;
  refreshVerification: () => Promise<boolean>;
  logout: () => Promise<void>;
  sendActivityNotification: (params: {
    recipientId: string;
    type: NotificationItem['type'];
    targetId?: string;
    text: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = 'mixy_session_id';
const APPEARANCE_CACHE_KEY = 'mixy_appearance_cache';

export function cacheAppearanceLocally(
  theme: AppTheme,
  accent: AccentColor,
  fontSize: FontSizePref
): void {
  try {
    localStorage.setItem(
      APPEARANCE_CACHE_KEY,
      JSON.stringify({ theme, accent, fontSize })
    );
  } catch {
    // ignore storage errors
  }
}

function readCachedAppearance(): {
  theme: AppTheme;
  accent: AccentColor;
  fontSize: FontSizePref;
} {
  try {
    const raw = localStorage.getItem(APPEARANCE_CACHE_KEY);
    if (!raw) return { theme: 'light', accent: 'fuchsia', fontSize: 'md' };
    const parsed = JSON.parse(raw) as Partial<{
      theme: AppTheme;
      accent: AccentColor;
      fontSize: FontSizePref;
    }>;
    return {
      theme: parsed.theme || 'light',
      accent: parsed.accent || 'fuchsia',
      fontSize: parsed.fontSize || 'md',
    };
  } catch {
    return { theme: 'light', accent: 'fuchsia', fontSize: 'md' };
  }
}

function getOrCreateSessionId(): string {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = generateId('sess');
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

function getDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/i.test(ua)) return 'iOS Safari / Mobile';
  if (/Android/i.test(ua)) return 'Android Mobile Browser';
  if (/Mac/i.test(ua)) return 'macOS Desktop';
  if (/Windows/i.test(ua)) return 'Windows Desktop';
  if (/Linux/i.test(ua)) return 'Linux Desktop';
  return 'Web Browser';
}

function getTodayUsageKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `mixy_usage_${y}-${m}-${day}`;
}

function isWithinScheduleWindow(startHHMM?: string, endHHMM?: string): boolean {
  if (!startHHMM || !endHHMM) return false;
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) {
    return false;
  }
  const now = new Date();
  const curMin = now.getHours() * 60 + now.getMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return curMin >= startMin && curMin < endMin;
  }
  // Overnight window e.g. 22:30 -> 07:00
  return curMin >= startMin || curMin < endMin;
}

export function applyAppearanceToDom(
  theme: AppTheme = 'light',
  accent: AccentColor = 'fuchsia',
  fontSize: FontSizePref = 'md'
): void {
  const html = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldDark = theme === 'dark' || (theme === 'system' && prefersDark);
  html.classList.toggle('dark', shouldDark);
  html.setAttribute('data-accent', accent);
  html.setAttribute('data-font-size', fontSize);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userPublic, setUserPublic] = useState<UserPublic | null>(null);
  const [userPrivate, setUserPrivate] = useState<UserPrivate | null>(null);
  const [usersById, setUsersById] = useState<Map<string, UserPublic>>(new Map());
  const [usersByUsername, setUsersByUsername] = useState<Map<string, UserPublic>>(new Map());
  const [profileChecked, setProfileChecked] = useState(false);
  const [isAdminDoc, setIsAdminDoc] = useState(false);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [pendingFollowIds, setPendingFollowIds] = useState<Set<string>>(new Set());
  const [repostedKeys, setRepostedKeys] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Map<string, string | undefined>>(new Map());
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [lastSeenUsers, setLastSeenUsers] = useState<Record<string, string>>({});
  const [sessionId] = useState<string>(() => getOrCreateSessionId());

  const userPublicRef = useRef<UserPublic | null>(null);
  const healingFollowingRef = useRef(false);
  const bootstrappingPrivateRef = useRef(false);

  // Sleep Mode & Digital Wellness state
  const [scheduleActive, setScheduleActive] = useState(false);
  const [scheduleDismissed, setScheduleDismissed] = useState(false);
  const [dailyUsageMinutes, setDailyUsageMinutes] = useState<number>(() => {
    const raw = localStorage.getItem(getTodayUsageKey());
    return raw ? Math.max(0, Number.parseInt(raw, 10) || 0) : 1;
  });
  const [screenTimeAlertDue, setScreenTimeAlertDue] = useState(false);

  useEffect(() => {
    void testConnection();
    const cached = readCachedAppearance();
    applyAppearanceToDom(cached.theme, cached.accent, cached.fontSize);
  }, []);

  // Re-apply system color scheme live when theme === 'system'
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if ((userPrivate?.theme || 'light') === 'system') {
        applyAppearanceToDom(
          'system',
          userPrivate?.accentColor || 'fuchsia',
          userPrivate?.fontSize || 'md'
        );
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [userPrivate?.theme, userPrivate?.accentColor, userPrivate?.fontSize]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        userPublicRef.current = null;
        setUserPublic(null);
        setUserPrivate(null);
        setUsersById(new Map());
        setUsersByUsername(new Map());
        setProfileChecked(true);
        setIsAdminDoc(false);
        setFollowingIds(new Set());
        setPendingFollowIds(new Set());
        setRepostedKeys(new Set());
        setSavedIds(new Map());
        setUnreadNotifications(0);
        try {
          localStorage.removeItem(APPEARANCE_CACHE_KEY);
        } catch {
          // ignore
        }
        applyAppearanceToDom('light', 'fuchsia', 'md');
        realtimeClient.disconnect();
      } else {
        setProfileChecked(false);
      }
    });
    return () => unsubAuth();
  }, []);

  // Subscribe to WebSocket presence
  useEffect(() => {
    return realtimeClient.onPresence((online, lastSeen) => {
      setOnlineUsers(online);
      setLastSeenUsers(lastSeen);
    });
  }, []);

  // Subscribe to user profile, private settings, follows, reposts, savedPosts, and unread notifications
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const uid = firebaseUser.uid;
    bootstrappingPrivateRef.current = false;

    const unsubPublic = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserPublic;
          userPublicRef.current = data;
          setUserPublic(data);
          const visible = data.showOnlineStatus !== false && data.sleepModeActive !== true;
          void realtimeClient.connect(visible);
          if (firebaseUser.emailVerified && firebaseUser.email) {
            void firebaseUser.getIdToken().then((token) =>
              apiFetch('/api/auth/register-username', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ username: data.username }),
              }).catch(() => {})
            );
          }
        } else {
          userPublicRef.current = null;
          setUserPublic(null);
        }
        setProfileChecked(true);
      },
      (error) => {
        setProfileChecked(true);
        handleFirestoreError(error, OperationType.GET, `users/${uid}`);
      }
    );

    const unsubPrivate = onSnapshot(
      doc(db, 'users', uid, 'private', 'info'),
      (snap) => {
        if (snap.exists()) {
          const priv = snap.data() as UserPrivate;
          setUserPrivate(priv);
          const theme = priv.theme || 'light';
          const accent = priv.accentColor || 'fuchsia';
          const fontSize = priv.fontSize || 'md';
          cacheAppearanceLocally(theme, accent, fontSize);
          applyAppearanceToDom(theme, accent, fontSize);
          setReducedMotionPreference(Boolean(priv.reducedMotionEnabled));
          setHapticsEnabled(priv.hapticsEnabled !== false);
        } else {
          setUserPrivate(null);
          applyAppearanceToDom('light', 'fuchsia', 'md');
          setReducedMotionPreference(false);
          setHapticsEnabled(true);
          if (firebaseUser.emailVerified && !bootstrappingPrivateRef.current) {
            bootstrappingPrivateRef.current = true;
            void setDoc(
              doc(db, 'users', uid, 'private', 'info'),
              {
                uid,
                email: firebaseUser.email || '',
                theme: 'light',
                accentColor: 'fuchsia',
                fontSize: 'md',
                blockedIds: [],
                restrictedIds: [],
                mutedIds: [],
                hiddenWords: [],
                closeFriendsIds: [],
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            ).catch(() => {
              bootstrappingPrivateRef.current = false;
            });
          }
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${uid}/private/info`)
    );

    const unsubAdmin = onSnapshot(
      doc(db, 'admins', uid),
      (snap) => setIsAdminDoc(snap.exists()),
      () => setIsAdminDoc(false)
    );

    const unsubFollows = onSnapshot(
      query(collection(db, 'follows'), where('followerId', '==', uid)),
      (snap) => {
        const nextActive = new Set<string>();
        const nextPending = new Set<string>();
        snap.forEach((d) => {
          const edge = d.data() as { targetId: string; status: string };
          if (edge.status === 'active') nextActive.add(edge.targetId);
          else if (edge.status === 'pending') nextPending.add(edge.targetId);
        });
        setFollowingIds(nextActive);
        setPendingFollowIds(nextPending);

        // Self-heal follower's followingCount if a private account accepted our pending request
        const currentPub = userPublicRef.current;
        if (
          firebaseUser.emailVerified &&
          currentPub &&
          nextActive.size > (currentPub.followingCount || 0) &&
          !healingFollowingRef.current
        ) {
          healingFollowingRef.current = true;
          void updateDoc(doc(db, 'users', uid), {
            followingCount: increment(1),
            updatedAt: serverTimestamp(),
          })
            .catch(() => {})
            .finally(() => {
              healingFollowingRef.current = false;
            });
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'follows')
    );

    const unsubReposts = onSnapshot(
      query(collection(db, 'reposts'), where('userId', '==', uid)),
      (snap) => {
        const next = new Set<string>();
        snap.forEach((d) => {
          const rp = d.data() as RepostItem;
          next.add(`${rp.targetType}_${rp.targetId}`);
        });
        setRepostedKeys(next);
      },
      () => {}
    );

    const unsubSaved = onSnapshot(
      query(collection(db, 'users', uid, 'savedPosts'), where('ownerId', '==', uid)),
      (snap) => {
        const next = new Map<string, string | undefined>();
        snap.forEach((d) => {
          const s = d.data() as { itemId: string; collectionId?: string };
          next.set(s.itemId, s.collectionId);
        });
        setSavedIds(next);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/savedPosts`)
    );

    const unsubNotifs = onSnapshot(
      query(collection(db, 'notifications'), where('recipientId', '==', uid)),
      (snap) => {
        let count = 0;
        snap.forEach((d) => {
          if (!(d.data() as NotificationItem).isRead) count += 1;
        });
        setUnreadNotifications(count);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'notifications')
    );

    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), where('isDeactivated', '==', false)),
      (snap) => {
        const byId = new Map<string, UserPublic>();
        const byUsername = new Map<string, UserPublic>();
        snap.forEach((d) => {
          const u = d.data() as UserPublic;
          byId.set(u.uid, u);
          if (u.usernameLower) {
            byUsername.set(u.usernameLower, u);
          } else if (u.username) {
            byUsername.set(u.username.toLowerCase(), u);
          }
        });
        setUsersById(byId);
        setUsersByUsername(byUsername);
      },
      () => {}
    );

    return () => {
      unsubPublic();
      unsubPrivate();
      unsubAdmin();
      unsubFollows();
      unsubReposts();
      unsubSaved();
      unsubNotifs();
      unsubUsers();
    };
  }, [authReady, firebaseUser]);

  // Also self-heal followingCount if userPublic loads after unsubFollows
  useEffect(() => {
    if (!firebaseUser?.emailVerified || !userPublic || healingFollowingRef.current) return;
    if (followingIds.size > (userPublic.followingCount || 0)) {
      healingFollowingRef.current = true;
      void updateDoc(doc(db, 'users', firebaseUser.uid), {
        followingCount: increment(1),
        updatedAt: serverTimestamp(),
      })
        .catch(() => {})
        .finally(() => {
          healingFollowingRef.current = false;
        });
    }
  }, [firebaseUser, userPublic, followingIds]);

  // Sleep schedule check every 30s
  useEffect(() => {
    const check = () => {
      if (userPrivate?.sleepScheduleEnabled) {
        const inWindow = isWithinScheduleWindow(
          userPrivate.sleepStart || '22:30',
          userPrivate.sleepEnd || '07:00'
        );
        setScheduleActive(inWindow);
        if (!inWindow) setScheduleDismissed(false);
      } else {
        setScheduleActive(false);
        setScheduleDismissed(false);
      }
    };
    check();
    const t = window.setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [userPrivate?.sleepScheduleEnabled, userPrivate?.sleepStart, userPrivate?.sleepEnd]);

  const isSleeping = Boolean(
    userPrivate?.sleepModeEnabled ||
      userPrivate?.quietModeEnabled ||
      (scheduleActive && !scheduleDismissed)
  );

  // Sync sleepModeActive & WebSocket online visibility when Sleep state changes
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || !userPublic) return;
    const visible = userPublic.showOnlineStatus !== false && !isSleeping;
    realtimeClient.updateVisibility(visible);
    if (Boolean(userPublic.sleepModeActive) !== isSleeping) {
      void updateDoc(doc(db, 'users', firebaseUser.uid), {
        sleepModeActive: isSleeping,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  }, [isSleeping, firebaseUser, userPublic]);

  // Real client-tracked active daily screen time + gentle break reminder
  useEffect(() => {
    if (!firebaseUser || !userPublic) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const key = getTodayUsageKey();
      const prev = Number.parseInt(localStorage.getItem(key) || '0', 10) || 0;
      const next = prev + 1;
      localStorage.setItem(key, String(next));
      setDailyUsageMinutes(next);
      const limit = userPrivate?.screenTimeReminderMin || 0;
      if (limit > 0 && next > 0 && next % limit === 0) {
        setScreenTimeAlertDue(true);
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [firebaseUser, userPublic, userPrivate?.screenTimeReminderMin]);

  const enableSleepMode = useCallback(async () => {
    if (!firebaseUser) return;
    setScheduleDismissed(false);
    await setDoc(
      doc(db, 'users', firebaseUser.uid, 'private', 'info'),
      {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        sleepModeEnabled: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [firebaseUser]);

  const wakeUpSleepMode = useCallback(async () => {
    if (!firebaseUser) return;
    setScheduleDismissed(true);
    await setDoc(
      doc(db, 'users', firebaseUser.uid, 'private', 'info'),
      {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        sleepModeEnabled: false,
        quietModeEnabled: false,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [firebaseUser]);

  const dismissScreenTimeAlert = useCallback(() => {
    setScreenTimeAlertDue(false);
  }, []);

  // Register active session heartbeat once profile exists and email is verified
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || !userPublic) return;
    const uid = firebaseUser.uid;
    const sessRef = doc(db, 'users', uid, 'sessions', sessionId);
    void (async () => {
      try {
        const snap = await getDoc(sessRef);
        if (!snap.exists()) {
          await setDoc(sessRef, {
            id: sessionId,
            ownerId: uid,
            device: getDeviceLabel(),
            isActive: true,
            lastActiveAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          });
        } else {
          await updateDoc(sessRef, {
            isActive: true,
            lastActiveAt: serverTimestamp(),
          });
        }
      } catch {
        // Non-blocking session telemetry
      }
    })();
  }, [firebaseUser, userPublic, sessionId]);

  const refreshVerification = useCallback(async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    setFirebaseUser({ ...auth.currentUser } as User);
    return auth.currentUser.emailVerified;
  }, []);

  const logout = useCallback(async () => {
    if (firebaseUser && firebaseUser.emailVerified) {
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid, 'sessions', sessionId), {
          isActive: false,
          lastActiveAt: serverTimestamp(),
        });
      } catch {
        // ignore if already logged out
      }
    }
    realtimeClient.disconnect();
    await signOut(auth);
  }, [firebaseUser, sessionId]);

  const sendActivityNotification = useCallback(
    async ({
      recipientId,
      type,
      targetId,
      text,
    }: {
      recipientId: string;
      type: NotificationItem['type'];
      targetId?: string;
      text: string;
    }) => {
      if (!firebaseUser || !userPublic || recipientId === firebaseUser.uid) return;
      const nid = generateId('ntf');
      try {
        const batch = writeBatch(db);
        const payload: Record<string, unknown> = {
          id: nid,
          recipientId,
          actorId: firebaseUser.uid,
          actorUsername: userPublic.username,
          actorPhotoURL: userPublic.photoURL || '',
          type,
          text: text.slice(0, 300),
          isRead: false,
          createdAt: serverTimestamp(),
        };
        if (targetId) payload.targetId = targetId;
        batch.set(doc(db, 'notifications', nid), payload);
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `notifications/${nid}`);
      }
    },
    [firebaseUser, userPublic]
  );

  const needsEmailVerification = Boolean(firebaseUser && !firebaseUser.emailVerified);
  const needsProfileSetup = Boolean(
    firebaseUser && firebaseUser.emailVerified && profileChecked && !userPublic
  );
  const isAdmin = Boolean(
    firebaseUser?.emailVerified &&
      (isAdminDoc ||
        userPublic?.role === 'admin' ||
        firebaseUser.email === 'juliusomukuba7@gmail.com')
  );

  const getVerificationInfo = useCallback(
    (uid?: string | null, fallbackVerified = false): VerificationInfo => {
      if (uid) {
        if (userPublic?.uid === uid) {
          return {
            isVerified: Boolean(userPublic.isVerified),
            verificationType: userPublic.verificationType ?? null,
          };
        }
        const liveUser = usersById.get(uid);
        if (liveUser) {
          return {
            isVerified: Boolean(liveUser.isVerified),
            verificationType: liveUser.verificationType ?? null,
          };
        }
      }
      return {
        isVerified: Boolean(fallbackVerified),
        verificationType: null,
      };
    },
    [userPublic, usersById]
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        authReady,
        userPublic,
        userPrivate,
        usersById,
        usersByUsername,
        getVerificationInfo,
        needsProfileSetup,
        needsEmailVerification,
        isAdmin,
        followingIds,
        pendingFollowIds,
        repostedKeys,
        savedIds,
        unreadNotifications,
        onlineUsers,
        lastSeenUsers,
        sessionId,
        isSleeping,
        enableSleepMode,
        wakeUpSleepMode,
        dailyUsageMinutes,
        screenTimeAlertDue,
        dismissScreenTimeAlert,
        refreshVerification,
        logout,
        sendActivityNotification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
