import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Archive,
  ArrowLeft,
  BarChart3,
  BellOff,
  Camera,
  Check,
  CheckCheck,
  CheckSquare,
  Clock,
  Copy,
  Download,
  Edit3,
  FileText,
  Film,
  Flag,
  Forward,
  Image as ImageIcon,
  Languages,
  Link2,
  Loader2,
  Mic,
  MoreVertical,
  Palette,
  Paperclip,
  Pause,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  Pin,
  Play,
  Plus,
  Reply,
  Search,
  Send,
  ShieldBan,
  Smile,
  Sparkles,
  Square,
  Star,
  Trash2,
  Undo2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { apiFetch, mediaUrl } from '../lib/api';
import {
  DM_APPEARANCE_CLASSES,
  DM_BUBBLE_PADDING_CLASSES,
  DM_CORNER_RADIUS_MAP,
  DM_EFFECT_OPTIONS,
  DM_FONT_OPTIONS,
  DM_TEXT_SIZE_CLASSES,
  resolveConversationStyle,
} from '../lib/dmThemes';
import {
  auth,
  BLUEPRINT_LIMITS,
  db,
  formatRelativeTime,
  generateId,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { uploadMediaFile } from '../lib/media';
import { realtimeClient } from '../lib/realtime';
import { getOrCreateDirectConversation, sendConversationMessage } from '../lib/socialActions';
import type {
  CallRecord,
  Conversation,
  ConversationMember,
  DmCollectionTag,
  DmMessageEffect,
  GroupInvite,
  Message,
  NoteItem,
  ScheduledMessage,
  UserPublic,
} from '../types/mixy';
import { DmCustomizeModal } from './dm/DmCustomizeModal';
import { ForwardShareModal } from './dm/ForwardShareModal';
import { GroupManageModal } from './dm/GroupManageModal';
import { MediaCaptureModal } from './dm/MediaCaptureModal';
import { VoicePlayer } from './dm/VoicePlayer';
import { JuliusAvatar, JuliusChatPanel } from './JuliusChatPanel';
import { UserAvatar, UserVerifiedBadge } from './MixyLogo';
import { ReportModal } from './ReportModal';

const QUICK_REACTIONS = ['❤️', '😂', '😮', '🔥', '👍', '😢'];
const EXPANDED_EMOJIS = [
  '❤️', '😂', '😮', '🔥', '👍', '😢', '🙌', '🥳', '✨', '💯',
  '🫧', '💖', '🫶', '😎', '🤩', '🤝', '🙏', '🎵', '💎', '🚀',
];
const TRANSLATE_LANGUAGES = [
  'English',
  'Swahili',
  'French',
  'Spanish',
  'Arabic',
  'German',
  'Hindi',
  'Japanese',
];
const COLLECTION_TABS: { id: DmCollectionTag; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'friends', label: 'Friends' },
  { id: 'family', label: 'Family' },
  { id: 'groups', label: 'Groups' },
  { id: 'favorites', label: 'Favorites' },
];

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'File';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getEffectParticles(effect?: DmMessageEffect): string[] {
  if (effect === 'hearts') return ['💖', '❤️', '💕', '💗', '💓'];
  if (effect === 'sparkles') return ['✨', '⭐', '💫', '🌟', '✨'];
  if (effect === 'confetti') return ['🎉', '🎊', '🎈', '✨', '🥳'];
  if (effect === 'bubbles') return ['🫧', '💧', '🫧', '🩵', '🫧'];
  return [];
}

export function MessagesView({
  initialConversationId,
  onOpenProfile,
  onOpenPost,
  onOpenReel,
  onOpenStories,
}: {
  initialConversationId?: string | null;
  onOpenProfile: (uid: string) => void;
  onOpenPost?: (postId: string) => void;
  onOpenReel?: (reelId: string) => void;
  onOpenStories?: () => void;
}) {
  const {
    firebaseUser,
    userPublic,
    userPrivate,
    followingIds,
    onlineUsers,
    lastSeenUsers,
  } = useAuth();
  const { startCall } = useCall();

  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const [showCallHistory, setShowCallHistory] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [memberships, setMemberships] = useState<Map<string, ConversationMember>>(new Map());
  const [usersMap, setUsersMap] = useState<Map<string, UserPublic>>(new Map());
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [showNotesPanel, setShowNotesPanel] = useState(false);

  const [activeConvId, setActiveConvId] = useState<string | null>(initialConversationId || null);
  const [juliusSelected, setJuliusSelected] = useState(false);
  const [folder, setFolder] = useState<'inbox' | 'requests' | 'archived'>('inbox');
  const [collectionFilter, setCollectionFilter] = useState<DmCollectionTag>('all');
  const [searchConv, setSearchConv] = useState('');

  // Thread state
  const [messages, setMessages] = useState<Message[]>([]);
  const [scheduledMsgs, setScheduledMsgs] = useState<ScheduledMessage[]>([]);
  const [msgText, setMsgText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaErr, setMediaErr] = useState('');
  const [typingMap, setTypingMap] = useState<Record<string, boolean>>({});
  const [reactingMsgId, setReactingMsgId] = useState<string | null>(null);
  const [msgMenuId, setMsgMenuId] = useState<string | null>(null);
  const [showMoreEmojisFor, setShowMoreEmojisFor] = useState<string | null>(null);
  const [showChatMenu, setShowChatMenu] = useState(false);

  // Search / Starred filter inside thread
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [inChatQuery, setInChatQuery] = useState('');
  const [starredOnly, setStarredOnly] = useState(false);

  // Multi-select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());

  // Modals & Overlays
  const [customizeTab, setCustomizeTab] = useState<'themes' | 'moods' | 'fonts' | 'privacy' | null>(null);
  const [groupModalTab, setGroupModalTab] = useState<'info' | 'members' | 'poll' | 'invite' | null>(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [forwardMessages, setForwardMessages] = useState<Message[] | null>(null);
  const [reportTarget, setReportTarget] = useState<{ type: 'user' | 'message'; id: string } | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Effects & Translation state
  const [selectedEffect, setSelectedEffect] = useState<DmMessageEffect>('none');
  const [showEffectPicker, setShowEffectPicker] = useState(false);
  const [activeEffectBursts, setActiveEffectBursts] = useState<Record<string, number>>({});
  const [translateLang, setTranslateLang] = useState('English');
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);

  // Schedule message popover
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDatetime, setScheduleDatetime] = useState('');

  // Join invite code dialog
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinStatus, setJoinStatus] = useState('');

  // Voice recording with Pause/Resume & real waveform bars
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [liveBars, setLiveBars] = useState<number[]>(new Array(18).fill(22));
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRafRef = useRef<number | null>(null);
  const waveformSamplesRef = useRef<number[]>([]);
  const cancelVoiceRef = useRef(false);
  const recordingSecRef = useRef(0);

  // New DM / Group Modal
  const [showNewChat, setShowNewChat] = useState(false);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Swipe-left tracking in conversation list
  const [swipedConvId, setSwipedConvId] = useState<string | null>(null);
  const swipeTouchStartX = useRef<number | null>(null);

  // Disappearing message clock tick
  const [nowTick, setNowTick] = useState(() => Date.now());

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialConversationId) {
      setActiveConvId(initialConversationId);
      setJuliusSelected(false);
    }
  }, [initialConversationId]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  // Load all active users
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'users'), where('isDeactivated', '==', false)),
      (snap) => {
        const next = new Map<string, UserPublic>();
        snap.forEach((d) => {
          const u = d.data() as UserPublic;
          next.set(u.uid, u);
        });
        setUsersMap(next);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );
    return () => unsub();
  }, []);

  // Load conversations
  useEffect(() => {
    if (!userPublic) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'conversations'),
        where('participantIds', 'array-contains', userPublic.uid)
      ),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Conversation);
        list.sort((a, b) => {
          const at = a.lastMessageAt?.toDate?.().getTime() || a.updatedAt?.toDate?.().getTime() || 0;
          const bt = b.lastMessageAt?.toDate?.().getTime() || b.updatedAt?.toDate?.().getTime() || 0;
          return bt - at;
        });
        setConversations(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'conversations')
    );
    return () => unsub();
  }, [userPublic]);

  // Subscribe to per-conversation member metadata
  useEffect(() => {
    if (!userPublic || conversations.length === 0) return;
    const unsubs = conversations.map((c) =>
      onSnapshot(
        doc(db, 'conversations', c.id, 'members', userPublic.uid),
        (snap) => {
          if (snap.exists()) {
            setMemberships((prev) => {
              const copy = new Map(prev);
              copy.set(c.id, snap.data() as ConversationMember);
              return copy;
            });
          }
        },
        () => {}
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [userPublic, conversations]);

  // Subscribe to active 24h DM Notes
  useEffect(() => {
    const unsub = onSnapshot(
      query(
        collection(db, 'notes'),
        where('expiresAt', '>', Timestamp.now()),
        orderBy('expiresAt', 'desc')
      ),
      (snap) => {
        const now = Date.now();
        const list = snap.docs
          .map((d) => d.data() as NoteItem)
          .filter((n) => (n.expiresAt?.toDate?.().getTime() || 0) > now)
          .sort((a, b) => {
            const at = a.createdAt?.toDate?.().getTime() ?? Date.now();
            const bt = b.createdAt?.toDate?.().getTime() ?? Date.now();
            return bt - at;
          });
        setNotes(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notes')
    );
    return () => unsub();
  }, []);

  // Subscribe to recent voice/video call history
  useEffect(() => {
    if (!userPublic) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'calls'),
        where('participantIds', 'array-contains', userPublic.uid)
      ),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as CallRecord)
          .sort(
            (a, b) =>
              (b.createdAt?.toDate?.().getTime() || 0) -
              (a.createdAt?.toDate?.().getTime() || 0)
          );
        setCallHistory(list.slice(0, 30));
      },
      () => {}
    );
    return () => unsub();
  }, [userPublic]);

  // Reset transient per-chat states when switching chats
  useEffect(() => {
    setSelectMode(false);
    setSelectedMsgIds(new Set());
    setReactingMsgId(null);
    setMsgMenuId(null);
    setShowMoreEmojisFor(null);
    setShowInChatSearch(false);
    setInChatQuery('');
    setStarredOnly(false);
    setReplyTo(null);
    setEditingMsg(null);
    setMediaErr('');
  }, [activeConvId]);

  // Subscribe to messages for active conversation & update lastReadAt
  useEffect(() => {
    if (!activeConvId || !userPublic) {
      setMessages([]);
      return;
    }
    void updateDoc(doc(db, 'conversations', activeConvId, 'members', userPublic.uid), {
      lastReadAt: serverTimestamp(),
    }).catch(() => {});

    const q = query(
      collection(db, 'conversations', activeConvId, 'messages'),
      where('participantIds', 'array-contains', userPublic.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Message)
          .sort(
            (a, b) =>
              (a.createdAt?.toDate?.().getTime() || 0) -
              (b.createdAt?.toDate?.().getTime() || 0)
          );
        setMessages(list);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);

        // Trigger special effects on newly received effect messages
        const latest = list[list.length - 1];
        if (latest && latest.effectType && latest.effectType !== 'none') {
          const createdMs = latest.createdAt?.toDate?.().getTime() || Date.now();
          if (Date.now() - createdMs < 8000) {
            setActiveEffectBursts((prev) => ({
              ...prev,
              [latest.id]: Date.now(),
            }));
          }
        }

        // Update readBy & lastReadAt when read receipts enabled
        void updateDoc(doc(db, 'conversations', activeConvId, 'members', userPublic.uid), {
          lastReadAt: serverTimestamp(),
        }).catch(() => {});

        if (userPrivate?.readReceipts !== false) {
          for (const m of list) {
            if (m.senderId !== userPublic.uid && !(m.readBy || []).includes(userPublic.uid)) {
              void updateDoc(doc(db, 'conversations', activeConvId, 'messages', m.id), {
                readBy: arrayUnion(userPublic.uid),
                updatedAt: serverTimestamp(),
              }).catch(() => {});
            }
          }
        }
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `conversations/${activeConvId}/messages`)
    );
    return () => unsub();
  }, [activeConvId, userPublic, userPrivate?.readReceipts]);

  // Subscribe to sender's pending scheduled messages for active conversation
  useEffect(() => {
    if (!activeConvId || !userPublic) {
      setScheduledMsgs([]);
      return;
    }
    const q = query(
      collection(db, 'conversations', activeConvId, 'scheduledMessages'),
      where('senderId', '==', userPublic.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as ScheduledMessage)
          .filter((s) => s.status === 'pending')
          .sort(
            (a, b) =>
              (a.scheduledFor?.toDate?.().getTime() || 0) -
              (b.scheduledFor?.toDate?.().getTime() || 0)
          );
        setScheduledMsgs(list);
      },
      () => {}
    );
    return () => unsub();
  }, [activeConvId, userPublic]);

  const activeConv = conversations.find((c) => c.id === activeConvId) || null;

  // Client-side scheduler dispatcher for due pending messages
  useEffect(() => {
    if (!userPublic || !activeConv || scheduledMsgs.length === 0) return;
    const dispatchDue = async () => {
      const now = Date.now();
      for (const sm of scheduledMsgs) {
        if (sm.status === 'pending' && (sm.scheduledFor?.toDate?.().getTime() || 0) <= now) {
          try {
            await updateDoc(
              doc(db, 'conversations', activeConv.id, 'scheduledMessages', sm.id),
              { status: 'sent' }
            );
            await sendConversationMessage({
              currentUser: userPublic,
              conversation: activeConv,
              type: 'text',
              text: sm.text,
              effectType: sm.effectType,
            });
          } catch {
            // ignore concurrent send
          }
        }
      }
    };
    void dispatchDue();
    const timer = window.setInterval(() => void dispatchDue(), 5000);
    return () => clearInterval(timer);
  }, [scheduledMsgs, activeConv, userPublic]);

  // WebSocket typing events
  useEffect(() => {
    return realtimeClient.onTyping((convId, uid, isTyping) => {
      if (convId === activeConvId && uid !== userPublic?.uid) {
        setTypingMap((prev) => ({ ...prev, [uid]: isTyping }));
      }
    });
  }, [activeConvId, userPublic?.uid]);

  // Voice recording timer
  useEffect(() => {
    if (!isRecording || isPaused) return;
    const t = window.setInterval(() => {
      recordingSecRef.current += 1;
      setRecordingSec(recordingSecRef.current);
    }, 1000);
    return () => clearInterval(t);
  }, [isRecording, isPaused]);

  const blockedSet = useMemo(
    () => new Set(userPrivate?.blockedIds || []),
    [userPrivate?.blockedIds]
  );
  const restrictedSet = useMemo(
    () => new Set(userPrivate?.restrictedIds || []),
    [userPrivate?.restrictedIds]
  );

  const getConvDisplay = (conv: Conversation) => {
    if (conv.isGroup) {
      return {
        title: conv.groupName || 'Group Chat',
        avatar: conv.groupPhotoURL || '',
        otherUser: null as UserPublic | null,
      };
    }
    const otherId = conv.participantIds.find((id) => id !== userPublic?.uid) || '';
    const other = usersMap.get(otherId) || null;
    return {
      title: other ? other.displayName : 'MIXY User',
      avatar: other?.photoURL || '',
      otherUser: other,
    };
  };

  const isConvUnread = (conv: Conversation): boolean => {
    if (!userPublic) return false;
    if (!conv.lastMessageSenderId || conv.lastMessageSenderId === userPublic.uid) return false;
    const mem = memberships.get(conv.id);
    if (mem?.isMuted) return false;
    const lastMsgMs = conv.lastMessageAt?.toDate?.().getTime() || 0;
    const lastReadMs = mem?.lastReadAt?.toDate?.().getTime() || 0;
    return lastMsgMs > lastReadMs;
  };

  const requestsCount = useMemo(() => {
    if (userPrivate?.dmWhoCanMessage === 'nobody') return 0;
    return conversations.filter((c) => {
      const m = memberships.get(c.id);
      return m?.isRequest && !m?.isArchived;
    }).length;
  }, [conversations, memberships, userPrivate?.dmWhoCanMessage]);

  const filteredConversations = useMemo(() => {
    const q = searchConv.trim().toLowerCase();
    return conversations
      .filter((conv) => {
        const mem = memberships.get(conv.id);
        const disp = getConvDisplay(conv);
        if (disp.otherUser && blockedSet.has(disp.otherUser.uid)) return false;

        const isArchived = mem?.isArchived || false;
        const isRestrictedIncoming = Boolean(
          disp.otherUser && restrictedSet.has(disp.otherUser.uid)
        );
        const isRequest =
          (mem?.isRequest || isRestrictedIncoming) &&
          !(disp.otherUser && followingIds.has(disp.otherUser.uid) && !isRestrictedIncoming);

        if (folder === 'archived') {
          if (!isArchived) return false;
        } else if (folder === 'requests') {
          if (userPrivate?.dmWhoCanMessage === 'nobody') return false;
          if (isArchived || !isRequest) return false;
        } else {
          if (isArchived || isRequest) return false;
        }

        // Collection tab filter (inbox)
        if (folder === 'inbox' && collectionFilter !== 'all') {
          if (collectionFilter === 'groups') {
            if (!conv.isGroup && mem?.collectionTag !== 'groups') return false;
          } else if (collectionFilter === 'favorites') {
            if (mem?.collectionTag !== 'favorites' && !mem?.isPinned) return false;
          } else if (mem?.collectionTag !== collectionFilter) {
            return false;
          }
        }

        if (!q) return true;
        return (
          disp.title.toLowerCase().includes(q) ||
          (disp.otherUser?.username || '').toLowerCase().includes(q) ||
          (conv.lastMessageText || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aPin = memberships.get(a.id)?.isPinned ? 1 : 0;
        const bPin = memberships.get(b.id)?.isPinned ? 1 : 0;
        if (aPin !== bPin) return bPin - aPin;
        return 0;
      });
  }, [
    conversations,
    memberships,
    folder,
    collectionFilter,
    searchConv,
    blockedSet,
    restrictedSet,
    followingIds,
    userPrivate?.dmWhoCanMessage,
    usersMap,
  ]);

  const activeFriendsOnline = useMemo(() => {
    return Array.from(usersMap.values())
      .filter(
        (u) =>
          u.uid !== userPublic?.uid &&
          !blockedSet.has(u.uid) &&
          u.showOnlineStatus !== false &&
          Boolean(onlineUsers[u.uid])
      )
      .slice(0, 16);
  }, [usersMap, userPublic?.uid, blockedSet, onlineUsers]);

  // Active conversation resolved styling & DM typography
  const activeStyle = useMemo(() => resolveConversationStyle(activeConv), [activeConv]);
  const activeFontMeta = useMemo(
    () =>
      DM_FONT_OPTIONS.find((f) => f.id === (userPrivate?.dmFontFamily || 'modern_sans')) ||
      DM_FONT_OPTIONS[0],
    [userPrivate?.dmFontFamily]
  );
  const bubblePaddingClass = DM_BUBBLE_PADDING_CLASSES[userPrivate?.dmBubbleSize || 'cozy'];
  const textSizeClass = DM_TEXT_SIZE_CLASSES[userPrivate?.dmTextSize || 'md'];
  const radiusSet = DM_CORNER_RADIUS_MAP[userPrivate?.dmCornerRadius || 'rounded'];
  const appearanceClass =
    DM_APPEARANCE_CLASSES[userPrivate?.dmTextAppearance || 'clean'].className;
  const bubbleChatMode = Boolean(userPrivate?.dmBubbleMode);
  const effectsEnabled = userPrivate?.dmEffectsEnabled !== false;

  const activeDisplay = activeConv ? getConvDisplay(activeConv) : null;
  const activeMember = activeConv ? memberships.get(activeConv.id) : null;

  // Filter out disappeared, deleted-for-me, cleared, search & starred messages
  const visibleMessages = useMemo(() => {
    const clearedMs = activeMember?.clearedAt?.toDate?.().getTime() || 0;
    const q = inChatQuery.trim().toLowerCase();
    return messages.filter((m) => {
      if ((m.deletedFor || []).includes(userPublic?.uid || '')) return false;
      if (m.expiresAt && m.expiresAt.toDate().getTime() <= nowTick) return false;
      const mMs = m.createdAt?.toDate?.().getTime() || nowTick;
      if (clearedMs > 0 && mMs <= clearedMs) return false;
      if (starredOnly && !(m.starredBy || []).includes(userPublic?.uid || '')) return false;
      if (q) {
        const hay = `${m.text || ''} ${m.fileName || ''} ${m.sharedItemPreview || ''} ${
          m.senderUsername
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [messages, activeMember?.clearedAt, userPublic?.uid, nowTick, starredOnly, inChatQuery]);

  const pinnedMessages = useMemo(() => {
    const ids = new Set(activeConv?.pinnedMessageIds || []);
    return visibleMessages.filter((m) => ids.has(m.id));
  }, [visibleMessages, activeConv?.pinnedMessageIds]);

  const handlePostNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublic || !noteInput.trim()) return;
    const noteId = generateId('note');
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const batch = writeBatch(db);
    batch.set(doc(db, 'notes', noteId), {
      id: noteId,
      authorId: userPublic.uid,
      authorUsername: userPublic.username,
      authorPhotoURL: userPublic.photoURL || '',
      text: noteInput.trim().slice(0, BLUEPRINT_LIMITS.NOTE_MAX),
      expiresAt,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    setNoteInput('');
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublic || !activeConv || !msgText.trim()) return;

    if (editingMsg) {
      await updateDoc(doc(db, 'conversations', activeConv.id, 'messages', editingMsg.id), {
        text: msgText.trim().slice(0, BLUEPRINT_LIMITS.MESSAGE_TEXT_MAX),
        isEdited: true,
        updatedAt: serverTimestamp(),
      });
      setEditingMsg(null);
      setMsgText('');
      return;
    }

    const txt = msgText.trim();
    const eff = selectedEffect;
    setMsgText('');
    setSelectedEffect('none');
    setShowEffectPicker(false);
    if (userPrivate?.dmShowTyping !== false) {
      realtimeClient.sendTyping(activeConv.id, activeConv.participantIds, false);
    }

    const sentId = await sendConversationMessage({
      currentUser: userPublic,
      conversation: activeConv,
      type: 'text',
      text: txt,
      effectType: eff,
      replyToId: replyTo?.id,
      replyToPreview: replyTo
        ? `${replyTo.senderUsername}: ${replyTo.text || replyTo.type}`
        : undefined,
    });
    if (sentId && eff !== 'none') {
      setActiveEffectBursts((prev) => ({ ...prev, [sentId]: Date.now() }));
    }
    setReplyTo(null);
  };

  const handleScheduleMessage = async (targetDate: Date) => {
    if (!userPublic || !activeConv || !msgText.trim()) return;
    const schedId = generateId('sch');
    const txt = msgText.trim().slice(0, BLUEPRINT_LIMITS.MESSAGE_TEXT_MAX);
    const payload: Record<string, unknown> = {
      id: schedId,
      conversationId: activeConv.id,
      participantIds: activeConv.participantIds,
      senderId: userPublic.uid,
      senderUsername: userPublic.username,
      senderPhotoURL: userPublic.photoURL || '',
      type: 'text',
      text: txt,
      scheduledFor: Timestamp.fromDate(targetDate),
      status: 'pending',
      createdAt: serverTimestamp(),
    };
    if (selectedEffect !== 'none') payload.effectType = selectedEffect;
    await setDoc(doc(db, 'conversations', activeConv.id, 'scheduledMessages', schedId), payload);
    setMsgText('');
    setSelectedEffect('none');
    setShowSchedulePicker(false);
    setScheduleDatetime('');
  };

  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 10);
    e.target.value = '';
    if (files.length === 0 || !userPublic || !activeConv) return;
    setUploadingMedia(true);
    setMediaErr('');
    try {
      const urls: string[] = [];
      for (const f of files) {
        const uploaded = await uploadMediaFile(f);
        urls.push(uploaded.url);
      }
      if (urls.length === 1) {
        await sendConversationMessage({
          currentUser: userPublic,
          conversation: activeConv,
          type: 'image',
          mediaURL: urls[0],
          effectType: selectedEffect,
        });
      } else {
        await sendConversationMessage({
          currentUser: userPublic,
          conversation: activeConv,
          type: 'images',
          mediaItems: urls,
          effectType: selectedEffect,
        });
      }
      setSelectedEffect('none');
    } catch (err) {
      setMediaErr(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleUploadVideoOrFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'video' | 'file'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userPublic || !activeConv) return;
    setUploadingMedia(true);
    setMediaErr('');
    try {
      const uploaded = await uploadMediaFile(file);
      await sendConversationMessage({
        currentUser: userPublic,
        conversation: activeConv,
        type: kind,
        mediaURL: uploaded.url,
        fileName: kind === 'file' ? file.name : undefined,
        fileSize: kind === 'file' ? file.size : undefined,
        fileMime: kind === 'file' ? uploaded.mimeType : undefined,
        effectType: selectedEffect,
      });
      setSelectedEffect('none');
    } catch (err) {
      setMediaErr(err instanceof Error ? err.message : 'Attachment upload failed.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const cleanupVoiceResources = () => {
    if (analyserRafRef.current) {
      cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
  };

  const startVoiceRecording = async () => {
    if (!userPublic || !activeConv) return;
    setMediaErr('');
    cancelVoiceRef.current = false;
    waveformSamplesRef.current = [];

    if (!navigator?.mediaDevices?.getUserMedia) {
      setMediaErr('Microphone recording is not supported in this browser environment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const pump = () => {
            if (!analyserRafRef.current) return;
            analyser.getByteFrequencyData(data);
            const bars = Array.from({ length: 18 }, (_, i) => {
              const v = data[i % data.length] || 0;
              return Math.max(18, Math.min(100, Math.round((v / 255) * 100)));
            });
            setLiveBars(bars);
            const avg = Math.round(
              bars.reduce((acc, v) => acc + v, 0) / Math.max(1, bars.length)
            );
            if (waveformSamplesRef.current.length < 48) {
              waveformSamplesRef.current.push(avg);
            } else {
              const idx = Math.floor(Math.random() * waveformSamplesRef.current.length);
              waveformSamplesRef.current[idx] = Math.round(
                (waveformSamplesRef.current[idx] + avg) / 2
              );
            }
            analyserRafRef.current = requestAnimationFrame(pump);
          };
          analyserRafRef.current = requestAnimationFrame(pump);
        } catch {
          // AudioContext visualizer fallback
        }
      }

      let chosenMime = '';
      let fileName = 'voice-note.webm';
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          chosenMime = 'audio/webm;codecs=opus';
          fileName = 'voice-note.webm';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          chosenMime = 'audio/webm';
          fileName = 'voice-note.webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          chosenMime = 'audio/mp4';
          fileName = 'voice-note.m4a';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          chosenMime = 'audio/aac';
          fileName = 'voice-note.aac';
        }
      }

      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        cleanupVoiceResources();
        if (cancelVoiceRef.current) return;
        const dur = Math.max(1, recordingSecRef.current);
        const blobType = recorder.mimeType || chosenMime || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: blobType });
        const samples = waveformSamplesRef.current;
        const finalWaveform =
          samples.length >= 8
            ? samples.slice(0, 24)
            : [24, 48, 70, 40, 82, 62, 34, 76, 54, 88, 42, 64, 38, 72, 50, 28];
        setUploadingMedia(true);
        try {
          const uploaded = await uploadMediaFile(blob, fileName);
          await sendConversationMessage({
            currentUser: userPublic,
            conversation: activeConv,
            type: 'voice',
            mediaURL: uploaded.url,
            voiceDurationSec: dur,
            voiceWaveform: finalWaveform,
          });
        } catch (err) {
          setMediaErr(err instanceof Error ? err.message : 'Voice upload failed.');
        } finally {
          setUploadingMedia(false);
          recordingSecRef.current = 0;
          setRecordingSec(0);
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      recordingSecRef.current = 0;
      setRecordingSec(0);
      setIsPaused(false);
      setIsRecording(true);
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        setMediaErr('Microphone permission was denied. Please allow microphone access in your browser to record voice notes.');
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setMediaErr('No microphone device found on your system.');
      } else {
        setMediaErr(err instanceof Error ? err.message : 'Microphone permission was denied or unavailable.');
      }
    }
  };

  const pauseOrResumeVoice = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording' && typeof rec.pause === 'function') {
      rec.pause();
      setIsPaused(true);
    } else if (rec.state === 'paused' && typeof rec.resume === 'function') {
      rec.resume();
      setIsPaused(false);
    }
  };

  const stopVoiceRecording = (cancel: boolean) => {
    cancelVoiceRef.current = cancel;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        cleanupVoiceResources();
      }
    } else {
      cleanupVoiceResources();
    }
    setIsRecording(false);
    setIsPaused(false);
    if (cancel) {
      recordingSecRef.current = 0;
      setRecordingSec(0);
    }
  };

  const handleReactMessage = async (msg: Message, emoji: string) => {
    if (!userPublic || !activeConv) return;
    const nextReactions = { ...(msg.reactions || {}) };
    if (nextReactions[userPublic.uid] === emoji) {
      delete nextReactions[userPublic.uid];
    } else {
      nextReactions[userPublic.uid] = emoji;
    }
    await updateDoc(doc(db, 'conversations', activeConv.id, 'messages', msg.id), {
      reactions: nextReactions,
      updatedAt: serverTimestamp(),
    });
    setReactingMsgId(null);
    setShowMoreEmojisFor(null);
  };

  const handleUnsendMessage = async (msg: Message) => {
    if (!activeConv || msg.senderId !== userPublic?.uid) return;
    await updateDoc(doc(db, 'conversations', activeConv.id, 'messages', msg.id), {
      text: 'This message was unsent',
      isDeleted: true,
      isUnsent: true,
      updatedAt: serverTimestamp(),
    });
    setMsgMenuId(null);
  };

  const handleDeleteForMe = async (msg: Message) => {
    if (!activeConv || !userPublic) return;
    await updateDoc(doc(db, 'conversations', activeConv.id, 'messages', msg.id), {
      deletedFor: arrayUnion(userPublic.uid),
      updatedAt: serverTimestamp(),
    });
    setMsgMenuId(null);
  };

  const handleToggleStarMessage = async (msg: Message) => {
    if (!activeConv || !userPublic) return;
    const starred = (msg.starredBy || []).includes(userPublic.uid);
    await updateDoc(doc(db, 'conversations', activeConv.id, 'messages', msg.id), {
      starredBy: starred ? arrayRemove(userPublic.uid) : arrayUnion(userPublic.uid),
      updatedAt: serverTimestamp(),
    });
    setMsgMenuId(null);
  };

  const handleTogglePinMessage = async (msg: Message) => {
    if (!activeConv) return;
    const current = activeConv.pinnedMessageIds || [];
    const exists = current.includes(msg.id);
    const next = exists ? current.filter((id) => id !== msg.id) : [msg.id, ...current].slice(0, 10);
    await updateDoc(doc(db, 'conversations', activeConv.id), {
      pinnedMessageIds: next,
      updatedAt: serverTimestamp(),
    });
    setMsgMenuId(null);
  };

  const handleTranslateMessage = async (msg: Message) => {
    if (!msg.text || translatingId) return;
    setTranslatingId(msg.id);
    setMsgMenuId(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const resp = await apiFetch('/api/ai/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: msg.text,
          targetLanguage: translateLang,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as { translatedText?: string };
      if (resp.ok && data.translatedText) {
        setTranslations((prev) => ({
          ...prev,
          [msg.id]: `${translateLang}: ${data.translatedText}`,
        }));
      }
    } finally {
      setTranslatingId(null);
    }
  };

  const handleVotePoll = async (msg: Message, optionIndex: number) => {
    if (!activeConv || !userPublic || msg.pollClosed) return;
    await updateDoc(doc(db, 'conversations', activeConv.id, 'messages', msg.id), {
      [`pollVotes.${userPublic.uid}`]: optionIndex,
      updatedAt: serverTimestamp(),
    });
  };

  const handleClosePoll = async (msg: Message) => {
    if (!activeConv || msg.senderId !== userPublic?.uid) return;
    await updateDoc(doc(db, 'conversations', activeConv.id, 'messages', msg.id), {
      pollClosed: true,
      updatedAt: serverTimestamp(),
    });
  };

  const updateMembership = async (convId: string, patch: Partial<ConversationMember>) => {
    if (!userPublic) return;
    await updateDoc(doc(db, 'conversations', convId, 'members', userPublic.uid), patch);
  };

  const handleClearChat = async (convId: string) => {
    await updateMembership(convId, { clearedAt: Timestamp.now() });
    setShowChatMenu(false);
  };

  const handleBlockUser = async (targetUid: string) => {
    if (!userPublic) return;
    await setDoc(
      doc(db, 'users', userPublic.uid, 'private', 'info'),
      {
        uid: userPublic.uid,
        email: firebaseUser?.email || userPrivate?.email || '',
        blockedIds: arrayUnion(targetUid),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    setActiveConvId(null);
    setShowChatMenu(false);
  };

  const handleRestrictUser = async (targetUid: string) => {
    if (!userPublic) return;
    const already = restrictedSet.has(targetUid);
    await setDoc(
      doc(db, 'users', userPublic.uid, 'private', 'info'),
      {
        uid: userPublic.uid,
        email: firebaseUser?.email || userPrivate?.email || '',
        restrictedIds: already ? arrayRemove(targetUid) : arrayUnion(targetUid),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    setShowChatMenu(false);
  };

  const handleBulkAction = async (action: 'star' | 'delete' | 'forward') => {
    if (!activeConv || !userPublic || selectedMsgIds.size === 0) return;
    const chosen = visibleMessages.filter((m) => selectedMsgIds.has(m.id));
    if (action === 'forward') {
      setForwardMessages(chosen);
      setSelectMode(false);
      setSelectedMsgIds(new Set());
      return;
    }
    for (const m of chosen) {
      if (action === 'star') {
        await updateDoc(doc(db, 'conversations', activeConv.id, 'messages', m.id), {
          starredBy: arrayUnion(userPublic.uid),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'conversations', activeConv.id, 'messages', m.id), {
          deletedFor: arrayUnion(userPublic.uid),
          updatedAt: serverTimestamp(),
        });
      }
    }
    setSelectMode(false);
    setSelectedMsgIds(new Set());
  };

  const handleJoinByInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublic || !joinCodeInput.trim()) return;
    setJoinStatus('');
    const code = joinCodeInput
      .trim()
      .replace(/^.*\?join=/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '');
    if (!code) {
      setJoinStatus('Enter a valid invite code.');
      return;
    }
    try {
      const invSnap = await getDoc(doc(db, 'groupInvites', code));
      if (!invSnap.exists()) {
        setJoinStatus('Invite link is invalid or has been revoked.');
        return;
      }
      const inv = invSnap.data() as GroupInvite;
      if (!inv.isActive) {
        setJoinStatus('Invite link has been disabled by group admins.');
        return;
      }
      const convSnap = await getDoc(doc(db, 'conversations', inv.conversationId));
      if (convSnap.exists() && (convSnap.data() as Conversation).participantIds.includes(userPublic.uid)) {
        setActiveConvId(inv.conversationId);
        setShowJoinDialog(false);
        setJoinCodeInput('');
        return;
      }
      const batch = writeBatch(db);
      batch.update(doc(db, 'conversations', inv.conversationId), {
        participantIds: arrayUnion(userPublic.uid),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'conversations', inv.conversationId, 'members', userPublic.uid), {
        userId: userPublic.uid,
        role: 'member',
        isPinned: false,
        isMuted: false,
        isArchived: false,
        isRequest: false,
        joinedAt: serverTimestamp(),
      });
      await batch.commit();
      setActiveConvId(inv.conversationId);
      setShowJoinDialog(false);
      setJoinCodeInput('');
    } catch (err) {
      setJoinStatus(err instanceof Error ? err.message : 'Unable to join group.');
    }
  };

  const handleCreateConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublic || selectedUserIds.length === 0) return;

    if (!isGroupMode && selectedUserIds.length === 1) {
      const target = usersMap.get(selectedUserIds[0]);
      if (!target) return;
      const cid = await getOrCreateDirectConversation(
        userPublic,
        target,
        followingIds.has(target.uid)
      );
      setActiveConvId(cid);
      setShowNewChat(false);
      setSelectedUserIds([]);
      return;
    }

    const convId = generateId('grp');
    const participants = Array.from(new Set([userPublic.uid, ...selectedUserIds])).slice(0, 50);
    const batch = writeBatch(db);
    batch.set(doc(db, 'conversations', convId), {
      id: convId,
      isGroup: true,
      groupName: groupName.trim() || 'MIXY Group',
      groupAdmins: [userPublic.uid],
      createdBy: userPublic.uid,
      participantIds: participants,
      lastMessageText: `${userPublic.username} created the group`,
      lastMessageSenderId: userPublic.uid,
      lastMessageType: 'text',
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    for (const pid of participants) {
      batch.set(doc(db, 'conversations', convId, 'members', pid), {
        userId: pid,
        role: pid === userPublic.uid ? 'admin' : 'member',
        isPinned: false,
        isMuted: false,
        isArchived: false,
        isRequest: false,
        joinedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    setActiveConvId(convId);
    setShowNewChat(false);
    setSelectedUserIds([]);
    setGroupName('');
  };

  const activeTypingUsers = Object.entries(typingMap)
    .filter(([, val]) => val)
    .map(([uid]) => usersMap.get(uid)?.username || 'Someone');

  const isLightTheme = activeStyle.isLight;

  return (
    <div className="relative rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] overflow-hidden grid md:grid-cols-[340px_1fr] h-[calc(100vh-146px)] min-h-[560px]">
      {/* LEFT CONVERSATION INBOX SIDEBAR */}
      <div
        className={`relative flex flex-col border-r border-slate-200 dark:border-white/10 overflow-hidden ${
          activeConvId || juliusSelected ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-slate-200 dark:border-white/10 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-bold">Messages</h1>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (!userPublic) return;
                  void setDoc(
                    doc(db, 'users', userPublic.uid, 'private', 'info'),
                    {
                      uid: userPublic.uid,
                      email: firebaseUser?.email || userPrivate?.email || '',
                      dmBubbleMode: !bubbleChatMode,
                      updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                  );
                }}
                title="Toggle MIXY Bubble Chat Mode"
                className={`px-2 py-1.5 rounded-xl text-[11px] font-semibold transition-colors ${
                  bubbleChatMode
                    ? 'mixy-gradient-bg text-white'
                    : 'bg-slate-100 dark:bg-white/5 hover:bg-fuchsia-500/15'
                }`}
              >
                🫧 Bubbles
              </button>
              <button
                type="button"
                onClick={() => {
                  setJoinStatus('');
                  setShowJoinDialog(true);
                }}
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-fuchsia-500/15 flex items-center justify-center"
                title="Join group with invite link/code"
              >
                <Link2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCallHistory((v) => !v);
                  setShowNotesPanel(false);
                }}
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                  showCallHistory
                    ? 'mixy-gradient-bg text-white'
                    : 'bg-slate-100 dark:bg-white/5 hover:bg-fuchsia-500/15'
                }`}
                title="Recent Voice & Video Calls"
              >
                <PhoneCall className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNotesPanel((v) => !v);
                  setShowCallHistory(false);
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-white/5 hover:bg-fuchsia-500/15"
              >
                Notes ({notes.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsGroupMode(false);
                  setShowNewChat(true);
                }}
                className="w-8 h-8 rounded-xl mixy-gradient-bg text-white flex items-center justify-center"
                title="New conversation"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchConv}
              onChange={(e) => setSearchConv(e.target.value)}
              placeholder="Search chats, friends or messages..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-100 dark:bg-white/5 text-xs focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
            />
          </div>

          {/* Primary Folders */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/5">
            {(['inbox', 'requests', 'archived'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFolder(tab)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize flex items-center justify-center gap-1 ${
                  folder === tab
                    ? 'bg-white dark:bg-[#1B1B2B] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                <span>{tab}</span>
                {tab === 'requests' && requestsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-fuchsia-500 text-white text-[10px] font-bold tabular-nums">
                    {requestsCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Chat Collections Filter Strip */}
          {folder === 'inbox' && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {COLLECTION_TABS.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setCollectionFilter(col.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 transition-colors ${
                    collectionFilter === col.id
                      ? 'mixy-gradient-bg text-white'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
                  }`}
                >
                  {col.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active Now Online Friends & Quick Notes Strip */}
        {(activeFriendsOnline.length > 0 || notes.length > 0) && !showNotesPanel && (
          <div className="px-3 py-2.5 border-b border-slate-200 dark:border-white/10 flex items-center gap-3 overflow-x-auto no-scrollbar">
            {activeFriendsOnline.map((u) => (
              <button
                key={u.uid}
                type="button"
                onClick={async () => {
                  if (!userPublic) return;
                  const cid = await getOrCreateDirectConversation(
                    userPublic,
                    u,
                    followingIds.has(u.uid)
                  );
                  setJuliusSelected(false);
                  setActiveConvId(cid);
                }}
                className="flex flex-col items-center gap-1 shrink-0 group"
              >
                <UserAvatar src={u.photoURL} name={u.displayName} size="sm" isOnline />
                <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 max-w-[60px] inline-flex items-center gap-0.5 truncate group-hover:text-fuchsia-500">
                  <span className="truncate">{u.username}</span>
                  <UserVerifiedBadge uid={u.uid} fallback={u.isVerified} className="w-2.5 h-2.5" />
                </span>
              </button>
            ))}
            {notes.slice(0, 8).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setShowNotesPanel(true)}
                className="flex flex-col items-center gap-1 shrink-0 max-w-[82px]"
                title={`@${n.authorUsername}: ${n.text}`}
              >
                <div className="px-2 py-1 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 text-[10px] truncate max-w-[78px]">
                  {n.text}
                </div>
                <span className="text-[10px] text-slate-400 truncate max-w-[74px] inline-flex items-center gap-0.5">
                  <span className="truncate">@{n.authorUsername}</span>
                  <UserVerifiedBadge uid={n.authorId} className="w-2.5 h-2.5" />
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Notes Drawer inside DMs */}
        {showNotesPanel && (
          <div className="p-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] space-y-2.5">
            <form onSubmit={handlePostNote} className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.NOTE_MAX}
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Share a 24h note..."
                  className="w-full h-9 pl-3 pr-12 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 tabular-nums">
                  {noteInput.length}/100
                </span>
              </div>
              <button
                type="submit"
                disabled={!noteInput.trim()}
                className="w-full h-8 rounded-xl mixy-gradient-bg text-white text-xs font-semibold disabled:opacity-40"
              >
                Post Note
              </button>
            </form>
            <div className="max-h-36 overflow-y-auto space-y-1.5">
              {notes.map((n) => (
                <div key={n.id} className="flex items-center justify-between gap-2 text-xs py-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(n.authorId)}
                      className="flex items-center gap-1.5 shrink-0 hover:opacity-85"
                      title={`View @${n.authorUsername}'s profile`}
                    >
                      <UserAvatar src={n.authorPhotoURL} name={n.authorUsername} size="xs" />
                      <span className="font-semibold hover:underline">@{n.authorUsername}</span>
                      <UserVerifiedBadge uid={n.authorId} className="w-3 h-3" />
                    </button>
                    <span className="text-slate-600 dark:text-slate-300 truncate">{n.text}</span>
                  </div>
                  {n.authorId === userPublic?.uid && (
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc(db, 'notes', n.id))}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Call History Drawer inside DMs */}
        {showCallHistory && (
          <div className="p-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] space-y-2 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Recent Calls ({callHistory.length})
              </p>
              <button
                type="button"
                onClick={() => setShowCallHistory(false)}
                className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                Close
              </button>
            </div>
            {callHistory.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                No voice or video calls yet. Tap the phone or camera icon in any chat to call.
              </p>
            ) : (
              callHistory.map((call) => {
                const otherIds = call.participantIds.filter((id) => id !== userPublic?.uid);
                const otherPeer = usersMap.get(otherIds[0] || '');
                const conv = conversations.find((c) => c.id === call.conversationId);
                const isMissed = call.status === 'missed' || call.status === 'declined';
                const label = call.isGroup
                  ? conv?.groupName || 'Group Call'
                  : otherPeer?.displayName || `@${call.callerUsername}`;
                return (
                  <div
                    key={call.id}
                    className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-xl hover:bg-white dark:hover:bg-white/5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isMissed
                            ? 'bg-rose-500/15 text-rose-500'
                            : 'bg-emerald-500/15 text-emerald-500'
                        }`}
                      >
                        {isMissed ? (
                          <PhoneMissed className="w-3.5 h-3.5" />
                        ) : call.callerId === userPublic?.uid ? (
                          <PhoneCall className="w-3.5 h-3.5" />
                        ) : (
                          <PhoneIncoming className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold flex items-center gap-1 truncate">
                          <span className="truncate">{label}</span>
                          {!call.isGroup && (otherPeer?.uid || otherIds[0]) && (
                            <UserVerifiedBadge
                              uid={otherPeer?.uid || otherIds[0]}
                              fallback={otherPeer?.isVerified}
                              className="w-3 h-3"
                            />
                          )}
                        </p>
                        <p className="text-[10px] text-slate-500 capitalize">
                          {call.callType} · {call.status}
                          {call.durationSec > 0 ? ` (${call.durationSec}s)` : ''} ·{' '}
                          {formatRelativeTime(call.createdAt)}
                        </p>
                      </div>
                    </div>
                    {conv && (
                      <button
                        type="button"
                        onClick={() => {
                          const peers = conv.participantIds
                            .filter((id) => id !== userPublic?.uid)
                            .map((id) => usersMap.get(id))
                            .filter((u): u is UserPublic => Boolean(u));
                          setActiveConvId(conv.id);
                          setShowCallHistory(false);
                          void startCall({
                            conversation: conv,
                            peers,
                            callType: call.callType,
                          });
                        }}
                        className="p-2 rounded-xl bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 hover:bg-fuchsia-500/20 shrink-0"
                        title={`Call back (${call.callType})`}
                      >
                        {call.callType === 'video' ? (
                          <Video className="w-3.5 h-3.5" />
                        ) : (
                          <Phone className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5 pb-16">
          {/* Pinned Julius AI Companion */}
          {folder === 'inbox' &&
            collectionFilter === 'all' &&
            (!searchConv.trim() ||
              'julius ai companion'.includes(searchConv.toLowerCase())) && (
              <button
                type="button"
                onClick={() => {
                  setActiveConvId(null);
                  setJuliusSelected(true);
                }}
                className={`w-full flex items-center gap-3 p-3.5 text-left transition-colors ${
                  juliusSelected
                    ? 'bg-fuchsia-500/12'
                    : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                }`}
              >
                <JuliusAvatar size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold truncate flex items-center gap-1.5">
                      Julius
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-fuchsia-500/15 text-fuchsia-500 text-[10px] font-bold">
                        <Sparkles className="w-2.5 h-2.5" /> AI
                      </span>
                    </span>
                    <span className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1 shrink-0">
                      <Pin className="w-3 h-3 text-fuchsia-500" />
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    Ask anything, brainstorm captions & vibe ✨
                  </p>
                </div>
              </button>
            )}

          {folder === 'requests' && userPrivate?.dmWhoCanMessage === 'nobody' ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-2">
              <p>Message requests are hidden while "Who Can Message Me" is set to No one.</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-2">
              <p>No conversations match this filter.</p>
              <button
                type="button"
                onClick={() => setShowNewChat(true)}
                className="text-fuchsia-500 font-semibold hover:underline"
              >
                Start a conversation
              </button>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const disp = getConvDisplay(conv);
              const mem = memberships.get(conv.id);
              const unread = isConvUnread(conv);
              const isSwiped = swipedConvId === conv.id;
              const isOnline = disp.otherUser
                ? disp.otherUser.showOnlineStatus !== false &&
                  Boolean(onlineUsers[disp.otherUser.uid])
                : false;

              return (
                <div
                  key={conv.id}
                  onTouchStart={(e) => {
                    swipeTouchStartX.current = e.touches[0]?.clientX ?? null;
                  }}
                  onTouchEnd={(e) => {
                    if (swipeTouchStartX.current === null) return;
                    const dx = (e.changedTouches[0]?.clientX ?? 0) - swipeTouchStartX.current;
                    if (dx < -45) setSwipedConvId(conv.id);
                    else if (dx > 35 && isSwiped) setSwipedConvId(null);
                    swipeTouchStartX.current = null;
                  }}
                  className="relative group overflow-hidden"
                >
                  <div
                    onClick={() => {
                      if (isSwiped) {
                        setSwipedConvId(null);
                        return;
                      }
                      setJuliusSelected(false);
                      setActiveConvId(conv.id);
                    }}
                    className={`w-full flex items-center gap-3 p-3.5 text-left transition-all cursor-pointer ${
                      activeConvId === conv.id && !juliusSelected
                        ? 'bg-fuchsia-500/10'
                        : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                    } ${isSwiped ? '-translate-x-28' : 'translate-x-0'}`}
                  >
                    <UserAvatar
                      src={disp.avatar}
                      name={disp.title}
                      size="md"
                      isOnline={isOnline}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate flex items-center gap-1">
                          <span className="truncate">{disp.title}</span>
                          {disp.otherUser && (
                            <UserVerifiedBadge
                              uid={disp.otherUser.uid}
                              fallback={disp.otherUser.isVerified}
                              className="w-3.5 h-3.5"
                            />
                          )}
                          {conv.isGroup && (
                            <Users className="w-3 h-3 text-fuchsia-400 shrink-0" />
                          )}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 shrink-0">
                          {mem?.isPinned && <Pin className="w-3 h-3 text-fuchsia-500" />}
                          {mem?.isMuted && <BellOff className="w-3 h-3" />}
                          <span>{formatRelativeTime(conv.lastMessageAt || conv.updatedAt)}</span>
                          {unread && (
                            <span
                              className="w-2.5 h-2.5 rounded-full mixy-gradient-bg shrink-0"
                              title="Unread messages"
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p
                          className={`text-xs truncate ${
                            unread
                              ? 'font-bold text-slate-900 dark:text-white'
                              : 'text-slate-500'
                          }`}
                        >
                          {conv.lastMessageText || 'Start chatting...'}
                        </p>
                        {mem?.collectionTag && mem.collectionTag !== 'all' && (
                          <span className="text-[10px] font-semibold capitalize text-fuchsia-400 shrink-0">
                            {mem.collectionTag}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Desktop Quick Hover Actions */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="hidden md:flex opacity-0 group-hover:opacity-100 items-center gap-1 transition-opacity shrink-0"
                    >
                      <button
                        type="button"
                        onClick={() => void updateMembership(conv.id, { isPinned: !mem?.isPinned })}
                        title={mem?.isPinned ? 'Unpin' : 'Pin'}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-fuchsia-500"
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateMembership(conv.id, { isMuted: !mem?.isMuted })}
                        title={mem?.isMuted ? 'Unmute' : 'Mute'}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400"
                      >
                        <BellOff className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void updateMembership(conv.id, { isArchived: !mem?.isArchived })
                        }
                        title={mem?.isArchived ? 'Unarchive' : 'Archive'}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Mobile Swipe-Left Actions Drawer */}
                  {isSwiped && (
                    <div className="absolute inset-y-0 right-0 flex items-center bg-slate-100 dark:bg-slate-900 text-white">
                      <button
                        type="button"
                        onClick={() => {
                          void updateMembership(conv.id, { isPinned: !mem?.isPinned });
                          setSwipedConvId(null);
                        }}
                        className="h-full px-3 bg-fuchsia-600 flex items-center justify-center"
                        title="Pin"
                      >
                        <Pin className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void updateMembership(conv.id, { isMuted: !mem?.isMuted });
                          setSwipedConvId(null);
                        }}
                        className="h-full px-3 bg-slate-700 flex items-center justify-center"
                        title="Mute"
                      >
                        <BellOff className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void updateMembership(conv.id, { isArchived: !mem?.isArchived });
                          setSwipedConvId(null);
                        }}
                        className="h-full px-3 bg-amber-600 flex items-center justify-center"
                        title="Archive"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Floating Compose Button inside Inbox */}
        <button
          type="button"
          onClick={() => {
            setIsGroupMode(false);
            setShowNewChat(true);
          }}
          className="absolute bottom-4 right-4 w-11 h-11 rounded-2xl mixy-gradient-bg text-white shadow-xl shadow-fuchsia-500/30 flex items-center justify-center hover:scale-105 transition-transform"
          title="Compose new message"
          aria-label="Compose new message"
        >
          <Edit3 className="w-4 h-4" />
        </button>
      </div>

      {/* RIGHT CHAT THREAD WORKSPACE */}
      <div
        className={`flex flex-col h-full overflow-hidden ${
          !activeConvId && !juliusSelected ? 'hidden md:flex' : 'flex'
        }`}
      >
        {juliusSelected ? (
          <JuliusChatPanel onBack={() => setJuliusSelected(false)} />
        ) : !activeConv || !activeDisplay ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 mixy-aurora-surface">
            <div className="w-16 h-16 rounded-2xl mixy-gradient-bg text-white flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
              <Send className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold">MIXY Direct Messages</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
              Pick a chat or start a new conversation with live themes, custom fonts, voice notes, polls, and special effects.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setJuliusSelected(true)}
                className="px-4 py-2.5 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/20"
              >
                Chat with Julius AI
              </button>
              <button
                type="button"
                onClick={() => setShowNewChat(true)}
                className="px-5 py-2.5 rounded-xl mixy-gradient-bg text-white text-sm font-semibold"
              >
                New Message
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Theme-Synced Chat Header */}
            <div
              style={{ background: activeStyle.headerSurface }}
              className={`flex items-center justify-between px-4 py-3 border-b backdrop-blur-xl transition-colors ${
                isLightTheme
                  ? 'border-slate-200 text-slate-900'
                  : 'border-white/10 text-white'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveConvId(null)}
                  className="md:hidden p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeConv.isGroup) setGroupModalTab('info');
                    else if (activeDisplay.otherUser) onOpenProfile(activeDisplay.otherUser.uid);
                  }}
                  className="flex items-center gap-2.5 min-w-0 text-left"
                >
                  <UserAvatar
                    src={activeDisplay.avatar}
                    name={activeDisplay.title}
                    size="sm"
                    isOnline={
                      activeDisplay.otherUser
                        ? activeDisplay.otherUser.showOnlineStatus !== false &&
                          Boolean(onlineUsers[activeDisplay.otherUser.uid])
                        : false
                    }
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate flex items-center gap-1.5">
                      <span className="truncate">{activeDisplay.title}</span>
                      {activeDisplay.otherUser && (
                        <UserVerifiedBadge
                          uid={activeDisplay.otherUser.uid}
                          fallback={activeDisplay.otherUser.isVerified}
                          className="w-3.5 h-3.5"
                        />
                      )}
                      {activeStyle.mood && (
                        <span className="text-xs" title={`Mood: ${activeStyle.mood.name}`}>
                          {activeStyle.mood.emoji}
                        </span>
                      )}
                    </p>
                    <p
                      className={`text-[11px] truncate ${
                        isLightTheme ? 'text-slate-600' : 'text-slate-300'
                      }`}
                    >
                      {activeTypingUsers.length > 0
                        ? `${activeTypingUsers[0]} is typing...`
                        : activeConv.isGroup
                          ? `${activeConv.participantIds.length} members${
                              activeConv.disappearingSeconds ? ' · Auto-delete active' : ''
                            }`
                          : activeDisplay.otherUser?.showOnlineStatus !== false &&
                              onlineUsers[activeDisplay.otherUser?.uid || '']
                            ? 'Active now'
                            : activeDisplay.otherUser?.showLastSeen !== false &&
                                lastSeenUsers[activeDisplay.otherUser?.uid || '']
                              ? `Last seen ${formatRelativeTime(
                                  new Date(lastSeenUsers[activeDisplay.otherUser?.uid || ''])
                                )}`
                              : `@${activeDisplay.otherUser?.username || 'user'}`}
                    </p>
                  </div>
                </button>
              </div>

              {/* Header Quick Tools */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const peers = activeConv.participantIds
                      .filter((id) => id !== userPublic?.uid)
                      .map((id) => usersMap.get(id))
                      .filter((u): u is UserPublic => Boolean(u));
                    void startCall({
                      conversation: activeConv,
                      peers,
                      callType: 'voice',
                    });
                  }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                    isLightTheme ? 'hover:bg-black/5 text-slate-700' : 'hover:bg-white/10'
                  }`}
                  title="Start Voice Call"
                >
                  <Phone className="w-4 h-4 text-emerald-500" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const peers = activeConv.participantIds
                      .filter((id) => id !== userPublic?.uid)
                      .map((id) => usersMap.get(id))
                      .filter((u): u is UserPublic => Boolean(u));
                    void startCall({
                      conversation: activeConv,
                      peers,
                      callType: 'video',
                    });
                  }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                    isLightTheme ? 'hover:bg-black/5 text-slate-700' : 'hover:bg-white/10'
                  }`}
                  title="Start Video Call"
                >
                  <Video className="w-4 h-4 text-fuchsia-500" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowInChatSearch((v) => !v)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                    showInChatSearch
                      ? 'bg-fuchsia-500/25 text-fuchsia-500'
                      : isLightTheme
                        ? 'hover:bg-black/5'
                        : 'hover:bg-white/10'
                  }`}
                  title="Search inside conversation"
                >
                  <Search className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setStarredOnly((v) => !v)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                    starredOnly
                      ? 'bg-amber-500/25 text-amber-500'
                      : isLightTheme
                        ? 'hover:bg-black/5'
                        : 'hover:bg-white/10'
                  }`}
                  title="Show starred messages"
                >
                  <Star className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setCustomizeTab('themes')}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    isLightTheme ? 'hover:bg-black/5' : 'hover:bg-white/10'
                  }`}
                  title="Customize theme, mood, fonts & privacy"
                >
                  <Palette className="w-4 h-4" />
                </button>

                {activeConv.isGroup && (
                  <button
                    type="button"
                    onClick={() => setGroupModalTab('info')}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      isLightTheme ? 'hover:bg-black/5' : 'hover:bg-white/10'
                    }`}
                    title="Group info, members, polls & invite link"
                  >
                    <Users className="w-4 h-4" />
                  </button>
                )}

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowChatMenu((v) => !v)}
                    className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center"
                    title="Chat options"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  {showChatMenu && (
                    <div className="absolute right-0 mt-1 w-56 rounded-2xl bg-white dark:bg-[#171726] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-white/10 shadow-2xl py-1.5 z-30 text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomizeTab('fonts');
                          setShowChatMenu(false);
                        }}
                        className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-white/5"
                      >
                        <Palette className="w-4 h-4 text-fuchsia-500" /> Fonts & Bubble Style
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectMode((v) => !v);
                          setSelectedMsgIds(new Set());
                          setShowChatMenu(false);
                        }}
                        className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-white/5"
                      >
                        <CheckSquare className="w-4 h-4" /> Select Messages
                      </button>
                      {activeConv.isGroup && (
                        <button
                          type="button"
                          onClick={() => {
                            setGroupModalTab('poll');
                            setShowChatMenu(false);
                          }}
                          className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-white/5"
                        >
                          <BarChart3 className="w-4 h-4 text-fuchsia-500" /> Create Group Poll
                        </button>
                      )}
                      <div className="px-3.5 py-1.5 border-y border-slate-100 dark:border-white/10">
                        <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Collection Tag
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(['all', 'friends', 'family', 'groups', 'favorites'] as DmCollectionTag[]).map(
                            (tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => {
                                  void updateMembership(activeConv.id, { collectionTag: tag });
                                  setShowChatMenu(false);
                                }}
                                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold capitalize ${
                                  (activeMember?.collectionTag || 'all') === tag
                                    ? 'mixy-gradient-bg text-white'
                                    : 'bg-slate-100 dark:bg-white/10'
                                }`}
                              >
                                {tag}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void updateMembership(activeConv.id, {
                            isPinned: !activeMember?.isPinned,
                          });
                          setShowChatMenu(false);
                        }}
                        className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-white/5"
                      >
                        <Pin className="w-4 h-4" />{' '}
                        {activeMember?.isPinned ? 'Unpin chat' : 'Pin chat'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void updateMembership(activeConv.id, {
                            isMuted: !activeMember?.isMuted,
                          });
                          setShowChatMenu(false);
                        }}
                        className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-white/5"
                      >
                        <BellOff className="w-4 h-4" />{' '}
                        {activeMember?.isMuted ? 'Unmute chat' : 'Mute chat'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void updateMembership(activeConv.id, {
                            isArchived: !activeMember?.isArchived,
                          });
                          setShowChatMenu(false);
                          setActiveConvId(null);
                        }}
                        className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-white/5"
                      >
                        <Archive className="w-4 h-4" />{' '}
                        {activeMember?.isArchived ? 'Unarchive' : 'Archive chat'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleClearChat(activeConv.id)}
                        className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-white/5"
                      >
                        <Trash2 className="w-4 h-4" /> Clear chat for me
                      </button>
                      {activeDisplay.otherUser && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleRestrictUser(activeDisplay.otherUser!.uid)}
                            className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-amber-500 hover:bg-amber-500/10"
                          >
                            <ShieldBan className="w-4 h-4" />
                            {restrictedSet.has(activeDisplay.otherUser.uid)
                              ? 'Unrestrict user'
                              : 'Restrict user'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleBlockUser(activeDisplay.otherUser!.uid)}
                            className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-rose-500 hover:bg-rose-500/10"
                          >
                            <ShieldBan className="w-4 h-4" /> Block user
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReportTarget({ type: 'user', id: activeDisplay.otherUser!.uid });
                              setShowChatMenu(false);
                            }}
                            className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-rose-500 hover:bg-rose-500/10"
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

            {/* In-Chat Search & Language Selector Strip */}
            {(showInChatSearch || starredOnly) && (
              <div className="px-4 py-2 bg-slate-100 dark:bg-[#141422] border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center gap-2 text-xs">
                {showInChatSearch && (
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={inChatQuery}
                      onChange={(e) => setInChatQuery(e.target.value)}
                      placeholder="Search messages in this chat..."
                      className="w-full h-8 pl-8 pr-3 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                    />
                  </div>
                )}
                {starredOnly && (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 font-semibold">
                    Showing Starred Only ({visibleMessages.length})
                  </span>
                )}
                <div className="flex items-center gap-1.5 ml-auto">
                  <Languages className="w-3.5 h-3.5 text-fuchsia-400" />
                  <select
                    value={translateLang}
                    onChange={(e) => setTranslateLang(e.target.value)}
                    className="h-8 px-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                  >
                    {TRANSLATE_LANGUAGES.map((l) => (
                      <option key={l} value={l} className="bg-white dark:bg-[#141422]">
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Multi-select Bulk Toolbar */}
            {selectMode && (
              <div className="px-4 py-2 bg-fuchsia-600 text-white flex items-center justify-between text-xs font-semibold">
                <span>{selectedMsgIds.size} selected</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleBulkAction('star')}
                    disabled={selectedMsgIds.size === 0}
                    className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-40"
                  >
                    Star
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBulkAction('forward')}
                    disabled={selectedMsgIds.size === 0}
                    className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-40"
                  >
                    Forward
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBulkAction('delete')}
                    disabled={selectedMsgIds.size === 0}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/80 hover:bg-rose-500 disabled:opacity-40"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectMode(false);
                      setSelectedMsgIds(new Set());
                    }}
                    className="px-2 py-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Message Request Banner */}
            {activeMember?.isRequest && (
              <div className="px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-3 text-xs">
                <span>Message request from someone you don't follow.</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void updateMembership(activeConv.id, { isRequest: false })}
                    className="px-3 py-1 rounded-lg mixy-gradient-bg text-white font-semibold"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void updateMembership(activeConv.id, { isArchived: true });
                      setActiveConvId(null);
                    }}
                    className="px-3 py-1 rounded-lg border border-slate-300 dark:border-white/20"
                  >
                    Ignore
                  </button>
                </div>
              </div>
            )}

            {/* Group Announcement Banner */}
            {activeConv.isGroup && activeConv.announcementText && (
              <div className="px-4 py-2 bg-fuchsia-500/12 border-b border-fuchsia-500/20 flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium">
                  📣 <strong>Announcement:</strong> {activeConv.announcementText}
                </span>
                <button
                  type="button"
                  onClick={() => setGroupModalTab('info')}
                  className="text-fuchsia-400 font-semibold shrink-0 hover:underline"
                >
                  View
                </button>
              </div>
            )}

            {/* Pinned Messages Banner */}
            {pinnedMessages.length > 0 && (
              <div className="px-4 py-2 bg-white/90 dark:bg-slate-900/75 text-slate-900 dark:text-white border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(`msg-${pinnedMessages[0].id}`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="flex items-center gap-2 truncate text-left hover:underline"
                >
                  <Pin className="w-3.5 h-3.5 text-fuchsia-500 shrink-0" />
                  <span className="truncate">
                    <strong>Pinned ({pinnedMessages.length}):</strong>{' '}
                    {pinnedMessages[0].text || pinnedMessages[0].type}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleTogglePinMessage(pinnedMessages[0])}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white shrink-0"
                  title="Unpin"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Pending Scheduled Messages Queue Banner */}
            {scheduledMsgs.length > 0 && (
              <div className="px-4 py-2 bg-indigo-500/12 border-b border-indigo-500/20 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-indigo-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {scheduledMsgs.length} Scheduled Message{scheduledMsgs.length > 1 ? 's' : ''} (auto-sends when due while signed into MIXY)
                  </span>
                </div>
                {scheduledMsgs.slice(0, 2).map((sm) => (
                  <div
                    key={sm.id}
                    className="flex items-center justify-between gap-2 pl-5 text-[11px] text-slate-400"
                  >
                    <span className="truncate">
                      "{sm.text}" — {sm.scheduledFor?.toDate?.().toLocaleString()}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!userPublic) return;
                          await updateDoc(
                            doc(db, 'conversations', activeConv.id, 'scheduledMessages', sm.id),
                            { status: 'sent' }
                          );
                          await sendConversationMessage({
                            currentUser: userPublic,
                            conversation: activeConv,
                            type: 'text',
                            text: sm.text,
                            effectType: sm.effectType,
                          });
                        }}
                        className="text-fuchsia-400 font-semibold hover:underline"
                      >
                        Send Now
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void updateDoc(
                            doc(db, 'conversations', activeConv.id, 'scheduledMessages', sm.id),
                            { status: 'cancelled' }
                          )
                        }
                        className="text-rose-400 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* MESSAGE THREAD SURFACE (THEME / MOOD / WALLPAPER + CUSTOM FONTS) */}
            <div
              style={{
                ...activeStyle.backgroundStyle,
                fontFamily: activeFontMeta.cssFamily,
              }}
              className={`relative flex-1 overflow-y-auto p-4 space-y-3 transition-all ${
                activeStyle.isAnimated && effectsEnabled ? 'mixy-animated-gradient' : ''
              }`}
            >
              {visibleMessages.length === 0 && (
                <div
                  className={`py-14 text-center text-xs ${
                    isLightTheme ? 'text-slate-600' : 'text-slate-300/80'
                  }`}
                >
                  {starredOnly || inChatQuery
                    ? 'No matching messages found.'
                    : 'Say hello! Customize this chat theme, font, or voice vibe anytime.'}
                </div>
              )}

              {visibleMessages.map((msg) => {
                const isMine = msg.senderId === userPublic?.uid;
                const reactionEntries = Object.entries(msg.reactions || {});
                const isRead = (msg.readBy || []).length > 1;
                const isPinned = (activeConv.pinnedMessageIds || []).includes(msg.id);
                const isStarred = (msg.starredBy || []).includes(userPublic?.uid || '');
                const isSelected = selectedMsgIds.has(msg.id);
                const hasEffect = Boolean(msg.effectType && msg.effectType !== 'none');
                const burstParticles =
                  effectsEnabled && activeEffectBursts[msg.id]
                    ? getEffectParticles(msg.effectType)
                    : [];

                // Poll calculations
                const pollVotes = msg.pollVotes || {};
                const totalVotes = Object.keys(pollVotes).length;
                const myVote = userPublic ? pollVotes[userPublic.uid] : undefined;

                return (
                  <div
                    id={`msg-${msg.id}`}
                    key={msg.id}
                    className={`relative flex flex-col ${isMine ? 'items-end' : 'items-start'} ${
                      effectsEnabled ? 'mixy-msg-enter' : ''
                    }`}
                  >
                    {/* Effect Particle Burst */}
                    {burstParticles.length > 0 && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-2 flex gap-2 z-20"
                      >
                        {burstParticles.map((p, idx) => (
                          <span
                            key={`${activeEffectBursts[msg.id]}-${idx}`}
                            style={{ animationDelay: `${idx * 90}ms` }}
                            className="text-xl mixy-effect-particle"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    )}

                    <div
                      className={`group flex items-end gap-2 max-w-[85%] ${
                        isMine ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() =>
                            setSelectedMsgIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(msg.id)) next.delete(msg.id);
                              else next.add(msg.id);
                              return next;
                            })
                          }
                          className="w-4 h-4 accent-fuchsia-500 mb-2 shrink-0"
                        />
                      )}

                      {!isMine && (
                        <button
                          type="button"
                          onClick={() => onOpenProfile(msg.senderId)}
                          className="shrink-0 hover:opacity-85 transition-opacity"
                          title={`View @${msg.senderUsername}'s profile`}
                        >
                          <UserAvatar
                            src={msg.senderPhotoURL}
                            name={msg.senderUsername}
                            size="xs"
                          />
                        </button>
                      )}

                      <div
                        style={
                          bubbleChatMode
                            ? {
                                background: isMine
                                  ? 'linear-gradient(135deg, rgba(236,72,153,0.45), rgba(99,102,241,0.45))'
                                  : 'rgba(255,255,255,0.16)',
                                color: isLightTheme && !isMine ? '#0f172a' : '#ffffff',
                              }
                            : {
                                background: isMine
                                  ? activeStyle.mineBubbleBg
                                  : activeStyle.otherBubbleBg,
                                color: isMine
                                  ? activeStyle.mineBubbleText
                                  : activeStyle.otherBubbleText,
                              }
                        }
                        className={`${bubblePaddingClass} ${
                          bubbleChatMode
                            ? 'rounded-3xl backdrop-blur-xl border border-white/35 shadow-[inset_0_1px_8px_rgba(255,255,255,0.45),0_8px_24px_rgba(0,0,0,0.2)]'
                            : isMine
                              ? radiusSet.mine
                              : radiusSet.other
                        } ${textSizeClass} ${appearanceClass} space-y-1.5 relative shadow-sm`}
                      >
                        {activeConv.isGroup && !isMine && (
                          <button
                            type="button"
                            onClick={() => onOpenProfile(msg.senderId)}
                            className="text-[11px] font-bold opacity-85 hover:underline inline-flex items-center gap-1 text-left"
                          >
                            <span>@{msg.senderUsername}</span>
                            <UserVerifiedBadge uid={msg.senderId} className="w-3 h-3" />
                          </button>
                        )}

                        {msg.forwardedFrom && !msg.isDeleted && (
                          <p className="text-[10px] opacity-80 flex items-center gap-1">
                            <Forward className="w-3 h-3" /> Forwarded from @{msg.forwardedFrom}
                          </p>
                        )}

                        {msg.replyToPreview && !msg.isDeleted && (
                          <div className="text-xs px-2.5 py-1 rounded-lg bg-black/20 border-l-2 border-white/70 opacity-90">
                            {msg.replyToPreview}
                          </div>
                        )}

                        {!msg.isDeleted && msg.type === 'image' && msg.mediaURL && (
                          <img
                            src={mediaUrl(msg.mediaURL)}
                            alt="Chat photo"
                            onClick={() => setLightboxImage(mediaUrl(msg.mediaURL!))}
                            className="max-h-64 rounded-xl object-cover cursor-pointer hover:opacity-95"
                          />
                        )}

                        {!msg.isDeleted &&
                          msg.type === 'images' &&
                          msg.mediaItems &&
                          msg.mediaItems.length > 0 && (
                            <div className="grid grid-cols-2 gap-1.5 max-w-[280px]">
                              {msg.mediaItems.map((imgUrl, idx) => (
                                <img
                                  key={idx}
                                  src={mediaUrl(imgUrl)}
                                  alt={`Photo ${idx + 1}`}
                                  onClick={() => setLightboxImage(mediaUrl(imgUrl))}
                                  className="h-32 w-full rounded-xl object-cover cursor-pointer hover:opacity-95"
                                />
                              ))}
                            </div>
                          )}

                        {!msg.isDeleted && msg.type === 'video' && msg.mediaURL && (
                          <video
                            src={mediaUrl(msg.mediaURL)}
                            controls
                            playsInline
                            className="max-h-64 rounded-xl bg-black"
                          />
                        )}

                        {!msg.isDeleted && msg.type === 'voice' && msg.mediaURL && (
                          <VoicePlayer
                            mediaURL={msg.mediaURL}
                            durationSec={msg.voiceDurationSec}
                            waveform={msg.voiceWaveform}
                            transcript={msg.transcript}
                            isMine={isMine}
                            onTranscriptSaved={async (tr) => {
                              await updateDoc(
                                doc(db, 'conversations', activeConv.id, 'messages', msg.id),
                                {
                                  transcript: tr,
                                  updatedAt: serverTimestamp(),
                                }
                              );
                            }}
                          />
                        )}

                        {!msg.isDeleted && msg.type === 'file' && msg.mediaURL && (
                          <a
                            href={mediaUrl(msg.mediaURL)}
                            download={msg.fileName || 'attachment'}
                            className="flex items-center gap-2.5 p-2.5 rounded-xl bg-black/20 hover:bg-black/30 transition-colors"
                          >
                            <FileText className="w-5 h-5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold truncate">
                                {msg.fileName || 'Attachment'}
                              </p>
                              <p className="text-[10px] opacity-75">{formatBytes(msg.fileSize)}</p>
                            </div>
                            <Download className="w-4 h-4 shrink-0" />
                          </a>
                        )}

                        {!msg.isDeleted &&
                          (msg.type === 'post_share' ||
                            msg.type === 'reel_share' ||
                            msg.type === 'story_share' ||
                            msg.type === 'story_reply') && (
                            <button
                              type="button"
                              onClick={() => {
                                if (msg.type === 'post_share' && msg.sharedItemId) {
                                  onOpenPost?.(msg.sharedItemId);
                                } else if (msg.type === 'reel_share' && msg.sharedItemId) {
                                  onOpenReel?.(msg.sharedItemId);
                                } else {
                                  onOpenStories?.();
                                }
                              }}
                              className="w-full text-left p-2.5 rounded-xl bg-black/20 hover:bg-black/30 transition-colors space-y-1"
                            >
                              <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                                {msg.type === 'post_share'
                                  ? 'Reposted Post'
                                  : msg.type === 'reel_share'
                                    ? 'Reposted Reel'
                                    : msg.type === 'story_share'
                                      ? 'Shared Story'
                                      : 'Story Reply'}
                                {msg.sharedCreatorUsername
                                  ? ` · @${msg.sharedCreatorUsername}`
                                  : ''}
                              </p>
                              {msg.sharedItemPreview && (
                                <p className="text-xs line-clamp-2 opacity-95">
                                  {msg.sharedItemPreview}
                                </p>
                              )}
                              {msg.sharedCaption && (
                                <p className="text-xs italic opacity-85">"{msg.sharedCaption}"</p>
                              )}
                            </button>
                          )}

                        {/* Interactive Group Poll Card */}
                        {!msg.isDeleted &&
                          msg.type === 'poll' &&
                          msg.pollOptions &&
                          msg.pollOptions.length >= 2 && (
                            <div className="space-y-2 min-w-[230px] pt-1">
                              <p className="text-xs font-bold flex items-center gap-1.5">
                                <BarChart3 className="w-3.5 h-3.5" />
                                {msg.pollQuestion || msg.text}
                              </p>
                              <div className="space-y-1.5">
                                {msg.pollOptions.map((opt, idx) => {
                                  const count = Object.values(pollVotes).filter(
                                    (v) => v === idx
                                  ).length;
                                  const pct =
                                    totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                                  const isVoted = myVote === idx;
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      disabled={Boolean(msg.pollClosed)}
                                      onClick={() => void handleVotePoll(msg, idx)}
                                      className={`relative w-full overflow-hidden rounded-xl border text-left px-3 py-1.5 text-xs transition-all ${
                                        isVoted
                                          ? 'border-white font-bold bg-black/25'
                                          : 'border-white/25 bg-black/15 hover:bg-black/25'
                                      }`}
                                    >
                                      <span
                                        style={{ width: `${pct}%` }}
                                        className="absolute inset-y-0 left-0 bg-white/20 transition-all"
                                      />
                                      <span className="relative flex items-center justify-between gap-2">
                                        <span className="truncate">{opt}</span>
                                        <span className="tabular-nums shrink-0 text-[11px]">
                                          {pct}% ({count})
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex items-center justify-between text-[10px] opacity-80">
                                <span>
                                  {totalVotes} vote{totalVotes === 1 ? '' : 's'}
                                  {msg.pollClosed ? ' · Closed' : ''}
                                </span>
                                {isMine && !msg.pollClosed && (
                                  <button
                                    type="button"
                                    onClick={() => void handleClosePoll(msg)}
                                    className="font-semibold hover:underline"
                                  >
                                    Close Poll
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                        {msg.text && msg.type !== 'poll' && (
                          <p
                            className={`whitespace-pre-wrap break-words ${
                              msg.isDeleted ? 'italic opacity-75 text-xs' : ''
                            }`}
                          >
                            {msg.text}
                          </p>
                        )}

                        {translations[msg.id] && (
                          <div className="px-2.5 py-1.5 rounded-xl bg-black/25 text-xs flex items-start justify-between gap-2">
                            <span>{translations[msg.id]}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setTranslations((prev) => {
                                  const copy = { ...prev };
                                  delete copy[msg.id];
                                  return copy;
                                })
                              }
                              className="opacity-70 hover:opacity-100"
                            >
                              ×
                            </button>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-1.5 text-[10px] opacity-75">
                          {hasEffect && !msg.isDeleted && (
                            <button
                              type="button"
                              onClick={() =>
                                setActiveEffectBursts((prev) => ({
                                  ...prev,
                                  [msg.id]: Date.now(),
                                }))
                              }
                              title="Replay message effect"
                              className="hover:scale-125 transition-transform"
                            >
                              {getEffectParticles(msg.effectType)[0]}
                            </button>
                          )}
                          {isPinned && <Pin className="w-2.5 h-2.5" />}
                          {isStarred && <Star className="w-2.5 h-2.5 fill-current" />}
                          {msg.expiresAt && !msg.isDeleted && (
                            <span title="Disappearing message" className="inline-flex">
                              <Clock className="w-2.5 h-2.5" />
                            </span>
                          )}
                          {msg.isEdited && !msg.isDeleted && <span>edited</span>}
                          <span>{formatRelativeTime(msg.createdAt)}</span>
                          {isMine &&
                            (isRead ? (
                              <CheckCheck className="w-3.5 h-3.5 text-sky-200" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            ))}
                        </div>

                        {reactionEntries.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {reactionEntries.map(([uid, emoji]) => (
                              <button
                                key={uid}
                                type="button"
                                onClick={() =>
                                  uid === userPublic?.uid && void handleReactMessage(msg, emoji)
                                }
                                className="text-xs px-1.5 py-0.5 rounded-full bg-black/25 hover:scale-110 transition-transform"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Message Hover Action Controls */}
                      {!msg.isDeleted && !selectMode && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 relative">
                          <button
                            type="button"
                            onClick={() =>
                              setReactingMsgId(reactingMsgId === msg.id ? null : msg.id)
                            }
                            className="p-1.5 rounded-full bg-black/25 hover:bg-black/45 text-white"
                            title="React"
                          >
                            <Smile className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setReplyTo(msg)}
                            className="p-1.5 rounded-full bg-black/25 hover:bg-black/45 text-white"
                            title="Reply"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setMsgMenuId(msgMenuId === msg.id ? null : msg.id)}
                            className="p-1.5 rounded-full bg-black/25 hover:bg-black/45 text-white"
                            title="More actions"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {msgMenuId === msg.id && (
                            <div
                              className={`absolute bottom-8 ${
                                isMine ? 'right-0' : 'left-0'
                              } w-48 rounded-2xl bg-white dark:bg-[#171726] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-white/10 shadow-2xl py-1.5 z-40 text-xs`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setForwardMessages([msg]);
                                  setMsgMenuId(null);
                                }}
                                className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/5"
                              >
                                <Forward className="w-3.5 h-3.5" /> Forward
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleTogglePinMessage(msg)}
                                className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/5"
                              >
                                <Pin className="w-3.5 h-3.5" /> {isPinned ? 'Unpin' : 'Pin message'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleStarMessage(msg)}
                                className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/5"
                              >
                                <Star className="w-3.5 h-3.5" /> {isStarred ? 'Unstar' : 'Star / Save'}
                              </button>
                              {msg.text && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void handleTranslateMessage(msg)}
                                    className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/5"
                                  >
                                    <Languages className="w-3.5 h-3.5" />
                                    {translatingId === msg.id
                                      ? 'Translating...'
                                      : `Translate (${translateLang})`}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void navigator.clipboard.writeText(msg.text || '');
                                      setMsgMenuId(null);
                                    }}
                                    className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/5"
                                  >
                                    <Copy className="w-3.5 h-3.5" /> Copy text
                                  </button>
                                </>
                              )}
                              {isMine && msg.type === 'text' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMsg(msg);
                                    setMsgText(msg.text || '');
                                    setMsgMenuId(null);
                                  }}
                                  className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/5"
                                >
                                  <Edit3 className="w-3.5 h-3.5" /> Edit message
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectMode(true);
                                  setSelectedMsgIds(new Set([msg.id]));
                                  setMsgMenuId(null);
                                }}
                                className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/5"
                              >
                                <CheckSquare className="w-3.5 h-3.5" /> Multi-select
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteForMe(msg)}
                                className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/5"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete for me
                              </button>
                              {isMine ? (
                                <button
                                  type="button"
                                  onClick={() => void handleUnsendMessage(msg)}
                                  className="w-full px-3.5 py-2 text-left flex items-center gap-2 text-rose-500 hover:bg-rose-500/10"
                                >
                                  <Undo2 className="w-3.5 h-3.5" /> Unsend
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReportTarget({ type: 'message', id: msg.id });
                                    setMsgMenuId(null);
                                  }}
                                  className="w-full px-3.5 py-2 text-left flex items-center gap-2 text-rose-500 hover:bg-rose-500/10"
                                >
                                  <Flag className="w-3.5 h-3.5" /> Report message
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Reaction Picker */}
                    {reactingMsgId === msg.id && (
                      <div className="mt-1 flex flex-col gap-1.5 px-2.5 py-1.5 rounded-2xl bg-white dark:bg-[#1B1B2B] border border-slate-200 dark:border-white/10 shadow-xl z-30">
                        <div className="flex items-center gap-1">
                          {QUICK_REACTIONS.map((em) => (
                            <button
                              key={em}
                              type="button"
                              onClick={() => void handleReactMessage(msg, em)}
                              className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-base hover:scale-110 transition-transform"
                            >
                              {em}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              setShowMoreEmojisFor(showMoreEmojisFor === msg.id ? null : msg.id)
                            }
                            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/10 text-xs font-bold"
                            title="More emojis"
                          >
                            +
                          </button>
                        </div>
                        {showMoreEmojisFor === msg.id && (
                          <div className="grid grid-cols-5 gap-1 pt-1 border-t border-slate-200 dark:border-white/10">
                            {EXPANDED_EMOJIS.map((em) => (
                              <button
                                key={em}
                                type="button"
                                onClick={() => void handleReactMessage(msg, em)}
                                className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-base"
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {mediaErr && (
              <div className="px-4 py-1.5 bg-rose-500/15 border-t border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
                <span>{mediaErr}</span>
                <button type="button" onClick={() => setMediaErr('')}>
                  ×
                </button>
              </div>
            )}

            {/* Reply / Edit Banner */}
            {(replyTo || editingMsg) && (
              <div className="px-4 py-2 bg-slate-100 dark:bg-white/5 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-xs">
                <span className="truncate">
                  {editingMsg
                    ? `Editing message: ${editingMsg.text}`
                    : `Replying to @${replyTo?.senderUsername}: ${replyTo?.text || replyTo?.type}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo(null);
                    setEditingMsg(null);
                    setMsgText('');
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Effect Picker & Schedule Popover */}
            {showEffectPicker && (
              <div className="px-4 py-2 bg-slate-50 dark:bg-[#141422] border-t border-slate-200 dark:border-white/10 flex items-center gap-2 overflow-x-auto no-scrollbar text-xs">
                <span className="font-semibold text-slate-500 shrink-0">Send with effect:</span>
                {DM_EFFECT_OPTIONS.map((eff) => (
                  <button
                    key={eff.id}
                    type="button"
                    onClick={() => {
                      setSelectedEffect(eff.id);
                      setShowEffectPicker(false);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 shrink-0 ${
                      selectedEffect === eff.id
                        ? 'mixy-gradient-bg text-white'
                        : 'bg-slate-200 dark:bg-white/10'
                    }`}
                  >
                    <span>{eff.emoji}</span>
                    <span>{eff.label}</span>
                  </button>
                ))}
              </div>
            )}

            {showSchedulePicker && (
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-[#141422] border-t border-slate-200 dark:border-white/10 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-fuchsia-500" /> Schedule "{msgText.slice(0, 24)}":
                </span>
                <button
                  type="button"
                  onClick={() => void handleScheduleMessage(new Date(Date.now() + 10 * 60 * 1000))}
                  className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-white/10 font-semibold hover:bg-fuchsia-500/20"
                >
                  +10 min
                </button>
                <button
                  type="button"
                  onClick={() => void handleScheduleMessage(new Date(Date.now() + 60 * 60 * 1000))}
                  className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-white/10 font-semibold hover:bg-fuchsia-500/20"
                >
                  +1 hour
                </button>
                <input
                  type="datetime-local"
                  value={scheduleDatetime}
                  onChange={(e) => setScheduleDatetime(e.target.value)}
                  className="h-8 px-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                />
                <button
                  type="button"
                  disabled={!scheduleDatetime}
                  onClick={() => {
                    const d = new Date(scheduleDatetime);
                    if (d.getTime() > Date.now()) void handleScheduleMessage(d);
                  }}
                  className="px-3 py-1 rounded-lg mixy-gradient-bg text-white font-semibold disabled:opacity-40"
                >
                  Set Schedule
                </button>
              </div>
            )}

            {/* COMPOSER BAR */}
            <form
              onSubmit={handleSendText}
              className="p-3 border-t border-slate-200 dark:border-white/10 flex items-center gap-1.5"
            >
              {!isRecording && (
                <>
                  <label
                    className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer text-slate-500 shrink-0"
                    title="Send photo(s)"
                  >
                    <ImageIcon className="w-5 h-5" />
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handleUploadImages(e)}
                    />
                  </label>

                  <label
                    className="hidden sm:flex w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 items-center justify-center cursor-pointer text-slate-500 shrink-0"
                    title="Send video"
                  >
                    <Film className="w-5 h-5" />
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => void handleUploadVideoOrFile(e, 'video')}
                    />
                  </label>

                  <label
                    className="hidden sm:flex w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 items-center justify-center cursor-pointer text-slate-500 shrink-0"
                    title="Attach file (PDF, doc, zip...)"
                  >
                    <Paperclip className="w-5 h-5" />
                    <input
                      type="file"
                      accept=".pdf,.txt,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
                      className="hidden"
                      onChange={(e) => void handleUploadVideoOrFile(e, 'file')}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setCameraModalOpen(true)}
                    className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 shrink-0"
                    title="Camera photo or video"
                  >
                    <Camera className="w-5 h-5" />
                  </button>
                </>
              )}

              {isRecording ? (
                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 h-11 rounded-full bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500/40 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
                  <button
                    type="button"
                    onClick={pauseOrResumeVoice}
                    className="w-8 h-8 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shrink-0 transition-transform active:scale-90"
                    title={isPaused ? 'Resume recording' : 'Pause recording'}
                    aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
                  >
                    {isPaused ? <Play className="w-4 h-4 ml-0.5" /> : <Pause className="w-4 h-4" />}
                  </button>
                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                    {isPaused ? 'PAUSED' : 'REC'} {Math.floor(recordingSec / 60)}:{(recordingSec % 60).toString().padStart(2, '0')}
                  </span>
                  <div className="flex-1 flex items-center gap-[2.5px] h-6 overflow-hidden px-1" aria-hidden="true">
                    {liveBars.map((val, i) => (
                      <span
                        key={i}
                        style={{ height: `${isPaused ? 25 : Math.max(15, val)}%` }}
                        className="flex-1 min-w-[3px] rounded-full bg-rose-500 transition-all duration-75"
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => stopVoiceRecording(true)}
                    className="w-8 h-8 rounded-full hover:bg-rose-500/20 text-slate-500 dark:text-slate-400 hover:text-rose-500 flex items-center justify-center shrink-0 transition-colors"
                    title="Cancel recording"
                    aria-label="Cancel recording"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => stopVoiceRecording(false)}
                    disabled={uploadingMedia || recordingSec < 1}
                    className="px-3.5 py-1.5 rounded-full mixy-gradient-bg text-white text-xs font-semibold flex items-center gap-1.5 shadow-md hover:opacity-90 active:scale-95 disabled:opacity-40 shrink-0 transition-all"
                    title="Send voice note"
                    aria-label="Send voice note"
                  >
                    {uploadingMedia ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void startVoiceRecording()}
                    disabled={uploadingMedia}
                    className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 hover:text-fuchsia-500 transition-colors shrink-0"
                    title="Record voice note"
                    aria-label="Record voice note"
                  >
                    <Mic className="w-5 h-5" />
                  </button>

                  <input
                    type="text"
                    maxLength={BLUEPRINT_LIMITS.MESSAGE_TEXT_MAX}
                    value={msgText}
                    onChange={(e) => {
                      setMsgText(e.target.value);
                      if (userPrivate?.dmShowTyping !== false) {
                        realtimeClient.sendTyping(activeConv.id, activeConv.participantIds, true);
                        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                        typingTimeoutRef.current = window.setTimeout(() => {
                          realtimeClient.sendTyping(
                            activeConv.id,
                            activeConv.participantIds,
                            false
                          );
                        }, 1800);
                      }
                    }}
                    placeholder={
                      selectedEffect !== 'none'
                        ? `Message with ${selectedEffect}...`
                        : 'Message...'
                    }
                    className="flex-1 min-w-0 h-10 px-4 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                  />

                  <button
                    type="button"
                    onClick={() => setShowEffectPicker((v) => !v)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      selectedEffect !== 'none'
                        ? 'bg-fuchsia-500/20 text-fuchsia-400'
                        : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500'
                    }`}
                    title="Send with special effect"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>

                  {msgText.trim() && !editingMsg && (
                    <button
                      type="button"
                      onClick={() => setShowSchedulePicker((v) => !v)}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        showSchedulePicker
                          ? 'bg-indigo-500/20 text-indigo-400'
                          : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500'
                      }`}
                      title="Schedule message"
                    >
                      <Clock className="w-4 h-4" />
                    </button>
                  )}

                  {msgText.trim() ? (
                    <button
                      type="submit"
                      disabled={uploadingMedia}
                      className="w-10 h-10 rounded-full mixy-gradient-bg text-white flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all disabled:opacity-40 shrink-0"
                      aria-label="Send message"
                      title="Send message"
                    >
                      {uploadingMedia ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startVoiceRecording()}
                      disabled={uploadingMedia}
                      className="w-10 h-10 rounded-full mixy-gradient-bg text-white flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all shrink-0"
                      aria-label="Record voice note"
                      title="Record voice note"
                    >
                      {uploadingMedia ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Mic className="w-5 h-5" />
                      )}
                    </button>
                  )}
                </>
              )}
            </form>
          </>
        )}
      </div>

      {/* NEW CHAT / GROUP MODAL */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateConversation}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 p-5 space-y-4 max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">New Conversation</h3>
              <button type="button" onClick={() => setShowNewChat(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/5">
              <button
                type="button"
                onClick={() => {
                  setIsGroupMode(false);
                  setSelectedUserIds([]);
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                  !isGroupMode ? 'mixy-gradient-bg text-white' : 'text-slate-500'
                }`}
              >
                Direct Message
              </button>
              <button
                type="button"
                onClick={() => setIsGroupMode(true)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${
                  isGroupMode ? 'mixy-gradient-bg text-white' : 'text-slate-500'
                }`}
              >
                <Users className="w-3.5 h-3.5" /> Group Chat
              </button>
            </div>

            {isGroupMode && (
              <input
                type="text"
                maxLength={80}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name (e.g. Weekend Vibes)"
                className="w-full h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
              />
            )}

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {Array.from(usersMap.values())
                .filter((u) => u.uid !== userPublic?.uid && !blockedSet.has(u.uid))
                .map((u) => {
                  const selected = selectedUserIds.includes(u.uid);
                  return (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => {
                        if (!isGroupMode) {
                          setSelectedUserIds([u.uid]);
                        } else {
                          setSelectedUserIds((prev) =>
                            selected ? prev.filter((id) => id !== u.uid) : [...prev, u.uid]
                          );
                        }
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left ${
                        selected
                          ? 'border-fuchsia-500 bg-fuchsia-500/10'
                          : 'border-transparent hover:bg-slate-100 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <UserAvatar src={u.photoURL} name={u.displayName} size="sm" />
                        <div>
                          <p className="text-sm font-semibold flex items-center gap-1">
                            <span>{u.displayName}</span>
                            <UserVerifiedBadge uid={u.uid} fallback={u.isVerified} className="w-3.5 h-3.5" />
                          </p>
                          <p className="text-xs text-slate-500">@{u.username}</p>
                        </div>
                      </div>
                      {selected && <Check className="w-4 h-4 text-fuchsia-500" />}
                    </button>
                  );
                })}
            </div>

            <button
              type="submit"
              disabled={selectedUserIds.length === 0}
              className="w-full h-11 rounded-xl mixy-gradient-bg text-white font-semibold text-sm disabled:opacity-40"
            >
              {isGroupMode ? 'Create Group' : 'Start Chat'}
            </button>
          </form>
        </div>
      )}

      {/* JOIN GROUP VIA INVITE LINK DIALOG */}
      {showJoinDialog && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleJoinByInvite}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Link2 className="w-4 h-4 text-fuchsia-500" /> Join Group Chat
              </h3>
              <button type="button" onClick={() => setShowJoinDialog(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              placeholder="Paste invite link or code..."
              className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
            />
            {joinStatus && <p className="text-xs text-rose-500">{joinStatus}</p>}
            <button
              type="submit"
              className="w-full h-10 rounded-xl mixy-gradient-bg text-white text-xs font-semibold"
            >
              Join Group
            </button>
          </form>
        </div>
      )}

      {/* THEME / FONT / MOOD / PRIVACY STUDIO MODAL */}
      {customizeTab && activeConv && (
        <DmCustomizeModal
          conversation={activeConv}
          otherUser={activeDisplay?.otherUser || null}
          initialTab={customizeTab}
          onClose={() => setCustomizeTab(null)}
          onBlockUser={handleBlockUser}
          onRestrictUser={handleRestrictUser}
          onReportUser={(uid) => setReportTarget({ type: 'user', id: uid })}
        />
      )}

      {/* GROUP MANAGE MODAL */}
      {groupModalTab && activeConv && activeConv.isGroup && (
        <GroupManageModal
          conversation={activeConv}
          usersMap={usersMap}
          initialTab={groupModalTab}
          onClose={() => setGroupModalTab(null)}
          onOpenProfile={onOpenProfile}
        />
      )}

      {/* CAMERA PHOTO & VIDEO CAPTURE MODAL */}
      {cameraModalOpen && activeConv && userPublic && (
        <MediaCaptureModal
          onClose={() => setCameraModalOpen(false)}
          onSendCaptured={async (url, kind) => {
            await sendConversationMessage({
              currentUser: userPublic,
              conversation: activeConv,
              type: kind,
              mediaURL: url,
            });
          }}
        />
      )}

      {/* FORWARD MESSAGE MODAL */}
      {forwardMessages && (
        <ForwardShareModal
          title={`Forward ${forwardMessages.length} Message${forwardMessages.length > 1 ? 's' : ''}`}
          messagesToForward={forwardMessages}
          conversations={conversations}
          usersMap={usersMap}
          onClose={() => setForwardMessages(null)}
        />
      )}

      {/* FULLSCREEN IMAGE LIGHTBOX */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={mediaUrl(lightboxImage)}
            alt="Full preview"
            className="max-w-full max-h-[90vh] rounded-2xl object-contain"
          />
        </div>
      )}

      {reportTarget && (
        <ReportModal
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}
