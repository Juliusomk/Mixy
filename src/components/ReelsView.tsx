import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Film,
  Flag,
  Heart,
  Loader2,
  MessageCircle,
  Music,
  Plus,
  Repeat,
  Send,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  BLUEPRINT_LIMITS,
  db,
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
  toggleLikeReel,
  toggleSaveItem,
} from '../lib/socialActions';
import type { CommentItem, Reel, UserPublic } from '../types/mixy';
import { UserAvatar, UserVerifiedBadge } from './MixyLogo';
import { ReportModal } from './ReportModal';
import { RepostModal } from './RepostModal';
import { ShareModal } from './ShareModal';

function ReelCard({
  reel,
  isActive,
  muted,
  onToggleMute,
  onOpenProfile,
  onOpenHashtag,
}: {
  reel: Reel;
  isActive: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onOpenProfile: (uid: string) => void;
  onOpenHashtag: (tag: string) => void;
}) {
  const { userPublic, followingIds, pendingFollowIds, repostedKeys, savedIds } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [liked, setLiked] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showRepost, setShowRepost] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [countedView, setCountedView] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const isOwner = userPublic?.uid === reel.authorId;
  const isFollowing = followingIds.has(reel.authorId);
  const isPending = pendingFollowIds.has(reel.authorId);
  const isReposted = repostedKeys.has(`reel_${reel.id}`);
  const isSaved = savedIds.has(reel.id);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isActive) {
      el.currentTime = 0;
      void el.play().catch(() => {});
      if (!countedView && userPublic) {
        setCountedView(true);
        void updateDoc(doc(db, 'reels', reel.id), {
          viewsCount: increment(1),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    } else {
      el.pause();
    }
  }, [isActive, reel.id, countedView, userPublic]);

  useEffect(() => {
    if (!userPublic) return;
    const unsub = onSnapshot(
      doc(db, 'reels', reel.id, 'likes', userPublic.uid),
      (snap) => setLiked(snap.exists()),
      (err) => handleFirestoreError(err, OperationType.GET, `reels/${reel.id}/likes`)
    );
    return () => unsub();
  }, [reel.id, userPublic]);

  useEffect(() => {
    if (!showComments) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'reels', reel.id, 'comments'),
        where('parentId', '==', reel.id)
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
      (err) => handleFirestoreError(err, OperationType.LIST, `reels/${reel.id}/comments`)
    );
    return () => unsub();
  }, [showComments, reel.id]);

  const handleFollow = async () => {
    if (!userPublic || isOwner || followLoading) return;
    setFollowLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', reel.authorId));
      if (snap.exists()) {
        await toggleFollowUser(userPublic, snap.data() as UserPublic, isFollowing);
      }
    } finally {
      setFollowLoading(false);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublic || !commentText.trim()) return;
    await addItemComment({
      currentUser: userPublic,
      parentType: 'reel',
      parentId: reel.id,
      parentAuthorId: reel.authorId,
      text: commentText,
      replyToCommentId: replyTo?.id,
      replyToAuthorId: replyTo?.authorId,
    });
    setCommentText('');
    setReplyTo(null);
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'reels', reel.id, 'comments', commentId));
      if ((reel.commentsCount || 0) > 0) {
        batch.update(doc(db, 'reels', reel.id), {
          commentsCount: increment(-1),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `reels/${reel.id}/comments/${commentId}`);
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-140px)] sm:h-[640px] max-w-[420px] mx-auto rounded-3xl overflow-hidden bg-black border border-white/10 snap-start shrink-0">
      {videoError ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400">
          <Film className="w-9 h-9 opacity-60" />
          <p className="text-xs">Video unavailable</p>
        </div>
      ) : (
        <video
          ref={videoRef}
          src={mediaUrl(reel.videoURL)}
          loop
          muted={muted}
          playsInline
          onError={() => setVideoError(true)}
          onClick={(e) => {
            const vid = e.currentTarget;
            if (vid.paused) void vid.play();
            else vid.pause();
          }}
          className="w-full h-full object-cover cursor-pointer"
        />
      )}

      {/* Top Overlay: Mute & Report */}
      <div className="absolute top-4 inset-x-4 flex items-center justify-between z-10">
        <span className="text-xs font-semibold text-white bg-black/50 backdrop-blur-md px-3 py-1 rounded-lg tabular-nums">
          {formatCount(reel.viewsCount)} views
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleMute}
            className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-md text-white flex items-center justify-center"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          {!isOwner && (
            <button
              onClick={() => setShowReport(true)}
              className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-md text-white flex items-center justify-center"
              aria-label="Report reel"
            >
              <Flag className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Right Action Rail */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10 text-white">
        <button
          onClick={() => {
            if (!userPublic) return;
            triggerHaptic(liked ? 'light' : 'medium');
            void toggleLikeReel(userPublic, reel, liked);
          }}
          className="flex flex-col items-center gap-1"
          aria-label="Like reel"
        >
          <div className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center">
            <Heart className={`w-6 h-6 ${liked ? 'text-rose-500 fill-rose-500' : ''}`} />
          </div>
          <span className="text-xs font-semibold tabular-nums">{formatCount(reel.likesCount)}</span>
        </button>

        <button
          onClick={() => setShowComments(true)}
          className="flex flex-col items-center gap-1"
          aria-label="Reel comments"
        >
          <div className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center">
            <MessageCircle className="w-6 h-6" />
          </div>
          <span className="text-xs font-semibold tabular-nums">{formatCount(reel.commentsCount)}</span>
        </button>

        <button
          onClick={() => setShowShare(true)}
          className="flex flex-col items-center gap-1"
          aria-label="Share reel"
        >
          <div className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center">
            <Send className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold tabular-nums">{formatCount(reel.sharesCount)}</span>
        </button>

        <button
          onClick={() => setShowRepost(true)}
          className="flex flex-col items-center gap-1"
          aria-label="Repost reel"
        >
          <div className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center">
            <Repeat className={`w-5 h-5 ${isReposted ? 'text-emerald-400' : ''}`} />
          </div>
          <span className="text-xs font-semibold tabular-nums">{formatCount(reel.repostsCount || 0)}</span>
        </button>

        <button
          onClick={() => userPublic && void toggleSaveItem(userPublic, reel.id, 'reel', isSaved)}
          className="flex flex-col items-center gap-1"
          aria-label="Save reel"
        >
          <div className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center">
            <Bookmark className={`w-5 h-5 ${isSaved ? 'text-fuchsia-400 fill-fuchsia-400' : ''}`} />
          </div>
          <span className="text-xs font-semibold">Save</span>
        </button>
      </div>

      {/* Bottom Metadata Scrim */}
      <div className="absolute inset-x-0 bottom-0 p-4 pr-16 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-white space-y-2 z-10">
        <div className="flex items-center gap-2.5">
          <button onClick={() => onOpenProfile(reel.authorId)} className="shrink-0">
            <UserAvatar src={reel.authorPhotoURL} name={reel.authorUsername} size="sm" />
          </button>
          <button
            onClick={() => onOpenProfile(reel.authorId)}
            className="text-sm font-bold flex items-center gap-1 hover:underline truncate"
          >
            <span>@{reel.authorUsername}</span>
            <UserVerifiedBadge uid={reel.authorId} fallback={reel.authorVerified} className="w-3.5 h-3.5" />
          </button>
          {!isOwner && (
            <button
              disabled={followLoading}
              onClick={handleFollow}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                isFollowing || isPending
                  ? 'border-white/40 bg-white/15'
                  : 'mixy-gradient-bg border-transparent'
              }`}
            >
              {followLoading ? '...' : isFollowing ? 'Following' : isPending ? 'Requested' : 'Follow'}
            </button>
          )}
        </div>

        {reel.caption && <p className="text-sm leading-snug">{reel.caption}</p>}
        {reel.description && (
          <p className="text-xs text-white/75 line-clamp-2">{reel.description}</p>
        )}
        {reel.hashtags && reel.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs text-fuchsia-300 font-medium">
            {reel.hashtags.map((tag) => (
              <button key={tag} onClick={() => onOpenHashtag(tag)} className="hover:underline">
                #{tag}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-white/80">
          <Music className="w-3.5 h-3.5" />
          <span className="truncate">{reel.audioTitle || 'Original Audio'}</span>
        </div>
      </div>

      {/* Reel Comments Drawer */}
      {showComments && (
        <div className="absolute inset-x-0 bottom-0 z-30 h-[65%] rounded-t-3xl bg-[#12121D] text-white p-4 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm">Comments ({comments.length})</h4>
            <button onClick={() => setShowComments(false)} className="p-1.5 hover:bg-white/10 rounded-full">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {comments.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No comments yet.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-2 text-xs">
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowComments(false);
                        onOpenProfile(c.authorId);
                      }}
                      className="shrink-0"
                    >
                      <UserAvatar src={c.authorPhotoURL} name={c.authorUsername} size="xs" />
                    </button>
                    <div>
                      <p>
                        <button
                          type="button"
                          onClick={() => {
                            setShowComments(false);
                            onOpenProfile(c.authorId);
                          }}
                          className="font-semibold mr-1.5 hover:underline inline-flex items-center gap-1 align-baseline"
                        >
                          <span>@{c.authorUsername}</span>
                          <UserVerifiedBadge uid={c.authorId} className="w-3 h-3" />
                        </button>
                        <span className="text-slate-200">{c.text}</span>
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                        <span>{formatRelativeTime(c.createdAt)}</span>
                        <button onClick={() => setReplyTo(c)} className="font-semibold hover:text-fuchsia-400">
                          Reply
                        </button>
                      </div>
                    </div>
                  </div>
                  {(c.authorId === userPublic?.uid || isOwner) && (
                    <button
                      onClick={() => void handleDeleteComment(c.id)}
                      className="text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          {replyTo && (
            <div className="flex items-center justify-between text-xs px-3 py-1 rounded-lg bg-white/10">
              <span>Replying to @{replyTo.authorUsername}</span>
              <button onClick={() => setReplyTo(null)}>
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
              placeholder="Add a comment..."
              className="flex-1 h-10 px-3 rounded-xl bg-white/10 text-sm text-white placeholder-white/50 focus:outline-none"
            />
            <button type="submit" className="px-4 h-10 rounded-xl mixy-gradient-bg text-xs font-semibold">
              Post
            </button>
          </form>
        </div>
      )}

      {showShare && (
        <ShareModal
          itemType="reel"
          itemId={reel.id}
          previewText={reel.caption || `Reel by @${reel.authorUsername}`}
          authorUsername={reel.authorUsername}
          shareUrl={`${window.location.origin}/?reel=${reel.id}`}
          onClose={() => setShowShare(false)}
        />
      )}

      {showRepost && (
        <RepostModal
          open={showRepost}
          targetType="reel"
          targetId={reel.id}
          originalAuthorId={reel.authorId}
          originalAuthorUsername={reel.authorUsername}
          audience="public"
          alreadyReposted={isReposted}
          previewText={reel.caption || `Reel by @${reel.authorUsername}`}
          onClose={() => setShowRepost(false)}
          onOpenShare={() => setShowShare(true)}
        />
      )}

      {showReport && (
        <ReportModal targetType="reel" targetId={reel.id} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}

export function ReelsView({
  onOpenCreateReel,
  onOpenProfile,
  onOpenHashtag,
}: {
  onOpenCreateReel: () => void;
  onOpenProfile: (uid: string) => void;
  onOpenHashtag: (tag: string) => void;
}) {
  const { userPublic, followingIds, userPrivate } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'reels'), where('viewsCount', '>=', 0), limit(40));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Reel)
          .sort((a, b) => {
            const at = a.createdAt?.toDate?.().getTime() ?? 0;
            const bt = b.createdAt?.toDate?.().getTime() ?? 0;
            return bt - at;
          });
        setReels(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'reels');
      }
    );
    return () => unsub();
  }, []);

  // Personalized recommendation ranking
  const recommendedReels = useMemo(() => {
    const blocked = new Set(userPrivate?.blockedIds || []);
    return reels
      .filter((r) => !blocked.has(r.authorId))
      .sort((a, b) => {
        const aScore =
          (followingIds.has(a.authorId) ? 50 : 0) +
          a.likesCount * 3 +
          a.commentsCount * 4 +
          a.viewsCount * 0.2;
        const bScore =
          (followingIds.has(b.authorId) ? 50 : 0) +
          b.likesCount * 3 +
          b.commentsCount * 4 +
          b.viewsCount * 0.2;
        if (a.authorId === userPublic?.uid && a.createdAt && b.createdAt) {
          // keep fresh user uploads easily discoverable
          return bScore - aScore;
        }
        return bScore - aScore;
      });
  }, [reels, followingIds, userPrivate?.blockedIds, userPublic?.uid]);

  const scrollToReel = (idx: number) => {
    const clamped = Math.max(0, Math.min(idx, recommendedReels.length - 1));
    setActiveIndex(clamped);
    const el = containerRef.current?.children[clamped] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin text-fuchsia-500" />
        <span className="text-sm">Loading Reels...</span>
      </div>
    );
  }

  if (recommendedReels.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-10 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl mixy-gradient-bg text-white flex items-center justify-center">
          <Film className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold">No Reels yet</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
          Upload a short vertical video to launch MIXY Reels.
        </p>
        <button
          onClick={onOpenCreateReel}
          className="px-5 py-2.5 rounded-xl mixy-gradient-bg text-white text-sm font-semibold inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Upload Reel
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center gap-3">
      <div className="w-full max-w-[420px] flex items-center justify-between px-1">
        <h1 className="text-xl font-bold">Reels</h1>
        <button
          onClick={onOpenCreateReel}
          className="px-3.5 py-1.5 rounded-xl mixy-gradient-bg text-white text-xs font-semibold flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Create Reel
        </button>
      </div>

      <div className="relative w-full flex items-center justify-center gap-4">
        <div
          ref={containerRef}
          onScroll={(e) => {
            const box = e.currentTarget;
            const childHeight = box.clientHeight || 640;
            const idx = Math.round(box.scrollTop / childHeight);
            if (idx !== activeIndex && idx >= 0 && idx < recommendedReels.length) {
              setActiveIndex(idx);
            }
          }}
          className="w-full max-w-[420px] h-[calc(100vh-140px)] sm:h-[640px] overflow-y-scroll snap-y snap-mandatory no-scrollbar space-y-4"
        >
          {recommendedReels.map((reel, idx) => (
            <ReelCard
              key={reel.id}
              reel={reel}
              isActive={idx === activeIndex}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onOpenProfile={onOpenProfile}
              onOpenHashtag={onOpenHashtag}
            />
          ))}
        </div>

        {/* Desktop Up/Down Swipe Controls */}
        {recommendedReels.length > 1 && (
          <div className="hidden sm:flex flex-col gap-2">
            <button
              onClick={() => scrollToReel(activeIndex - 1)}
              disabled={activeIndex === 0}
              className="w-11 h-11 rounded-full border border-slate-200 dark:border-white/15 bg-white dark:bg-[#12121D] flex items-center justify-center disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-white/10"
              aria-label="Previous reel"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
            <button
              onClick={() => scrollToReel(activeIndex + 1)}
              disabled={activeIndex === recommendedReels.length - 1}
              className="w-11 h-11 rounded-full border border-slate-200 dark:border-white/15 bg-white dark:bg-[#12121D] flex items-center justify-center disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-white/10"
              aria-label="Next reel"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
