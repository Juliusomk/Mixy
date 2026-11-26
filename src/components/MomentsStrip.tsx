import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  Loader2,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db, formatRelativeTime, generateId } from '../lib/firebase';
import { mediaUrl as resolveMediaUrl, uploadMediaFile } from '../lib/media';
import type { MomentItem } from '../types/mixy';
import { UserAvatar, UserVerifiedBadge } from './MixyLogo';

const MOMENT_MOODS = ['✨', '☕', '🎧', '🔥', '🌈', '📚', '🏋️', '🌙'];

export function MomentsStrip({
  onOpenProfile,
}: {
  onOpenProfile: (uid: string) => void;
}) {
  const { userPublic, userPrivate, followingIds } = useAuth();
  const [publicMoments, setPublicMoments] = useState<MomentItem[]>([]);
  const [cfMoments, setCfMoments] = useState<MomentItem[]>([]);
  const [ownMoments, setOwnMoments] = useState<MomentItem[]>([]);
  const [selectedMoment, setSelectedMoment] = useState<MomentItem | null>(null);
  const [showCreator, setShowCreator] = useState(false);

  const [caption, setCaption] = useState('');
  const [moodEmoji, setMoodEmoji] = useState('✨');
  const [audience, setAudience] = useState<'public' | 'followers' | 'close_friends'>('public');
  const [mediaURL, setMediaURL] = useState('');
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!userPublic) return;

    const unsubPub = onSnapshot(
      query(
        collection(db, 'moments'),
        where('audience', 'in', ['public', 'followers'])
      ),
      (snap) => setPublicMoments(snap.docs.map((d) => d.data() as MomentItem)),
      () => {}
    );

    const unsubCf = onSnapshot(
      query(
        collection(db, 'moments'),
        where('audience', '==', 'close_friends'),
        where('closeFriendIds', 'array-contains', userPublic.uid)
      ),
      (snap) => setCfMoments(snap.docs.map((d) => d.data() as MomentItem)),
      () => {}
    );

    const unsubOwn = onSnapshot(
      query(collection(db, 'moments'), where('authorId', '==', userPublic.uid)),
      (snap) => setOwnMoments(snap.docs.map((d) => d.data() as MomentItem)),
      () => {}
    );

    return () => {
      unsubPub();
      unsubCf();
      unsubOwn();
    };
  }, [userPublic]);

  const visibleMoments = useMemo(() => {
    const blocked = new Set(userPrivate?.blockedIds || []);
    const now = Date.now();
    const map = new Map<string, MomentItem>();
    for (const m of [...ownMoments, ...cfMoments, ...publicMoments]) {
      if (blocked.has(m.authorId)) continue;
      if ((m.expiresAt?.toDate?.().getTime() || 0) <= now) continue;
      if (
        m.audience === 'followers' &&
        m.authorId !== userPublic?.uid &&
        !followingIds.has(m.authorId)
      ) {
        continue;
      }
      map.set(m.id, m);
    }
    return Array.from(map.values()).sort(
      (a, b) => (b.createdAt?.toDate?.().getTime() || 0) - (a.createdAt?.toDate?.().getTime() || 0)
    );
  }, [ownMoments, cfMoments, publicMoments, userPrivate?.blockedIds, userPublic?.uid, followingIds]);

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadMediaFile(file);
      setMediaURL(up.url);
    } finally {
      setUploading(false);
    }
  };

  const handleCreateMoment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublic || !caption.trim() || posting) return;
    setPosting(true);
    try {
      const id = generateId('mom');
      const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
      const payload: Record<string, unknown> = {
        id,
        authorId: userPublic.uid,
        authorUsername: userPublic.username,
        authorPhotoURL: userPublic.photoURL || '',
        authorVerified: Boolean(userPublic.isVerified),
        caption: caption.trim().slice(0, 140),
        moodEmoji,
        audience,
        expiresAt,
        createdAt: serverTimestamp(),
      };
      if (mediaURL) payload.mediaURL = mediaURL;
      if (audience === 'close_friends') {
        payload.closeFriendIds = userPrivate?.closeFriendsIds || [];
      }
      await setDoc(doc(db, 'moments', id), payload);
      setCaption('');
      setMediaURL('');
      setShowCreator(false);
    } finally {
      setPosting(false);
    }
  };

  if (!userPublic) return null;

  return (
    <>
      <section className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-3.5 mixy-card-shadow">
        <div className="flex items-center justify-between mb-2.5 px-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-fuchsia-500" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              MIXY Moments · 24h Check-Ins
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setShowCreator(true)}
            className="text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-400 hover:underline flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Check in
          </button>
        </div>

        <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1">
          {/* Add Moment tile */}
          <button
            type="button"
            onClick={() => setShowCreator(true)}
            className="w-32 shrink-0 rounded-2xl border border-dashed border-fuchsia-300 dark:border-fuchsia-500/40 bg-fuchsia-50/70 dark:bg-fuchsia-500/10 p-3 flex flex-col items-center justify-center gap-1.5 text-center hover:bg-fuchsia-100/70 dark:hover:bg-fuchsia-500/15 transition-colors"
          >
            <span className="w-8 h-8 rounded-full mixy-gradient-bg text-white flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </span>
            <span className="text-[11px] font-bold text-slate-900 dark:text-white">
              Share Moment
            </span>
          </button>

          {visibleMoments.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedMoment(m)}
              className={`w-44 shrink-0 rounded-2xl border p-3 text-left transition-transform hover:-translate-y-0.5 flex flex-col justify-between gap-2 ${
                m.audience === 'close_friends'
                  ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-500/10'
                  : 'border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <UserAvatar src={m.authorPhotoURL} name={m.authorUsername} size="xs" />
                  <span className="text-[11px] font-bold truncate text-slate-900 dark:text-white inline-flex items-center gap-0.5">
                    <span className="truncate">@{m.authorUsername}</span>
                    <UserVerifiedBadge uid={m.authorId} fallback={m.authorVerified} className="w-3 h-3" />
                  </span>
                </div>
                <span className="text-sm shrink-0">{m.moodEmoji || '✨'}</span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-200 line-clamp-2 leading-snug">
                {m.caption}
              </p>
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>{formatRelativeTime(m.createdAt)}</span>
                {m.audience === 'close_friends' && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                    <Star className="w-2.5 h-2.5 fill-current" /> Close
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* View Moment Modal */}
      {selectedMoment && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 overflow-hidden shadow-2xl">
            <div className="p-4 flex items-center justify-between border-b border-slate-100 dark:border-white/10">
              <button
                type="button"
                onClick={() => {
                  const uid = selectedMoment.authorId;
                  setSelectedMoment(null);
                  onOpenProfile(uid);
                }}
                className="flex items-center gap-2.5 text-left"
              >
                <UserAvatar src={selectedMoment.authorPhotoURL} name={selectedMoment.authorUsername} size="sm" />
                <div>
                  <p className="text-sm font-bold flex items-center gap-1">
                    <span>@{selectedMoment.authorUsername}</span>
                    <UserVerifiedBadge uid={selectedMoment.authorId} fallback={selectedMoment.authorVerified} className="w-3.5 h-3.5" />
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {formatRelativeTime(selectedMoment.createdAt)} · {selectedMoment.moodEmoji || '✨'}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-1">
                {selectedMoment.authorId === userPublic.uid && (
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteDoc(doc(db, 'moments', selectedMoment.id));
                      setSelectedMoment(null);
                    }}
                    className="w-8 h-8 rounded-full hover:bg-rose-500/10 text-rose-500 flex items-center justify-center"
                    title="Delete moment"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedMoment(null)}
                  className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {selectedMoment.mediaURL && (
              <img
                src={resolveMediaUrl(selectedMoment.mediaURL)}
                alt="Moment snapshot"
                className="w-full max-h-72 object-cover"
              />
            )}
            <div className="p-5">
              <p className="text-base font-medium text-slate-900 dark:text-white leading-relaxed">
                {selectedMoment.moodEmoji} {selectedMoment.caption}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Create Moment Modal */}
      {showCreator && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateMoment}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Share a 24h MIXY Moment</h3>
              <button
                type="button"
                onClick={() => setShowCreator(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {MOMENT_MOODS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setMoodEmoji(em)}
                  className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center border ${
                    moodEmoji === em
                      ? 'border-fuchsia-500 bg-fuchsia-500/15'
                      : 'border-slate-200 dark:border-white/10'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              maxLength={140}
              required
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What's your quick vibe or check-in right now?"
              className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
            />

            {mediaURL && (
              <div className="relative rounded-2xl overflow-hidden max-h-40">
                <img src={resolveMediaUrl(mediaURL)} alt="" className="w-full h-40 object-cover" />
                <button
                  type="button"
                  onClick={() => setMediaURL('')}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5 text-fuchsia-500" />}
                Add Photo
                <input type="file" accept="image/*" className="hidden" onChange={handleUploadPhoto} />
              </label>

              <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-white/5 p-1 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setAudience('public')}
                  className={`px-2.5 py-1 rounded-lg ${
                    audience === 'public' ? 'bg-white dark:bg-[#1C1C2B] shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Public
                </button>
                <button
                  type="button"
                  onClick={() => setAudience('followers')}
                  className={`px-2.5 py-1 rounded-lg flex items-center gap-1 ${
                    audience === 'followers' ? 'bg-white dark:bg-[#1C1C2B] shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <Users className="w-3 h-3" /> Followers
                </button>
                <button
                  type="button"
                  onClick={() => setAudience('close_friends')}
                  className={`px-2.5 py-1 rounded-lg flex items-center gap-1 ${
                    audience === 'close_friends'
                      ? 'bg-emerald-500 text-white'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  <Star className="w-3 h-3" /> Close Friends
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!caption.trim() || posting}
              className="w-full h-11 rounded-xl mixy-gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {posting && <Loader2 className="w-4 h-4 animate-spin" />}
              Post Moment (24h)
            </button>
          </form>
        </div>
      )}
    </>
  );
}
