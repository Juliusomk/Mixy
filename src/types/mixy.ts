import type { Timestamp } from 'firebase/firestore';

export type AppTheme = 'dark' | 'light' | 'system';
export type AccentColor = 'fuchsia' | 'cyan' | 'emerald' | 'amber' | 'rose';
export type FontSizePref = 'sm' | 'md' | 'lg';
export type AudienceType = 'public' | 'followers' | 'close_friends' | 'private';
export type StoryVisibility = 'public' | 'followers' | 'close_friends';

export type DmFontFamily =
  | 'modern_sans'
  | 'elegant_serif'
  | 'rounded'
  | 'minimal'
  | 'bold'
  | 'handwritten'
  | 'futuristic';
export type DmTextSize = 'sm' | 'md' | 'lg' | 'xl';
export type DmBubbleSize = 'compact' | 'cozy' | 'spacious';
export type DmCornerRadius = 'sharp' | 'rounded' | 'pill';
export type DmTextAppearance = 'clean' | 'shadow' | 'soft_glow' | 'high_contrast';
export type DmCollectionTag = 'all' | 'friends' | 'family' | 'groups' | 'favorites';
export type DmMessageEffect = 'none' | 'hearts' | 'sparkles' | 'confetti' | 'bubbles';
export type DmWhoCanMessage = 'everyone' | 'followers' | 'nobody';
export type DmBackgroundMode = 'theme' | 'mood' | 'solid' | 'gradient' | 'image';

export type ProfileFrameId =
  | 'none'
  | 'aurora_ring'
  | 'gold_crown'
  | 'cyber_neon'
  | 'crystal_glass'
  | 'sakura_bloom';

export type ProfileBorderGradient =
  | 'none'
  | 'fuchsia_violet'
  | 'cyan_blue'
  | 'amber_rose'
  | 'emerald_teal'
  | 'rainbow';

export type ProfileThemeId =
  | 'default'
  | 'minimal_white'
  | 'obsidian_gold'
  | 'midnight_cosmos'
  | 'pastel_bloom'
  | 'neon_cyber';

export interface ProfileEffect {
  frame?: ProfileFrameId;
  borderGradient?: ProfileBorderGradient;
  theme?: ProfileThemeId;
  backgroundUrl?: string;
  musicTitle?: string;
  musicUrl?: string;
  accentHex?: string;
  intro?: string;
  badges?: string[];
  featuredPostIds?: string[];
}

export interface UserMood {
  id: string;
  emoji: string;
  label: string;
}

export type VerificationType = 'official' | 'creator';

export interface UserPublic {
  uid: string;
  username: string;
  usernameLower: string;
  displayName: string;
  bio?: string;
  website?: string;
  location?: string;
  photoURL?: string;
  coverURL?: string;
  isVerified: boolean;
  verifiedAt?: Timestamp | null;
  verificationType?: VerificationType | null;
  verificationStatus?: 'none' | 'pending' | 'verified' | 'rejected';
  isPrivate: boolean;
  isDeactivated: boolean;
  role: 'user' | 'admin';
  followersCount: number;
  followingCount: number;
  postsCount: number;
  showOnlineStatus?: boolean;
  showLastSeen?: boolean;
  profileEffect?: ProfileEffect;
  mood?: UserMood;
  sleepModeActive?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserPrivate {
  uid: string;
  email: string;
  phone?: string;
  dob?: string;
  blockedIds?: string[];
  restrictedIds?: string[];
  mutedIds?: string[];
  hiddenWords?: string[];
  closeFriendsIds?: string[];
  storyVisibility?: StoryVisibility;
  mentionsPolicy?: 'everyone' | 'followers' | 'none';
  readReceipts?: boolean;
  twoFactorEnabled?: boolean;
  theme?: AppTheme;
  accentColor?: AccentColor;
  fontSize?: FontSizePref;
  language?: string;
  notifyLikes?: boolean;
  notifyComments?: boolean;
  notifyFollowers?: boolean;
  notifyMessages?: boolean;
  notifyMentions?: boolean;
  notifyStories?: boolean;
  notifyCalls?: boolean;
  notifyReposts?: boolean;
  pushEnabled?: boolean;
  contentPreferences?: string;
  // Appearance & Settings effects
  settingsAnimEnabled?: boolean;
  settingsSoundEnabled?: boolean;
  reducedMotionEnabled?: boolean;
  hapticsEnabled?: boolean;
  // Sleep / Quiet Mode & Digital Wellness
  sleepModeEnabled?: boolean;
  sleepScheduleEnabled?: boolean;
  sleepStart?: string;
  sleepEnd?: string;
  sleepFocusLock?: boolean;
  sleepPriorityIds?: string[];
  quietModeEnabled?: boolean;
  screenTimeReminderMin?: number;
  visitorInsightsEnabled?: boolean;
  // Calling preferences
  callVoiceAllowed?: DmWhoCanMessage;
  callVideoAllowed?: DmWhoCanMessage;
  preferredCameraFacing?: 'user' | 'environment';
  callIncomingBanner?: boolean;
  // DM Customization & Privacy Preferences
  dmFontFamily?: DmFontFamily;
  dmTextSize?: DmTextSize;
  dmBubbleSize?: DmBubbleSize;
  dmCornerRadius?: DmCornerRadius;
  dmTextAppearance?: DmTextAppearance;
  dmBubbleMode?: boolean;
  dmEffectsEnabled?: boolean;
  dmShowTyping?: boolean;
  dmWhoCanMessage?: DmWhoCanMessage;
  dmSoundEnabled?: boolean;
  updatedAt: Timestamp;
}

export interface MediaItem {
  url: string;
  type: 'image' | 'video';
}

export interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorPhotoURL?: string;
  authorVerified?: boolean;
  media: MediaItem[];
  caption: string;
  hashtags?: string[];
  mentions?: string[];
  taggedUserIds?: string[];
  location?: string;
  audience: AudienceType;
  closeFriendIds?: string[];
  commentsDisabled: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  deletedAt?: Timestamp;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  savesCount: number;
  repostsCount?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CommentItem {
  id: string;
  parentId: string;
  authorId: string;
  authorUsername: string;
  authorPhotoURL?: string;
  authorVerified?: boolean;
  text: string;
  replyToCommentId?: string;
  createdAt: Timestamp;
}

export interface Reel {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorPhotoURL?: string;
  authorVerified?: boolean;
  videoURL: string;
  caption: string;
  description?: string;
  hashtags?: string[];
  audioTitle?: string;
  viewsCount: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  savesCount: number;
  repostsCount?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Story {
  id: string;
  authorId: string;
  authorUsername: string;
  authorPhotoURL?: string;
  authorVerified?: boolean;
  mediaURL: string;
  mediaType: 'image' | 'video';
  textOverlay?: string;
  textColor?: string;
  stickers?: string[];
  musicTrack?: string;
  caption?: string;
  visibility: StoryVisibility;
  closeFriendIds?: string[];
  // Interactive Stickers
  pollQuestion?: string;
  pollOptions?: string[];
  pollVotes?: Record<string, number>;
  questionPrompt?: string;
  countdownTitle?: string;
  countdownTarget?: Timestamp;
  quizQuestion?: string;
  quizOptions?: string[];
  quizCorrectIdx?: number;
  quizAnswers?: Record<string, number>;
  emojiSliderEmoji?: string;
  emojiSliderPrompt?: string;
  emojiSliderVotes?: Record<string, number>;
  isArchived: boolean;
  viewsCount: number;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

export interface StoryViewer {
  viewerId: string;
  storyAuthorId: string;
  username: string;
  photoURL?: string;
  reaction?: string;
  viewedAt: Timestamp;
}

export interface StoryAnswer {
  id: string;
  storyId: string;
  storyAuthorId: string;
  respondentId: string;
  respondentUsername: string;
  respondentPhotoURL?: string;
  text: string;
  createdAt: Timestamp;
}

export interface StoryHighlight {
  id: string;
  ownerId: string;
  title: string;
  coverURL?: string;
  storyIds: string[];
  createdAt: Timestamp;
}

export interface RepostItem {
  id: string;
  userId: string;
  username: string;
  userDisplayName?: string;
  userPhotoURL?: string;
  userVerified?: boolean;
  targetType: 'post' | 'reel';
  targetId: string;
  originalAuthorId: string;
  originalAuthorUsername: string;
  caption?: string;
  createdAt: Timestamp;
}

export interface MomentItem {
  id: string;
  authorId: string;
  authorUsername: string;
  authorPhotoURL?: string;
  authorVerified?: boolean;
  mediaURL?: string;
  caption: string;
  moodEmoji?: string;
  audience: 'public' | 'followers' | 'close_friends';
  closeFriendIds?: string[];
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

export type CallType = 'voice' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined';

export interface CallRecord {
  id: string;
  conversationId: string;
  callerId: string;
  callerUsername: string;
  callerPhotoURL?: string;
  participantIds: string[];
  isGroup: boolean;
  callType: CallType;
  status: CallStatus;
  durationSec: number;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FollowEdge {
  followerId: string;
  targetId: string;
  status: 'active' | 'pending';
  createdAt: Timestamp;
}

export interface SavedPost {
  itemId: string;
  itemType: 'post' | 'reel';
  collectionId?: string;
  ownerId: string;
  createdAt: Timestamp;
}

export interface SavedCollection {
  id: string;
  ownerId: string;
  name: string;
  createdAt: Timestamp;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  groupName?: string;
  groupPhotoURL?: string;
  groupDescription?: string;
  groupAdmins?: string[];
  createdBy: string;
  participantIds: string[];
  lastMessageText?: string;
  lastMessageSenderId?: string;
  lastMessageType?: string;
  lastMessageAt?: Timestamp;
  themeId?: string;
  moodId?: string;
  backgroundMode?: DmBackgroundMode;
  backgroundValue?: string;
  customBackgroundURL?: string;
  disappearingSeconds?: number;
  pinnedMessageIds?: string[];
  announcementText?: string;
  inviteCode?: string;
  inviteEnabled?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ConversationMember {
  userId: string;
  role: 'admin' | 'member';
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  isRequest: boolean;
  collectionTag?: DmCollectionTag;
  lastReadAt?: Timestamp;
  clearedAt?: Timestamp;
  joinedAt: Timestamp;
}

export type MessageType =
  | 'text'
  | 'image'
  | 'images'
  | 'video'
  | 'voice'
  | 'file'
  | 'post_share'
  | 'reel_share'
  | 'story_reply'
  | 'story_share'
  | 'poll'
  | 'system';

export interface Message {
  id: string;
  conversationId: string;
  participantIds: string[];
  senderId: string;
  senderUsername: string;
  senderPhotoURL?: string;
  type: MessageType;
  text?: string;
  mediaURL?: string;
  mediaItems?: string[];
  fileName?: string;
  fileSize?: number;
  fileMime?: string;
  voiceDurationSec?: number;
  voiceWaveform?: number[];
  transcript?: string;
  effectType?: DmMessageEffect;
  sharedItemId?: string;
  sharedItemPreview?: string;
  sharedCreatorUsername?: string;
  sharedCaption?: string;
  forwardedFrom?: string;
  replyToId?: string;
  replyToPreview?: string;
  reactions?: Record<string, string>;
  readBy?: string[];
  starredBy?: string[];
  deletedFor?: string[];
  isEdited: boolean;
  isDeleted: boolean;
  isUnsent?: boolean;
  expiresAt?: Timestamp;
  pollQuestion?: string;
  pollOptions?: string[];
  pollVotes?: Record<string, number>;
  pollClosed?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ScheduledMessage {
  id: string;
  conversationId: string;
  participantIds: string[];
  senderId: string;
  senderUsername: string;
  senderPhotoURL?: string;
  type: 'text';
  text: string;
  effectType?: DmMessageEffect;
  scheduledFor: Timestamp;
  status: 'pending' | 'sent' | 'cancelled';
  createdAt: Timestamp;
}

export interface GroupInvite {
  inviteCode: string;
  conversationId: string;
  groupName: string;
  groupPhotoURL?: string;
  memberCount: number;
  createdBy: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface NoteItem {
  id: string;
  authorId: string;
  authorUsername: string;
  authorPhotoURL?: string;
  text: string;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

export interface NotificationItem {
  id: string;
  recipientId: string;
  actorId: string;
  actorUsername: string;
  actorPhotoURL?: string;
  type:
    | 'follow'
    | 'like'
    | 'comment'
    | 'reply'
    | 'mention'
    | 'tag'
    | 'message'
    | 'story_reaction'
    | 'verification'
    | 'security'
    | 'group_invite'
    | 'missed_call'
    | 'incoming_call'
    | 'repost';
  targetId?: string;
  text: string;
  isRead: boolean;
  createdAt: Timestamp;
}

export interface ReportItem {
  id: string;
  reporterId: string;
  targetType: 'post' | 'reel' | 'user' | 'message' | 'problem';
  targetId: string;
  reason: string;
  details?: string;
  status: 'open' | 'reviewed' | 'resolved' | 'dismissed';
  reviewedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VerificationRequest {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  category: string;
  reason: string;
  link?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SessionActivity {
  id: string;
  ownerId: string;
  device: string;
  isActive: boolean;
  lastActiveAt: Timestamp;
  createdAt: Timestamp;
}

export interface JuliusMessage {
  id: string;
  ownerId: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: Timestamp;
}

export type AppView =
  | 'home'
  | 'explore'
  | 'reels'
  | 'stories'
  | 'messages'
  | 'julius'
  | 'notifications'
  | 'profile'
  | 'studio'
  | 'settings'
  | 'admin';
