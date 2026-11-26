import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  Clock,
  Film,
  Hash,
  Heart,
  ImageOff,
  MessageCircle,
  Search,
  Sparkles,
  TrendingUp,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth, db, formatCount, handleFirestoreError, OperationType } from '../lib/firebase';
import { triggerHaptic } from '../lib/haptics';
import { mediaUrl } from '../lib/media';
import { toggleFollowUser } from '../lib/socialActions';
import type { Post, Reel, UserPublic } from '../types/mixy';
import { UserAvatar, UserVerifiedBadge, VerifiedBadge } from './MixyLogo';
import { PostCard } from './PostCard';

const RECENT_SEARCHES_KEY = 'mixy_recent_searches';

const DISCOVER_TOPICS: { id: string; label: string; keywords: string[] }[] = [
  { id: 'all', label: 'All Topics', keywords: [] },
  { id: 'music', label: 'Music', keywords: ['music', 'song', 'beat', 'rap', 'track', 'audio', 'singer'] },
  { id: 'gaming', label: 'Gaming', keywords: ['game', 'gaming', 'esports', 'stream', 'fps', 'console'] },
  { id: 'art', label: 'Art & Design', keywords: ['art', 'design', 'draw', 'paint', 'ui', 'illustration', 'photo'] },
  { id: 'fitness', label: 'Fitness', keywords: ['fitness', 'gym', 'workout', 'run', 'health', 'training'] },
  { id: 'tech', label: 'Tech & AI', keywords: ['tech', 'ai', 'code', 'dev', 'app', 'software', 'gadget'] },
  { id: 'travel', label: 'Travel', keywords: ['travel', 'trip', 'city', 'beach', 'adventure', 'explore'] },
  { id: 'fashion', label: 'Fashion', keywords: ['fashion', 'style', 'outfit', 'fit', 'wear', 'drip'] },
  { id: 'comedy', label: 'Comedy', keywords: ['comedy', 'funny', 'meme', 'joke', 'laugh'] },
  { id: 'food', label: 'Food', keywords: ['food', 'cook', 'recipe', 'dinner', 'coffee', 'cafe'] },
];

export function ExploreView({
  initialQuery = '',
  initialHashtag = '',
  onOpenProfile,
  onOpenReels,
}: {
  initialQuery?: string;
  initialHashtag?: string;
  onOpenProfile: (uid: string) => void;
  onOpenReels: () => void;
}) {
  const { userPublic, followingIds, pendingFollowIds, userPrivate } = useAuth();
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState(
    initialHashtag ? `#${initialHashtag}` : initialQuery
  );
  const [activeTab, setActiveTab] = useState<'all' | 'users' | 'posts' | 'reels' | 'hashtags'>(
    initialHashtag ? 'hashtags' : 'all'
  );
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [brokenMediaIds, setBrokenMediaIds] = useState<Record<string, boolean>>({});
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (initialHashtag) {
      setSearchText(`#${initialHashtag}`);
      setActiveTab('hashtags');
    } else if (initialQuery) {
      setSearchText(initialQuery);
    }
  }, [initialHashtag, initialQuery]);

  useEffect(() => {
    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), where('isDeactivated', '==', false), limit(60)),
      (snap) => setUsers(snap.docs.map((d) => d.data() as UserPublic)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );
    const unsubPosts = onSnapshot(
      query(
        collection(db, 'posts'),
        where('isDeleted', '==', false),
        where('isArchived', '==', false),
        where('audience', 'in', ['public', 'followers'])
      ),
      (snap) => {
        const sorted = snap.docs
          .map((d) => d.data() as Post)
          .sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0))
          .slice(0, 60);
        setPosts(sorted);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'posts')
    );
    const unsubReels = onSnapshot(
      query(
        collection(db, 'reels'),
        where('viewsCount', '>=', 0),
        limit(40)
      ),
      (snap) => {
        const sorted = snap.docs
          .map((d) => d.data() as Reel)
          .sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0));
        setReels(sorted);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reels')
    );

    return () => {
      unsubUsers();
      unsubPosts();
      unsubReels();
    };
  }, []);

  const saveRecentSearch = (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    const next = [clean, ...recentSearches.filter((x) => x !== clean)].slice(0, 8);
    setRecentSearches(next);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  };

  const blockedSet = useMemo(
    () => new Set(userPrivate?.blockedIds || []),
    [userPrivate?.blockedIds]
  );

  const preferredTopics = useMemo(() => {
    const raw = (userPrivate?.contentPreferences || '').toLowerCase();
    if (!raw || raw === 'balanced') return [] as string[];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }, [userPrivate?.contentPreferences]);

  const togglePreferredTopic = async (topicId: string) => {
    triggerHaptic('light');
    setSelectedTopic(topicId);
    if (!userPublic || topicId === 'all') return;
    const current = new Set(preferredTopics);
    if (current.has(topicId)) {
      // keep active chip filtered but let settings manage full removal if single click
    } else {
      current.add(topicId);
      const nextStr = Array.from(current).join(',').slice(0, 120);
      await setDoc(
        doc(db, 'users', userPublic.uid, 'private', 'info'),
        {
          uid: userPublic.uid,
          email: auth.currentUser?.email || userPrivate?.email || '',
          contentPreferences: nextStr || 'balanced',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {});
    }
  };

  const qLower = searchText.trim().toLowerCase().replace(/^#/, '');

  const trendingHashtags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of posts) {
      for (const h of p.hashtags || []) {
        counts.set(h, (counts.get(h) || 0) + 1);
      }
    }
    for (const r of reels) {
      for (const h of r.hashtags || []) {
        counts.set(h, (counts.get(h) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [posts, reels]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (blockedSet.has(u.uid)) return false;
      if (!qLower) return u.uid !== userPublic?.uid;
      return (
        u.usernameLower.includes(qLower) ||
        u.displayName.toLowerCase().includes(qLower) ||
        (u.bio || '').toLowerCase().includes(qLower)
      );
    });
  }, [users, blockedSet, qLower, userPublic?.uid]);

  const filteredPosts = useMemo(() => {
    const activeTopicObj = DISCOVER_TOPICS.find((t) => t.id === selectedTopic);
    const matchesKeywords = (text: string, hashtags: string[] | undefined, keywords: string[]) => {
      const hay = `${text} ${(hashtags || []).join(' ')}`.toLowerCase();
      return keywords.some((kw) => hay.includes(kw));
    };

    const interestKeywords = preferredTopics.flatMap(
      (id) => DISCOVER_TOPICS.find((t) => t.id === id)?.keywords || [id]
    );

    return posts
      .filter((p) => {
        if (blockedSet.has(p.authorId)) return false;
        if (p.audience === 'private' && p.authorId !== userPublic?.uid) return false;
        if (selectedTopic !== 'all' && activeTopicObj) {
          if (!matchesKeywords(p.caption || '', p.hashtags, activeTopicObj.keywords)) {
            return false;
          }
        }
        if (!qLower) return true;
        return (
          p.caption.toLowerCase().includes(qLower) ||
          p.authorUsername.toLowerCase().includes(qLower) ||
          (p.hashtags || []).some((h) => h.includes(qLower))
        );
      })
      .sort((a, b) => {
        const aBoost =
          interestKeywords.length > 0 && matchesKeywords(a.caption || '', a.hashtags, interestKeywords)
            ? 20
            : 0;
        const bBoost =
          interestKeywords.length > 0 && matchesKeywords(b.caption || '', b.hashtags, interestKeywords)
            ? 20
            : 0;
        return bBoost + (b.likesCount || 0) - (aBoost + (a.likesCount || 0));
      });
  }, [posts, blockedSet, qLower, userPublic?.uid, selectedTopic, preferredTopics]);

  const filteredReels = useMemo(() => {
    const activeTopicObj = DISCOVER_TOPICS.find((t) => t.id === selectedTopic);
    return reels.filter((r) => {
      if (blockedSet.has(r.authorId)) return false;
      if (selectedTopic !== 'all' && activeTopicObj) {
        const hay = `${r.caption || ''} ${(r.hashtags || []).join(' ')}`.toLowerCase();
        if (!activeTopicObj.keywords.some((kw) => hay.includes(kw))) return false;
      }
      if (!qLower) return true;
      return (
        r.caption.toLowerCase().includes(qLower) ||
        r.authorUsername.toLowerCase().includes(qLower) ||
        (r.hashtags || []).some((h) => h.includes(qLower))
      );
    });
  }, [reels, blockedSet, qLower, selectedTopic]);

  const suggestedAccounts = useMemo(
    () =>
      users
        .filter((u) => u.uid !== userPublic?.uid && !followingIds.has(u.uid) && !blockedSet.has(u.uid))
        .slice(0, 8),
    [users, userPublic?.uid, followingIds, blockedSet]
  );

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveRecentSearch(searchText);
        }}
        className="relative"
      >
        <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search users, posts, reels, or #hashtags..."
          className="w-full h-12 pl-12 pr-10 rounded-2xl bg-white dark:bg-[#10101A] border border-slate-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
        />
        {searchText && (
          <button
            type="button"
            onClick={() => setSearchText('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </form>

      {/* Recent Searches */}
      {recentSearches.length > 0 && !qLower && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Recent searches
            </span>
            <button
              onClick={() => {
                setRecentSearches([]);
                localStorage.removeItem(RECENT_SEARCHES_KEY);
              }}
              className="text-xs text-fuchsia-500 hover:underline"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((term) => (
              <button
                key={term}
                onClick={() => setSearchText(term)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-fuchsia-500"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Smart Discover Topic Chips */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-fuchsia-500" />
            Smart Discover
          </span>
          {preferredTopics.length > 0 && (
            <span className="text-[11px] text-fuchsia-500 font-medium">
              Tuned for {preferredTopics.slice(0, 3).join(', ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {DISCOVER_TOPICS.map((topic) => {
            const active = selectedTopic === topic.id;
            const saved = preferredTopics.includes(topic.id);
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => void togglePreferredTopic(topic.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border transition-colors ${
                  active
                    ? 'mixy-gradient-bg text-white border-transparent shadow-sm'
                    : saved
                      ? 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300'
                      : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] text-slate-600 dark:text-slate-300 hover:border-fuchsia-400'
                }`}
              >
                {topic.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-white/5 overflow-x-auto no-scrollbar">
        {(['all', 'users', 'posts', 'reels', 'hashtags'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-colors ${
              activeTab === tab
                ? 'bg-white dark:bg-[#1A1A28] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Trending Hashtags */}
      {(activeTab === 'all' || activeTab === 'hashtags') && trendingHashtags.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-fuchsia-500" />
            Trending Hashtags
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {trendingHashtags
              .filter(([tag]) => !qLower || tag.includes(qLower))
              .map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => {
                    setSearchText(`#${tag}`);
                    saveRecentSearch(`#${tag}`);
                  }}
                  className="p-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] text-left hover:border-fuchsia-500 transition-colors"
                >
                  <div className="text-sm font-bold flex items-center gap-1 text-fuchsia-500">
                    <Hash className="w-3.5 h-3.5" />
                    <span className="truncate">{tag}</span>
                  </div>
                  <div className="text-xs text-slate-500 tabular-nums mt-0.5">
                    {count} {count === 1 ? 'post' : 'posts'}
                  </div>
                </button>
              ))}
          </div>
        </section>
      )}

      {/* Suggested / Matching Accounts */}
      {(activeTab === 'all' || activeTab === 'users') && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-fuchsia-500" />
            {qLower ? 'Accounts' : 'Suggested Accounts'}
          </h2>
          {(qLower ? filteredUsers : suggestedAccounts).length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No matching accounts found.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {(qLower ? filteredUsers : suggestedAccounts).map((person) => {
                const isFollowing = followingIds.has(person.uid);
                const isPending = pendingFollowIds.has(person.uid);
                return (
                  <div
                    key={person.uid}
                    className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A]"
                  >
                    <button
                      onClick={() => {
                        saveRecentSearch(`@${person.username}`);
                        onOpenProfile(person.uid);
                      }}
                      className="flex items-center gap-3 min-w-0 text-left"
                    >
                      <UserAvatar src={person.photoURL} name={person.displayName} size="md" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold flex items-center gap-1 truncate">
                          <span className="truncate">{person.displayName}</span>
                          {person.isVerified && (
                            <VerifiedBadge
                              className="w-3.5 h-3.5"
                              verificationType={person.verificationType}
                            />
                          )}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          @{person.username} · {formatCount(person.followersCount)} followers
                        </p>
                      </div>
                    </button>

                    {userPublic && person.uid !== userPublic.uid && (
                      <button
                        disabled={followBusyId === person.uid}
                        onClick={async () => {
                          setFollowBusyId(person.uid);
                          try {
                            await toggleFollowUser(userPublic, person, isFollowing);
                          } finally {
                            setFollowBusyId(null);
                          }
                        }}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 ml-2 ${
                          isFollowing || isPending
                            ? 'border border-slate-200 dark:border-white/15'
                            : 'mixy-gradient-bg text-white'
                        }`}
                      >
                        {followBusyId === person.uid
                          ? '...'
                          : isFollowing
                            ? 'Following'
                            : isPending
                              ? 'Requested'
                              : 'Follow'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Recommended Reels */}
      {(activeTab === 'all' || activeTab === 'reels') && filteredReels.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Film className="w-4 h-4 text-fuchsia-500" />
              Popular Reels
            </h2>
            <button onClick={onOpenReels} className="text-xs text-fuchsia-500 font-semibold hover:underline">
              Watch all
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredReels.slice(0, activeTab === 'reels' ? 24 : 6).map((reel) => (
              <button
                key={reel.id}
                onClick={onOpenReels}
                className="group relative aspect-[9/14] rounded-2xl overflow-hidden bg-black text-left"
              >
                <video src={mediaUrl(reel.videoURL)} muted className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-2.5 inset-x-2.5 text-white">
                  <p className="text-xs font-semibold flex items-center gap-1 truncate">
                    <span className="truncate">@{reel.authorUsername}</span>
                    <UserVerifiedBadge uid={reel.authorId} fallback={reel.authorVerified} className="w-3 h-3" />
                  </p>
                  <p className="text-[11px] text-white/75 tabular-nums">
                    {formatCount(reel.viewsCount)} views · {formatCount(reel.likesCount)} likes
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Popular Posts Grid */}
      {(activeTab === 'all' || activeTab === 'posts' || activeTab === 'hashtags') && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold">
            {qLower ? `Posts matching "${searchText}"` : 'Popular Posts'}
          </h2>
          {filteredPosts.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No posts match your search yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredPosts.map((post) => {
                const thumb = post.media[0];
                const isBroken = Boolean(brokenMediaIds[post.id]);
                return (
                  <button
                    key={post.id}
                    onClick={() => setSelectedPost(post)}
                    className="group relative aspect-square rounded-2xl overflow-hidden bg-black"
                  >
                    {isBroken ? (
                      <div className="w-full h-full flex items-center justify-center text-slate-500">
                        <ImageOff className="w-6 h-6" />
                      </div>
                    ) : thumb?.type === 'video' ? (
                      <video
                        src={mediaUrl(thumb.url)}
                        muted
                        onError={() => setBrokenMediaIds((p) => ({ ...p, [post.id]: true }))}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={mediaUrl(thumb?.url)}
                        alt={post.caption || 'Explore post'}
                        onError={() => setBrokenMediaIds((p) => ({ ...p, [post.id]: true }))}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white text-xs font-bold tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Heart className="w-4 h-4 fill-white" /> {formatCount(post.likesCount)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="w-4 h-4 fill-white" /> {formatCount(post.commentsCount)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Post Preview Modal */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg relative my-auto">
            <button
              onClick={() => setSelectedPost(null)}
              className="absolute -top-11 right-0 w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25"
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
                setSearchText(`#${tag}`);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
