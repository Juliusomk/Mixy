import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ImagePlus,
  Loader2,
  Music,
  Pause,
  Play,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { uploadMediaFile } from '../lib/media';
import { playMoodReactionPop } from '../lib/soundEffects';
import type {
  Post,
  ProfileBorderGradient,
  ProfileEffect,
  ProfileFrameId,
  ProfileThemeId,
  UserMood,
} from '../types/mixy';
import { UserAvatar, VerifiedBadge } from './MixyLogo';

const FRAME_OPTIONS: { id: ProfileFrameId; label: string }[] = [
  { id: 'none', label: 'Classic' },
  { id: 'aurora_ring', label: 'Aurora Ring' },
  { id: 'gold_crown', label: 'Gold Crown' },
  { id: 'cyber_neon', label: 'Cyber Neon' },
  { id: 'crystal_glass', label: 'Crystal Glass' },
  { id: 'sakura_bloom', label: 'Sakura Bloom' },
];

const BORDER_OPTIONS: { id: ProfileBorderGradient; label: string; css: string }[] = [
  { id: 'none', label: 'Clean', css: 'border-slate-200 dark:border-white/10' },
  { id: 'fuchsia_violet', label: 'Fuchsia', css: 'from-fuchsia-500 to-violet-600' },
  { id: 'cyan_blue', label: 'Ocean', css: 'from-cyan-400 to-blue-600' },
  { id: 'amber_rose', label: 'Sunset', css: 'from-amber-400 to-rose-500' },
  { id: 'emerald_teal', label: 'Emerald', css: 'from-emerald-400 to-teal-600' },
  { id: 'rainbow', label: 'Prism', css: 'from-pink-500 via-amber-400 to-cyan-500' },
];

const THEME_OPTIONS: { id: ProfileThemeId; label: string; cardClass: string; textClass: string }[] = [
  {
    id: 'default',
    label: 'MIXY Default',
    cardClass: 'bg-white dark:bg-[#10101A]',
    textClass: 'text-slate-900 dark:text-white',
  },
  {
    id: 'minimal_white',
    label: 'Studio White',
    cardClass: 'bg-white',
    textClass: 'text-slate-900',
  },
  {
    id: 'obsidian_gold',
    label: 'Obsidian Gold',
    cardClass: 'bg-gradient-to-br from-slate-950 via-neutral-900 to-amber-950/60',
    textClass: 'text-amber-50',
  },
  {
    id: 'midnight_cosmos',
    label: 'Midnight Cosmos',
    cardClass: 'bg-gradient-to-br from-indigo-950 via-slate-950 to-fuchsia-950',
    textClass: 'text-white',
  },
  {
    id: 'pastel_bloom',
    label: 'Pastel Bloom',
    cardClass: 'bg-gradient-to-br from-rose-50 via-white to-violet-50',
    textClass: 'text-slate-900',
  },
  {
    id: 'neon_cyber',
    label: 'Cyber Pulse',
    cardClass: 'bg-gradient-to-br from-slate-950 via-cyan-950 to-indigo-950',
    textClass: 'text-cyan-50',
  },
];

const BADGE_PRESETS = [
  '✨ Creator',
  '🎧 Music Lover',
  '📸 Visual Storyteller',
  '⚡ Early Adopter',
  '🌍 Explorer',
  '🎨 Designer',
];

export const MIXY_MOOD_PRESETS: UserMood[] = [
  { id: 'chill', emoji: '🎧', label: 'Chilling' },
  { id: 'creating', emoji: '✨', label: 'Creating' },
  { id: 'focused', emoji: '🎯', label: 'Focused' },
  { id: 'coffee', emoji: '☕', label: 'Coffee Break' },
  { id: 'traveling', emoji: '✈️', label: 'Exploring' },
  { id: 'celebrating', emoji: '🎉', label: 'Celebrating' },
  { id: 'resting', emoji: '🌙', label: 'Winding Down' },
  { id: 'happy', emoji: '💖', label: 'Good Vibes' },
];

export function ProfileEffectsModal({
  open,
  userPosts,
  onClose,
}: {
  open: boolean;
  userPosts: Post[];
  onClose: () => void;
}) {
  const { userPublic } = useAuth();
  const [effect, setEffect] = useState<ProfileEffect>({});
  const [mood, setMood] = useState<UserMood | undefined>(undefined);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playingPreview, setPlayingPreview] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open || !userPublic) return;
    setEffect({
      frame: userPublic.profileEffect?.frame || 'none',
      borderGradient: userPublic.profileEffect?.borderGradient || 'none',
      theme: userPublic.profileEffect?.theme || 'default',
      backgroundUrl: userPublic.profileEffect?.backgroundUrl || '',
      musicTitle: userPublic.profileEffect?.musicTitle || '',
      musicUrl: userPublic.profileEffect?.musicUrl || '',
      accentHex: userPublic.profileEffect?.accentHex || '#d946ef',
      intro: userPublic.profileEffect?.intro || '',
      badges: userPublic.profileEffect?.badges || [],
      featuredPostIds: userPublic.profileEffect?.featuredPostIds || [],
    });
    setMood(userPublic.mood);
    setError('');
    setPlayingPreview(false);
  }, [open, userPublic]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  if (!open || !userPublic) return null;

  const selectedThemeMeta =
    THEME_OPTIONS.find((t) => t.id === (effect.theme || 'default')) || THEME_OPTIONS[0];

  const handleUploadBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingBg(true);
    setError('');
    try {
      const uploaded = await uploadMediaFile(file);
      setEffect((prev) => ({ ...prev, backgroundUrl: uploaded.url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Background upload failed.');
    } finally {
      setUploadingBg(false);
    }
  };

  const handleUploadAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAudio(true);
    setError('');
    try {
      const uploaded = await uploadMediaFile(file);
      setEffect((prev) => ({
        ...prev,
        musicUrl: uploaded.url,
        musicTitle: prev.musicTitle || file.name.replace(/\.[^/.]+$/, '').slice(0, 60),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audio upload failed.');
    } finally {
      setUploadingAudio(false);
    }
  };

  const toggleBadge = (badge: string) => {
    const current = effect.badges || [];
    const exists = current.includes(badge);
    const next = exists ? current.filter((b) => b !== badge) : [...current, badge].slice(0, 3);
    setEffect((prev) => ({ ...prev, badges: next }));
  };

  const toggleFeaturedPost = (postId: string) => {
    const current = effect.featuredPostIds || [];
    const exists = current.includes(postId);
    const next = exists ? current.filter((id) => id !== postId) : [...current, postId].slice(0, 3);
    setEffect((prev) => ({ ...prev, featuredPostIds: next }));
  };

  const handleTogglePreviewMusic = () => {
    if (!effect.musicUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(effect.musicUrl);
      audioRef.current.onended = () => setPlayingPreview(false);
    } else if (audioRef.current.src !== effect.musicUrl) {
      audioRef.current.src = effect.musicUrl;
    }
    if (playingPreview) {
      audioRef.current.pause();
      setPlayingPreview(false);
    } else {
      void audioRef.current.play().then(() => setPlayingPreview(true)).catch(() => {});
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const cleanEffect: ProfileEffect = {
        frame: effect.frame || 'none',
        borderGradient: effect.borderGradient || 'none',
        theme: effect.theme || 'default',
        accentHex: effect.accentHex || '#d946ef',
        badges: (effect.badges || []).slice(0, 3),
        featuredPostIds: (effect.featuredPostIds || []).slice(0, 3),
      };
      if (effect.backgroundUrl?.trim()) cleanEffect.backgroundUrl = effect.backgroundUrl.trim();
      if (effect.musicTitle?.trim()) cleanEffect.musicTitle = effect.musicTitle.trim().slice(0, 80);
      if (effect.musicUrl?.trim()) cleanEffect.musicUrl = effect.musicUrl.trim();
      if (effect.intro?.trim()) cleanEffect.intro = effect.intro.trim().slice(0, 140);

      const updatePayload: Record<string, unknown> = {
        profileEffect: cleanEffect,
        updatedAt: serverTimestamp(),
      };
      if (mood) {
        updatePayload.mood = mood;
      }
      await updateDoc(doc(db, 'users', userPublic.uid), updatePayload);
      playMoodReactionPop();
      audioRef.current?.pause();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save profile effects.');
    } finally {
      setSaving(false);
    }
  };

  const borderOpt = BORDER_OPTIONS.find((b) => b.id === effect.borderGradient);

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-3xl bg-white dark:bg-[#11111B] border border-slate-200 dark:border-white/10 shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-fuchsia-500" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                MIXY Profile Effects & Mood
              </h2>
              <p className="text-[11px] text-slate-500">
                Customize your avatar frame, theme card, music track, and live mood
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              audioRef.current?.pause();
              onClose();
            }}
            className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
            aria-label="Close profile effects"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Live Preview */}
          <div>
            <p className="text-xs font-bold text-slate-500 mb-2">Live Preview</p>
            <div
              className={`rounded-3xl p-[2px] ${
                borderOpt && borderOpt.id !== 'none'
                  ? `bg-gradient-to-r ${borderOpt.css}`
                  : 'bg-slate-200 dark:bg-white/10'
              }`}
            >
              <div
                className={`relative rounded-[22px] p-5 overflow-hidden ${selectedThemeMeta.cardClass} ${selectedThemeMeta.textClass}`}
                style={
                  effect.backgroundUrl
                    ? {
                        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.42), rgba(0,0,0,0.68)), url(${effect.backgroundUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        color: '#ffffff',
                      }
                    : undefined
                }
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`p-1 rounded-full ${
                      effect.frame && effect.frame !== 'none'
                        ? `mixy-frame-${effect.frame}`
                        : 'bg-transparent'
                    }`}
                  >
                    <UserAvatar
                      src={userPublic.photoURL}
                      name={userPublic.displayName}
                      size="lg"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-base truncate">
                        {userPublic.displayName}
                      </span>
                      {userPublic.isVerified && (
                        <VerifiedBadge className="w-4 h-4" verificationType={userPublic.verificationType} />
                      )}
                      {mood && (
                        <span className="text-xs font-semibold opacity-90 ml-1">
                          {mood.emoji} {mood.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs opacity-75">@{userPublic.username}</p>
                    {effect.intro && (
                      <p className="text-xs mt-1.5 font-medium opacity-95">{effect.intro}</p>
                    )}
                    {(effect.badges || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(effect.badges || []).map((b) => (
                          <span
                            key={b}
                            className="px-2 py-0.5 rounded-lg bg-black/15 dark:bg-white/15 backdrop-blur-sm text-[11px] font-semibold"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {effect.musicTitle && (
                  <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/15 flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 truncate font-medium">
                      <Music className="w-3.5 h-3.5 shrink-0" style={{ color: effect.accentHex }} />
                      {effect.musicTitle}
                    </span>
                    {effect.musicUrl && (
                      <button
                        type="button"
                        onClick={handleTogglePreviewMusic}
                        className="px-2.5 py-1 rounded-lg bg-black/15 dark:bg-white/15 flex items-center gap-1 text-[11px] font-semibold"
                      >
                        {playingPreview ? (
                          <>
                            <Pause className="w-3 h-3" /> Pause
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3" /> Preview
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* MIXY Mood Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                MIXY Mood
              </label>
              {mood && (
                <button
                  type="button"
                  onClick={() => setMood(undefined)}
                  className="text-[11px] text-rose-500 hover:underline"
                >
                  Clear Mood
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MIXY_MOOD_PRESETS.map((m) => {
                const active = mood?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMood(m)}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors ${
                      active
                        ? 'border-fuchsia-500 bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300'
                        : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <span>{m.emoji}</span>
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Avatar Frame */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Animated Avatar Frame
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {FRAME_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setEffect((p) => ({ ...p, frame: f.id }))}
                  className={`p-2 rounded-xl border text-[11px] font-semibold text-center transition-colors ${
                    effect.frame === f.id
                      ? 'border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300'
                      : 'border-slate-200 dark:border-white/10'
                  }`}
                >
                  <div
                    className={`w-8 h-8 mx-auto mb-1 rounded-full p-0.5 ${
                      f.id !== 'none' ? `mixy-frame-${f.id}` : 'bg-slate-200 dark:bg-white/15'
                    }`}
                  >
                    <div className="w-full h-full rounded-full bg-white dark:bg-[#11111B]" />
                  </div>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Border Gradient & Profile Theme */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Profile Border Gradient
              </label>
              <div className="flex flex-wrap gap-1.5">
                {BORDER_OPTIONS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setEffect((p) => ({ ...p, borderGradient: b.id }))}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                      effect.borderGradient === b.id
                        ? 'border-fuchsia-500 bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300'
                        : 'border-slate-200 dark:border-white/10'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Card Theme & Accent
              </label>
              <div className="flex flex-wrap gap-1.5 items-center">
                {THEME_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setEffect((p) => ({ ...p, theme: t.id }))}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold ${
                      effect.theme === t.id
                        ? 'border-fuchsia-500 bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300'
                        : 'border-slate-200 dark:border-white/10'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
                <input
                  type="color"
                  value={effect.accentHex || '#d946ef'}
                  onChange={(e) => setEffect((p) => ({ ...p, accentHex: e.target.value }))}
                  className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200 dark:border-white/10"
                  title="Custom accent highlight color"
                />
              </div>
            </div>
          </div>

          {/* Custom Intro & Badges */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                Custom Profile Intro Line
              </label>
              <input
                type="text"
                maxLength={140}
                value={effect.intro || ''}
                onChange={(e) => setEffect((p) => ({ ...p, intro: e.target.value }))}
                placeholder="e.g. Visual director · Shooting on 35mm ✨"
                className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1.5">
                Profile Badges (up to 3)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {BADGE_PRESETS.map((b) => {
                  const active = (effect.badges || []).includes(b);
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => toggleBadge(b)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                        active
                          ? 'border-fuchsia-500 bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300'
                          : 'border-slate-200 dark:border-white/10'
                      }`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Background Image & Profile Music */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2 p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <ImagePlus className="w-4 h-4 text-fuchsia-500" /> Profile Card Background
              </p>
              <div className="flex items-center gap-2">
                <label className="flex-1 h-9 rounded-xl bg-white dark:bg-white/10 border border-slate-200 dark:border-white/15 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/15">
                  {uploadingBg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Upload Image
                  <input type="file" accept="image/*" className="hidden" onChange={handleUploadBg} />
                </label>
                {effect.backgroundUrl && (
                  <button
                    type="button"
                    onClick={() => setEffect((p) => ({ ...p, backgroundUrl: '' }))}
                    className="h-9 px-3 rounded-xl text-xs text-rose-500 hover:bg-rose-500/10"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2 p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <Music className="w-4 h-4 text-fuchsia-500" /> Profile Music Track
              </p>
              <input
                type="text"
                maxLength={80}
                value={effect.musicTitle || ''}
                onChange={(e) => setEffect((p) => ({ ...p, musicTitle: e.target.value }))}
                placeholder="Track title (e.g. Midnight City)"
                className="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
              />
              <div className="flex items-center gap-2">
                <label className="flex-1 h-8 rounded-xl bg-white dark:bg-white/10 border border-slate-200 dark:border-white/15 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                  {uploadingAudio ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Upload Audio
                  <input type="file" accept="audio/*" className="hidden" onChange={handleUploadAudio} />
                </label>
                {effect.musicUrl && (
                  <button
                    type="button"
                    onClick={() => setEffect((p) => ({ ...p, musicUrl: '', musicTitle: '' }))}
                    className="h-8 px-2.5 rounded-xl text-xs text-rose-500 hover:bg-rose-500/10"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Featured Posts Selector */}
          {userPosts.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Featured Posts (up to 3)
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {userPosts.slice(0, 12).map((post) => {
                  const selected = (effect.featuredPostIds || []).includes(post.id);
                  const thumb = post.media[0]?.url;
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => toggleFeaturedPost(post.id)}
                      className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                        selected ? 'border-fuchsia-500 scale-[0.98]' : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-100 dark:bg-white/10 p-1.5 text-[10px] flex items-center justify-center text-center">
                          {post.caption.slice(0, 28) || 'Post'}
                        </div>
                      )}
                      {selected && (
                        <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-fuchsia-500 text-white flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-rose-500">{error}</p>}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-white/10 flex items-center justify-end gap-2 bg-slate-50 dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={() => {
              audioRef.current?.pause();
              onClose();
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="px-5 py-2 rounded-xl mixy-gradient-bg text-white text-xs font-semibold flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save Profile Effects
          </button>
        </div>
      </div>
    </div>
  );
}
