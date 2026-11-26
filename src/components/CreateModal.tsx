import React, { useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  ChevronLeft,
  ChevronRight,
  Film,
  ImagePlus,
  Loader2,
  MapPin,
  Music,
  Sparkles,
  Tag,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  BLUEPRINT_LIMITS,
  db,
  extractHashtags,
  extractMentions,
  generateId,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  inferMediaKind,
  inferMimeType,
  MAX_MEDIA_BYTES,
  uploadMediaFile,
} from '../lib/media';
import type { AudienceType, StoryVisibility, UserPublic } from '../types/mixy';
import { VerifiedBadge } from './MixyLogo';

type CreateTab = 'post' | 'reel' | 'story';

interface PreviewMediaItem {
  file: File;
  preview: string;
  type: 'image' | 'video';
}

const LEGAL_STORY_TRACKS = [
  'Midnight Skyline (Ambient Mix)',
  'Golden Hour Groove (Royalty-Free)',
  'Neon Drift (Synth Instrumental)',
  'Sunday Acoustic Chill',
  'City Lights Lo-Fi',
];

const STORY_STICKERS = ['🔥', '❤️', '✨', '👑', '💯', '🦋', '🎵', '📸', '⚡', '🌍'];

export function CreateModal({
  initialTab = 'post',
  onClose,
  onCreated,
}: {
  initialTab?: CreateTab;
  onClose: () => void;
  onCreated?: (tab: CreateTab) => void;
}) {
  const { userPublic, userPrivate, sendActivityNotification } = useAuth();
  const [tab, setTab] = useState<CreateTab>(initialTab);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStage, setUploadStage] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isDraggingPost, setIsDraggingPost] = useState(false);
  const [error, setError] = useState('');

  // Post fields
  const [postFiles, setPostFiles] = useState<PreviewMediaItem[]>([]);
  const [caption, setCaption] = useState('');
  const [extraHashtags, setExtraHashtags] = useState('');
  const [location, setLocation] = useState('');
  const [audience, setAudience] = useState<AudienceType>('public');
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [allUsers, setAllUsers] = useState<UserPublic[]>([]);
  const [taggedUserIds, setTaggedUserIds] = useState<string[]>([]);

  // Reel fields
  const [reelFile, setReelFile] = useState<{ file: File; preview: string } | null>(null);
  const [reelCaption, setReelCaption] = useState('');
  const [reelDescription, setReelDescription] = useState('');
  const [reelAudio, setReelAudio] = useState('Original Audio');

  // Story fields
  const [storyFile, setStoryFile] = useState<PreviewMediaItem | null>(null);
  const [storyText, setStoryText] = useState('');
  const [storyTextColor, setStoryTextColor] = useState('#ffffff');
  const [storyStickers, setStoryStickers] = useState<string[]>([]);
  const [storyMusic, setStoryMusic] = useState('');
  const [storyCaption, setStoryCaption] = useState('');
  const [storyVisibility, setStoryVisibility] = useState<StoryVisibility>('followers');

  const previewsRef = useRef<string[]>([]);
  useEffect(() => {
    const urls: string[] = [
      ...postFiles.map((p) => p.preview),
      ...(reelFile ? [reelFile.preview] : []),
      ...(storyFile ? [storyFile.preview] : []),
    ];
    previewsRef.current = urls;
  }, [postFiles, reelFile, storyFile]);

  useEffect(() => {
    return () => {
      for (const url of previewsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'users'), where('isDeactivated', '==', false))
        );
        setAllUsers(
          snap.docs
            .map((d) => d.data() as UserPublic)
            .filter((u) => u.uid !== userPublic?.uid)
            .slice(0, 30)
        );
      } catch {
        // non-blocking
      }
    })();
  }, [userPublic?.uid]);

  const addPostFiles = (incomingList: File[]) => {
    if (incomingList.length === 0) return;
    setError('');
    const remaining = BLUEPRINT_LIMITS.MEDIA_ITEMS_MAX - postFiles.length;
    if (remaining <= 0) {
      setError(`Maximum of ${BLUEPRINT_LIMITS.MEDIA_ITEMS_MAX} photos or videos per post.`);
      return;
    }

    const accepted: PreviewMediaItem[] = [];
    const skippedReasons: string[] = [];

    for (const file of incomingList.slice(0, remaining)) {
      if (file.size <= 0) {
        skippedReasons.push(`${file.name} is empty.`);
        continue;
      }
      if (file.size > MAX_MEDIA_BYTES) {
        skippedReasons.push(`${file.name} exceeds 100 MB.`);
        continue;
      }
      const mime = inferMimeType(file);
      if (!mime.startsWith('image/') && !mime.startsWith('video/')) {
        skippedReasons.push(`${file.name} has an unsupported format.`);
        continue;
      }
      accepted.push({
        file,
        preview: URL.createObjectURL(file),
        type: inferMediaKind(file),
      });
    }

    if (incomingList.length > remaining) {
      skippedReasons.push(`Only the first ${remaining} item(s) were added (max 10 per post).`);
    }

    if (accepted.length > 0) {
      setPostFiles((prev) => [...prev, ...accepted]);
    }
    if (skippedReasons.length > 0) {
      setError(skippedReasons.join(' '));
    }
  };

  const handlePostFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addPostFiles(files);
    e.target.value = '';
  };

  const removePostFile = (idx: number) => {
    setPostFiles((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const movePostFile = (idx: number, direction: -1 | 1) => {
    setPostFiles((prev) => {
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, moved);
      return copy;
    });
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublic) {
      setError('Please sign in before publishing a post.');
      return;
    }
    if (postFiles.length === 0) {
      setError('Select at least one photo or video.');
      return;
    }

    setError('');
    setSubmitting(true);
    setUploadProgress(2);
    setUploadStage(`Preparing ${postFiles.length} media item${postFiles.length > 1 ? 's' : ''}...`);

    try {
      const uploadedMedia: { url: string; type: 'image' | 'video' }[] = [];
      for (let i = 0; i < postFiles.length; i += 1) {
        const item = postFiles[i];
        setUploadStage(
          `Uploading ${item.type} ${i + 1} of ${postFiles.length}...`
        );
        const res = await uploadMediaFile(item.file, item.file.name, (itemPct) => {
          const overall = Math.round(((i + itemPct / 100) / postFiles.length) * 92);
          setUploadProgress(Math.max(4, Math.min(94, overall)));
        });
        uploadedMedia.push({
          url: res.url.slice(0, 500),
          type: res.mediaType === 'video' ? 'video' : 'image',
        });
      }

      setUploadStage('Publishing post...');
      setUploadProgress(96);

      const combinedText = `${caption} ${extraHashtags}`;
      const hashtags = extractHashtags(combinedText).slice(0, 30);
      const mentions = extractMentions(caption).slice(0, 20);
      const postId = generateId('post');
      const batch = writeBatch(db);

      const safeUsername = (userPublic.username || 'user').trim().slice(0, 30) || 'user';
      const safeDisplayName =
        (userPublic.displayName || safeUsername).trim().slice(0, 60) || safeUsername;
      const safePhotoURL = (userPublic.photoURL || '').slice(0, 500);

      batch.set(doc(db, 'posts', postId), {
        id: postId,
        authorId: userPublic.uid,
        authorUsername: safeUsername,
        authorDisplayName: safeDisplayName,
        authorPhotoURL: safePhotoURL,
        authorVerified: Boolean(userPublic.isVerified),
        media: uploadedMedia,
        caption: caption.trim().slice(0, BLUEPRINT_LIMITS.CAPTION_MAX),
        hashtags,
        mentions,
        taggedUserIds: taggedUserIds.slice(0, 20),
        location: location.trim().slice(0, 120),
        audience,
        closeFriendIds: audience === 'close_friends' ? (userPrivate?.closeFriendsIds || []) : [],
        commentsDisabled,
        isArchived: false,
        isDeleted: false,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        savesCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.update(doc(db, 'users', userPublic.uid), {
        postsCount: increment(1),
        updatedAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (fsErr) {
        console.error('Failed to publish post to Firestore:', fsErr);
        throw new Error(
          fsErr instanceof Error && fsErr.message.includes('permission')
            ? 'You do not have permission to publish right now. Ensure your email is verified and your account is active.'
            : 'Could not save your post to the database. Please try again.'
        );
      }

      setUploadProgress(100);

      // Notification fan-out runs best-effort after commit so a notification failure never blocks post publishing
      const notifPromises: Promise<void>[] = [];
      for (const uid of taggedUserIds.slice(0, 20)) {
        notifPromises.push(
          sendActivityNotification({
            recipientId: uid,
            type: 'tag',
            targetId: postId,
            text: `@${safeUsername} tagged you in a post.`,
          })
        );
      }
      for (const u of allUsers) {
        if (mentions.includes(u.usernameLower) && !taggedUserIds.includes(u.uid)) {
          notifPromises.push(
            sendActivityNotification({
              recipientId: u.uid,
              type: 'mention',
              targetId: postId,
              text: `@${safeUsername} mentioned you in a post.`,
            })
          );
        }
      }
      if (notifPromises.length > 0) {
        void Promise.allSettled(notifPromises);
      }

      onCreated?.('post');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish post.');
    } finally {
      setSubmitting(false);
      setUploadStage('');
      setUploadProgress(null);
    }
  };

  const handleCreateReel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublic) return;
    if (!reelFile) return setError('Select a video file to publish a Reel.');

    setError('');
    setSubmitting(true);
    setUploadProgress(5);
    setUploadStage('Uploading Reel video...');
    try {
      const uploaded = await uploadMediaFile(reelFile.file, reelFile.file.name, (pct) => {
        setUploadProgress(Math.min(95, pct));
      });
      setUploadStage('Publishing Reel...');
      setUploadProgress(97);

      const hashtags = extractHashtags(`${reelCaption} ${reelDescription}`);
      const reelId = generateId('reel');

      const batch = writeBatch(db);
      batch.set(doc(db, 'reels', reelId), {
        id: reelId,
        authorId: userPublic.uid,
        authorUsername: (userPublic.username || 'user').trim().slice(0, 30),
        authorDisplayName: (userPublic.displayName || userPublic.username || 'user').trim().slice(0, 60),
        authorPhotoURL: (userPublic.photoURL || '').slice(0, 500),
        authorVerified: Boolean(userPublic.isVerified),
        videoURL: uploaded.url.slice(0, 500),
        caption: reelCaption.trim().slice(0, BLUEPRINT_LIMITS.REEL_CAPTION_MAX),
        description: reelDescription.trim().slice(0, BLUEPRINT_LIMITS.REEL_DESC_MAX),
        hashtags,
        audioTitle: reelAudio.trim().slice(0, 120) || 'Original Audio',
        viewsCount: 0,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        savesCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      try {
        await batch.commit();
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.CREATE, 'reels');
      }

      setUploadProgress(100);
      onCreated?.('reel');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish reel.');
    } finally {
      setSubmitting(false);
      setUploadStage('');
      setUploadProgress(null);
    }
  };

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublic) return;
    if (!storyFile) return setError('Select a photo or video for your Story.');

    setError('');
    setSubmitting(true);
    setUploadProgress(5);
    setUploadStage('Uploading Story...');
    try {
      const uploaded = await uploadMediaFile(storyFile.file, storyFile.file.name, (pct) => {
        setUploadProgress(Math.min(95, pct));
      });
      setUploadStage('Sharing Story...');
      setUploadProgress(97);

      const storyId = generateId('story');
      const expiresDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const batch = writeBatch(db);
      batch.set(doc(db, 'stories', storyId), {
        id: storyId,
        authorId: userPublic.uid,
        authorUsername: (userPublic.username || 'user').trim().slice(0, 30),
        authorPhotoURL: (userPublic.photoURL || '').slice(0, 500),
        authorVerified: Boolean(userPublic.isVerified),
        mediaURL: uploaded.url.slice(0, 500),
        mediaType: storyFile.type,
        textOverlay: storyText.trim().slice(0, BLUEPRINT_LIMITS.STORY_TEXT_MAX),
        textColor: storyTextColor,
        stickers: storyStickers.slice(0, 15),
        musicTrack: storyMusic.slice(0, 120),
        caption: storyCaption.trim().slice(0, 300),
        visibility: storyVisibility,
        closeFriendIds: storyVisibility === 'close_friends' ? (userPrivate?.closeFriendsIds || []) : [],
        isArchived: false,
        viewsCount: 0,
        expiresAt: Timestamp.fromDate(expiresDate),
        createdAt: serverTimestamp(),
      });
      await batch.commit();

      setUploadProgress(100);
      onCreated?.('story');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish story.');
    } finally {
      setSubmitting(false);
      setUploadStage('');
      setUploadProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#11111B] border border-slate-200 dark:border-white/10 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header & Type Switcher */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/5">
            {(['post', 'reel', 'story'] as CreateTab[]).map((t) => (
              <button
                key={t}
                type="button"
                disabled={submitting}
                onClick={() => {
                  setError('');
                  setTab(t);
                }}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                  tab === t
                    ? 'mixy-gradient-bg text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center disabled:opacity-40"
            aria-label="Close creator"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-sm">
              {error}
            </div>
          )}

          {submitting && uploadProgress !== null && (
            <div className="p-3.5 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/25 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-2 text-fuchsia-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {uploadStage || 'Uploading...'}
                </span>
                <span className="tabular-nums text-slate-300">{uploadProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full mixy-gradient-bg transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {tab === 'post' && (
            <form onSubmit={handleCreatePost} className="space-y-4">
              <div>
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingPost(true);
                  }}
                  onDragLeave={() => setIsDraggingPost(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingPost(false);
                    addPostFiles(Array.from(e.dataTransfer.files || []));
                  }}
                  className={`flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${
                    isDraggingPost
                      ? 'border-fuchsia-500 bg-fuchsia-500/10'
                      : 'border-slate-300 dark:border-white/15 hover:border-fuchsia-500 bg-slate-50 dark:bg-white/[0.02]'
                  }`}
                >
                  <ImagePlus className="w-8 h-8 text-fuchsia-500" />
                  <span className="text-sm font-semibold text-center">
                    {postFiles.length > 0
                      ? `Add more photos or videos (${postFiles.length}/${BLUEPRINT_LIMITS.MEDIA_ITEMS_MAX})`
                      : 'Drop or click to upload Photos or Videos (up to 10)'}
                  </span>
                  <span className="text-xs text-slate-500">
                    JPG, PNG, WEBP, GIF, HEIC, MP4, MOV, WEBM (up to 100 MB each)
                  </span>
                  <input
                    type="file"
                    accept="image/*,video/*,.heic,.heif,.mov,.m4v"
                    multiple
                    disabled={submitting}
                    onChange={handlePostFilesSelect}
                    className="hidden"
                  />
                </label>

                {postFiles.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
                    {postFiles.map((item, idx) => (
                      <div key={item.preview} className="relative aspect-square rounded-xl overflow-hidden bg-black group">
                        {item.type === 'video' ? (
                          <video
                            src={item.preview}
                            muted
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img src={item.preview} alt="Upload preview" className="w-full h-full object-cover" />
                        )}
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-black/70 text-[10px] font-semibold text-white">
                          {idx + 1}/{postFiles.length}
                        </span>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => removePostFile(idx)}
                          aria-label={`Remove item ${idx + 1}`}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/75 text-white flex items-center justify-center hover:bg-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {postFiles.length > 1 && (
                          <div className="absolute bottom-1 inset-x-1 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              disabled={submitting || idx === 0}
                              onClick={() => movePostFile(idx, -1)}
                              aria-label="Move slide left"
                              className="w-6 h-6 rounded-full bg-black/75 text-white flex items-center justify-center disabled:opacity-30"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={submitting || idx === postFiles.length - 1}
                              onClick={() => movePostFile(idx, 1)}
                              aria-label="Move slide right"
                              className="w-6 h-6 rounded-full bg-black/75 text-white flex items-center justify-center disabled:opacity-30"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Caption (use #hashtags and @mentions)</label>
                <textarea
                  rows={3}
                  maxLength={BLUEPRINT_LIMITS.CAPTION_MAX}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write a caption... #mixy #vibes"
                  className="w-full p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" /> Extra Hashtags
                  </label>
                  <input
                    type="text"
                    value={extraHashtags}
                    onChange={(e) => setExtraHashtags(e.target.value)}
                    placeholder="#photography #music"
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Nairobi, Kenya"
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  />
                </div>
              </div>

              {allUsers.length > 0 && (
                <div>
                  <label className="block text-xs font-medium mb-1.5">Tag People</label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {allUsers.map((u) => {
                      const selected = taggedUserIds.includes(u.uid);
                      return (
                        <button
                          key={u.uid}
                          type="button"
                          onClick={() =>
                            setTaggedUserIds((prev) =>
                              selected ? prev.filter((id) => id !== u.uid) : [...prev, u.uid]
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors inline-flex items-center gap-1 ${
                            selected
                              ? 'mixy-gradient-bg text-white border-transparent'
                              : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <span>@{u.username}</span>
                          {u.isVerified && (
                            <VerifiedBadge
                              className="w-3 h-3"
                              verificationType={u.verificationType}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-medium mb-1">Audience</label>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as AudienceType)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  >
                    <option value="public" className="bg-white dark:bg-[#11111B]">Public (Everyone)</option>
                    <option value="followers" className="bg-white dark:bg-[#11111B]">Followers Only</option>
                    <option value="close_friends" className="bg-white dark:bg-[#11111B]">⭐️ Close Friends</option>
                    <option value="private" className="bg-white dark:bg-[#11111B]">Only Me (Private)</option>
                  </select>
                </div>
                <label className="flex items-center gap-2.5 pt-4 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={commentsDisabled}
                    onChange={(e) => setCommentsDisabled(e.target.checked)}
                    className="w-4 h-4 accent-fuchsia-500"
                  />
                  <span>Turn off commenting</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting || postFiles.length === 0}
                className="w-full h-12 rounded-xl mixy-gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? uploadStage || 'Publishing Post...' : 'Publish Post'}
              </button>
            </form>
          )}

          {tab === 'reel' && (
            <form onSubmit={handleCreateReel} className="space-y-4">
              <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-white/15 hover:border-fuchsia-500 cursor-pointer bg-slate-50 dark:bg-white/[0.02]">
                <Film className="w-8 h-8 text-fuchsia-500" />
                <span className="text-sm font-semibold">
                  {reelFile ? reelFile.file.name : 'Upload Vertical Short Video (MP4 / WEBM / MOV)'}
                </span>
                <input
                  type="file"
                  accept="video/*,.mov,.m4v"
                  disabled={submitting}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    if (f.size <= 0 || f.size > MAX_MEDIA_BYTES) {
                      setError('Video must be between 1 byte and 100 MB.');
                      return;
                    }
                    setError('');
                    if (reelFile) URL.revokeObjectURL(reelFile.preview);
                    setReelFile({ file: f, preview: URL.createObjectURL(f) });
                  }}
                  className="hidden"
                />
              </label>

              {reelFile && (
                <video
                  src={reelFile.preview}
                  controls
                  className="w-full max-h-64 rounded-2xl bg-black object-contain"
                />
              )}

              <div>
                <label className="block text-xs font-medium mb-1">Reel Caption & Hashtags</label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.REEL_CAPTION_MAX}
                  value={reelCaption}
                  onChange={(e) => setReelCaption(e.target.value)}
                  placeholder="Dreams don't work unless you do #Life #Mixy #Reels"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Description</label>
                <textarea
                  rows={2}
                  maxLength={BLUEPRINT_LIMITS.REEL_DESC_MAX}
                  value={reelDescription}
                  onChange={(e) => setReelDescription(e.target.value)}
                  placeholder="Add extra video description..."
                  className="w-full p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Audio / Sound Name</label>
                <input
                  type="text"
                  maxLength={120}
                  value={reelAudio}
                  onChange={(e) => setReelAudio(e.target.value)}
                  placeholder="Original Audio"
                  className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 rounded-xl mixy-gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? uploadStage || 'Publishing Reel...' : 'Publish Reel'}
              </button>
            </form>
          )}

          {tab === 'story' && (
            <form onSubmit={handleCreateStory} className="space-y-4">
              <label className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-dashed border-slate-300 dark:border-white/15 hover:border-fuchsia-500 cursor-pointer bg-slate-50 dark:bg-white/[0.02]">
                <Sparkles className="w-7 h-7 text-fuchsia-500" />
                <span className="text-sm font-semibold">
                  {storyFile ? storyFile.file.name : 'Upload Story Photo or Video (Expires in 24h)'}
                </span>
                <input
                  type="file"
                  accept="image/*,video/*,.heic,.heif,.mov,.m4v"
                  disabled={submitting}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    if (f.size <= 0 || f.size > MAX_MEDIA_BYTES) {
                      setError('Media must be between 1 byte and 100 MB.');
                      return;
                    }
                    setError('');
                    if (storyFile) URL.revokeObjectURL(storyFile.preview);
                    setStoryFile({
                      file: f,
                      preview: URL.createObjectURL(f),
                      type: inferMediaKind(f),
                    });
                  }}
                  className="hidden"
                />
              </label>

              {storyFile && (
                <div className="relative mx-auto w-56 aspect-[9/16] rounded-2xl overflow-hidden bg-black border border-white/10">
                  {storyFile.type === 'video' ? (
                    <video src={storyFile.preview} controls className="w-full h-full object-cover" />
                  ) : (
                    <img src={storyFile.preview} alt="Story preview" className="w-full h-full object-cover" />
                  )}
                  {storyText && (
                    <div
                      className="absolute inset-x-3 top-1/2 -translate-y-1/2 text-center font-bold text-lg drop-shadow-lg break-words"
                      style={{ color: storyTextColor }}
                    >
                      {storyText}
                    </div>
                  )}
                  {storyStickers.length > 0 && (
                    <div className="absolute bottom-10 inset-x-3 flex flex-wrap justify-center gap-1.5 text-2xl">
                      {storyStickers.map((s, i) => (
                        <span key={i}>{s}</span>
                      ))}
                    </div>
                  )}
                  {storyMusic && (
                    <div className="absolute top-3 inset-x-3 bg-black/60 backdrop-blur-md rounded-lg px-2 py-1 text-[10px] text-white flex items-center gap-1 truncate">
                      <Music className="w-3 h-3 shrink-0" /> {storyMusic}
                    </div>
                  )}
                </div>
              )}

              <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                    <Type className="w-3.5 h-3.5" /> Text Overlay
                  </label>
                  <input
                    type="text"
                    maxLength={BLUEPRINT_LIMITS.STORY_TEXT_MAX}
                    value={storyText}
                    onChange={(e) => setStoryText(e.target.value)}
                    placeholder="Add text onto your story..."
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  />
                </div>
                <input
                  type="color"
                  value={storyTextColor}
                  onChange={(e) => setStoryTextColor(e.target.value)}
                  className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border border-white/15"
                  title="Text color"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Stickers & Emojis</label>
                <div className="flex flex-wrap gap-1.5">
                  {STORY_STICKERS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() =>
                        setStoryStickers((prev) =>
                          prev.includes(emoji) ? prev.filter((x) => x !== emoji) : [...prev, emoji]
                        )
                      }
                      className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center border ${
                        storyStickers.includes(emoji)
                          ? 'border-fuchsia-500 bg-fuchsia-500/15'
                          : 'border-slate-200 dark:border-white/10'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Legal Music Track</label>
                  <select
                    value={storyMusic}
                    onChange={(e) => setStoryMusic(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  >
                    <option value="" className="bg-white dark:bg-[#11111B]">No music</option>
                    {LEGAL_STORY_TRACKS.map((track) => (
                      <option key={track} value={track} className="bg-white dark:bg-[#11111B]">
                        {track}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Story Privacy</label>
                  <select
                    value={storyVisibility}
                    onChange={(e) => setStoryVisibility(e.target.value as StoryVisibility)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  >
                    <option value="followers" className="bg-white dark:bg-[#11111B]">Followers</option>
                    <option value="public" className="bg-white dark:bg-[#11111B]">Public</option>
                    <option value="close_friends" className="bg-white dark:bg-[#11111B]">Close Friends</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Story Caption</label>
                <input
                  type="text"
                  maxLength={300}
                  value={storyCaption}
                  onChange={(e) => setStoryCaption(e.target.value)}
                  placeholder="Optional story caption..."
                  className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 rounded-xl mixy-gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? uploadStage || 'Sharing Story...' : 'Share to Story'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
