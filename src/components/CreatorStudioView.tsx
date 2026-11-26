import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BarChart3,
  Bookmark,
  Calendar,
  Eye,
  Film,
  Heart,
  History,
  Loader2,
  MessageSquare,
  Repeat2,
  Share2,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db, formatCount, formatRelativeTime } from '../lib/firebase';
import { mediaUrl } from '../lib/media';
import type { Post, Reel, RepostItem, Story } from '../types/mixy';

export function CreatorStudioView({
  onOpenCreate,
  onOpenProfile,
}: {
  onOpenCreate: (tab: 'post' | 'reel' | 'story') => void;
  onOpenProfile: (uid: string) => void;
}) {
  const { userPublic } = useAuth();
  const [tab, setTab] = useState<'analytics' | 'posts' | 'reels' | 'memory'>('analytics');
  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [repostsReceived, setRepostsReceived] = useState<RepostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState('');

  useEffect(() => {
    if (!userPublic) return;
    setLoading(true);
    let pending = 4;
    const done = () => {
      pending = Math.max(0, pending - 1);
      if (pending === 0) setLoading(false);
    };

    const unsubPosts = onSnapshot(
      query(collection(db, 'posts'), where('authorId', '==', userPublic.uid)),
      (snap) => {
        setPosts(
          snap.docs
            .map((d) => d.data() as Post)
            .filter((p) => !p.isDeleted)
            .sort(
              (a, b) =>
                (b.createdAt?.toDate?.().getTime() || 0) -
                (a.createdAt?.toDate?.().getTime() || 0)
            )
        );
        done();
      },
      done
    );

    const unsubReels = onSnapshot(
      query(collection(db, 'reels'), where('authorId', '==', userPublic.uid)),
      (snap) => {
        setReels(
          snap.docs
            .map((d) => d.data() as Reel)
            .sort(
              (a, b) =>
                (b.createdAt?.toDate?.().getTime() || 0) -
                (a.createdAt?.toDate?.().getTime() || 0)
            )
        );
        done();
      },
      done
    );

    const unsubStories = onSnapshot(
      query(collection(db, 'stories'), where('authorId', '==', userPublic.uid)),
      (snap) => {
        setStories(
          snap.docs
            .map((d) => d.data() as Story)
            .sort(
              (a, b) =>
                (b.createdAt?.toDate?.().getTime() || 0) -
                (a.createdAt?.toDate?.().getTime() || 0)
            )
        );
        done();
      },
      done
    );

    const unsubReposts = onSnapshot(
      query(collection(db, 'reposts'), where('originalAuthorId', '==', userPublic.uid)),
      (snap) => {
        setRepostsReceived(snap.docs.map((d) => d.data() as RepostItem));
        done();
      },
      done
    );

    return () => {
      unsubPosts();
      unsubReels();
      unsubStories();
      unsubReposts();
    };
  }, [userPublic]);

  const metrics = useMemo(() => {
    const totalLikes =
      posts.reduce((s, p) => s + (p.likesCount || 0), 0) +
      reels.reduce((s, r) => s + (r.likesCount || 0), 0);
    const totalComments =
      posts.reduce((s, p) => s + (p.commentsCount || 0), 0) +
      reels.reduce((s, r) => s + (r.commentsCount || 0), 0);
    const totalShares =
      posts.reduce((s, p) => s + (p.sharesCount || 0), 0) +
      reels.reduce((s, r) => s + (r.sharesCount || 0), 0);
    const totalSaves =
      posts.reduce((s, p) => s + (p.savesCount || 0), 0) +
      reels.reduce((s, r) => s + (r.savesCount || 0), 0);
    const totalReposts =
      posts.reduce((s, p) => s + (p.repostsCount || 0), 0) +
      reels.reduce((s, r) => s + (r.repostsCount || 0), 0);
    const totalViews =
      reels.reduce((s, r) => s + (r.viewsCount || 0), 0) +
      stories.reduce((s, st) => s + (st.viewsCount || 0), 0);
    const interactions = totalLikes + totalComments + totalShares + totalSaves + totalReposts;
    const reachDenominator = Math.max(
      1,
      totalViews + (userPublic?.followersCount || 0) * Math.max(1, posts.length)
    );
    const engagementRate = Math.min(100, (interactions / reachDenominator) * 100);

    const topPosts = [...posts].sort(
      (a, b) =>
        b.likesCount + b.commentsCount + b.sharesCount + b.savesCount -
        (a.likesCount + a.commentsCount + a.sharesCount + a.savesCount)
    );
    const topReels = [...reels].sort((a, b) => b.viewsCount + b.likesCount - (a.viewsCount + a.likesCount));

    return {
      totalLikes,
      totalComments,
      totalShares,
      totalSaves,
      totalReposts: Math.max(totalReposts, repostsReceived.length),
      totalViews,
      interactions,
      engagementRate: Number.isFinite(engagementRate) ? engagementRate.toFixed(1) : '0.0',
      topPosts,
      topReels,
    };
  }, [posts, reels, stories, repostsReceived.length, userPublic?.followersCount]);

  // Memory Lane timeline grouped by Month Year
  const memoryGroups = useMemo(() => {
    type MemEntry = {
      id: string;
      kind: 'post' | 'reel' | 'story';
      dateMs: number;
      label: string;
      thumb?: string;
      caption: string;
      isArchived?: boolean;
    };
    const all: MemEntry[] = [];
    for (const p of posts) {
      const ms = p.createdAt?.toDate?.().getTime() || Date.now();
      const d = new Date(ms);
      all.push({
        id: p.id,
        kind: 'post',
        dateMs: ms,
        label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        thumb: p.media[0]?.url,
        caption: p.caption || 'Photo post',
        isArchived: p.isArchived,
      });
    }
    for (const r of reels) {
      const ms = r.createdAt?.toDate?.().getTime() || Date.now();
      const d = new Date(ms);
      all.push({
        id: r.id,
        kind: 'reel',
        dateMs: ms,
        label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        caption: r.caption || 'Reel',
      });
    }
    for (const s of stories) {
      const ms = s.createdAt?.toDate?.().getTime() || Date.now();
      const d = new Date(ms);
      all.push({
        id: s.id,
        kind: 'story',
        dateMs: ms,
        label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        thumb: s.mediaType === 'image' ? s.mediaURL : undefined,
        caption: s.caption || s.textOverlay || 'Story snapshot',
        isArchived: s.isArchived,
      });
    }
    all.sort((a, b) => b.dateMs - a.dateMs);
    const grouped = new Map<string, MemEntry[]>();
    for (const item of all) {
      const list = grouped.get(item.label) || [];
      list.push(item);
      grouped.set(item.label, list);
    }
    return Array.from(grouped.entries());
  }, [posts, reels, stories]);

  if (!userPublic) return null;

  const handleSaveCaption = async (postId: string) => {
    await updateDoc(doc(db, 'posts', postId), {
      caption: editCaption.trim(),
      updatedAt: serverTimestamp(),
    });
    setEditingPostId(null);
  };

  const handleToggleArchivePost = async (p: Post) => {
    await updateDoc(doc(db, 'posts', p.id), {
      isArchived: !p.isArchived,
      updatedAt: serverTimestamp(),
    });
  };

  const handleDeletePost = async (p: Post) => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'posts', p.id), {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', userPublic.uid), {
      postsCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  };

  const handleDeleteReel = async (reelId: string) => {
    await deleteDoc(doc(db, 'reels', reelId));
  };

  return (
    <div className="space-y-5">
      {/* Studio Header */}
      <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-5 mixy-card-shadow flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl mixy-gradient-bg text-white flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              MIXY Creator Studio
            </h1>
            <p className="text-xs text-slate-500">
              Live performance metrics, content manager & Memory Lane archive
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenProfile(userPublic.uid)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-white/5"
          >
            View Profile
          </button>
          <button
            type="button"
            onClick={() => onOpenCreate('post')}
            className="px-4 py-2 rounded-xl mixy-gradient-bg text-white text-xs font-semibold"
          >
            New Creation
          </button>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white dark:bg-[#10101A] border border-slate-200 dark:border-white/10 overflow-x-auto no-scrollbar mixy-card-shadow">
        {(
          [
            { id: 'analytics', label: 'Analytics', icon: <TrendingUp className="w-4 h-4" /> },
            { id: 'posts', label: `Posts (${posts.length})`, icon: <Sparkles className="w-4 h-4" /> },
            { id: 'reels', label: `Reels (${reels.length})`, icon: <Film className="w-4 h-4" /> },
            { id: 'memory', label: 'Memory Lane', icon: <History className="w-4 h-4" /> },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`flex-1 min-w-[110px] py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
              tab === item.id
                ? 'mixy-gradient-bg text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-fuchsia-500" />
        </div>
      ) : tab === 'analytics' ? (
        <div className="space-y-5">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              {
                label: 'Followers',
                val: formatCount(userPublic.followersCount),
                icon: <Users className="w-4 h-4 text-fuchsia-500" />,
              },
              {
                label: 'Views & Plays',
                val: formatCount(metrics.totalViews),
                icon: <Eye className="w-4 h-4 text-sky-500" />,
              },
              {
                label: 'Engagement Rate',
                val: `${metrics.engagementRate}%`,
                icon: <TrendingUp className="w-4 h-4 text-emerald-500" />,
              },
              {
                label: 'Total Likes',
                val: formatCount(metrics.totalLikes),
                icon: <Heart className="w-4 h-4 text-rose-500" />,
              },
              {
                label: 'Comments & Shares',
                val: formatCount(metrics.totalComments + metrics.totalShares),
                icon: <MessageSquare className="w-4 h-4 text-amber-500" />,
              },
              {
                label: 'Saves & Reposts',
                val: formatCount(metrics.totalSaves + metrics.totalReposts),
                icon: <Repeat2 className="w-4 h-4 text-violet-500" />,
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-4 mixy-card-shadow"
              >
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                  <span>{kpi.label}</span>
                  {kpi.icon}
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {kpi.val}
                </p>
              </div>
            ))}
          </div>

          {/* Top Performing Content */}
          <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-5 space-y-4 mixy-card-shadow">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Top Performing Content
            </h2>
            {metrics.topPosts.length === 0 && metrics.topReels.length === 0 ? (
              <p className="text-xs text-slate-500">
                Publish posts or reels to track performance here.
              </p>
            ) : (
              <div className="space-y-2.5">
                {metrics.topPosts.slice(0, 4).map((p, idx) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-bold text-slate-400 tabular-nums w-5">
                        0{idx + 1}
                      </span>
                      {p.media[0]?.url ? (
                        <img
                          src={mediaUrl(p.media[0].url)}
                          alt=""
                          className="w-11 h-11 rounded-xl object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-fuchsia-500/15 flex items-center justify-center shrink-0">
                          <Sparkles className="w-4 h-4 text-fuchsia-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate text-slate-900 dark:text-white">
                          {p.caption || 'Photo post'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Post · {formatRelativeTime(p.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3.5 h-3.5 text-rose-500" /> {p.likesCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Bookmark className="w-3.5 h-3.5 text-amber-500" /> {p.savesCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Share2 className="w-3.5 h-3.5 text-sky-500" /> {p.sharesCount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : tab === 'posts' ? (
        <div className="space-y-3">
          {posts.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-10 text-center text-xs text-slate-500">
              You haven't created any posts yet.
            </div>
          ) : (
            posts.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mixy-card-shadow"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {p.media[0]?.url ? (
                    <img
                      src={mediaUrl(p.media[0].url)}
                      alt=""
                      className="w-14 h-14 rounded-xl object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-white/5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    {editingPostId === p.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editCaption}
                          onChange={(e) => setEditCaption(e.target.value)}
                          className="flex-1 h-9 px-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveCaption(p.id)}
                          className="px-3 h-9 rounded-xl mixy-gradient-bg text-white text-xs font-semibold"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {p.caption || 'Untitled post'}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      {p.audience} · {p.isArchived ? 'Archived · ' : ''}
                      {p.likesCount} likes · {p.commentsCount} comments · {p.repostsCount || 0} reposts
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPostId(p.id);
                      setEditCaption(p.caption || '');
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleArchivePost(p)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    {p.isArchived ? 'Unarchive' : 'Archive'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeletePost(p)}
                    className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10"
                    title="Delete post"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === 'reels' ? (
        <div className="space-y-3">
          {reels.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-10 text-center text-xs text-slate-500">
              You haven't uploaded any Reels yet.
            </div>
          ) : (
            reels.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-4 flex items-center justify-between gap-4 mixy-card-shadow"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <video
                    src={mediaUrl(r.videoURL)}
                    muted
                    className="w-12 h-16 rounded-xl object-cover bg-black shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{r.caption || 'MIXY Reel'}</p>
                    <p className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                      {r.viewsCount} views · {r.likesCount} likes · {r.commentsCount} comments · {r.repostsCount || 0} reposts
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteReel(r.id)}
                  className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 shrink-0"
                  title="Delete reel"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        /* MIXY Memory Lane */
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-5 mixy-card-shadow">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-fuchsia-500" />
              <h2 className="text-sm font-bold">MIXY Memory Lane · Chronological Archive</h2>
            </div>
            {memoryGroups.length === 0 ? (
              <p className="text-xs text-slate-500">
                Your posts, reels, and archived stories will appear here as your MIXY timeline grows.
              </p>
            ) : (
              <div className="space-y-6">
                {memoryGroups.map(([monthLabel, items]) => (
                  <div key={monthLabel} className="space-y-2.5">
                    <h3 className="text-xs font-bold text-fuchsia-600 dark:text-fuchsia-400">
                      {monthLabel} ({items.length})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {items.map((item) => (
                        <div
                          key={`${item.kind}-${item.id}`}
                          className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50 dark:bg-white/[0.03]"
                        >
                          {item.thumb ? (
                            <img
                              src={mediaUrl(item.thumb)}
                              alt=""
                              className="w-full h-24 object-cover"
                            />
                          ) : (
                            <div className="w-full h-24 flex items-center justify-center bg-gradient-to-br from-fuchsia-500/10 to-indigo-500/10 text-xs font-semibold uppercase text-slate-500">
                              {item.kind}
                            </div>
                          )}
                          <div className="p-2">
                            <p className="text-[11px] font-medium truncate">{item.caption}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 capitalize">
                              {item.kind} {item.isArchived ? '· Archived' : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
