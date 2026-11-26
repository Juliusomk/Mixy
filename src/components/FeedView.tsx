import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { Film, RefreshCw, Repeat, Search, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, formatRelativeTime, handleFirestoreError, OperationType } from '../lib/firebase';
import { triggerHaptic } from '../lib/haptics';
import { mediaUrl } from '../lib/media';
import type { Post, Reel, RepostItem } from '../types/mixy';
import { PostCard } from './PostCard';
import { StoriesBar } from './StoriesBar';
import { MomentsStrip } from './MomentsStrip';
import { UserVerifiedBadge } from './MixyLogo';

export function FeedView({
  onOpenCreatePost,
  onOpenCreateStory,
  onOpenExploreSearch,
  onOpenProfile,
  onOpenHashtag,
}: {
  onOpenCreatePost: () => void;
  onOpenCreateStory: () => void;
  onOpenExploreSearch: (initialQuery?: string) => void;
  onOpenProfile: (uid: string) => void;
  onOpenHashtag: (tag: string) => void;
}) {
  const { userPublic, userPrivate, followingIds } = useAuth();
  const [communityPosts, setCommunityPosts] = useState<Post[]>([]);
  const [ownPosts, setOwnPosts] = useState<Post[]>([]);
  const [cfPosts, setCfPosts] = useState<Post[]>([]);
  const [reposts, setReposts] = useState<RepostItem[]>([]);
  const [extraPostsById, setExtraPostsById] = useState<Record<string, Post>>({});
  const [extraReelsById, setExtraReelsById] = useState<Record<string, Reel>>({});
  const [loading, setLoading] = useState(true);
  const [feedMode, setFeedMode] = useState<'following' | 'all'>('all');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [quickSearch, setQuickSearch] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(15);

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'posts'),
      where('isDeleted', '==', false),
      where('isArchived', '==', false),
      where('audience', 'in', ['public', 'followers'])
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setCommunityPosts(snap.docs.map((d) => d.data() as Post));
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'posts');
      }
    );
    return () => unsub();
  }, [refreshNonce]);

  useEffect(() => {
    if (!userPublic?.uid) {
      setOwnPosts([]);
      return;
    }
    const ownQ = query(
      collection(db, 'posts'),
      where('authorId', '==', userPublic.uid),
      where('isDeleted', '==', false),
      where('isArchived', '==', false)
    );
    const unsubOwn = onSnapshot(
      ownQ,
      (snap) => {
        setOwnPosts(snap.docs.map((d) => d.data() as Post));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'posts')
    );
    return () => unsubOwn();
  }, [userPublic?.uid, refreshNonce]);

  useEffect(() => {
    if (!userPublic?.uid) {
      setCfPosts([]);
      return;
    }
    const cfQ = query(
      collection(db, 'posts'),
      where('isDeleted', '==', false),
      where('isArchived', '==', false),
      where('audience', '==', 'close_friends'),
      where('closeFriendIds', 'array-contains', userPublic.uid)
    );
    const unsub = onSnapshot(
      cfQ,
      (snap) => {
        setCfPosts(snap.docs.map((d) => d.data() as Post));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'posts')
    );
    return () => unsub();
  }, [userPublic?.uid, refreshNonce]);

  useEffect(() => {
    if (!userPublic?.uid) {
      setReposts([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'reposts'), where('userId', '>', ''), limit(40)),
      async (snap) => {
        const list = snap.docs
          .map((d) => d.data() as RepostItem)
          .sort((a, b) => {
            const at = a.createdAt?.toDate?.().getTime() ?? Date.now();
            const bt = b.createdAt?.toDate?.().getTime() ?? Date.now();
            return bt - at;
          })
          .slice(0, 25);
        setReposts(list);

        const missingPostIds = Array.from(
          new Set(list.filter((r) => r.targetType === 'post').map((r) => r.targetId))
        );
        const missingReelIds = Array.from(
          new Set(list.filter((r) => r.targetType === 'reel').map((r) => r.targetId))
        );

        const [fetchedPosts, fetchedReels] = await Promise.all([
          Promise.all(
            missingPostIds.map(async (pid) => {
              const s = await getDoc(doc(db, 'posts', pid)).catch(() => null);
              return s && s.exists() ? (s.data() as Post) : null;
            })
          ),
          Promise.all(
            missingReelIds.map(async (rid) => {
              const s = await getDoc(doc(db, 'reels', rid)).catch(() => null);
              return s && s.exists() ? (s.data() as Reel) : null;
            })
          ),
        ]);

        const postMap: Record<string, Post> = {};
        for (const p of fetchedPosts) {
          if (p && !p.isDeleted && !p.isArchived) postMap[p.id] = p;
        }
        const reelMap: Record<string, Reel> = {};
        for (const r of fetchedReels) {
          if (r) reelMap[r.id] = r;
        }
        setExtraPostsById(postMap);
        setExtraReelsById(reelMap);
      },
      () => {}
    );
    return () => unsub();
  }, [userPublic?.uid, refreshNonce]);

  const postsById = useMemo(() => {
    const map = new Map<string, Post>();
    for (const p of communityPosts) map.set(p.id, p);
    for (const p of ownPosts) map.set(p.id, p);
    for (const p of cfPosts) map.set(p.id, p);
    return map;
  }, [communityPosts, ownPosts, cfPosts]);

  const posts = useMemo(() => {
    return Array.from(postsById.values())
      .sort((a, b) => {
        const at = a.createdAt?.toDate?.().getTime() ?? Date.now();
        const bt = b.createdAt?.toDate?.().getTime() ?? Date.now();
        return bt - at;
      })
      .slice(0, 120);
  }, [postsById]);

  const blockedSet = useMemo(
    () => new Set(userPrivate?.blockedIds || []),
    [userPrivate?.blockedIds]
  );
  const mutedSet = useMemo(
    () => new Set(userPrivate?.mutedIds || []),
    [userPrivate?.mutedIds]
  );
  const hiddenWords = useMemo(
    () => (userPrivate?.hiddenWords || []).map((w) => w.toLowerCase()),
    [userPrivate?.hiddenWords]
  );

  const visiblePosts = useMemo(() => {
    return posts.filter((p) => {
      if (blockedSet.has(p.authorId) || mutedSet.has(p.authorId)) return false;
      if (p.audience === 'private' && p.authorId !== userPublic?.uid) return false;
      if (p.audience === 'followers' && p.authorId !== userPublic?.uid && !followingIds.has(p.authorId)) {
        return false;
      }
      if (p.audience === 'close_friends') {
        const isOwner = p.authorId === userPublic?.uid;
        const isCF = (p.closeFriendIds || []).includes(userPublic?.uid || '');
        if (!isOwner && !isCF) return false;
      }
      if (hiddenWords.length > 0 && hiddenWords.some((w) => p.caption.toLowerCase().includes(w))) {
        return false;
      }
      if (feedMode === 'following') {
        return p.authorId === userPublic?.uid || followingIds.has(p.authorId);
      }
      return true;
    });
  }, [posts, blockedSet, mutedSet, hiddenWords, feedMode, followingIds, userPublic?.uid]);

  type TimelineEntry =
    | { kind: 'post'; key: string; sortTs: number; post: Post }
    | {
        kind: 'repost';
        key: string;
        sortTs: number;
        repost: RepostItem;
        post?: Post;
        reel?: Reel;
      };

  const timelineItems = useMemo<TimelineEntry[]>(() => {
    const items: TimelineEntry[] = visiblePosts.map((post) => ({
      kind: 'post',
      key: `post_${post.id}`,
      sortTs: post.createdAt?.toDate?.().getTime() ?? Date.now(),
      post,
    }));

    for (const rp of reposts) {
      if (blockedSet.has(rp.userId) || mutedSet.has(rp.userId)) continue;
      if (blockedSet.has(rp.originalAuthorId) || mutedSet.has(rp.originalAuthorId)) continue;
      if (feedMode === 'following' && rp.userId !== userPublic?.uid && !followingIds.has(rp.userId)) {
        continue;
      }
      if (rp.targetType === 'post') {
        const p = postsById.get(rp.targetId) || extraPostsById[rp.targetId];
        if (!p || p.audience !== 'public' || p.isDeleted || p.isArchived) continue;
        if (hiddenWords.length > 0 && hiddenWords.some((w) => p.caption.toLowerCase().includes(w))) {
          continue;
        }
        items.push({
          kind: 'repost',
          key: `rp_${rp.id}`,
          sortTs: rp.createdAt?.toDate?.().getTime() ?? Date.now(),
          repost: rp,
          post: p,
        });
      } else {
        const r = extraReelsById[rp.targetId];
        if (!r) continue;
        items.push({
          kind: 'repost',
          key: `rp_${rp.id}`,
          sortTs: rp.createdAt?.toDate?.().getTime() ?? Date.now(),
          repost: rp,
          reel: r,
        });
      }
    }

    return items.sort((a, b) => b.sortTs - a.sortTs);
  }, [
    visiblePosts,
    reposts,
    blockedSet,
    mutedSet,
    feedMode,
    userPublic?.uid,
    followingIds,
    postsById,
    extraPostsById,
    extraReelsById,
    hiddenWords,
  ]);

  return (
    <div className="space-y-5">
      {/* Feed Toolbar: Search + Feed Mode + Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-white/5">
          <button
            onClick={() => {
              triggerHaptic('light');
              setFeedMode('all');
              setVisibleLimit(15);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              feedMode === 'all'
                ? 'bg-white dark:bg-[#1A1A28] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            For You
          </button>
          <button
            onClick={() => {
              triggerHaptic('light');
              setFeedMode('following');
              setVisibleLimit(15);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              feedMode === 'following'
                ? 'bg-white dark:bg-[#1A1A28] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Following
          </button>
        </div>

        <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onOpenExploreSearch(quickSearch);
            }}
            className="relative flex-1 sm:w-52"
          >
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder="Search MIXY..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-200/70 dark:bg-white/5 border border-transparent focus:border-fuchsia-500 text-xs focus:outline-none"
            />
          </form>

          <button
            onClick={() => setRefreshNonce((n) => n + 1)}
            title="Refresh feed"
            aria-label="Refresh feed"
            className="w-9 h-9 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-fuchsia-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stories Strip */}
      <StoriesBar
        onOpenCreateStory={onOpenCreateStory}
        onOpenProfile={onOpenProfile}
      />

      {/* 24h Moments Strip */}
      <MomentsStrip onOpenProfile={onOpenProfile} />

      {/* Feed Content */}
      {loading && posts.length === 0 ? (
        <div className="space-y-5" aria-label="Loading feed">
          {[0, 1].map((idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] overflow-hidden mixy-skeleton"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-white/10" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3 w-28 rounded-md bg-slate-200 dark:bg-white/10" />
                  <div className="h-2.5 w-20 rounded-md bg-slate-200 dark:bg-white/10" />
                </div>
              </div>
              <div className="aspect-[4/3] w-full bg-slate-200 dark:bg-white/5" />
              <div className="p-4 space-y-2">
                <div className="h-3 w-3/4 rounded-md bg-slate-200 dark:bg-white/10" />
                <div className="h-3 w-1/2 rounded-md bg-slate-200 dark:bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      ) : timelineItems.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-10 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl mixy-gradient-bg text-white flex items-center justify-center">
            <Sparkles className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold">
              {feedMode === 'following' ? 'Your Following feed is quiet' : 'Be the first to share on MIXY'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {feedMode === 'following'
                ? 'Follow creators in Explore or switch to For You to discover posts.'
                : 'Upload your first photo or video post to kick off the community feed.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onOpenCreatePost}
              className="px-5 py-2.5 rounded-xl mixy-gradient-bg text-white text-sm font-semibold"
            >
              Create First Post
            </button>
            <button
              onClick={() => onOpenExploreSearch()}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-white/15 text-sm font-semibold"
            >
              Discover Creators
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {timelineItems.slice(0, visibleLimit).map((item) => {
            if (item.kind === 'post') {
              return (
                <PostCard
                  key={item.key}
                  post={item.post}
                  onOpenProfile={onOpenProfile}
                  onOpenHashtag={onOpenHashtag}
                />
              );
            }
            const { repost, post, reel } = item;
            return (
              <div key={item.key} className="space-y-2">
                <div className="px-3 py-2 rounded-2xl bg-slate-100/80 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <Repeat className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <button
                      onClick={() => onOpenProfile(repost.userId)}
                      className="font-bold inline-flex items-center gap-1 hover:underline"
                    >
                      <span>@{repost.username}</span>
                      <UserVerifiedBadge uid={repost.userId} className="w-3.5 h-3.5" />
                    </button>
                    <span>reposted</span>
                    <span className="text-slate-400">· {formatRelativeTime(repost.createdAt)}</span>
                  </div>
                  {repost.caption && (
                    <p className="w-full text-xs text-slate-700 dark:text-slate-200 italic pl-5">
                      "{repost.caption}"
                    </p>
                  )}
                </div>

                {post ? (
                  <PostCard
                    post={post}
                    onOpenProfile={onOpenProfile}
                    onOpenHashtag={onOpenHashtag}
                  />
                ) : reel ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] overflow-hidden p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <button
                        onClick={() => onOpenProfile(reel.authorId)}
                        className="font-semibold flex items-center gap-1.5 hover:underline"
                      >
                        <Film className="w-4 h-4 text-fuchsia-500" />
                        <span>@{reel.authorUsername}</span>
                        <UserVerifiedBadge uid={reel.authorId} fallback={reel.authorVerified} className="w-3.5 h-3.5" />
                        <span>· Reel</span>
                      </button>
                    </div>
                    <video
                      src={mediaUrl(reel.videoURL)}
                      controls
                      playsInline
                      className="w-full max-h-96 rounded-xl bg-black object-contain"
                    />
                    {reel.caption && (
                      <p className="text-sm text-slate-700 dark:text-slate-200">{reel.caption}</p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}

          {timelineItems.length > visibleLimit && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setVisibleLimit((v) => v + 15);
                }}
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#10101A] text-xs font-semibold hover:border-fuchsia-500 transition-colors"
              >
                Load more ({timelineItems.length - visibleLimit} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
