import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  Music,
  Plus,
  Send,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  db,
  formatRelativeTime,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { mediaUrl } from '../lib/media';
import { getOrCreateDirectConversation, sendConversationMessage } from '../lib/socialActions';
import type { Conversation, Story, StoryViewer, UserPublic } from '../types/mixy';
import { UserAvatar, UserVerifiedBadge } from './MixyLogo';
import { ShareModal } from './ShareModal';

const STORY_REACTIONS = ['❤️', '🔥', '😂', '😮', '👏', '💯'];

export function StoriesBar({
  onOpenCreateStory,
  onOpenProfile,
  fullPage = false,
}: {
  onOpenCreateStory: () => void;
  onOpenProfile: (uid: string) => void;
  fullPage?: boolean;
}) {
  const { userPublic, followingIds, sendActivityNotification } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [activeAuthorIndex, setActiveAuthorIndex] = useState<number | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewers, setViewers] = useState<StoryViewer[]>([]);
  const [showViewers, setShowViewers] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySent, setReplySent] = useState(false);
  const [shareStoryTarget, setShareStoryTarget] = useState<Story | null>(null);

  useEffect(() => {
    const publicStoriesMap = new Map<string, Story>();
    const ownStoriesMap = new Map<string, Story>();
    const cfStoriesMap = new Map<string, Story>();

    const syncMerged = () => {
      const now = Date.now();
      const merged = new Map<string, Story>();
      for (const s of [...publicStoriesMap.values(), ...cfStoriesMap.values(), ...ownStoriesMap.values()]) {
        const expMs = s.expiresAt?.toDate ? s.expiresAt.toDate().getTime() : 0;
        if (expMs <= now || s.isArchived) continue;
        if (s.authorId === userPublic?.uid) {
          merged.set(s.id, s);
          continue;
        }
        if (s.visibility === 'public' || s.visibility === 'close_friends' || followingIds.has(s.authorId)) {
          merged.set(s.id, s);
        }
      }
      const active = Array.from(merged.values()).sort((a, b) => {
        const at = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bt = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bt - at;
      });
      setStories(active);
    };

    const unsubPub = onSnapshot(
      query(
        collection(db, 'stories'),
        where('isArchived', '==', false),
        where('visibility', 'in', ['public', 'followers'])
      ),
      (snap) => {
        publicStoriesMap.clear();
        snap.docs.forEach((d) => {
          const s = d.data() as Story;
          publicStoriesMap.set(s.id, s);
        });
        syncMerged();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'stories')
    );

    const unsubOwn = userPublic?.uid
      ? onSnapshot(
          query(collection(db, 'stories'), where('authorId', '==', userPublic.uid)),
          (snap) => {
            ownStoriesMap.clear();
            snap.docs.forEach((d) => {
              const s = d.data() as Story;
              ownStoriesMap.set(s.id, s);
            });
            syncMerged();
          },
          () => {}
        )
      : () => {};

    const unsubCf = userPublic?.uid
      ? onSnapshot(
          query(
            collection(db, 'stories'),
            where('isArchived', '==', false),
            where('visibility', '==', 'close_friends'),
            where('closeFriendIds', 'array-contains', userPublic.uid)
          ),
          (snap) => {
            cfStoriesMap.clear();
            snap.docs.forEach((d) => {
              const s = d.data() as Story;
              cfStoriesMap.set(s.id, s);
            });
            syncMerged();
          },
          () => {}
        )
      : () => {};

    return () => {
      unsubPub();
      unsubOwn();
      unsubCf();
    };
  }, [userPublic?.uid, followingIds]);

  const groupedAuthors = useMemo(() => {
    const map = new Map<string, Story[]>();
    for (const st of stories) {
      const list = map.get(st.authorId) || [];
      list.push(st);
      map.set(st.authorId, list);
    }
    const entries = Array.from(map.entries()).map(([authorId, items]) => ({
      authorId,
      authorUsername: items[0].authorUsername,
      authorPhotoURL: items[0].authorPhotoURL,
      authorVerified: items[0].authorVerified,
      items: items.reverse(),
    }));
    // Put current user's story first if present
    entries.sort((a, b) => {
      if (a.authorId === userPublic?.uid) return -1;
      if (b.authorId === userPublic?.uid) return 1;
      return 0;
    });
    return entries;
  }, [stories, userPublic?.uid]);

  const activeGroup = activeAuthorIndex !== null ? groupedAuthors[activeAuthorIndex] : null;
  const activeStory = activeGroup ? activeGroup.items[activeStoryIndex] : null;

  // Record story view + load viewers if owner
  useEffect(() => {
    if (!activeStory || !userPublic) return;
    setProgress(0);
    setReplySent(false);
    const viewerRef = doc(db, 'stories', activeStory.id, 'viewers', userPublic.uid);
    void (async () => {
      try {
        const existing = await getDoc(viewerRef);
        if (!existing.exists()) {
          const batch = writeBatch(db);
          batch.set(viewerRef, {
            viewerId: userPublic.uid,
            storyAuthorId: activeStory.authorId,
            username: userPublic.username,
            photoURL: userPublic.photoURL || '',
            viewedAt: serverTimestamp(),
          });
          batch.update(doc(db, 'stories', activeStory.id), {
            viewsCount: increment(1),
          });
          await batch.commit();
        }
      } catch {
        // ignore concurrent view race
      }
    })();

    if (activeStory.authorId === userPublic.uid) {
      const unsubViewers = onSnapshot(
        query(collection(db, 'stories', activeStory.id, 'viewers'), where('storyAuthorId', '==', userPublic.uid)),
        (snap) => {
          setViewers(snap.docs.map((d) => d.data() as StoryViewer));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `stories/${activeStory.id}/viewers`)
      );
      return () => unsubViewers();
    } else {
      setViewers([]);
    }
  }, [activeStory?.id, userPublic]);

  // Story timer progression
  useEffect(() => {
    if (!activeStory || paused || showViewers) return;
    const interval = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          handleNextStory();
          return 0;
        }
        return prev + 2;
      });
    }, 100);
    return () => clearInterval(interval);
  });

  const handleNextStory = () => {
    if (!activeGroup || activeAuthorIndex === null) return;
    if (activeStoryIndex + 1 < activeGroup.items.length) {
      setActiveStoryIndex(activeStoryIndex + 1);
      setProgress(0);
    } else if (activeAuthorIndex + 1 < groupedAuthors.length) {
      setActiveAuthorIndex(activeAuthorIndex + 1);
      setActiveStoryIndex(0);
      setProgress(0);
    } else {
      setActiveAuthorIndex(null);
      setShowViewers(false);
    }
  };

  const handlePrevStory = () => {
    if (!activeGroup || activeAuthorIndex === null) return;
    if (activeStoryIndex > 0) {
      setActiveStoryIndex(activeStoryIndex - 1);
      setProgress(0);
    } else if (activeAuthorIndex > 0) {
      const prevGroup = groupedAuthors[activeAuthorIndex - 1];
      setActiveAuthorIndex(activeAuthorIndex - 1);
      setActiveStoryIndex(prevGroup.items.length - 1);
      setProgress(0);
    }
  };

  const handleReactStory = async (emoji: string) => {
    if (!activeStory || !userPublic) return;
    const viewerRef = doc(db, 'stories', activeStory.id, 'viewers', userPublic.uid);
    try {
      await setDoc(
        viewerRef,
        {
          viewerId: userPublic.uid,
          storyAuthorId: activeStory.authorId,
          username: userPublic.username,
          photoURL: userPublic.photoURL || '',
          reaction: emoji,
          viewedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await sendActivityNotification({
        recipientId: activeStory.authorId,
        type: 'story_reaction',
        targetId: activeStory.id,
        text: `@${userPublic.username} reacted ${emoji} to your story.`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `stories/${activeStory.id}/viewers`);
    }
  };

  const handleReplyStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStory || !userPublic || !replyText.trim()) return;
    try {
      const authorSnap = await getDoc(doc(db, 'users', activeStory.authorId));
      if (!authorSnap.exists()) return;
      const targetUser = authorSnap.data() as UserPublic;
      const convId = await getOrCreateDirectConversation(
        userPublic,
        targetUser,
        followingIds.has(targetUser.uid)
      );
      const convSnap = await getDoc(doc(db, 'conversations', convId));
      if (convSnap.exists()) {
        await sendConversationMessage({
          currentUser: userPublic,
          conversation: convSnap.data() as Conversation,
          type: 'story_reply',
          text: replyText.trim(),
          sharedItemId: activeStory.id,
          sharedItemPreview: activeStory.caption || activeStory.textOverlay || 'Story reply',
        });
        setReplyText('');
        setReplySent(true);
      }
    } catch {
      // handled in helper
    }
  };

  const handleArchiveStory = async (story: Story) => {
    await updateDoc(doc(db, 'stories', story.id), { isArchived: true });
    setActiveAuthorIndex(null);
  };

  const handleDeleteStory = async (story: Story) => {
    await deleteDoc(doc(db, 'stories', story.id));
    setActiveAuthorIndex(null);
  };

  const ownGroupIdx = groupedAuthors.findIndex((g) => g.authorId === userPublic?.uid);

  return (
    <>
      {fullPage ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Stories</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                24-hour moments from people you follow
              </p>
            </div>
            <button
              onClick={onOpenCreateStory}
              className="px-4 py-2 rounded-xl mixy-gradient-bg text-white text-sm font-semibold flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Story
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            <button
              onClick={onOpenCreateStory}
              className="aspect-[9/14] rounded-2xl border-2 border-dashed border-slate-300 dark:border-white/15 flex flex-col items-center justify-center gap-3 hover:border-fuchsia-500 transition-colors bg-white dark:bg-[#11111B]"
            >
              <div className="w-12 h-12 rounded-full mixy-gradient-bg text-white flex items-center justify-center">
                <Plus className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold">Create Story</span>
            </button>

            {groupedAuthors.map((group, idx) => {
              const cover = group.items[group.items.length - 1];
              return (
                <button
                  key={group.authorId}
                  onClick={() => {
                    setActiveAuthorIndex(idx);
                    setActiveStoryIndex(0);
                  }}
                  className="group relative aspect-[9/14] rounded-2xl overflow-hidden bg-slate-900 text-left"
                >
                  {cover.mediaType === 'video' ? (
                    <video src={mediaUrl(cover.mediaURL)} className="w-full h-full object-cover group-hover:scale-105 transition-transform" muted />
                  ) : (
                    <img src={mediaUrl(cover.mediaURL)} alt={group.authorUsername} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute top-3 left-3">
                    <UserAvatar src={group.authorPhotoURL} name={group.authorUsername} size="sm" hasStory />
                  </div>
                  <div className="absolute bottom-3 inset-x-3 text-white">
                    <p className="text-sm font-semibold flex items-center gap-1 truncate">
                      <span className="truncate">@{group.authorUsername}</span>
                      <UserVerifiedBadge uid={group.authorId} className="w-3.5 h-3.5" />
                    </p>
                    <p className="text-xs text-white/70">{group.items.length} active</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar py-2 px-1">
          {/* Your Story Slot */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="relative">
              <button
                onClick={() => {
                  if (ownGroupIdx >= 0) {
                    setActiveAuthorIndex(ownGroupIdx);
                    setActiveStoryIndex(0);
                  } else {
                    onOpenCreateStory();
                  }
                }}
                className="focus:outline-none"
              >
                <UserAvatar
                  src={userPublic?.photoURL}
                  name={userPublic?.displayName || 'You'}
                  size="lg"
                  hasStory={ownGroupIdx >= 0}
                />
              </button>
              <button
                onClick={onOpenCreateStory}
                aria-label="Add to story"
                className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full mixy-gradient-bg text-white ring-2 ring-slate-50 dark:ring-[#07070D] flex items-center justify-center"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-xs text-slate-600 dark:text-slate-300 max-w-[70px] truncate">
              Your story
            </span>
          </div>

          {groupedAuthors
            .filter((g) => g.authorId !== userPublic?.uid)
            .map((group) => {
              const realIdx = groupedAuthors.findIndex((x) => x.authorId === group.authorId);
              return (
                <button
                  key={group.authorId}
                  onClick={() => {
                    setActiveAuthorIndex(realIdx);
                    setActiveStoryIndex(0);
                  }}
                  className="flex flex-col items-center gap-1.5 shrink-0 focus:outline-none"
                >
                  <UserAvatar
                    src={group.authorPhotoURL}
                    name={group.authorUsername}
                    size="lg"
                    hasStory
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300 max-w-[76px] inline-flex items-center gap-0.5 truncate">
                    <span className="truncate">{group.authorUsername}</span>
                    <UserVerifiedBadge uid={group.authorId} className="w-3 h-3" />
                  </span>
                </button>
              );
            })}
        </div>
      )}

      {/* Fullscreen Story Viewer Modal */}
      {activeStory && activeGroup && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-0 sm:p-6">
          <div
            className="relative w-full max-w-md h-full sm:h-[88vh] sm:rounded-3xl overflow-hidden bg-[#0A0A12] flex flex-col justify-between"
            onMouseDown={() => setPaused(true)}
            onMouseUp={() => setPaused(false)}
            onTouchStart={() => setPaused(true)}
            onTouchEnd={() => setPaused(false)}
          >
            {/* Media Layer */}
            {activeStory.mediaType === 'video' ? (
              <video
                key={activeStory.id}
                src={mediaUrl(activeStory.mediaURL)}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <img
                src={mediaUrl(activeStory.mediaURL)}
                alt={activeStory.caption || 'Story'}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}

            {/* Text & Sticker Overlays */}
            {activeStory.textOverlay && (
              <div
                className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-2xl font-bold drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] pointer-events-none"
                style={{ color: activeStory.textColor || '#ffffff' }}
              >
                {activeStory.textOverlay}
              </div>
            )}
            {activeStory.stickers && activeStory.stickers.length > 0 && (
              <div className="absolute bottom-28 inset-x-6 flex flex-wrap justify-center gap-2 text-3xl pointer-events-none">
                {activeStory.stickers.map((st, idx) => (
                  <span key={idx}>{st}</span>
                ))}
              </div>
            )}

            {/* Top Progress + Author Bar */}
            <div className="relative z-20 p-4 bg-gradient-to-b from-black/80 via-black/30 to-transparent space-y-3">
              <div className="flex gap-1.5">
                {activeGroup.items.map((st, idx) => (
                  <div key={st.id} className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-100"
                      style={{
                        width:
                          idx < activeStoryIndex
                            ? '100%'
                            : idx === activeStoryIndex
                              ? `${progress}%`
                              : '0%',
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-white">
                <button
                  onClick={() => {
                    setActiveAuthorIndex(null);
                    onOpenProfile(activeStory.authorId);
                  }}
                  className="flex items-center gap-2.5 text-left"
                >
                  <UserAvatar
                    src={activeStory.authorPhotoURL}
                    name={activeStory.authorUsername}
                    size="sm"
                  />
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-1">
                      <span>{activeStory.authorUsername}</span>
                      <UserVerifiedBadge uid={activeStory.authorId} fallback={activeStory.authorVerified} className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-[11px] text-white/70">
                      {formatRelativeTime(activeStory.createdAt)}
                      {activeStory.musicTrack ? ` · 🎵 ${activeStory.musicTrack}` : ''}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-1">
                  {(activeStory.visibility === 'public' ||
                    activeStory.authorId === userPublic?.uid) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPaused(true);
                        setShareStoryTarget(activeStory);
                      }}
                      title="Repost story to DM"
                      className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  )}
                  {activeStory.authorId === userPublic?.uid && (
                    <>
                      <button
                        onClick={() => handleArchiveStory(activeStory)}
                        title="Save to archive"
                        className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteStory(activeStory)}
                        title="Delete story"
                        className="w-9 h-9 rounded-full hover:bg-white/15 text-rose-400 flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setActiveAuthorIndex(null);
                      setShowViewers(false);
                    }}
                    className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center"
                    aria-label="Close story"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              {activeStory.musicTrack && (
                <div className="inline-flex items-center gap-1.5 text-xs text-white/90 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-lg">
                  <Music className="w-3.5 h-3.5" />
                  <span>{activeStory.musicTrack}</span>
                </div>
              )}
            </div>

            {/* Tap Navigation Zones */}
            <button
              onClick={handlePrevStory}
              aria-label="Previous story"
              className="absolute left-0 top-24 bottom-28 w-1/3 z-10 flex items-center justify-start pl-2 text-white/0 hover:text-white/80"
            >
              <ChevronLeft className="w-7 h-7" />
            </button>
            <button
              onClick={handleNextStory}
              aria-label="Next story"
              className="absolute right-0 top-24 bottom-28 w-1/3 z-10 flex items-center justify-end pr-2 text-white/0 hover:text-white/80"
            >
              <ChevronRight className="w-7 h-7" />
            </button>

            {/* Bottom Interaction Bar */}
            <div className="relative z-20 p-4 bg-gradient-to-t from-black/85 via-black/45 to-transparent space-y-3 text-white">
              {activeStory.caption && (
                <p className="text-sm text-white/95 text-center">{activeStory.caption}</p>
              )}

              {activeStory.authorId === userPublic?.uid ? (
                <button
                  onClick={() => setShowViewers(true)}
                  className="w-full h-11 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center gap-2 text-sm font-semibold hover:bg-white/25"
                >
                  <Eye className="w-4 h-4" />
                  <span className="tabular-nums">{activeStory.viewsCount}</span> Viewers
                </button>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-center gap-2">
                    {STORY_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleReactStory(emoji)}
                        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 hover:scale-110 transition-all text-lg flex items-center justify-center"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={handleReplyStory} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={replySent ? 'Reply sent to DM!' : `Reply to @${activeStory.authorUsername}...`}
                      className="flex-1 h-11 px-4 rounded-full bg-white/15 backdrop-blur-md text-white placeholder-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                    />
                    <button
                      type="submit"
                      aria-label="Send story reply"
                      className="w-11 h-11 rounded-full mixy-gradient-bg flex items-center justify-center shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Owner Viewers Sheet */}
            {showViewers && (
              <div className="absolute inset-x-0 bottom-0 z-30 max-h-[65%] rounded-t-3xl bg-[#12121D] text-white p-5 flex flex-col space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-base">Story Viewers ({viewers.length})</h4>
                  <button
                    onClick={() => setShowViewers(false)}
                    className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                  {viewers.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No viewers yet.</p>
                  ) : (
                    viewers.map((v) => (
                      <div key={v.viewerId} className="flex items-center justify-between py-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveAuthorIndex(null);
                            setShowViewers(false);
                            onOpenProfile(v.viewerId);
                          }}
                          className="flex items-center gap-3 text-left hover:opacity-85 transition-opacity"
                        >
                          <UserAvatar src={v.photoURL} name={v.username} size="sm" />
                          <span className="text-sm font-medium hover:underline inline-flex items-center gap-1">
                            <span>@{v.username}</span>
                            <UserVerifiedBadge uid={v.viewerId} className="w-3.5 h-3.5" />
                          </span>
                        </button>
                        <div className="flex items-center gap-2 text-sm">
                          {v.reaction && <span>{v.reaction}</span>}
                          <span className="text-xs text-slate-400">
                            {formatRelativeTime(v.viewedAt)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {shareStoryTarget && (
        <ShareModal
          itemType="story"
          itemId={shareStoryTarget.id}
          previewText={
            shareStoryTarget.caption ||
            shareStoryTarget.textOverlay ||
            `Story by @${shareStoryTarget.authorUsername}`
          }
          authorUsername={shareStoryTarget.authorUsername}
          mediaPreviewUrl={
            shareStoryTarget.mediaType === 'image' ? mediaUrl(shareStoryTarget.mediaURL) : undefined
          }
          shareUrl={`${window.location.origin}/?story=${shareStoryTarget.id}`}
          onClose={() => {
            setShareStoryTarget(null);
            setPaused(false);
          }}
        />
      )}
    </>
  );
}
