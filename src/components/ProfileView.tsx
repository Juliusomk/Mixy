import React, { useEffect, useRef, useState } from 'react';
import {
  arrayUnion,
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
  BarChart3,
  Bookmark,
  Camera,
  Check,
  Edit3,
  Film,
  Flag,
  FolderPlus,
  Globe,
  Grid,
  Heart,
  ImageOff,
  Link2,
  Loader2,
  Lock,
  MapPin,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Music,
  Pause,
  Play,
  Plus,
  Repeat,
  Settings,
  ShieldBan,
  Sparkles,
  Tag,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { mediaUrl } from '../lib/api';
import {
  BLUEPRINT_LIMITS,
  db,
  formatCount,
  formatRelativeTime,
  generateId,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { uploadMediaFile } from '../lib/media';
import {
  getOrCreateDirectConversation,
  respondToFollowRequest,
  toggleFollowUser,
  toggleRepostItem,
} from '../lib/socialActions';
import type {
  FollowEdge,
  Post,
  ProfileBorderGradient,
  ProfileThemeId,
  Reel,
  RepostItem,
  SavedCollection,
  SavedPost,
  Story,
  StoryHighlight,
  UserPublic,
} from '../types/mixy';
import { UserAvatar, UserVerifiedBadge, VerifiedBadge } from './MixyLogo';
import { PostCard } from './PostCard';
import { ProfileEffectsModal } from './ProfileEffectsModal';
import { ReportModal } from './ReportModal';

const BORDER_GRADIENT_CLASS: Record<ProfileBorderGradient, string> = {
  none: '',
  fuchsia_violet: 'p-[2px] bg-gradient-to-br from-fuchsia-500 to-violet-600',
  cyan_blue: 'p-[2px] bg-gradient-to-br from-cyan-400 to-blue-600',
  amber_rose: 'p-[2px] bg-gradient-to-br from-amber-400 to-rose-500',
  emerald_teal: 'p-[2px] bg-gradient-to-br from-emerald-400 to-teal-600',
  rainbow: 'p-[2px] bg-gradient-to-br from-pink-500 via-amber-400 to-cyan-500',
};

const PROFILE_THEME_CLASS: Record<ProfileThemeId, { card: string; text: string; sub: string }> = {
  default: {
    card: 'bg-white dark:bg-[#10101A]',
    text: 'text-slate-900 dark:text-white',
    sub: 'text-slate-500 dark:text-slate-400',
  },
  minimal_white: {
    card: 'bg-white',
    text: 'text-slate-900',
    sub: 'text-slate-500',
  },
  obsidian_gold: {
    card: 'bg-gradient-to-br from-slate-950 via-neutral-900 to-amber-950/60',
    text: 'text-amber-50',
    sub: 'text-amber-200/70',
  },
  midnight_cosmos: {
    card: 'bg-gradient-to-br from-indigo-950 via-slate-950 to-fuchsia-950',
    text: 'text-white',
    sub: 'text-indigo-200/75',
  },
  pastel_bloom: {
    card: 'bg-gradient-to-br from-rose-50 via-white to-violet-50',
    text: 'text-slate-900',
    sub: 'text-slate-600',
  },
  neon_cyber: {
    card: 'bg-gradient-to-br from-slate-950 via-cyan-950 to-indigo-950',
    text: 'text-cyan-50',
    sub: 'text-cyan-200/70',
  },
};

export function ProfileView({
  targetUid,
  onOpenProfile,
  onOpenMessageConv,
  onOpenSettings,
  onOpenStudio,
  onOpenCloseFriends,
  onOpenHashtag,
}: {
  targetUid?: string | null;
  onOpenProfile: (uid: string) => void;
  onOpenMessageConv: (convId: string) => void;
  onOpenSettings: () => void;
  onOpenStudio?: () => void;
  onOpenCloseFriends?: () => void;
  onOpenHashtag: (tag: string) => void;
}) {
  const { firebaseUser, userPublic, followingIds, pendingFollowIds, savedIds } = useAuth();
  const profileUid = targetUid || userPublic?.uid || '';
  const isOwnProfile = profileUid === userPublic?.uid;

  const [profile, setProfile] = useState<UserPublic | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [taggedPosts, setTaggedPosts] = useState<Post[]>([]);
  const [savedPostDocs, setSavedPostDocs] = useState<Post[]>([]);
  const [savedReelDocs, setSavedReelDocs] = useState<Reel[]>([]);
  const [savedEntries, setSavedEntries] = useState<SavedPost[]>([]);
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [selectedSavedFilter, setSelectedSavedFilter] = useState<string>('all');
  const [newSavedColName, setNewSavedColName] = useState('');
  const [creatingSavedCol, setCreatingSavedCol] = useState(false);
  const [brokenMediaIds, setBrokenMediaIds] = useState<Set<string>>(new Set());
  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [archivedStories, setArchivedStories] = useState<Story[]>([]);
  const [pendingRequesters, setPendingRequesters] = useState<UserPublic[]>([]);
  const [respondingReqId, setRespondingReqId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'posts' | 'reels' | 'tagged' | 'saved' | 'reposts'>('posts');
  const [showEffectsModal, setShowEffectsModal] = useState(false);
  const [reposts, setReposts] = useState<RepostItem[]>([]);
  const [repostPosts, setRepostPosts] = useState<Post[]>([]);
  const [repostReels, setRepostReels] = useState<Reel[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedReel, setSelectedReel] = useState<Reel | null>(null);
  const [listModal, setListModal] = useState<'followers' | 'following' | null>(null);
  const [listUsers, setListUsers] = useState<UserPublic[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Action feedback
  const [followLoading, setFollowLoading] = useState(false);
  const [listFollowBusyId, setListFollowBusyId] = useState<string | null>(null);
  const [msgLoading, setMsgLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [musicPlaying, setMusicPlaying] = useState(false);
  const profileAudioRef = useRef<HTMLAudioElement | null>(null);

  // Edit profile state
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editPrivate, setEditPrivate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // Verification request state
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyCategory, setVerifyCategory] = useState('Creator / Public Figure');
  const [verifyReason, setVerifyReason] = useState('');
  const [verifyLink, setVerifyLink] = useState('');
  const [verifySubmitted, setVerifySubmitted] = useState(false);

  // Create Highlight modal
  const [showHighlightModal, setShowHighlightModal] = useState(false);
  const [highlightTitle, setHighlightTitle] = useState('');
  const [selectedHighlightStoryIds, setSelectedHighlightStoryIds] = useState<string[]>([]);
  const [activeHighlight, setActiveHighlight] = useState<{
    highlight: StoryHighlight;
    stories: Story[];
  } | null>(null);

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    setActiveTab('posts');
    setSelectedPost(null);
    setSelectedReel(null);
    setListModal(null);
    setShowMoreMenu(false);
    setActionError('');
    setProfile(null);
    setProfileMissing(false);
    profileAudioRef.current?.pause();
    setMusicPlaying(false);
  }, [profileUid]);

  useEffect(() => {
    return () => {
      profileAudioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!profileUid) return;
    const unsub = onSnapshot(
      doc(db, 'users', profileUid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserPublic;
          setProfile(data);
          setProfileMissing(false);
          setEditName(data.displayName);
          setEditUsername(data.username);
          setEditBio(data.bio || '');
          setEditWebsite(data.website || '');
          setEditLocation(data.location || '');
          setEditPrivate(data.isPrivate);
        } else {
          setProfile(null);
          setProfileMissing(true);
        }
      },
      (err) => {
        setProfileMissing(true);
        handleFirestoreError(err, OperationType.GET, `users/${profileUid}`);
      }
    );
    return () => unsub();
  }, [profileUid]);

  useEffect(() => {
    if (!profileUid) return;
    const ownProfile = profileUid === userPublic?.uid;

    const postsQ = ownProfile
      ? query(collection(db, 'posts'), where('authorId', '==', profileUid))
      : query(
          collection(db, 'posts'),
          where('authorId', '==', profileUid),
          where('isDeleted', '==', false),
          where('isArchived', '==', false),
          where('audience', 'in', ['public', 'followers'])
        );

    const unsubPosts = onSnapshot(
      postsQ,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Post)
          .filter((p) => !p.isDeleted && !p.isArchived)
          .sort((a, b) => {
            const at = a.createdAt?.toDate?.().getTime() ?? Date.now();
            const bt = b.createdAt?.toDate?.().getTime() ?? Date.now();
            return bt - at;
          });
        setPosts(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'posts')
    );

    const reelsQ = ownProfile
      ? query(collection(db, 'reels'), where('authorId', '==', profileUid))
      : query(collection(db, 'reels'), where('viewsCount', '>=', 0));

    const unsubReels = onSnapshot(
      reelsQ,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Reel)
          .filter((r) => r.authorId === profileUid)
          .sort((a, b) => {
            const at = a.createdAt?.toDate?.().getTime() ?? Date.now();
            const bt = b.createdAt?.toDate?.().getTime() ?? Date.now();
            return bt - at;
          });
        setReels(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reels')
    );

    const unsubTagged = onSnapshot(
      query(
        collection(db, 'posts'),
        where('taggedUserIds', 'array-contains', profileUid),
        where('isDeleted', '==', false),
        where('isArchived', '==', false),
        where('audience', 'in', ['public', 'followers'])
      ),
      (snap) => setTaggedPosts(snap.docs.map((d) => d.data() as Post)),
      () => {}
    );

    const unsubHighlights = onSnapshot(
      query(
        collection(db, 'users', profileUid, 'highlights'),
        where('ownerId', '==', profileUid)
      ),
      (snap) => setHighlights(snap.docs.map((d) => d.data() as StoryHighlight)),
      () => {}
    );

    return () => {
      unsubPosts();
      unsubReels();
      unsubTagged();
      unsubHighlights();
    };
  }, [profileUid, userPublic?.uid]);

  useEffect(() => {
    if (!isOwnProfile || !userPublic) {
      setCollections([]);
      setSavedEntries([]);
      setSavedPostDocs([]);
      setSavedReelDocs([]);
      return;
    }
    const unsubCols = onSnapshot(
      query(collection(db, 'users', userPublic.uid, 'collections'), where('ownerId', '==', userPublic.uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as SavedCollection)
          .sort((a, b) => {
            const at = a.createdAt?.toDate?.().getTime() ?? Date.now();
            const bt = b.createdAt?.toDate?.().getTime() ?? Date.now();
            return bt - at;
          });
        setCollections(list);
      },
      () => {}
    );
    const unsubEntries = onSnapshot(
      query(collection(db, 'users', userPublic.uid, 'savedPosts'), where('ownerId', '==', userPublic.uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as SavedPost)
          .sort((a, b) => {
            const at = a.createdAt?.toDate?.().getTime() ?? Date.now();
            const bt = b.createdAt?.toDate?.().getTime() ?? Date.now();
            return bt - at;
          });
        setSavedEntries(list);
      },
      () => {}
    );
    return () => {
      unsubCols();
      unsubEntries();
    };
  }, [isOwnProfile, userPublic]);

  useEffect(() => {
    if (!isOwnProfile || !userPublic) return;
    void (async () => {
      const entries =
        savedEntries.length > 0
          ? savedEntries.slice(0, 40)
          : Array.from(savedIds.entries())
              .slice(0, 40)
              .map(([itemId, collectionId]) => ({
                itemId,
                itemType: 'post' as const,
                collectionId,
                ownerId: userPublic.uid,
              }));
      if (entries.length === 0) {
        setSavedPostDocs([]);
        setSavedReelDocs([]);
        return;
      }
      const postDocs: Post[] = [];
      const reelDocs: Reel[] = [];
      await Promise.all(
        entries.map(async (entry) => {
          if (entry.itemType === 'reel') {
            const rSnap = await getDoc(doc(db, 'reels', entry.itemId)).catch(() => null);
            if (rSnap && rSnap.exists()) {
              reelDocs.push(rSnap.data() as Reel);
              return;
            }
          }
          const pSnap = await getDoc(doc(db, 'posts', entry.itemId)).catch(() => null);
          if (pSnap && pSnap.exists()) {
            const pData = pSnap.data() as Post;
            if (!pData.isDeleted) postDocs.push(pData);
            return;
          }
          if (entry.itemType !== 'reel') {
            const fallbackReel = await getDoc(doc(db, 'reels', entry.itemId)).catch(() => null);
            if (fallbackReel && fallbackReel.exists()) {
              reelDocs.push(fallbackReel.data() as Reel);
            }
          }
        })
      );
      setSavedPostDocs(postDocs);
      setSavedReelDocs(reelDocs);
    })();
  }, [isOwnProfile, userPublic, savedEntries, savedIds]);

  useEffect(() => {
    if (!profileUid) return;
    const q = query(
      collection(db, 'reposts'),
      where('userId', '==', profileUid)
    );
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const loadedReposts = snap.docs
          .map((d) => d.data() as RepostItem)
          .sort((a, b) => {
            const at = a.createdAt?.toDate?.().getTime() ?? Date.now();
            const bt = b.createdAt?.toDate?.().getTime() ?? Date.now();
            return bt - at;
          });
        setReposts(loadedReposts);
        const postIds = Array.from(
          new Set(loadedReposts.filter((r) => r.targetType === 'post').map((r) => r.targetId))
        );
        const reelIds = Array.from(
          new Set(loadedReposts.filter((r) => r.targetType === 'reel').map((r) => r.targetId))
        );
        const [loadedPosts, loadedReels] = await Promise.all([
          Promise.all(
            postIds.slice(0, 30).map(async (pid) => {
              const s = await getDoc(doc(db, 'posts', pid)).catch(() => null);
              return s && s.exists() ? (s.data() as Post) : null;
            })
          ),
          Promise.all(
            reelIds.slice(0, 30).map(async (rid) => {
              const s = await getDoc(doc(db, 'reels', rid)).catch(() => null);
              return s && s.exists() ? (s.data() as Reel) : null;
            })
          ),
        ]);
        setRepostPosts(loadedPosts.filter((x): x is Post => x !== null && !x.isDeleted));
        setRepostReels(loadedReels.filter((x): x is Reel => x !== null));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reposts')
    );
    return () => unsub();
  }, [profileUid]);

  // Listen to pending follow requests on own profile
  useEffect(() => {
    if (!isOwnProfile || !profileUid) {
      setPendingRequesters([]);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(db, 'follows'),
        where('targetId', '==', profileUid),
        where('status', '==', 'pending')
      ),
      async (snap) => {
        const followerIds = snap.docs.map((d) => (d.data() as FollowEdge).followerId);
        const loaded = await Promise.all(
          followerIds.slice(0, 30).map(async (fid) => {
            const s = await getDoc(doc(db, 'users', fid)).catch(() => null);
            return s && s.exists() ? (s.data() as UserPublic) : null;
          })
        );
        setPendingRequesters(loaded.filter((u): u is UserPublic => Boolean(u)));
      },
      () => {}
    );
    return () => unsub();
  }, [isOwnProfile, profileUid]);

  const openFollowList = async (kind: 'followers' | 'following') => {
    setListModal(kind);
    setListUsers([]);
    setListLoading(true);
    try {
      const field = kind === 'followers' ? 'targetId' : 'followerId';
      const snap = await getDocs(
        query(collection(db, 'follows'), where(field, '==', profileUid), where('status', '==', 'active'))
      );
      const uids = snap.docs.map((d) => {
        const edge = d.data() as FollowEdge;
        return kind === 'followers' ? edge.followerId : edge.targetId;
      });
      const loaded = await Promise.all(
        uids.slice(0, 50).map(async (id) => {
          const uSnap = await getDoc(doc(db, 'users', id)).catch(() => null);
          return uSnap && uSnap.exists() ? (uSnap.data() as UserPublic) : null;
        })
      );
      setListUsers(loaded.filter((u): u is UserPublic => Boolean(u)));
    } finally {
      setListLoading(false);
    }
  };

  const handleSaveProfileEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !userPublic) return;
    setEditError('');
    const cleanUser = editUsername.trim();
    if (!BLUEPRINT_LIMITS.USERNAME_REGEX.test(cleanUser)) {
      return setEditError('Username must be 3–30 chars (letters, numbers, _, .).');
    }

    setSavingEdit(true);
    try {
      const batch = writeBatch(db);
      const nextLower = cleanUser.toLowerCase();
      if (nextLower !== profile.usernameLower) {
        const check = await getDoc(doc(db, 'usernames', nextLower));
        if (check.exists() && check.data().uid !== profile.uid) {
          throw new Error('Username is already taken.');
        }
        batch.delete(doc(db, 'usernames', profile.usernameLower));
        batch.set(doc(db, 'usernames', nextLower), {
          uid: profile.uid,
          username: cleanUser,
          createdAt: serverTimestamp(),
        });
      }

      batch.update(doc(db, 'users', profile.uid), {
        displayName: editName.trim().slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
        username: cleanUser,
        usernameLower: nextLower,
        bio: editBio.trim().slice(0, BLUEPRINT_LIMITS.BIO_MAX),
        website: editWebsite.trim().slice(0, BLUEPRINT_LIMITS.WEBSITE_MAX),
        location: editLocation.trim().slice(0, BLUEPRINT_LIMITS.LOCATION_MAX),
        isPrivate: editPrivate,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setShowEdit(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'photoURL' | 'coverURL'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const uploaded = await uploadMediaFile(file);
    await updateDoc(doc(db, 'users', profile.uid), {
      [field]: uploaded.url,
      updatedAt: serverTimestamp(),
    });
  };

  const handleRequestVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !verifyReason.trim()) return;
    const reqId = generateId('ver');
    const batch = writeBatch(db);
    batch.set(doc(db, 'verificationRequests', reqId), {
      id: reqId,
      userId: profile.uid,
      username: profile.username,
      fullName: profile.displayName,
      category: verifyCategory,
      reason: verifyReason.trim().slice(0, 500),
      link: verifyLink.trim().slice(0, 200),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', profile.uid), {
      verificationStatus: 'pending',
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    setVerifySubmitted(true);
  };

  const openHighlightCreator = async () => {
    if (!userPublic) return;
    setShowHighlightModal(true);
    const snap = await getDocs(query(collection(db, 'stories'), where('authorId', '==', userPublic.uid)));
    setArchivedStories(snap.docs.map((d) => d.data() as Story));
  };

  const handleSaveHighlight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublic || !highlightTitle.trim() || selectedHighlightStoryIds.length === 0) return;
    const hid = generateId('hl');
    const coverStory = archivedStories.find((s) => s.id === selectedHighlightStoryIds[0]);
    await setDoc(doc(db, 'users', userPublic.uid, 'highlights', hid), {
      id: hid,
      ownerId: userPublic.uid,
      title: highlightTitle.trim().slice(0, 40),
      coverURL: coverStory?.mediaURL || '',
      storyIds: selectedHighlightStoryIds.slice(0, 50),
      createdAt: serverTimestamp(),
    });
    setHighlightTitle('');
    setSelectedHighlightStoryIds([]);
    setShowHighlightModal(false);
  };

  const openHighlightViewer = async (hl: StoryHighlight) => {
    const loaded: Story[] = [];
    for (const sid of hl.storyIds) {
      const s = await getDoc(doc(db, 'stories', sid)).catch(() => null);
      if (s && s.exists()) loaded.push(s.data() as Story);
    }
    if (loaded.length > 0) setActiveHighlight({ highlight: hl, stories: loaded });
  };

  if (profileMissing) {
    return (
      <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-12 text-center space-y-2">
        <p className="text-lg font-bold">Profile unavailable</p>
        <p className="text-sm text-slate-500">This MIXY account could not be found or is no longer active.</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-fuchsia-500" />
      </div>
    );
  }

  const isFollowing = followingIds.has(profile.uid);
  const isPending = pendingFollowIds.has(profile.uid);
  const canViewContent = isOwnProfile || !profile.isPrivate || isFollowing;
  const eff = profile.profileEffect;
  const frameClass =
    eff?.frame && eff.frame !== 'none' ? `mixy-frame-${eff.frame}` : '';
  const borderWrapperClass =
    eff?.borderGradient && eff.borderGradient !== 'none'
      ? BORDER_GRADIENT_CLASS[eff.borderGradient]
      : '';
  const themeStyle =
    PROFILE_THEME_CLASS[eff?.theme || 'default'] || PROFILE_THEME_CLASS.default;

  const toggleProfileMusic = () => {
    if (!eff?.musicUrl) return;
    const resolvedMusic = mediaUrl(eff.musicUrl);
    if (musicPlaying) {
      profileAudioRef.current?.pause();
      setMusicPlaying(false);
    } else {
      if (!profileAudioRef.current || profileAudioRef.current.src !== resolvedMusic) {
        profileAudioRef.current = new Audio(resolvedMusic);
        profileAudioRef.current.onended = () => setMusicPlaying(false);
      }
      void profileAudioRef.current.play().then(() => setMusicPlaying(true)).catch(() => {});
    }
  };

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} className="shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cover + Profile Header */}
      <div className={`rounded-3xl ${borderWrapperClass || 'border border-slate-200 dark:border-white/10'} overflow-hidden`}>
        <div className={`rounded-[22px] ${themeStyle.card} ${themeStyle.text} overflow-hidden relative`}>
          {eff?.backgroundUrl && (
            <img
              src={mediaUrl(eff.backgroundUrl)}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none"
            />
          )}
          <div className="relative h-40 sm:h-52 bg-slate-900 mixy-aurora-surface">
            {profile.coverURL && (
              <img
                src={mediaUrl(profile.coverURL)}
                alt="Profile cover"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            )}
            {isOwnProfile && (
              <label className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-black/80">
                <Camera className="w-3.5 h-3.5" /> Cover
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handlePhotoUpload(e, 'coverURL')}
                />
              </label>
            )}
          </div>

          <div className="px-5 pb-6 -mt-12 relative space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="relative">
                <div className={`rounded-full p-1 transition-all ${frameClass}`}>
                  <UserAvatar
                    src={profile.photoURL}
                    name={profile.displayName}
                    size="xl"
                    hasStory
                  />
                </div>
                {profile.isVerified && (
                  <span className="absolute top-0.5 right-0.5 rounded-full bg-white dark:bg-[#07070D] p-[2px] shadow-md flex items-center justify-center">
                    <VerifiedBadge className="w-5 h-5" verificationType={profile.verificationType} />
                  </span>
                )}
                {isOwnProfile && (
                  <label className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-slate-900 text-white border border-white/20 flex items-center justify-center cursor-pointer">
                    <Camera className="w-4 h-4" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handlePhotoUpload(e, 'photoURL')}
                    />
                  </label>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                {isOwnProfile ? (
                  <>
                    <button
                      onClick={() => setShowEdit(true)}
                      className="px-4 h-10 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit profile
                    </button>
                    <button
                      onClick={() => setShowEffectsModal(true)}
                      className="px-4 h-10 rounded-xl mixy-gradient-bg text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm hover:opacity-95"
                      title="Profile effects, frames, music & themes"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Effects
                    </button>
                    {onOpenCloseFriends && (
                      <button
                        onClick={onOpenCloseFriends}
                        className="px-3.5 h-10 rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e] text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Heart className="w-3.5 h-3.5" /> Close Friends
                      </button>
                    )}
                    {onOpenStudio && (
                      <button
                        onClick={onOpenStudio}
                        className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/15 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
                        aria-label="Creator Studio"
                        title="Creator Studio"
                      >
                        <BarChart3 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={onOpenSettings}
                      className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/15 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
                      aria-label="Settings"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      disabled={followLoading}
                      onClick={async () => {
                        if (!userPublic || followLoading) return;
                        setFollowLoading(true);
                        setActionError('');
                        try {
                          await toggleFollowUser(userPublic, profile, isFollowing);
                        } catch (err) {
                          setActionError(err instanceof Error ? err.message : 'Unable to update follow status.');
                        } finally {
                          setFollowLoading(false);
                        }
                      }}
                      className={`px-5 h-10 rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60 ${
                        isFollowing || isPending
                          ? 'border border-slate-200 dark:border-white/15'
                          : 'mixy-gradient-bg text-white'
                      }`}
                    >
                      {followLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isFollowing ? (
                        <UserCheck className="w-3.5 h-3.5" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5" />
                      )}
                      {isFollowing ? 'Following' : isPending ? 'Requested' : 'Follow'}
                    </button>
                    <button
                      disabled={msgLoading}
                      onClick={async () => {
                        if (!userPublic || msgLoading) return;
                        setMsgLoading(true);
                        setActionError('');
                        try {
                          const cid = await getOrCreateDirectConversation(
                            userPublic,
                            profile,
                            followingIds.has(profile.uid)
                          );
                          onOpenMessageConv(cid);
                        } catch (err) {
                          setActionError(err instanceof Error ? err.message : 'Unable to open chat.');
                        } finally {
                          setMsgLoading(false);
                        }
                      }}
                      className="px-4 h-10 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-60"
                    >
                      {msgLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <MessageSquare className="w-3.5 h-3.5" />
                      )}
                      Message
                    </button>
                  </>
                )}

                <div className="relative">
                  <button
                    onClick={() => setShowMoreMenu((v) => !v)}
                    className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/15 flex items-center justify-center"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {showMoreMenu && (
                    <div className="absolute right-0 mt-1 w-48 rounded-2xl bg-white dark:bg-[#171726] text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 shadow-xl py-1.5 z-30 text-sm">
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            `${window.location.origin}/?u=${profile.username}`
                          );
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 1800);
                          setShowMoreMenu(false);
                        }}
                        className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/5"
                      >
                        <Link2 className="w-4 h-4" /> {copiedLink ? 'Link copied!' : 'Copy profile link'}
                      </button>
                      {isOwnProfile && !profile.isVerified && (
                        <button
                          onClick={() => {
                            setShowMoreMenu(false);
                            setShowVerifyModal(true);
                          }}
                          className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/5"
                        >
                          <VerifiedBadge className="w-4 h-4" /> Request verification
                        </button>
                      )}
                      {!isOwnProfile && (
                        <>
                          <button
                            onClick={async () => {
                              if (!userPublic) return;
                              await setDoc(
                                doc(db, 'users', userPublic.uid, 'private', 'info'),
                                {
                                  uid: userPublic.uid,
                                  email: firebaseUser?.email || '',
                                  blockedIds: arrayUnion(profile.uid),
                                  updatedAt: serverTimestamp(),
                                },
                                { merge: true }
                              );
                              setShowMoreMenu(false);
                            }}
                            className="w-full px-3.5 py-2 text-left flex items-center gap-2 text-rose-500 hover:bg-rose-500/10"
                          >
                            <ShieldBan className="w-4 h-4" /> Block user
                          </button>
                          <button
                            onClick={() => {
                              setShowMoreMenu(false);
                              setShowReport(true);
                            }}
                            className="w-full px-3.5 py-2 text-left flex items-center gap-2 text-rose-500 hover:bg-rose-500/10"
                          >
                            <Flag className="w-4 h-4" /> Report user
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <h1 className="text-xl font-bold flex flex-wrap items-center gap-2">
                <span>{profile.displayName}</span>
                {profile.isVerified && (
                  <VerifiedBadge className="w-5 h-5" verificationType={profile.verificationType} />
                )}
                {profile.sleepModeActive && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-500 border border-indigo-500/30">
                    <Moon className="w-3 h-3" /> Sleeping
                  </span>
                )}
                {profile.mood && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10">
                    <span>{profile.mood.emoji}</span>
                    <span className="text-[11px] font-normal">{profile.mood.label}</span>
                  </span>
                )}
                {profile.isPrivate && <Lock className="w-4 h-4 text-slate-400" />}
              </h1>
              <p className={`text-sm flex items-center gap-1 ${themeStyle.sub}`}>
                <span>@{profile.username}</span>
                {profile.isVerified && (
                  <VerifiedBadge className="w-3.5 h-3.5" verificationType={profile.verificationType} />
                )}
              </p>
              {eff?.intro && (
                <p className="text-xs font-medium italic text-fuchsia-500">{eff.intro}</p>
              )}
              {eff?.badges && eff.badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {eff.badges.map((b) => (
                    <span
                      key={b}
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold mixy-gradient-bg text-white shadow-xs"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              )}
              {eff?.musicTitle && (
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-600 dark:text-fuchsia-400 font-medium w-fit">
                  <Music className="w-3.5 h-3.5" />
                  <span>{eff.musicTitle}</span>
                  {eff.musicUrl && (
                    <button
                      type="button"
                      onClick={toggleProfileMusic}
                      className="w-5 h-5 rounded-full mixy-gradient-bg text-white flex items-center justify-center"
                      aria-label={musicPlaying ? 'Pause profile track' : 'Play profile track'}
                    >
                      {musicPlaying ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                    </button>
                  )}
                </div>
              )}
              {profile.bio && (
                <p className="text-sm whitespace-pre-wrap pt-1 opacity-90">
                  {profile.bio}
                </p>
              )}
              <div className={`flex flex-wrap items-center gap-4 text-xs pt-1 ${themeStyle.sub}`}>
                {profile.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> {profile.location}
                  </span>
                )}
                {profile.website && (
                  <a
                    href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-fuchsia-500 hover:underline"
                  >
                    <Globe className="w-3.5 h-3.5" /> {profile.website}
                  </a>
                )}
              </div>
            </div>

          {/* Stats Row */}
          <div className="flex items-center gap-6 pt-2 border-t border-slate-100 dark:border-white/5">
            <div className="text-sm">
              <span className="font-bold tabular-nums">{formatCount(posts.length)}</span>{' '}
              <span className="text-slate-500">Posts</span>
            </div>
            <button onClick={() => openFollowList('followers')} className="text-sm hover:underline">
              <span className="font-bold tabular-nums">{formatCount(profile.followersCount)}</span>{' '}
              <span className="text-slate-500">Followers</span>
            </button>
            <button onClick={() => openFollowList('following')} className="text-sm hover:underline">
              <span className="font-bold tabular-nums">{formatCount(profile.followingCount)}</span>{' '}
              <span className="text-slate-500">Following</span>
            </button>
          </div>

            {/* Story Highlights */}
            {(highlights.length > 0 || isOwnProfile) && (
              <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pt-2">
                {isOwnProfile && (
                  <button
                    onClick={openHighlightCreator}
                    className="flex flex-col items-center gap-1.5 shrink-0"
                  >
                    <div className="w-14 h-14 rounded-full border-2 border-dashed border-slate-300 dark:border-white/20 flex items-center justify-center">
                      <Plus className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] opacity-70">Highlight</span>
                  </button>
                )}
                {highlights.map((hl) => (
                  <button
                    key={hl.id}
                    onClick={() => void openHighlightViewer(hl)}
                    className="flex flex-col items-center gap-1.5 shrink-0"
                  >
                    <UserAvatar src={hl.coverURL} name={hl.title} size="md" hasStory />
                    <span className="text-[11px] max-w-[64px] truncate">{hl.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pending Follow Requests on Own Private Profile */}
      {isOwnProfile && pendingRequesters.length > 0 && (
        <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Follow Requests ({pendingRequesters.length})
          </p>
          <div className="space-y-2">
            {pendingRequesters.map((reqUser) => (
              <div key={reqUser.uid} className="flex items-center justify-between gap-3">
                <button
                  onClick={() => onOpenProfile(reqUser.uid)}
                  className="flex items-center gap-2.5 min-w-0 text-left"
                >
                  <UserAvatar src={reqUser.photoURL} name={reqUser.displayName} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold flex items-center gap-1 truncate">
                      <span className="truncate">{reqUser.displayName}</span>
                      <UserVerifiedBadge uid={reqUser.uid} fallback={reqUser.isVerified} className="w-3.5 h-3.5" />
                    </p>
                    <p className="text-xs text-slate-500 truncate">@{reqUser.username}</p>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    disabled={respondingReqId === reqUser.uid}
                    onClick={async () => {
                      if (!userPublic) return;
                      setRespondingReqId(reqUser.uid);
                      try {
                        await respondToFollowRequest(userPublic, reqUser.uid, true);
                      } finally {
                        setRespondingReqId(null);
                      }
                    }}
                    className="px-3 h-8 rounded-xl mixy-gradient-bg text-white text-xs font-semibold"
                  >
                    Accept
                  </button>
                  <button
                    disabled={respondingReqId === reqUser.uid}
                    onClick={async () => {
                      if (!userPublic) return;
                      setRespondingReqId(reqUser.uid);
                      try {
                        await respondToFollowRequest(userPublic, reqUser.uid, false);
                      } finally {
                        setRespondingReqId(null);
                      }
                    }}
                    className="px-3 h-8 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content Tabs */}
      {!canViewContent ? (
        <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-10 text-center space-y-2">
          <Lock className="w-8 h-8 mx-auto text-slate-400" />
          <p className="font-bold">This account is private</p>
          <p className="text-sm text-slate-500">Follow @{profile.username} to see their posts and reels.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-white/5 w-fit">
            <button
              onClick={() => setActiveTab('posts')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                activeTab === 'posts'
                  ? 'bg-white dark:bg-[#1A1A28] shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              <Grid className="w-3.5 h-3.5" /> Posts
            </button>
            <button
              onClick={() => setActiveTab('reels')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                activeTab === 'reels'
                  ? 'bg-white dark:bg-[#1A1A28] shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              <Film className="w-3.5 h-3.5" /> Reels
            </button>
            <button
              onClick={() => setActiveTab('tagged')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                activeTab === 'tagged'
                  ? 'bg-white dark:bg-[#1A1A28] shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              <Tag className="w-3.5 h-3.5" /> Tagged
            </button>
            <button
              onClick={() => setActiveTab('reposts')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                activeTab === 'reposts'
                  ? 'bg-white dark:bg-[#1A1A28] shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" /> Reposts
            </button>
            {isOwnProfile && (
              <button
                onClick={() => setActiveTab('saved')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                  activeTab === 'saved'
                    ? 'bg-white dark:bg-[#1A1A28] shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" /> Saved
              </button>
            )}
          </div>

          {activeTab === 'reposts' ? (
            reposts.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">No reposts yet.</p>
            ) : (
              <div className="space-y-3">
                {reposts.map((rp) => {
                  const targetPost =
                    rp.targetType === 'post'
                      ? repostPosts.find((p) => p.id === rp.targetId)
                      : undefined;
                  const targetReel =
                    rp.targetType === 'reel'
                      ? repostReels.find((r) => r.id === rp.targetId)
                      : undefined;
                  return (
                    <div
                      key={rp.id}
                      className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 bg-white dark:bg-[#12121D] space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                          <Repeat className="w-4 h-4 text-emerald-500" />
                          <span className="font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1">
                            <span>@{profile.username}</span>
                            {profile.isVerified && (
                              <VerifiedBadge className="w-3.5 h-3.5" verificationType={profile.verificationType} />
                            )}
                            <span>reposted</span>
                          </span>
                          <span>· {formatRelativeTime(rp.createdAt)}</span>
                        </div>
                        {isOwnProfile && userPublic && (
                          <button
                            onClick={() =>
                              void toggleRepostItem({
                                currentUser: userPublic,
                                targetType: rp.targetType,
                                targetId: rp.targetId,
                                originalAuthorId: rp.originalAuthorId,
                                originalAuthorUsername: rp.originalAuthorUsername,
                                currentlyReposted: true,
                              })
                            }
                            className="text-[11px] font-semibold text-rose-500 hover:underline"
                          >
                            Remove repost
                          </button>
                        )}
                      </div>
                      {rp.caption && (
                        <p className="text-sm text-slate-800 dark:text-slate-100 font-medium">
                          "{rp.caption}"
                        </p>
                      )}
                      {targetPost ? (
                        <div
                          onClick={() => setSelectedPost(targetPost)}
                          className="cursor-pointer p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 hover:border-fuchsia-500/50 transition-colors flex items-center gap-3"
                        >
                          {targetPost.media[0] && (
                            <img
                              src={mediaUrl(targetPost.media[0].url)}
                              alt="Thumbnail"
                              className="w-14 h-14 rounded-lg object-cover bg-black shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenProfile(targetPost.authorId);
                              }}
                              className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
                            >
                              <span>@{targetPost.authorUsername}</span>
                              <UserVerifiedBadge uid={targetPost.authorId} fallback={targetPost.authorVerified} className="w-3 h-3" />
                            </button>
                            <p className="text-xs text-slate-500 line-clamp-2">
                              {targetPost.caption || 'Media post'}
                            </p>
                          </div>
                        </div>
                      ) : targetReel ? (
                        <div
                          onClick={() => setSelectedReel(targetReel)}
                          className="cursor-pointer p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 hover:border-fuchsia-500/50 transition-colors flex items-center gap-3"
                        >
                          <div className="w-14 h-14 rounded-lg bg-black flex items-center justify-center text-white shrink-0">
                            <Film className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenProfile(targetReel.authorId);
                              }}
                              className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
                            >
                              <span>@{targetReel.authorUsername}</span>
                              <UserVerifiedBadge uid={targetReel.authorId} fallback={targetReel.authorVerified} className="w-3 h-3" />
                              <span>· Reel</span>
                            </button>
                            <p className="text-xs text-slate-500 line-clamp-2">
                              {targetReel.caption || 'Watch reel'}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">Original content is unavailable.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : activeTab === 'reels' ? (
            reels.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">No reels uploaded yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {reels.map((r) => (
                  <div key={r.id} className="relative aspect-[9/14] rounded-xl overflow-hidden bg-black">
                    <video src={mediaUrl(r.videoURL)} controls className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )
          ) : activeTab === 'saved' && isOwnProfile ? (
            <div className="space-y-4">
              {/* Saved Collections Bar */}
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedSavedFilter('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                        selectedSavedFilter === 'all'
                          ? 'mixy-gradient-bg text-white'
                          : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      All ({savedPostDocs.length + savedReelDocs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSavedFilter('reels')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 transition-colors ${
                        selectedSavedFilter === 'reels'
                          ? 'mixy-gradient-bg text-white'
                          : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Film className="w-3 h-3" /> Reels ({savedReelDocs.length})
                    </button>
                    {collections.map((col) => (
                      <div key={col.id} className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setSelectedSavedFilter(col.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                            selectedSavedFilter === col.id
                              ? 'mixy-gradient-bg text-white'
                              : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {col.name}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!userPublic) return;
                            await deleteDoc(doc(db, 'users', userPublic.uid, 'collections', col.id));
                            if (selectedSavedFilter === col.id) setSelectedSavedFilter('all');
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-500"
                          title="Delete collection"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!userPublic || !newSavedColName.trim() || creatingSavedCol) return;
                      setCreatingSavedCol(true);
                      try {
                        const cid = generateId('col');
                        await setDoc(doc(db, 'users', userPublic.uid, 'collections', cid), {
                          id: cid,
                          ownerId: userPublic.uid,
                          name: newSavedColName.trim().slice(0, 60),
                          createdAt: serverTimestamp(),
                        });
                        setNewSavedColName('');
                        setSelectedSavedFilter(cid);
                      } finally {
                        setCreatingSavedCol(false);
                      }
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      value={newSavedColName}
                      onChange={(e) => setNewSavedColName(e.target.value)}
                      maxLength={60}
                      placeholder="New collection..."
                      className="h-8 px-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs w-32 sm:w-40"
                    />
                    <button
                      type="submit"
                      disabled={!newSavedColName.trim() || creatingSavedCol}
                      className="h-8 px-2.5 rounded-xl mixy-gradient-bg text-white text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40"
                    >
                      <FolderPlus className="w-3.5 h-3.5" /> Add
                    </button>
                  </form>
                </div>
              </div>

              {(() => {
                const entryById = new Map(savedEntries.map((e) => [e.itemId, e]));
                const filteredPosts =
                  selectedSavedFilter === 'reels'
                    ? []
                    : savedPostDocs.filter((p) => {
                        if (selectedSavedFilter === 'all') return true;
                        const colId = entryById.get(p.id)?.collectionId ?? savedIds.get(p.id);
                        return colId === selectedSavedFilter;
                      });
                const filteredReels =
                  selectedSavedFilter === 'reels' || selectedSavedFilter === 'all'
                    ? savedReelDocs
                    : savedReelDocs.filter((r) => {
                        const colId = entryById.get(r.id)?.collectionId ?? savedIds.get(r.id);
                        return colId === selectedSavedFilter;
                      });

                if (filteredPosts.length === 0 && filteredReels.length === 0) {
                  return (
                    <p className="text-sm text-slate-500 text-center py-10">
                      {selectedSavedFilter === 'all'
                        ? 'No saved posts or reels yet.'
                        : 'No saved items in this filter yet.'}
                    </p>
                  );
                }

                return (
                  <div className="grid grid-cols-3 gap-2">
                    {filteredPosts.map((p) => {
                      const thumb = p.media[0];
                      const currentCol = entryById.get(p.id)?.collectionId ?? savedIds.get(p.id) ?? '';
                      const isBroken = brokenMediaIds.has(p.id);
                      return (
                        <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden bg-black group">
                          <button
                            type="button"
                            onClick={() => setSelectedPost(p)}
                            className="w-full h-full block"
                          >
                            {isBroken ? (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 text-[11px] gap-1">
                                <ImageOff className="w-5 h-5" />
                                <span>Media unavailable</span>
                              </div>
                            ) : thumb?.type === 'video' ? (
                              <video
                                src={mediaUrl(thumb.url)}
                                muted
                                onError={() => setBrokenMediaIds((prev) => new Set(prev).add(p.id))}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <img
                                src={mediaUrl(thumb?.url)}
                                alt={p.caption || 'Post'}
                                onError={() => setBrokenMediaIds((prev) => new Set(prev).add(p.id))}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                referrerPolicy="no-referrer"
                              />
                            )}
                          </button>
                          {collections.length > 0 && (
                            <select
                              aria-label="Assign to collection"
                              value={currentCol}
                              onClick={(e) => e.stopPropagation()}
                              onChange={async (e) => {
                                if (!userPublic) return;
                                await updateDoc(doc(db, 'users', userPublic.uid, 'savedPosts', p.id), {
                                  collectionId: e.target.value,
                                });
                              }}
                              className="absolute bottom-1.5 inset-x-1.5 h-6 px-1.5 rounded-lg bg-black/70 backdrop-blur-sm text-white text-[10px] border border-white/15 truncate"
                            >
                              <option value="">No collection</option>
                              {collections.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}

                    {filteredReels.map((r) => {
                      const currentCol = entryById.get(r.id)?.collectionId ?? savedIds.get(r.id) ?? '';
                      return (
                        <div key={r.id} className="relative aspect-square rounded-xl overflow-hidden bg-black group">
                          <button
                            type="button"
                            onClick={() => setSelectedReel(r)}
                            className="w-full h-full block"
                          >
                            <video
                              src={mediaUrl(r.videoURL)}
                              muted
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/65 text-white text-[10px] font-semibold flex items-center gap-1">
                              <Film className="w-3 h-3" /> Reel
                            </span>
                          </button>
                          {collections.length > 0 && (
                            <select
                              aria-label="Assign reel to collection"
                              value={currentCol}
                              onClick={(e) => e.stopPropagation()}
                              onChange={async (e) => {
                                if (!userPublic) return;
                                await updateDoc(doc(db, 'users', userPublic.uid, 'savedPosts', r.id), {
                                  collectionId: e.target.value,
                                });
                              }}
                              className="absolute bottom-1.5 inset-x-1.5 h-6 px-1.5 rounded-lg bg-black/70 backdrop-blur-sm text-white text-[10px] border border-white/15 truncate"
                            >
                              <option value="">No collection</option>
                              {collections.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          ) : (
            (() => {
              const gridPosts = activeTab === 'tagged' ? taggedPosts : posts;
              return gridPosts.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-10">No posts here yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {gridPosts.map((p) => {
                    const thumb = p.media[0];
                    const isBroken = brokenMediaIds.has(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPost(p)}
                        className="aspect-square rounded-xl overflow-hidden bg-black relative group"
                      >
                        {isBroken ? (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 text-[11px] gap-1">
                            <ImageOff className="w-5 h-5" />
                            <span>Media unavailable</span>
                          </div>
                        ) : thumb?.type === 'video' ? (
                          <video
                            src={mediaUrl(thumb.url)}
                            muted
                            onError={() => setBrokenMediaIds((prev) => new Set(prev).add(p.id))}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src={mediaUrl(thumb?.url)}
                            alt={p.caption || 'Post'}
                            onError={() => setBrokenMediaIds((prev) => new Set(prev).add(p.id))}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Selected Post Modal */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg relative my-auto">
            <button
              onClick={() => setSelectedPost(null)}
              className="absolute -top-11 right-0 w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
            <PostCard
              post={selectedPost}
              onOpenProfile={(uid) => {
                setSelectedPost(null);
                onOpenProfile(uid);
              }}
              onOpenHashtag={(tag) => {
                setSelectedPost(null);
                onOpenHashtag(tag);
              }}
            />
          </div>
        </div>
      )}

      {/* Selected Reel Modal */}
      {selectedReel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl overflow-hidden bg-black relative">
            <button
              onClick={() => setSelectedReel(null)}
              className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
            <video src={mediaUrl(selectedReel.videoURL)} controls autoPlay playsInline className="w-full aspect-[9/15] object-cover" />
            <div className="p-4 text-white space-y-1">
              <button
                onClick={() => {
                  const aid = selectedReel.authorId;
                  setSelectedReel(null);
                  onOpenProfile(aid);
                }}
                className="text-sm font-bold inline-flex items-center gap-1 hover:underline"
              >
                <span>@{selectedReel.authorUsername}</span>
                <UserVerifiedBadge uid={selectedReel.authorId} fallback={selectedReel.authorVerified} className="w-3.5 h-3.5" />
              </button>
              {selectedReel.caption && <p className="text-xs text-white/80">{selectedReel.caption}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Followers / Following List Modal */}
      {listModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 p-5 space-y-4 max-h-[75vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="font-bold capitalize">{listModal}</h3>
              <button onClick={() => setListModal(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {listLoading ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-fuchsia-500" />
                </div>
              ) : listUsers.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">No accounts yet.</p>
              ) : (
                listUsers.map((u) => {
                  const isSelf = u.uid === userPublic?.uid;
                  const rowFollowing = followingIds.has(u.uid);
                  const rowPending = pendingFollowIds.has(u.uid);
                  return (
                    <div
                      key={u.uid}
                      className="w-full flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      <button
                        onClick={() => {
                          setListModal(null);
                          onOpenProfile(u.uid);
                        }}
                        className="flex items-center gap-3 min-w-0 text-left flex-1"
                      >
                        <UserAvatar src={u.photoURL} name={u.displayName} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold flex items-center gap-1 truncate">
                            <span className="truncate">{u.displayName}</span>
                            <UserVerifiedBadge uid={u.uid} fallback={u.isVerified} className="w-3.5 h-3.5" />
                          </p>
                          <p className="text-xs text-slate-500 truncate">@{u.username}</p>
                        </div>
                      </button>
                      {!isSelf && userPublic && (
                        <button
                          disabled={listFollowBusyId === u.uid}
                          onClick={async () => {
                            setListFollowBusyId(u.uid);
                            try {
                              await toggleFollowUser(userPublic, u, rowFollowing);
                            } finally {
                              setListFollowBusyId(null);
                            }
                          }}
                          className={`px-3 h-8 rounded-xl text-xs font-semibold shrink-0 ${
                            rowFollowing || rowPending
                              ? 'border border-slate-200 dark:border-white/15'
                              : 'mixy-gradient-bg text-white'
                          }`}
                        >
                          {listFollowBusyId === u.uid
                            ? '...'
                            : rowFollowing
                              ? 'Following'
                              : rowPending
                                ? 'Requested'
                                : 'Follow'}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveProfileEdit}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 p-6 space-y-3.5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Edit Profile</h3>
              <button type="button" onClick={() => setShowEdit(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            {editError && (
              <p className="text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-xl">{editError}</p>
            )}
            <div>
              <label className="block text-xs font-medium mb-1">Display Name</label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Username</label>
              <input
                type="text"
                required
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value.replace(/\s/g, ''))}
                className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Bio</label>
              <textarea
                rows={3}
                maxLength={BLUEPRINT_LIMITS.BIO_MAX}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Website</label>
              <input
                type="text"
                value={editWebsite}
                onChange={(e) => setEditWebsite(e.target.value)}
                placeholder="https://..."
                className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Location</label>
              <input
                type="text"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
              />
            </div>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={editPrivate}
                onChange={(e) => setEditPrivate(e.target.checked)}
                className="w-4 h-4 accent-fuchsia-500"
              />
              Private Account (only approved followers can see posts)
            </label>
            <button
              type="submit"
              disabled={savingEdit}
              className="w-full h-11 rounded-xl mixy-gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Profile
            </button>
          </form>
        </div>
      )}

      {/* Request Verification Modal */}
      {showVerifyModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <VerifiedBadge className="w-5 h-5" /> Verified Badge Request
              </h3>
              <button onClick={() => setShowVerifyModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            {verifySubmitted || profile.verificationStatus === 'pending' ? (
              <div className="py-4 text-center space-y-2">
                <Check className="w-10 h-10 text-emerald-500 mx-auto" />
                <p className="font-semibold">Application under review</p>
                <p className="text-sm text-slate-500">
                  Our admin team will review your verification request and notify you.
                </p>
              </div>
            ) : (
              <form onSubmit={handleRequestVerification} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Category</label>
                  <select
                    value={verifyCategory}
                    onChange={(e) => setVerifyCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  >
                    <option className="bg-white dark:bg-[#12121D]">Creator / Public Figure</option>
                    <option className="bg-white dark:bg-[#12121D]">Music & Entertainment</option>
                    <option className="bg-white dark:bg-[#12121D]">Sports & Gaming</option>
                    <option className="bg-white dark:bg-[#12121D]">Brand / Organization</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Reference Link (optional)</label>
                  <input
                    type="text"
                    value={verifyLink}
                    onChange={(e) => setVerifyLink(e.target.value)}
                    placeholder="https://..."
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Why should this account be verified?</label>
                  <textarea
                    rows={3}
                    required
                    value={verifyReason}
                    onChange={(e) => setVerifyReason(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full h-11 rounded-xl mixy-gradient-bg text-white font-semibold text-sm"
                >
                  Submit Application
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Highlight Creator Modal */}
      {showHighlightModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveHighlight}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 p-6 space-y-4 max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-fuchsia-500" /> New Story Highlight
              </h3>
              <button type="button" onClick={() => setShowHighlightModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              required
              maxLength={40}
              value={highlightTitle}
              onChange={(e) => setHighlightTitle(e.target.value)}
              placeholder="Highlight title (e.g. Gaming, Travel)"
              className="w-full h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
            />
            <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-2">
              {archivedStories.length === 0 ? (
                <p className="col-span-3 text-xs text-slate-500 text-center py-6">
                  Publish a story first to add it to a Highlight.
                </p>
              ) : (
                archivedStories.map((st) => {
                  const picked = selectedHighlightStoryIds.includes(st.id);
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() =>
                        setSelectedHighlightStoryIds((prev) =>
                          picked ? prev.filter((id) => id !== st.id) : [...prev, st.id]
                        )
                      }
                      className={`relative aspect-[9/14] rounded-xl overflow-hidden border-2 ${
                        picked ? 'border-fuchsia-500' : 'border-transparent'
                      }`}
                    >
                      {st.mediaType === 'video' ? (
                        <video src={mediaUrl(st.mediaURL)} muted className="w-full h-full object-cover" />
                      ) : (
                        <img src={mediaUrl(st.mediaURL)} alt="Story" className="w-full h-full object-cover" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
            <button
              type="submit"
              disabled={!highlightTitle.trim() || selectedHighlightStoryIds.length === 0}
              className="w-full h-11 rounded-xl mixy-gradient-bg text-white font-semibold text-sm disabled:opacity-40"
            >
              Save Highlight
            </button>
          </form>
        </div>
      )}

      {/* Highlight Viewer */}
      {activeHighlight && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div className="relative w-full max-w-sm aspect-[9/16] rounded-3xl overflow-hidden bg-black">
            <img
              src={mediaUrl(activeHighlight.stories[0].mediaURL)}
              alt={activeHighlight.highlight.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 inset-x-4 flex items-center justify-between text-white">
              <span className="font-bold text-sm">{activeHighlight.highlight.title}</span>
              <button
                onClick={() => setActiveHighlight(null)}
                className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {showReport && (
        <ReportModal targetType="user" targetId={profile.uid} onClose={() => setShowReport(false)} />
      )}

      {showEffectsModal && (
        <ProfileEffectsModal
          open={showEffectsModal}
          userPosts={posts}
          onClose={() => setShowEffectsModal(false)}
        />
      )}
    </div>
  );
}
