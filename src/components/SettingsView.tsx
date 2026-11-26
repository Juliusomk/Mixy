import React, { useEffect, useState } from 'react';
import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Archive,
  Bell,
  Bookmark,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  FolderPlus,
  Heart,
  HelpCircle,
  KeyRound,
  Layers,
  Lock,
  Moon,
  Palette,
  Phone,
  RotateCcw,
  Shield,
  Sparkles,
  Sun,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import {
  applyAppearanceToDom,
  cacheAppearanceLocally,
  useAuth,
} from '../context/AuthContext';
import {
  auth,
  BLUEPRINT_LIMITS,
  db,
  formatRelativeTime,
  generateId,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  setHapticsEnabled,
  setReducedMotionPreference,
  triggerHaptic,
} from '../lib/haptics';
import { realtimeClient } from '../lib/realtime';
import { submitReport } from '../lib/socialActions';
import type {
  AccentColor,
  AppTheme,
  DmWhoCanMessage,
  FontSizePref,
  Post,
  SavedCollection,
  SessionActivity,
  Story,
  StoryVisibility,
  UserPrivate,
  UserPublic,
} from '../types/mixy';
import { SettingsStarIntro } from './SettingsStarIntro';

export type SettingsSectionId =
  | 'account'
  | 'privacy'
  | 'security'
  | 'notifications'
  | 'appearance'
  | 'sleep'
  | 'wellness'
  | 'content'
  | 'support';

export function SettingsView({
  initialSection = 'account',
  onOpenCloseFriends,
}: {
  initialSection?: SettingsSectionId;
  onOpenCloseFriends?: () => void;
}) {
  const {
    firebaseUser,
    userPublic,
    userPrivate,
    sessionId,
    savedIds,
    logout,
    isSleeping,
    enableSleepMode,
    wakeUpSleepMode,
    dailyUsageMinutes,
  } = useAuth();
  const [section, setSection] = useState<SettingsSectionId>(initialSection);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Account fields
  const [displayName, setDisplayName] = useState(userPublic?.displayName || '');
  const [username, setUsername] = useState(userPublic?.username || '');
  const [phone, setPhone] = useState(userPrivate?.phone || '');
  const [dob, setDob] = useState(userPrivate?.dob || '');
  const [newEmail, setNewEmail] = useState(userPrivate?.email || firebaseUser?.email || '');

  // Password change
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showPw, setShowPw] = useState(false);

  // Content & Sessions
  const [sessions, setSessions] = useState<SessionActivity[]>([]);
  const [archivedPosts, setArchivedPosts] = useState<Post[]>([]);
  const [deletedPosts, setDeletedPosts] = useState<Post[]>([]);
  const [archivedStories, setArchivedStories] = useState<Story[]>([]);
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newHiddenWord, setNewHiddenWord] = useState('');
  const [blockedUsers, setBlockedUsers] = useState<UserPublic[]>([]);
  const [restrictedUsers, setRestrictedUsers] = useState<UserPublic[]>([]);
  const [mutedUsers, setMutedUsers] = useState<UserPublic[]>([]);

  // Support
  const [problemText, setProblemText] = useState('');
  const [supportModal, setSupportModal] = useState<string | null>(null);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (userPublic) {
      setDisplayName(userPublic.displayName);
      setUsername(userPublic.username);
    }
    if (userPrivate) {
      setPhone(userPrivate.phone || '');
      setDob(userPrivate.dob || '');
      setNewEmail(userPrivate.email || firebaseUser?.email || '');
    }
  }, [userPublic, userPrivate, firebaseUser?.email]);

  useEffect(() => {
    if (!userPublic) return;
    const unsubSess = onSnapshot(
      query(collection(db, 'users', userPublic.uid, 'sessions'), where('ownerId', '==', userPublic.uid)),
      (snap) => setSessions(snap.docs.map((d) => d.data() as SessionActivity)),
      () => {}
    );
    const unsubCol = onSnapshot(
      query(collection(db, 'users', userPublic.uid, 'collections'), where('ownerId', '==', userPublic.uid)),
      (snap) => setCollections(snap.docs.map((d) => d.data() as SavedCollection)),
      () => {}
    );
    return () => {
      unsubSess();
      unsubCol();
    };
  }, [userPublic]);

  useEffect(() => {
    if (!userPublic || section !== 'content') return;
    void (async () => {
      const [postsSnap, storiesSnap] = await Promise.all([
        getDocs(query(collection(db, 'posts'), where('authorId', '==', userPublic.uid))),
        getDocs(query(collection(db, 'stories'), where('authorId', '==', userPublic.uid))),
      ]);
      const allPosts = postsSnap.docs.map((d) => d.data() as Post);
      const allStories = storiesSnap.docs.map((d) => d.data() as Story);
      setArchivedPosts(allPosts.filter((p) => p.isArchived && !p.isDeleted));
      setDeletedPosts(allPosts.filter((p) => p.isDeleted));
      setArchivedStories(allStories.filter((s) => s.isArchived));
    })();
  }, [userPublic, section]);

  useEffect(() => {
    if (!userPrivate) return;
    void (async () => {
      const loadUsers = async (ids: string[]) => {
        const res: UserPublic[] = [];
        for (const id of ids.slice(0, 30)) {
          const s = await getDoc(doc(db, 'users', id)).catch(() => null);
          if (s && s.exists()) res.push(s.data() as UserPublic);
        }
        return res;
      };
      setBlockedUsers(await loadUsers(userPrivate.blockedIds || []));
      setRestrictedUsers(await loadUsers(userPrivate.restrictedIds || []));
      setMutedUsers(await loadUsers(userPrivate.mutedIds || []));
    })();
  }, [userPrivate?.blockedIds, userPrivate?.restrictedIds, userPrivate?.mutedIds]);

  const notifySaved = (msg: string) => {
    setErrorMsg('');
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const updatePrivateField = async (patch: Partial<UserPrivate>) => {
    if (!userPublic) return;
    try {
      await setDoc(
        doc(db, 'users', userPublic.uid, 'private', 'info'),
        {
          uid: userPublic.uid,
          email: firebaseUser?.email || userPrivate?.email || '',
          ...patch,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      notifySaved('Preferences updated.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userPublic.uid}/private/info`);
    }
  };

  const updatePublicField = async (patch: Partial<UserPublic>) => {
    if (!userPublic) return;
    try {
      await updateDoc(doc(db, 'users', userPublic.uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      notifySaved('Account updated.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userPublic.uid}`);
    }
  };

  const handleSaveAccountInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublic) return;
    setErrorMsg('');
    const cleanUser = username.trim();
    if (!BLUEPRINT_LIMITS.USERNAME_REGEX.test(cleanUser)) {
      return setErrorMsg('Username must be 3–30 chars (letters, numbers, _, .).');
    }
    try {
      const batch = writeBatch(db);
      const nextLower = cleanUser.toLowerCase();
      if (nextLower !== userPublic.usernameLower) {
        const check = await getDoc(doc(db, 'usernames', nextLower));
        if (check.exists() && check.data().uid !== userPublic.uid) {
          throw new Error('Username already taken.');
        }
        batch.delete(doc(db, 'usernames', userPublic.usernameLower));
        batch.set(doc(db, 'usernames', nextLower), {
          uid: userPublic.uid,
          username: cleanUser,
          createdAt: serverTimestamp(),
        });
      }
      batch.update(doc(db, 'users', userPublic.uid), {
        displayName: displayName.trim().slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
        username: cleanUser,
        usernameLower: nextLower,
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'users', userPublic.uid, 'private', 'info'),
        {
          uid: userPublic.uid,
          email: firebaseUser?.email || userPrivate?.email || '',
          phone: phone.trim().slice(0, 30),
          dob: dob.trim().slice(0, 20),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await batch.commit();
      notifySaved('Account details saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update account.');
    }
  };

  const handleChangeEmail = async () => {
    if (!firebaseUser || !newEmail.includes('@')) return;
    setErrorMsg('');
    try {
      await verifyBeforeUpdateEmail(firebaseUser, newEmail.trim());
      notifySaved('Verification email sent to your new address to confirm the change.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Re-sign in may be required to change email.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !firebaseUser.email) return;
    setErrorMsg('');
    if (newPw.length < 8) return setErrorMsg('New password must be at least 8 characters.');
    try {
      const cred = EmailAuthProvider.credential(firebaseUser.email, currentPw);
      await reauthenticateWithCredential(firebaseUser, cred);
      await updatePassword(firebaseUser, newPw);
      setCurrentPw('');
      setNewPw('');
      notifySaved('Password updated securely.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update password.');
    }
  };

  const handleEnablePushNotifications = async (checked: boolean) => {
    if (checked && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setErrorMsg('Browser notification permission was denied.');
        return;
      }
    }
    await updatePrivateField({ pushEnabled: checked });
  };

  const handleLogoutOtherDevices = async () => {
    if (!userPublic) return;
    for (const s of sessions) {
      if (s.id !== sessionId && s.isActive) {
        await updateDoc(doc(db, 'users', userPublic.uid, 'sessions', s.id), {
          isActive: false,
          lastActiveAt: serverTimestamp(),
        });
      }
    }
    notifySaved('Logged out of all other active sessions.');
  };

  const handleDeactivateAccount = async () => {
    if (!userPublic) return;
    await updatePublicField({ isDeactivated: true });
    await logout();
  };

  const handleDeleteAccount = async () => {
    if (!firebaseUser || !userPublic) return;
    setErrorMsg('');
    try {
      await deleteDoc(doc(db, 'users', userPublic.uid, 'private', 'info'));
      await deleteDoc(doc(db, 'usernames', userPublic.usernameLower));
      await deleteDoc(doc(db, 'users', userPublic.uid));
      await deleteUser(firebaseUser);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Please log out and log back in recently before deleting your account.'
      );
    }
  };

  const handleExportAccountData = () => {
    if (!userPublic) return;
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      profile: {
        uid: userPublic.uid,
        username: userPublic.username,
        displayName: userPublic.displayName,
        bio: userPublic.bio || '',
        website: userPublic.website || '',
        location: userPublic.location || '',
        followersCount: userPublic.followersCount,
        followingCount: userPublic.followingCount,
        postsCount: userPublic.postsCount,
      },
      preferences: {
        theme: userPrivate?.theme || 'light',
        accentColor: userPrivate?.accentColor || 'fuchsia',
        fontSize: userPrivate?.fontSize || 'md',
        language: userPrivate?.language || 'en',
        sleepModeEnabled: Boolean(userPrivate?.sleepModeEnabled),
        sleepScheduleEnabled: Boolean(userPrivate?.sleepScheduleEnabled),
        sleepStart: userPrivate?.sleepStart || '22:30',
        sleepEnd: userPrivate?.sleepEnd || '07:00',
      },
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mixy-${userPublic.username}-data.json`;
    a.click();
    URL.revokeObjectURL(url);
    notifySaved('Account archive downloaded.');
  };

  const navItems: { id: SettingsSectionId; label: string; icon: React.ReactNode }[] = [
    { id: 'account', label: 'Account', icon: <UserIcon className="w-4 h-4" /> },
    { id: 'privacy', label: 'Privacy', icon: <Lock className="w-4 h-4" /> },
    { id: 'security', label: 'Security', icon: <Shield className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'appearance', label: 'App Appearance', icon: <Palette className="w-4 h-4" /> },
    { id: 'sleep', label: 'Sleep & Wellness', icon: <Moon className="w-4 h-4" /> },
    { id: 'content', label: 'Content & Saved', icon: <Layers className="w-4 h-4" /> },
    { id: 'support', label: 'Support', icon: <HelpCircle className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-5">
      <SettingsStarIntro
        animEnabled={userPrivate?.settingsAnimEnabled !== false}
        soundEnabled={userPrivate?.settingsSoundEnabled !== false}
      />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        {statusMsg && (
          <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> {statusMsg}
          </span>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid md:grid-cols-[220px_1fr] gap-5">
        {/* Settings Category Nav */}
        <div className="flex md:flex-col gap-1 overflow-x-auto no-scrollbar p-1.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] h-fit">
          {navItems.map((item) => {
            const isActive =
              section === item.id || (item.id === 'sleep' && section === 'wellness');
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'mixy-gradient-bg text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Settings Panel */}
        <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-6 space-y-6">
          {section === 'account' && (
            <div className="space-y-6">
              <form onSubmit={handleSaveAccountInfo} className="space-y-4">
                <h2 className="text-lg font-bold">Personal Information</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Full Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                      className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-5 h-10 rounded-xl mixy-gradient-bg text-white text-xs font-semibold"
                >
                  Save Account Details
                </button>
              </form>

              <div className="pt-5 border-t border-slate-200 dark:border-white/10 space-y-3">
                <h3 className="text-sm font-bold">Email Address</h3>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="flex-1 h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleChangeEmail}
                    className="px-4 h-10 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold"
                  >
                    Update Email
                  </button>
                </div>
              </div>

              <div className="pt-5 border-t border-slate-200 dark:border-white/10 space-y-3">
                <h3 className="text-sm font-bold text-rose-500 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Account Status & Data
                </h3>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleExportAccountData}
                    className="px-4 h-10 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-white/5"
                  >
                    <Download className="w-3.5 h-3.5" /> Download My Data
                  </button>
                  <button
                    type="button"
                    onClick={handleDeactivateAccount}
                    className="px-4 h-10 rounded-xl border border-amber-500/40 text-amber-500 text-xs font-semibold hover:bg-amber-500/10"
                  >
                    Deactivate Account
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    className="px-4 h-10 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500"
                  >
                    Delete Account Permanently
                  </button>
                </div>
              </div>
            </div>
          )}

          {section === 'privacy' && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold">Privacy Controls</h2>
              {[
                {
                  label: 'Private Account',
                  desc: 'Only approved followers can view your posts and stories.',
                  checked: Boolean(userPublic?.isPrivate),
                  onChange: (v: boolean) => void updatePublicField({ isPrivate: v }),
                },
                {
                  label: 'Show Online Status',
                  desc: 'Let people you message see when you are active right now.',
                  checked: userPublic?.showOnlineStatus !== false,
                  onChange: (v: boolean) => {
                    realtimeClient.updateVisibility(v);
                    void updatePublicField({ showOnlineStatus: v });
                  },
                },
                {
                  label: 'Show Last Seen',
                  desc: 'Display your last active timestamp in Direct Messages.',
                  checked: userPublic?.showLastSeen !== false,
                  onChange: (v: boolean) => void updatePublicField({ showLastSeen: v }),
                },
                {
                  label: 'Read Receipts',
                  desc: 'Send read checkmarks when you open direct messages.',
                  checked: userPrivate?.readReceipts !== false,
                  onChange: (v: boolean) => void updatePrivateField({ readReceipts: v }),
                },
                {
                  label: 'Typing Indicator Visibility',
                  desc: 'Show when you are typing in Direct Messages.',
                  checked: userPrivate?.dmShowTyping !== false,
                  onChange: (v: boolean) => void updatePrivateField({ dmShowTyping: v }),
                },
                {
                  label: 'MIXY Bubble Chat Mode',
                  desc: 'Render messages inside translucent floating glass droplets.',
                  checked: Boolean(userPrivate?.dmBubbleMode),
                  onChange: (v: boolean) => void updatePrivateField({ dmBubbleMode: v }),
                },
                {
                  label: 'DM Special Effects & Animations',
                  desc: 'Enable animated chat backgrounds and floating heart/sparkle effects.',
                  checked: userPrivate?.dmEffectsEnabled !== false,
                  onChange: (v: boolean) => void updatePrivateField({ dmEffectsEnabled: v }),
                },
              ].map((row) => (
                <label
                  key={row.label}
                  className="flex items-center justify-between gap-4 py-2 cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-semibold">{row.label}</p>
                    <p className="text-xs text-slate-500">{row.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={(e) => row.onChange(e.target.checked)}
                    className="w-5 h-5 accent-fuchsia-500"
                  />
                </label>
              ))}

              <div className="grid sm:grid-cols-3 gap-4 pt-3 border-t border-slate-200 dark:border-white/10">
                <div>
                  <label className="block text-xs font-medium mb-1">Who Can Message Me</label>
                  <select
                    value={userPrivate?.dmWhoCanMessage || 'everyone'}
                    onChange={(e) =>
                      void updatePrivateField({ dmWhoCanMessage: e.target.value as DmWhoCanMessage })
                    }
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  >
                    <option value="everyone" className="bg-white dark:bg-[#10101A]">Everyone</option>
                    <option value="followers" className="bg-white dark:bg-[#10101A]">People you follow</option>
                    <option value="nobody" className="bg-white dark:bg-[#10101A]">No one</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Default Story Visibility</label>
                  <select
                    value={userPrivate?.storyVisibility || 'followers'}
                    onChange={(e) =>
                      void updatePrivateField({ storyVisibility: e.target.value as StoryVisibility })
                    }
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  >
                    <option value="public" className="bg-white dark:bg-[#10101A]">Everyone</option>
                    <option value="followers" className="bg-white dark:bg-[#10101A]">Followers</option>
                    <option value="close_friends" className="bg-white dark:bg-[#10101A]">Close Friends</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Mentions & Tags</label>
                  <select
                    value={userPrivate?.mentionsPolicy || 'everyone'}
                    onChange={(e) =>
                      void updatePrivateField({
                        mentionsPolicy: e.target.value as 'everyone' | 'followers' | 'none',
                      })
                    }
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  >
                    <option value="everyone" className="bg-white dark:bg-[#10101A]">Everyone</option>
                    <option value="followers" className="bg-white dark:bg-[#10101A]">People you follow</option>
                    <option value="none" className="bg-white dark:bg-[#10101A]">No one</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-2">
                <h3 className="text-sm font-bold">Restricted Accounts ({restrictedUsers.length})</h3>
                {restrictedUsers.length === 0 ? (
                  <p className="text-xs text-slate-500">No restricted accounts.</p>
                ) : (
                  restrictedUsers.map((u) => (
                    <div key={u.uid} className="flex items-center justify-between text-sm py-1.5">
                      <span>@{u.username}</span>
                      <button
                        onClick={() =>
                          userPublic &&
                          void setDoc(
                            doc(db, 'users', userPublic.uid, 'private', 'info'),
                            {
                              uid: userPublic.uid,
                              email: firebaseUser?.email || userPrivate?.email || '',
                              restrictedIds: arrayRemove(u.uid),
                              updatedAt: serverTimestamp(),
                            },
                            { merge: true }
                          )
                        }
                        className="px-3 py-1 rounded-lg border border-slate-200 dark:border-white/15 text-xs font-semibold"
                      >
                        Unrestrict
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-2">
                <h3 className="text-sm font-bold">Blocked Accounts ({blockedUsers.length})</h3>
                {blockedUsers.length === 0 ? (
                  <p className="text-xs text-slate-500">You haven't blocked anyone.</p>
                ) : (
                  blockedUsers.map((u) => (
                    <div key={u.uid} className="flex items-center justify-between text-sm py-1.5">
                      <span>@{u.username}</span>
                      <button
                        onClick={() =>
                          userPublic &&
                          void setDoc(
                            doc(db, 'users', userPublic.uid, 'private', 'info'),
                            {
                              uid: userPublic.uid,
                              email: firebaseUser?.email || userPrivate?.email || '',
                              blockedIds: arrayRemove(u.uid),
                              updatedAt: serverTimestamp(),
                            },
                            { merge: true }
                          )
                        }
                        className="px-3 py-1 rounded-lg border border-slate-200 dark:border-white/15 text-xs font-semibold"
                      >
                        Unblock
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {section === 'security' && (
            <div className="space-y-6">
              <form onSubmit={handleChangePassword} className="space-y-3">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-fuchsia-500" /> Change Password
                </h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      required
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      placeholder="Current password"
                      className="w-full h-10 pl-3 pr-10 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="New password (min 8 chars)"
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 h-10 rounded-xl mixy-gradient-bg text-white text-xs font-semibold"
                >
                  Update Password
                </button>
              </form>

              <label className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-white/10 cursor-pointer">
                <div>
                  <p className="text-sm font-semibold">Two-Factor Authentication Preference</p>
                  <p className="text-xs text-slate-500">
                    Require verified session alerts when signing in on new browsers.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(userPrivate?.twoFactorEnabled)}
                  onChange={(e) => void updatePrivateField({ twoFactorEnabled: e.target.checked })}
                  className="w-5 h-5 accent-fuchsia-500"
                />
              </label>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">Active Sessions & Login Activity</h3>
                  <button
                    onClick={handleLogoutOtherDevices}
                    className="text-xs font-semibold text-fuchsia-500 hover:underline"
                  >
                    Log out of other devices
                  </button>
                </div>
                <div className="space-y-2">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5 text-xs"
                    >
                      <div>
                        <p className="font-semibold">
                          {s.device} {s.id === sessionId ? '(This device)' : ''}
                        </p>
                        <p className="text-slate-500">
                          Last active: {formatRelativeTime(s.lastActiveAt)}
                        </p>
                      </div>
                      <span
                        className={`font-semibold ${
                          s.isActive ? 'text-emerald-500' : 'text-slate-400'
                        }`}
                      >
                        {s.isActive ? 'Active' : 'Signed out'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === 'notifications' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold">Notification Preferences</h2>
              {[
                { key: 'notifyLikes', label: 'Likes', val: userPrivate?.notifyLikes !== false },
                { key: 'notifyComments', label: 'Comments & Replies', val: userPrivate?.notifyComments !== false },
                { key: 'notifyFollowers', label: 'New Followers', val: userPrivate?.notifyFollowers !== false },
                { key: 'notifyMessages', label: 'Direct Messages', val: userPrivate?.notifyMessages !== false },
                { key: 'notifyMentions', label: 'Mentions & Tags', val: userPrivate?.notifyMentions !== false },
                { key: 'notifyStories', label: 'Story Reactions', val: userPrivate?.notifyStories !== false },
                { key: 'notifyCalls', label: 'Voice & Video Calls', val: userPrivate?.notifyCalls !== false },
                { key: 'notifyReposts', label: 'Reposts', val: userPrivate?.notifyReposts !== false },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center justify-between py-2 cursor-pointer"
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={item.val}
                    onChange={(e) =>
                      void updatePrivateField({ [item.key]: e.target.checked } as Partial<UserPrivate>)
                    }
                    className="w-5 h-5 accent-fuchsia-500"
                  />
                </label>
              ))}
              <label className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-white/10 cursor-pointer">
                <div>
                  <p className="text-sm font-semibold">Browser Push Notifications</p>
                  <p className="text-xs text-slate-500">Receive real-time desktop/mobile alerts.</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(userPrivate?.pushEnabled)}
                  onChange={(e) => void handleEnablePushNotifications(e.target.checked)}
                  className="w-5 h-5 accent-fuchsia-500"
                />
              </label>
            </div>
          )}

          {section === 'appearance' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold">App Appearance</h2>
              <div>
                <label className="block text-xs font-medium mb-2">Theme Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'light', label: 'Light Mode', icon: <Sun className="w-4 h-4" /> },
                      { id: 'dark', label: 'Dark Mode', icon: <Moon className="w-4 h-4" /> },
                      { id: 'system', label: 'System Auto', icon: <Sparkles className="w-4 h-4" /> },
                    ] as { id: AppTheme; label: string; icon: React.ReactNode }[]
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => {
                        const accent = userPrivate?.accentColor || 'fuchsia';
                        const fs = userPrivate?.fontSize || 'md';
                        cacheAppearanceLocally(mode.id, accent, fs);
                        applyAppearanceToDom(mode.id, accent, fs);
                        void updatePrivateField({ theme: mode.id });
                      }}
                      className={`h-11 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                        (userPrivate?.theme || 'light') === mode.id
                          ? 'mixy-gradient-bg text-white border-transparent'
                          : 'border-slate-200 dark:border-white/15'
                      }`}
                    >
                      {mode.icon}
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-2">Accent Colour</label>
                <div className="flex flex-wrap gap-2.5">
                  {(
                    [
                      { id: 'fuchsia', label: 'Fuchsia', swatch: 'bg-fuchsia-500' },
                      { id: 'cyan', label: 'Ocean', swatch: 'bg-cyan-500' },
                      { id: 'emerald', label: 'Emerald', swatch: 'bg-emerald-500' },
                      { id: 'amber', label: 'Sunset', swatch: 'bg-amber-500' },
                      { id: 'rose', label: 'Crimson', swatch: 'bg-rose-500' },
                    ] as { id: AccentColor; label: string; swatch: string }[]
                  ).map((acc) => (
                    <button
                      key={acc.id}
                      onClick={() => {
                        const theme = userPrivate?.theme || 'light';
                        const fs = userPrivate?.fontSize || 'md';
                        cacheAppearanceLocally(theme, acc.id, fs);
                        applyAppearanceToDom(theme, acc.id, fs);
                        void updatePrivateField({ accentColor: acc.id });
                      }}
                      className={`px-3.5 h-10 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                        (userPrivate?.accentColor || 'fuchsia') === acc.id
                          ? 'border-fuchsia-500 bg-fuchsia-500/10'
                          : 'border-slate-200 dark:border-white/15'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full ${acc.swatch}`} />
                      {acc.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Font Size</label>
                  <select
                    value={userPrivate?.fontSize || 'md'}
                    onChange={(e) => {
                      const fs = e.target.value as FontSizePref;
                      const theme = userPrivate?.theme || 'light';
                      const accent = userPrivate?.accentColor || 'fuchsia';
                      cacheAppearanceLocally(theme, accent, fs);
                      applyAppearanceToDom(theme, accent, fs);
                      void updatePrivateField({ fontSize: fs });
                    }}
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  >
                    <option value="sm" className="bg-white dark:bg-[#10101A]">Compact</option>
                    <option value="md" className="bg-white dark:bg-[#10101A]">Standard</option>
                    <option value="lg" className="bg-white dark:bg-[#10101A]">Large</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Language</label>
                  <select
                    value={userPrivate?.language || 'en'}
                    onChange={(e) => void updatePrivateField({ language: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  >
                    <option value="en" className="bg-white dark:bg-[#10101A]">English</option>
                    <option value="sw" className="bg-white dark:bg-[#10101A]">Kiswahili</option>
                    <option value="fr" className="bg-white dark:bg-[#10101A]">Français</option>
                    <option value="es" className="bg-white dark:bg-[#10101A]">Español</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-3">
                <label className="flex items-center justify-between gap-4 py-1 cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold">Settings Star Intro Animation</p>
                    <p className="text-xs text-slate-500">Show the subtle star constellation shimmer when opening Settings.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={userPrivate?.settingsAnimEnabled !== false}
                    onChange={(e) => void updatePrivateField({ settingsAnimEnabled: e.target.checked })}
                    className="w-5 h-5 accent-fuchsia-500"
                  />
                </label>
                <label className="flex items-center justify-between gap-4 py-1 cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold">Ambient Sound Effects</p>
                    <p className="text-xs text-slate-500">Play gentle chimes and pop tones on reactions and intros.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={userPrivate?.settingsSoundEnabled !== false}
                    onChange={(e) => void updatePrivateField({ settingsSoundEnabled: e.target.checked })}
                    className="w-5 h-5 accent-fuchsia-500"
                  />
                </label>
                <label className="flex items-center justify-between gap-4 py-1 cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold">Reduce Motion</p>
                    <p className="text-xs text-slate-500">Minimize view transitions, floating animations, and burst effects.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(userPrivate?.reducedMotionEnabled)}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setReducedMotionPreference(val);
                      void updatePrivateField({ reducedMotionEnabled: val });
                    }}
                    className="w-5 h-5 accent-fuchsia-500"
                  />
                </label>
                <label className="flex items-center justify-between gap-4 py-1 cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold">Tactile Haptic Feedback</p>
                    <p className="text-xs text-slate-500">Subtle vibration feedback on likes, navigation, and actions.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={userPrivate?.hapticsEnabled !== false}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setHapticsEnabled(val);
                      if (val) triggerHaptic('light');
                      void updatePrivateField({ hapticsEnabled: val });
                    }}
                    className="w-5 h-5 accent-fuchsia-500"
                  />
                </label>
              </div>
            </div>
          )}

          {(section === 'sleep' || section === 'wellness') && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Moon className="w-5 h-5 text-indigo-500" /> Sleep Mode & Digital Wellness
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Rest without distractions, silence calls & notifications, and manage daily screen time.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void (isSleeping ? wakeUpSleepMode() : enableSleepMode())}
                  className={`px-4 h-9 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                    isSleeping
                      ? 'bg-emerald-500 text-white'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500'
                  }`}
                >
                  {isSleeping ? (
                    <>
                      <Sun className="w-3.5 h-3.5" /> Wake Up Now
                    </>
                  ) : (
                    <>
                      <Moon className="w-3.5 h-3.5" /> Enter Sleep Mode
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-500 flex items-center justify-center">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Today's Active Time: {dailyUsageMinutes} min</p>
                    <p className="text-xs text-slate-500">Tracked locally while MIXY is open.</p>
                  </div>
                </div>
                <div className="min-w-[180px]">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Break Reminder Interval
                  </label>
                  <select
                    value={userPrivate?.screenTimeReminderMin || 0}
                    onChange={(e) =>
                      void updatePrivateField({ screenTimeReminderMin: Number(e.target.value) })
                    }
                    className="w-full h-9 px-3 rounded-xl bg-white dark:bg-[#10101A] border border-slate-200 dark:border-white/10 text-xs font-medium"
                  >
                    <option value={0}>Off</option>
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={45}>Every 45 minutes</option>
                    <option value={60}>Every 1 hour</option>
                    <option value={90}>Every 90 minutes</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center justify-between gap-4 py-1.5 cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold">Manual Sleep Mode</p>
                    <p className="text-xs text-slate-500">
                      Hide active online status, pause non-essential notifications, and show a sleeping status badge.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(userPrivate?.sleepModeEnabled)}
                    onChange={(e) => void updatePrivateField({ sleepModeEnabled: e.target.checked })}
                    className="w-5 h-5 accent-indigo-500"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 py-1.5 cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold">Quiet Mode</p>
                    <p className="text-xs text-slate-500">
                      Silence incoming call rings and push alerts while browsing quietly.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(userPrivate?.quietModeEnabled)}
                    onChange={(e) => void updatePrivateField({ quietModeEnabled: e.target.checked })}
                    className="w-5 h-5 accent-indigo-500"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 py-1.5 cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold">Focus Lock Overlay</p>
                    <p className="text-xs text-slate-500">
                      Lock feed scrolling behind a calm moon overlay whenever Sleep Mode is active.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(userPrivate?.sleepFocusLock)}
                    onChange={(e) => void updatePrivateField({ sleepFocusLock: e.target.checked })}
                    className="w-5 h-5 accent-indigo-500"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 py-1.5 cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold">Schedule Automatic Bedtime</p>
                    <p className="text-xs text-slate-500">
                      Automatically activate Sleep Mode during your nightly rest hours.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(userPrivate?.sleepScheduleEnabled)}
                    onChange={(e) => void updatePrivateField({ sleepScheduleEnabled: e.target.checked })}
                    className="w-5 h-5 accent-indigo-500"
                  />
                </label>

                <div className="grid sm:grid-cols-2 gap-3 pl-1">
                  <div>
                    <label className="block text-xs font-medium mb-1">Bedtime Start</label>
                    <input
                      type="time"
                      value={userPrivate?.sleepStart || '22:30'}
                      onChange={(e) => void updatePrivateField({ sleepStart: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Wake-up Time</label>
                    <input
                      type="time"
                      value={userPrivate?.sleepEnd || '07:00'}
                      onChange={(e) => void updatePrivateField({ sleepEnd: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-4">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Phone className="w-4 h-4 text-fuchsia-500" /> Voice & Video Calling Controls
                </h3>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Who Can Voice Call</label>
                    <select
                      value={userPrivate?.callVoiceAllowed || 'everyone'}
                      onChange={(e) =>
                        void updatePrivateField({ callVoiceAllowed: e.target.value as DmWhoCanMessage })
                      }
                      className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                    >
                      <option value="everyone">Everyone</option>
                      <option value="followers">People you follow</option>
                      <option value="nobody">No one</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Who Can Video Call</label>
                    <select
                      value={userPrivate?.callVideoAllowed || 'everyone'}
                      onChange={(e) =>
                        void updatePrivateField({ callVideoAllowed: e.target.value as DmWhoCanMessage })
                      }
                      className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                    >
                      <option value="everyone">Everyone</option>
                      <option value="followers">People you follow</option>
                      <option value="nobody">No one</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Default Camera</label>
                    <select
                      value={userPrivate?.preferredCameraFacing || 'user'}
                      onChange={(e) =>
                        void updatePrivateField({
                          preferredCameraFacing: e.target.value as 'user' | 'environment',
                        })
                      }
                      className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                    >
                      <option value="user">Front Camera</option>
                      <option value="environment">Rear Camera</option>
                    </select>
                  </div>
                </div>
              </div>

              {onOpenCloseFriends && (
                <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold flex items-center gap-1.5">
                      <Heart className="w-4 h-4 text-[#22c55e]" /> Close Friends Circle
                    </p>
                    <p className="text-xs text-slate-500">
                      Manage who sees your Close Friends stories, posts, and priority check-ins.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenCloseFriends}
                    className="px-4 h-9 rounded-xl bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30 text-xs font-semibold shrink-0"
                  >
                    Manage Circle
                  </button>
                </div>
              )}
            </div>
          )}

          {section === 'content' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-fuchsia-500" /> Saved Collections ({savedIds.size} saved)
                </h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!userPublic || !newCollectionName.trim()) return;
                    const cid = generateId('col');
                    await setDoc(doc(db, 'users', userPublic.uid, 'collections', cid), {
                      id: cid,
                      ownerId: userPublic.uid,
                      name: newCollectionName.trim().slice(0, 60),
                      createdAt: serverTimestamp(),
                    });
                    setNewCollectionName('');
                  }}
                  className="flex gap-2 mb-3"
                >
                  <input
                    type="text"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="New collection name..."
                    className="flex-1 h-9 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                  />
                  <button
                    type="submit"
                    className="px-3.5 h-9 rounded-xl mixy-gradient-bg text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <FolderPlus className="w-3.5 h-3.5" /> Create
                  </button>
                </form>
                <div className="flex flex-wrap gap-2">
                  {collections.map((c) => (
                    <div
                      key={c.id}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold flex items-center gap-2"
                    >
                      <span>{c.name}</span>
                      <button
                        onClick={() =>
                          userPublic &&
                          deleteDoc(doc(db, 'users', userPublic.uid, 'collections', c.id))
                        }
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-2.5">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-fuchsia-500" /> Content Discovery Interests
                  </h3>
                  <p className="text-xs text-slate-500">
                    Choose topics to personalize your Explore Smart Discover ranking.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['music', 'gaming', 'art', 'fitness', 'tech', 'travel', 'fashion', 'comedy', 'food'].map((topic) => {
                    const selected = (userPrivate?.contentPreferences || '')
                      .split(',')
                      .map((t) => t.trim().toLowerCase())
                      .filter(Boolean);
                    const active = selected.includes(topic);
                    return (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => {
                          const next = active
                            ? selected.filter((t) => t !== topic)
                            : [...selected, topic];
                          triggerHaptic('light');
                          void updatePrivateField({
                            contentPreferences: next.join(',').slice(0, 120),
                          });
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-colors ${
                          active
                            ? 'mixy-gradient-bg text-white'
                            : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10'
                        }`}
                      >
                        #{topic}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-2">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Archive className="w-4 h-4" /> Archived Posts ({archivedPosts.length}) & Stories ({archivedStories.length})
                </h3>
                {archivedPosts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-white/5">
                    <span className="truncate">{p.caption || 'Archived post'}</span>
                    <button
                      onClick={() =>
                        updateDoc(doc(db, 'posts', p.id), {
                          isArchived: false,
                          updatedAt: serverTimestamp(),
                        })
                      }
                      className="text-fuchsia-500 font-semibold shrink-0 ml-2"
                    >
                      Restore to Profile
                    </button>
                  </div>
                ))}
                {archivedStories.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-white/5">
                    <span className="truncate">{s.caption || s.textOverlay || 'Archived story'}</span>
                    <button
                      onClick={() => updateDoc(doc(db, 'stories', s.id), { isArchived: false })}
                      className="text-fuchsia-500 font-semibold shrink-0 ml-2"
                    >
                      Unarchive
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-2">
                <h3 className="text-sm font-bold">Recently Deleted Posts ({deletedPosts.length})</h3>
                {deletedPosts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-white/5">
                    <span className="truncate">{p.caption || 'Deleted post'}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() =>
                          updateDoc(doc(db, 'posts', p.id), {
                            isDeleted: false,
                            updatedAt: serverTimestamp(),
                          })
                        }
                        className="text-emerald-500 font-semibold flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" /> Restore
                      </button>
                      <button
                        onClick={() => deleteDoc(doc(db, 'posts', p.id))}
                        className="text-rose-500 font-semibold"
                      >
                        Delete Forever
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-3">
                <h3 className="text-sm font-bold">Hidden Words Filter</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newHiddenWord}
                    onChange={(e) => setNewHiddenWord(e.target.value)}
                    placeholder="Hide posts containing word..."
                    className="flex-1 h-9 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                  />
                  <button
                    onClick={async () => {
                      if (!userPublic || !newHiddenWord.trim()) return;
                      const next = Array.from(
                        new Set([...(userPrivate?.hiddenWords || []), newHiddenWord.trim()])
                      );
                      await updatePrivateField({ hiddenWords: next });
                      setNewHiddenWord('');
                    }}
                    className="px-4 h-9 rounded-xl mixy-gradient-bg text-white text-xs font-semibold"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(userPrivate?.hiddenWords || []).map((w) => (
                    <span
                      key={w}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 text-xs flex items-center gap-1.5"
                    >
                      {w}
                      <button
                        onClick={() =>
                          void updatePrivateField({
                            hiddenWords: (userPrivate?.hiddenWords || []).filter((x) => x !== w),
                          })
                        }
                        className="text-rose-500"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                {mutedUsers.length > 0 && (
                  <div className="pt-2 space-y-1.5">
                    <h4 className="text-xs font-bold text-slate-500">Muted Accounts</h4>
                    {mutedUsers.map((u) => (
                      <div key={u.uid} className="flex items-center justify-between text-xs">
                        <span>@{u.username}</span>
                        <button
                          onClick={() =>
                            userPublic &&
                            void setDoc(
                              doc(db, 'users', userPublic.uid, 'private', 'info'),
                              {
                                uid: userPublic.uid,
                                email: firebaseUser?.email || userPrivate?.email || '',
                                mutedIds: arrayRemove(u.uid),
                                updatedAt: serverTimestamp(),
                              },
                              { merge: true }
                            )
                          }
                          className="text-fuchsia-500 font-semibold"
                        >
                          Unmute
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {section === 'support' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold">Help & Support</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!userPublic || !problemText.trim()) return;
                  await submitReport({
                    reporterId: userPublic.uid,
                    targetType: 'problem',
                    targetId: userPublic.uid,
                    reason: 'User Problem Report',
                    details: problemText.trim(),
                  });
                  setProblemText('');
                  notifySaved('Problem report submitted to support.');
                }}
                className="space-y-3"
              >
                <label className="block text-xs font-medium">Report a Problem</label>
                <textarea
                  rows={3}
                  required
                  value={problemText}
                  onChange={(e) => setProblemText(e.target.value)}
                  placeholder="Describe an issue or share feedback..."
                  className="w-full p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                />
                <button
                  type="submit"
                  className="px-5 h-10 rounded-xl mixy-gradient-bg text-white text-xs font-semibold"
                >
                  Send to Support
                </button>
              </form>

              <div className="grid sm:grid-cols-2 gap-3 pt-4 border-t border-slate-200 dark:border-white/10">
                {[
                  {
                    title: 'Help Centre',
                    body: 'Create Posts, Stories, and Reels using the + button. Manage privacy, saved collections, and active sessions directly in Settings.',
                  },
                  {
                    title: 'Community Guidelines',
                    body: 'Respect creators, share authentic media, avoid harassment or spam, and report harmful content so moderators can act promptly.',
                  },
                  {
                    title: 'Privacy Policy',
                    body: 'MIXY isolates personal email, phone, and date of birth in private owner-only records protected by Firestore security rules.',
                  },
                  {
                    title: 'Terms of Service & About MIXY',
                    body: 'MIXY — Connect · Share · Vibe. Built with Firebase Authentication, Cloud Firestore, and real-time media delivery.',
                  },
                ].map((docItem) => (
                  <button
                    key={docItem.title}
                    onClick={() =>
                      setSupportModal(supportModal === docItem.title ? null : docItem.title)
                    }
                    className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 text-left hover:border-fuchsia-500 transition-colors"
                  >
                    <p className="text-sm font-semibold">{docItem.title}</p>
                    {supportModal === docItem.title && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                        {docItem.body}
                      </p>
                    )}
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">MIXY Onboarding Tour</p>
                  <p className="text-xs text-slate-500">Replay the quick walkthrough of Feed, DMs, Reels, and Julius AI Studio.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    window.dispatchEvent(new CustomEvent('mixy:open-onboarding'));
                  }}
                  className="px-4 h-9 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  Replay Onboarding Tour
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
