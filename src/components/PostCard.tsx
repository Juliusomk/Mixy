import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Archive,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Flag,
  Heart,
  ImageOff,
  Languages,
  Link2,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Repeat,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { RepostModal } from './RepostModal';
import { apiFetch } from '../lib/api';
import {
  auth,
  BLUEPRINT_LIMITS,
  db,
  extractHashtags,
  extractMentions,
  formatCount,
  formatRelativeTime,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { triggerHaptic } from '../lib/haptics';
import { mediaUrl } from '../lib/media';
import {
  addItemComment,
  toggleFollowUser,
  toggleLikePost,
  toggleSaveItem,
} from '../lib/socialActions';
import type { CommentItem, Post, UserPublic } from '../types/mixy';
import { UserAvatar, UserVerifiedBadge, VerifiedBadge } from './MixyLogo';
import { ReportModal } from './ReportModal';
import { ShareModal } from './ShareModal';

export function PostCard({
  post,
  onOpenProfile,
  onOpenHashtag,
}: {
  post: Post;
  onOpenProfile: (uid: string) => void;
  onOpenHashtag: (tag: string) => void;
}) {
  const {
    userPublic,
    userPrivate,
    usersById,
    usersByUsername,
    followingIds,
    pendingFollowIds,
    repostedKeys,
    savedIds,
  } = useAuth();
  const [mediaIdx, setMediaIdx] = useState(0);
  const [mediaError, setMediaError] = useState(false);
  const [liked, setLiked] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showRepost, setShowRepost] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption);
  const [editLocation, setEditLocation] = useState(post.location || '');
  const [editCommentsDisabled, setEditCommentsDisabled] = useState(post.commentsDisabled);
  const [copiedLink, setCopiedLink] = useState(false);
  const [translatedCaption, setTranslatedCaption] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState('');

  const isOwner = userPublic?.uid === post.authorId;
  const isFollowing = followingIds.has(post.authorId);
  const isPending = pendingFollowIds.has(post.authorId);
  const isReposted = repostedKeys.has(`post_${post.id}`);
  const isSaved = savedIds.has(post.id);

  useEffect(() => {
    if (!userPublic) return;
    const unsub = onSnapshot(
      doc(db, 'posts', post.id, 'likes', userPublic.uid),
      (snap) => setLiked(snap.exists()),
      (err) => handleFirestoreError(err, OperationType.GET, `posts/${post.id}/likes`)
    );
    return () => unsub();
  }, [post.id, userPublic]);

  useEffect(() => {
    if (!showComments) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'posts', post.id, 'comments'),
        where('parentId', '==', post.id)
      ),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as CommentItem)
          .sort((a, b) => {
            const at = a.createdAt?.toDate?.().getTime() ?? 0;
            const bt = b.createdAt?.toDate?.().getTime() ?? 0;
            return at - bt;
          });
        setComments(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `posts/${post.id}/comments`)
    );
    return () => unsub();
  }, [showComments, post.id]);

  useEffect(() => {
    setMediaError(false);
  }, [mediaIdx, post.id]);

  const handleLike = async () => {
    if (!userPublic) return;
    triggerHaptic(liked ? 'light' : 'medium');
    await toggleLikePost(userPublic, post, liked);
  };

  const handleDoubleTapLike = async () => {
    if (!userPublic) return;
    triggerHaptic('medium');
    setShowHeartBurst(true);
    window.setTimeout(() => setShowHeartBurst(false), 760);
    if (!liked) {
      await toggleLikePost(userPublic, post, false);
    }
  };

  const handleSave = async () => {
    if (!userPublic) return;
    triggerHaptic('light');
    await toggleSaveItem(userPublic, post.id, 'post', isSaved);
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'posts', post.id, 'comments', commentId));
      if ((post.commentsCount || 0) > 0) {
        batch.update(doc(db, 'posts', post.id), {
          commentsCount: increment(-1),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      triggerHaptic('light');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${post.id}/comments/${commentId}`);
    }
  };

  const handleTranslateCaption = async () => {
    if (translatedCaption) {
      setTranslatedCaption(null);
      setTranslateError('');
      return;
    }
    if (!post.caption || translating) return;
    setTranslating(true);
    setTranslateError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setTranslateError('Sign in required to translate.');
        return;
      }
      const langMap: Record<string, string> = {
        en: 'English',
        sw: 'Kiswahili',
        fr: 'French',
        es: 'Spanish',
      };
      const targetLanguage = langMap[userPrivate?.language || 'en'] || 'English';
      const resp = await apiFetch('/api/ai/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: post.caption,
          targetLanguage,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        translatedText?: string;
        error?: string;
      };
      if (!resp.ok || !data.translatedText) {
        setTranslateError(data.error || 'Translation unavailable right now.');
        return;
      }
      setTranslatedCaption(data.translatedText);
    } catch {
      setTranslateError('Network error translating caption.');
    } finally {
      setTranslating(false);
    }
  };

  const handleFollowToggle = async () => {
    if (!userPublic || isOwner || followLoading) return;
    setFollowLoading(true);
    try {
      const targetSnap = await getDoc(doc(db, 'users', post.authorId));
      if (targetSnap.exists()) {
        await toggleFollowUser(userPublic, targetSnap.data() as UserPublic, isFollowing);
      }
    } finally {
      setFollowLoading(false);
    }
  };

  const handleOpenMention = async (handle: string) => {
    const clean = handle.replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase();
    if (!clean) return;
    const snap = await getDoc(doc(db, 'usernames', clean)).catch(() => null);
    if (snap && snap.exists()) {
      const uid = (snap.data() as { uid?: string }).uid;
      if (uid) onOpenProfile(uid);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublic || !commentText.trim() || post.commentsDisabled) return;
    await addItemComment({
      currentUser: userPublic,
      parentType: 'post',
      parentId: post.id,
      parentAuthorId: post.authorId,
      text: commentText,
      replyToCommentId: replyTo?.id,
      replyToAuthorId: replyTo?.authorId,
    });
    setCommentText('');
    setReplyTo(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateDoc(doc(db, 'posts', post.id), {
      caption: editCaption.trim().slice(0, BLUEPRINT_LIMITS.CAPTION_MAX),
      hashtags: extractHashtags(editCaption),
      mentions: extractMentions(editCaption),
      location: editLocation.trim().slice(0, 120),
      commentsDisabled: editCommentsDisabled,
      updatedAt: serverTimestamp(),
    });
    setShowEdit(false);
  };

  const handleArchivePost = async () => {
    await updateDoc(doc(db, 'posts', post.id), {
      isArchived: !post.isArchived,
      updatedAt: serverTimestamp(),
    });
    setShowMenu(false);
  };

  const handleDeletePost = async () => {
    await updateDoc(doc(db, 'posts', post.id), {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setShowMenu(false);
  };

  const renderCaptionText = (text: string) => {
    const tokens = text.split(/(\s+)/);
    return tokens.map((tok, i) => {
      if (tok.startsWith('#') && tok.length > 1) {
        const tag = tok.slice(1).replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        return (
          <button
            key={i}
            type="button"
            onClick={() => onOpenHashtag(tag)}
            className="text-fuchsia-500 hover:underline font-medium"
          >
            {tok}
          </button>
        );
      }
      if (tok.startsWith('@') && tok.length > 1) {
        const handle = tok.slice(1);
        const cleanHandle = handle.replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase();
        const mentionedUser = usersByUsername.get(cleanHandle);
        return (
          <button
            key={i}
            type="button"
            onClick={() => void handleOpenMention(handle)}
            className="text-sky-500 hover:underline font-medium inline-flex items-center gap-0.5 align-baseline"
          >
            <span>{tok}</span>
            {mentionedUser?.isVerified && (
              <VerifiedBadge
                className="w-3 h-3"
                verificationType={mentionedUser.verificationType}
              />
            )}
          </button>
        );
      }
      return <React.Fragment key={i}>{tok}</React.Fragment>;
    });
  };

  const currentMedia = post.media[mediaIdx] || post.media[0];
  const topComments = comments.filter((c) => !c.replyToCommentId);
  const repliesByParent = new Map<string, CommentItem[]>();
  for (const c of comments) {
    if (c.replyToCommentId) {
      const list = repliesByParent.get(c.replyToCommentId) || [];
      list.push(c);
      repliesByParent.set(c.replyToCommentId, list);
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => onOpenProfile(post.authorId)} className="shrink-0">
            <UserAvatar
              src={post.authorPhotoURL}
              name={post.authorDisplayName}
              size="sm"
            />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onOpenProfile(post.authorId)}
                className="text-sm font-semibold truncate hover:underline"
              >
                {post.authorUsername}
              </button>
              <UserVerifiedBadge uid={post.authorId} fallback={post.authorVerified} className="w-3.5 h-3.5" />
              {post.audience === 'close_friends' && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                  Close Friends
                </span>
              )}
              {!isOwner && (
                <>
                  <span className="text-slate-400" aria-hidden="true">·</span>
                  <button
                    disabled={followLoading}
                    onClick={handleFollowToggle}
                    className={`text-xs font-semibold ${
                      isFollowing || isPending
                        ? 'text-slate-500 hover:text-rose-400'
                        : 'text-fuchsia-500 hover:underline'
                    }`}
                  >
                    {followLoading ? '...' : isFollowing ? 'Following' : isPending ? 'Requested' : 'Follow'}
                  </button>
                </>
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
              <span>{formatRelativeTime(post.createdAt)}</span>
              {post.location && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{post.location}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center text-slate-500"
            aria-label="Post options"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-48 rounded-2xl bg-white dark:bg-[#171726] border border-slate-200 dark:border-white/10 shadow-xl py-1.5 z-30 text-sm">
              <button
                onClick={() => {
                  setShowMenu(false);
                  setShowShare(true);
                }}
                className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <Send className="w-4 h-4 text-fuchsia-500" /> Repost to DM
              </button>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(`${window.location.origin}/?post=${post.id}`);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 1800);
                  setShowMenu(false);
                }}
                className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <Link2 className="w-4 h-4" /> {copiedLink ? 'Copied!' : 'Copy post link'}
              </button>
              {isOwner ? (
                <>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      setShowEdit(true);
                    }}
                    className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-white/5"
                  >
                    <Edit3 className="w-4 h-4" /> Edit post
                  </button>
                  <button
                    onClick={handleArchivePost}
                    className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-white/5"
                  >
                    <Archive className="w-4 h-4" /> {post.isArchived ? 'Unarchive' : 'Archive post'}
                  </button>
                  <button
                    onClick={handleDeletePost}
                    className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-rose-500 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-4 h-4" /> Delete post
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowReport(true);
                  }}
                  className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-rose-500 hover:bg-rose-500/10"
                >
                  <Flag className="w-4 h-4" /> Report post
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Media Carousel */}
      {currentMedia && (
        <div
          className="relative bg-black aspect-[4/3] sm:aspect-square max-h-[540px] w-full overflow-hidden flex items-center justify-center select-none"
          onDoubleClick={() => void handleDoubleTapLike()}
        >
          {mediaError ? (
            <div className="flex flex-col items-center justify-center gap-2 text-slate-400 p-6 text-center">
              <ImageOff className="w-8 h-8 opacity-60" />
              <p className="text-xs font-medium">Media unavailable</p>
            </div>
          ) : currentMedia.type === 'video' ? (
            <video
              src={mediaUrl(currentMedia.url)}
              controls
              playsInline
              preload="metadata"
              onError={() => setMediaError(true)}
              className="w-full h-full object-contain"
            />
          ) : (
            <img
              src={mediaUrl(currentMedia.url)}
              alt={post.caption || 'Post media'}
              onError={() => setMediaError(true)}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          )}

          {showHeartBurst && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20">
              <Heart className="w-24 h-24 text-rose-500 fill-rose-500 drop-shadow-[0_10px_28px_rgba(244,63,94,0.65)] mixy-heart-pop" />
            </div>
          )}

          {post.media.length > 1 && (
            <>
              {mediaIdx > 0 && (
                <button
                  onClick={() => setMediaIdx((i) => i - 1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                  aria-label="Previous media"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {mediaIdx < post.media.length - 1 && (
                <button
                  onClick={() => setMediaIdx((i) => i + 1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                  aria-label="Next media"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
              <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
                {post.media.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setMediaIdx(idx)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      idx === mediaIdx ? 'bg-white' : 'bg-white/40'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Action Bar & Metadata */}
      <div className="px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleLike}
              className="inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80 transition-opacity"
              aria-label={liked ? 'Unlike post' : 'Like post'}
            >
              <Heart
                className={`w-6 h-6 transition-transform active:scale-125 ${
                  liked ? 'text-rose-500 fill-rose-500' : ''
                }`}
              />
              <span className="tabular-nums text-xs font-semibold">
                {formatCount(post.likesCount)}
              </span>
            </button>

            <button
              onClick={() => setShowComments((v) => !v)}
              className="inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
              aria-label="Comments"
            >
              <MessageCircle className="w-6 h-6" />
              <span className="tabular-nums text-xs font-semibold">
                {formatCount(post.commentsCount)}
              </span>
            </button>

            <button
              onClick={() => setShowShare(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
              aria-label="Share post"
            >
              <Send className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowRepost(true)}
              className={`inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80 transition-opacity ${
                isReposted ? 'text-emerald-500' : ''
              }`}
              aria-label="Repost"
              title="Repost to your profile"
            >
              <Repeat className="w-5 h-5" />
              {(post.repostsCount || 0) > 0 && (
                <span className="tabular-nums text-xs font-semibold">
                  {formatCount(post.repostsCount || 0)}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={handleSave}
            className="hover:opacity-80 transition-opacity"
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark post'}
          >
            <Bookmark
              className={`w-6 h-6 ${isSaved ? 'text-fuchsia-500 fill-fuchsia-500' : ''}`}
            />
          </button>
        </div>

        {/* Caption & Hashtags */}
        {post.caption && (
          <div className="space-y-1.5">
            <div className="text-sm leading-relaxed">
              <button
                onClick={() => onOpenProfile(post.authorId)}
                className="font-semibold mr-2 hover:underline inline-flex items-center gap-1 align-baseline"
              >
                <span>{post.authorUsername}</span>
                <UserVerifiedBadge uid={post.authorId} fallback={post.authorVerified} className="w-3.5 h-3.5" />
              </button>
              <span className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                {renderCaptionText(post.caption)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleTranslateCaption()}
                disabled={translating}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-fuchsia-500 transition-colors disabled:opacity-50"
              >
                {translating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Languages className="w-3 h-3" />
                )}
                <span>
                  {translating
                    ? 'Translating...'
                    : translatedCaption
                      ? 'Show original'
                      : 'Translate'}
                </span>
              </button>
              {translateError && (
                <span className="text-[11px] text-rose-500">{translateError}</span>
              )}
            </div>

            {translatedCaption && (
              <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                {translatedCaption}
              </div>
            )}
          </div>
        )}

        {/* Tagged People */}
        {post.taggedUserIds && post.taggedUserIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400">With</span>
            {post.taggedUserIds.map((uid) => {
              const tagged = usersById.get(uid);
              return (
                <button
                  key={uid}
                  type="button"
                  onClick={() => onOpenProfile(uid)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 font-medium text-slate-700 dark:text-slate-200"
                >
                  <span>@{tagged?.username || 'user'}</span>
                  <UserVerifiedBadge uid={uid} className="w-3 h-3" />
                </button>
              );
            })}
          </div>
        )}

        {/* Unboxed clean metadata line */}
        <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
          <span>{post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : 'Today'}</span>
          {post.hashtags && post.hashtags.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="flex flex-wrap gap-2">
                {post.hashtags.slice(0, 5).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => onOpenHashtag(tag)}
                    className="text-fuchsia-500 hover:underline"
                  >
                    #{tag}
                  </button>
                ))}
              </span>
            </>
          )}
        </div>

        {/* Comments Section */}
        {showComments && (
          <div className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-3">
            {post.commentsDisabled ? (
              <p className="text-xs text-slate-500">Comments are turned off for this post.</p>
            ) : (
              <>
                <div className="max-h-60 overflow-y-auto space-y-2.5 pr-1">
                  {topComments.length === 0 ? (
                    <p className="text-xs text-slate-500">No comments yet. Start the conversation.</p>
                  ) : (
                    topComments.map((c) => {
                      const replies = repliesByParent.get(c.id) || [];
                      return (
                        <div key={c.id} className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2 text-xs">
                            <div className="flex items-start gap-2 min-w-0">
                              <button
                                type="button"
                                onClick={() => onOpenProfile(c.authorId)}
                                className="shrink-0"
                              >
                                <UserAvatar src={c.authorPhotoURL} name={c.authorUsername} size="xs" />
                              </button>
                              <div>
                                <p>
                                  <button
                                    onClick={() => onOpenProfile(c.authorId)}
                                    className="font-semibold mr-1.5 hover:underline inline-flex items-center gap-1 align-baseline"
                                  >
                                    <span>{c.authorUsername}</span>
                                    <UserVerifiedBadge uid={c.authorId} className="w-3 h-3" />
                                  </button>
                                  <span className="text-slate-700 dark:text-slate-200">{c.text}</span>
                                </p>
                                <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                                  <span>{formatRelativeTime(c.createdAt)}</span>
                                  <button
                                    type="button"
                                    onClick={() => setReplyTo(c)}
                                    className="font-semibold hover:text-fuchsia-400"
                                  >
                                    Reply
                                  </button>
                                </div>
                              </div>
                            </div>
                            {(c.authorId === userPublic?.uid || isOwner) && (
                              <button
                                onClick={() => void handleDeleteComment(c.id)}
                                className="text-slate-400 hover:text-rose-500"
                                title="Delete comment"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {replies.length > 0 && (
                            <div className="pl-8 space-y-1.5 border-l border-slate-200 dark:border-white/10 ml-3">
                              {replies.map((r) => (
                                <div key={r.id} className="flex items-start justify-between gap-2 text-xs">
                                  <div className="flex items-start gap-2 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => onOpenProfile(r.authorId)}
                                      className="shrink-0"
                                    >
                                      <UserAvatar src={r.authorPhotoURL} name={r.authorUsername} size="xs" />
                                    </button>
                                    <div>
                                      <p>
                                        <button
                                          onClick={() => onOpenProfile(r.authorId)}
                                          className="font-semibold mr-1.5 hover:underline inline-flex items-center gap-1 align-baseline"
                                        >
                                          <span>{r.authorUsername}</span>
                                          <UserVerifiedBadge uid={r.authorId} className="w-3 h-3" />
                                        </button>
                                        <span className="text-slate-700 dark:text-slate-200">{r.text}</span>
                                      </p>
                                      <span className="text-[11px] text-slate-400">
                                        {formatRelativeTime(r.createdAt)}
                                      </span>
                                    </div>
                                  </div>
                                  {(r.authorId === userPublic?.uid || isOwner) && (
                                    <button
                                      onClick={() => void handleDeleteComment(r.id)}
                                      className="text-slate-400 hover:text-rose-500 shrink-0"
                                      title="Delete reply"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {replyTo && (
                  <div className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5">
                    <span>Replying to @{replyTo.authorUsername}</span>
                    <button onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={BLUEPRINT_LIMITS.COMMENT_MAX}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={replyTo ? `Reply to @${replyTo.authorUsername}...` : 'Add a comment...'}
                    className="flex-1 h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    className="px-4 h-10 rounded-xl mixy-gradient-bg text-white text-xs font-semibold disabled:opacity-40"
                  >
                    Post
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </div>

      {/* Edit Post Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Edit Post</h3>
              <button type="button" onClick={() => setShowEdit(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Caption</label>
              <textarea
                rows={3}
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
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
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={editCommentsDisabled}
                onChange={(e) => setEditCommentsDisabled(e.target.checked)}
                className="w-4 h-4 accent-fuchsia-500"
              />
              Disable comments
            </label>
            <button
              type="submit"
              className="w-full h-11 rounded-xl mixy-gradient-bg text-white font-semibold text-sm"
            >
              Save Changes
            </button>
          </form>
        </div>
      )}

      {showShare && (
        <ShareModal
          itemType="post"
          itemId={post.id}
          previewText={post.caption || `Post by @${post.authorUsername}`}
          authorUsername={post.authorUsername}
          mediaPreviewUrl={currentMedia?.type === 'image' ? mediaUrl(currentMedia.url) : undefined}
          shareUrl={`${window.location.origin}/?post=${post.id}`}
          onClose={() => setShowShare(false)}
        />
      )}

      {showReport && (
        <ReportModal
          targetType="post"
          targetId={post.id}
          onClose={() => setShowReport(false)}
        />
      )}

      {showRepost && (
        <RepostModal
          open={showRepost}
          targetType="post"
          targetId={post.id}
          originalAuthorId={post.authorId}
          originalAuthorUsername={post.authorUsername}
          audience={post.audience}
          alreadyReposted={isReposted}
          previewText={post.caption || `Post by @${post.authorUsername}`}
          onClose={() => setShowRepost(false)}
          onOpenShare={() => setShowShare(true)}
        />
      )}
    </article>
  );
}
