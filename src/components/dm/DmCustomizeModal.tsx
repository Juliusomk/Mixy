import React, { useState } from 'react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  Check,
  Image as ImageIcon,
  Loader2,
  Palette,
  RotateCcw,
  Shield,
  Sparkles,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  DM_APPEARANCE_CLASSES,
  DM_BUBBLE_PADDING_CLASSES,
  DM_CORNER_RADIUS_MAP,
  DM_DISAPPEARING_OPTIONS,
  DM_FONT_OPTIONS,
  DM_MOOD_PRESETS,
  DM_TEXT_SIZE_CLASSES,
  DM_THEME_PRESETS,
  resolveConversationStyle,
} from '../../lib/dmThemes';
import { db } from '../../lib/firebase';
import { uploadMediaFile } from '../../lib/media';
import { realtimeClient } from '../../lib/realtime';
import type {
  Conversation,
  DmBubbleSize,
  DmCornerRadius,
  DmFontFamily,
  DmTextAppearance,
  DmTextSize,
  DmWhoCanMessage,
  UserPublic,
} from '../../types/mixy';

export function DmCustomizeModal({
  conversation,
  otherUser,
  initialTab = 'themes',
  onClose,
  onBlockUser,
  onRestrictUser,
  onReportUser,
}: {
  conversation: Conversation;
  otherUser: UserPublic | null;
  initialTab?: 'themes' | 'moods' | 'fonts' | 'privacy';
  onClose: () => void;
  onBlockUser?: (uid: string) => Promise<void>;
  onRestrictUser?: (uid: string) => Promise<void>;
  onReportUser?: (uid: string) => void;
}) {
  const { firebaseUser, userPublic, userPrivate } = useAuth();
  const [tab, setTab] = useState<'themes' | 'moods' | 'fonts' | 'privacy'>(initialTab);
  const [saving, setSaving] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [statusNote, setStatusNote] = useState('');

  // Draft conversation theme state (for Live Preview before applying!)
  const [draftThemeId, setDraftThemeId] = useState(conversation.themeId || 'default');
  const [draftMoodId, setDraftMoodId] = useState(conversation.moodId || '');
  const [draftBgMode, setDraftBgMode] = useState(conversation.backgroundMode || 'theme');
  const [draftBgValue, setDraftBgValue] = useState(conversation.backgroundValue || '');
  const [draftCustomBgUrl, setDraftCustomBgUrl] = useState(conversation.customBackgroundURL || '');
  const [draftDisappearing, setDraftDisappearing] = useState(
    conversation.disappearingSeconds || 0
  );

  // Draft user DM font & personality state
  const [draftFont, setDraftFont] = useState<DmFontFamily>(
    userPrivate?.dmFontFamily || 'modern_sans'
  );
  const [draftTextSize, setDraftTextSize] = useState<DmTextSize>(userPrivate?.dmTextSize || 'md');
  const [draftBubbleSize, setDraftBubbleSize] = useState<DmBubbleSize>(
    userPrivate?.dmBubbleSize || 'cozy'
  );
  const [draftRadius, setDraftRadius] = useState<DmCornerRadius>(
    userPrivate?.dmCornerRadius || 'rounded'
  );
  const [draftAppearance, setDraftAppearance] = useState<DmTextAppearance>(
    userPrivate?.dmTextAppearance || 'clean'
  );
  const [draftBubbleMode, setDraftBubbleMode] = useState<boolean>(
    Boolean(userPrivate?.dmBubbleMode)
  );
  const [draftEffects, setDraftEffects] = useState<boolean>(
    userPrivate?.dmEffectsEnabled !== false
  );

  // Privacy drafts
  const [draftReadReceipts, setDraftReadReceipts] = useState<boolean>(
    userPrivate?.readReceipts !== false
  );
  const [draftShowOnline, setDraftShowOnline] = useState<boolean>(
    userPublic?.showOnlineStatus !== false
  );
  const [draftShowTyping, setDraftShowTyping] = useState<boolean>(
    userPrivate?.dmShowTyping !== false
  );
  const [draftWhoCanMessage, setDraftWhoCanMessage] = useState<DmWhoCanMessage>(
    userPrivate?.dmWhoCanMessage || 'everyone'
  );

  const previewConvStyle = resolveConversationStyle({
    themeId: draftThemeId,
    moodId: draftMoodId,
    backgroundMode: draftBgMode,
    backgroundValue: draftBgValue,
    customBackgroundURL: draftCustomBgUrl,
  });

  const activeFontMeta =
    DM_FONT_OPTIONS.find((f) => f.id === draftFont) || DM_FONT_OPTIONS[0];
  const radiusSet = DM_CORNER_RADIUS_MAP[draftRadius];
  const isRestricted = otherUser ? (userPrivate?.restrictedIds || []).includes(otherUser.uid) : false;

  const handleUploadWallpaper = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBg(true);
    try {
      const uploaded = await uploadMediaFile(file);
      setDraftCustomBgUrl(uploaded.url);
      setDraftBgMode('image');
      setDraftMoodId('');
    } finally {
      setUploadingBg(false);
    }
  };

  const handleResetThemeToDefault = () => {
    setDraftThemeId('default');
    setDraftMoodId('');
    setDraftBgMode('theme');
    setDraftBgValue('');
    setDraftCustomBgUrl('');
  };

  const handleApplyAll = async () => {
    if (!userPublic || saving) return;
    setSaving(true);
    try {
      // 1. Sync conversation theme/mood/wallpaper/disappearing across participants
      await updateDoc(doc(db, 'conversations', conversation.id), {
        themeId: draftThemeId,
        moodId: draftMoodId,
        backgroundMode: draftBgMode,
        backgroundValue: draftBgValue,
        customBackgroundURL: draftCustomBgUrl,
        disappearingSeconds: draftDisappearing,
        updatedAt: serverTimestamp(),
      });

      // 2. Save user font, bubble personality, effects & privacy prefs
      await setDoc(
        doc(db, 'users', userPublic.uid, 'private', 'info'),
        {
          uid: userPublic.uid,
          email: firebaseUser?.email || userPrivate?.email || '',
          dmFontFamily: draftFont,
          dmTextSize: draftTextSize,
          dmBubbleSize: draftBubbleSize,
          dmCornerRadius: draftRadius,
          dmTextAppearance: draftAppearance,
          dmBubbleMode: draftBubbleMode,
          dmEffectsEnabled: draftEffects,
          dmShowTyping: draftShowTyping,
          dmWhoCanMessage: draftWhoCanMessage,
          readReceipts: draftReadReceipts,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 3. Sync online visibility if changed
      if (draftShowOnline !== (userPublic.showOnlineStatus !== false)) {
        realtimeClient.updateVisibility(draftShowOnline);
        await updateDoc(doc(db, 'users', userPublic.uid), {
          showOnlineStatus: draftShowOnline,
          updatedAt: serverTimestamp(),
        });
      }

      setStatusNote('Synced across chat!');
      setTimeout(() => {
        onClose();
      }, 450);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#11111B] border border-slate-200 dark:border-white/10 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Palette className="w-5 h-5 text-fuchsia-500" />
              Chat Studio & Settings
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Themes, wallpapers & timers sync automatically with everyone in this chat.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
            aria-label="Close customize modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Preview Strip */}
        <div
          style={previewConvStyle.backgroundStyle}
          className={`p-4 border-b border-slate-200 dark:border-white/10 space-y-2 transition-all ${
            previewConvStyle.isAnimated ? 'mixy-animated-gradient' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                previewConvStyle.isLight
                  ? 'bg-black/10 text-slate-800'
                  : 'bg-white/15 text-white/90'
              }`}
            >
              Live Preview · {activeFontMeta.label}
            </span>
            {draftDisappearing > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300">
                Disappearing: {DM_DISAPPEARING_OPTIONS.find((d) => d.seconds === draftDisappearing)?.label}
              </span>
            )}
          </div>
          <div
            className="space-y-1.5"
            style={{ fontFamily: activeFontMeta.cssFamily }}
          >
            <div className="flex justify-start">
              <div
                style={{
                  background: previewConvStyle.otherBubbleBg,
                  color: previewConvStyle.otherBubbleText,
                }}
                className={`${DM_BUBBLE_PADDING_CLASSES[draftBubbleSize]} ${
                  draftBubbleMode ? 'rounded-full shadow-lg backdrop-blur-md border border-white/20' : radiusSet.other
                } ${DM_TEXT_SIZE_CLASSES[draftTextSize]} ${DM_APPEARANCE_CLASSES[draftAppearance].className} max-w-[78%]`}
              >
                Loving this MIXY vibe! ✨
              </div>
            </div>
            <div className="flex justify-end">
              <div
                style={{
                  background: previewConvStyle.mineBubbleBg,
                  color: previewConvStyle.mineBubbleText,
                }}
                className={`${DM_BUBBLE_PADDING_CLASSES[draftBubbleSize]} ${
                  draftBubbleMode ? 'rounded-full shadow-lg backdrop-blur-md border border-white/25' : radiusSet.mine
                } ${DM_TEXT_SIZE_CLASSES[draftTextSize]} ${DM_APPEARANCE_CLASSES[draftAppearance].className} max-w-[78%]`}
              >
                Synced for both of us right now 🫧
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 pt-3 flex gap-1.5 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-white/10 pb-2.5">
          {[
            { id: 'themes', label: 'Theme Store & Walls', icon: <Palette className="w-3.5 h-3.5" /> },
            { id: 'moods', label: 'Mood Themes', icon: <Sparkles className="w-3.5 h-3.5" /> },
            { id: 'fonts', label: 'Fonts & Bubbles', icon: <Type className="w-3.5 h-3.5" /> },
            { id: 'privacy', label: 'Privacy & Control', icon: <Shield className="w-3.5 h-3.5" /> },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors ${
                tab === item.id
                  ? 'mixy-gradient-bg text-white'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'themes' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">MIXY Theme Store</h3>
                <button
                  type="button"
                  onClick={handleResetThemeToDefault}
                  className="text-xs font-semibold text-fuchsia-500 hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset to Default
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {DM_THEME_PRESETS.filter((t) => t.category === 'theme_store').map((preset) => {
                  const selected = draftBgMode === 'theme' && draftThemeId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setDraftThemeId(preset.id);
                        setDraftBgMode('theme');
                        setDraftMoodId('');
                      }}
                      className={`p-2.5 rounded-2xl border text-left transition-all ${
                        selected
                          ? 'border-fuchsia-500 bg-fuchsia-500/10 ring-1 ring-fuchsia-500'
                          : 'border-slate-200 dark:border-white/10 hover:border-fuchsia-400/50'
                      }`}
                    >
                      <div
                        style={{ background: preset.previewGradient }}
                        className="h-12 rounded-xl mb-2 flex items-center justify-between px-2.5"
                      >
                        <span className="text-[10px] font-bold text-white/90 drop-shadow">
                          {preset.isAnimated ? 'Animated' : preset.isLight ? 'Light' : 'Dark'}
                        </span>
                        {selected && (
                          <span className="w-5 h-5 rounded-full bg-white text-slate-900 flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold truncate">{preset.name}</p>
                    </button>
                  );
                })}
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Solid Colors & Curated Wallpapers
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {DM_THEME_PRESETS.filter(
                    (t) => t.category === 'solid' || t.category === 'wallpaper'
                  ).map((preset) => {
                    const selected = draftBgMode === 'theme' && draftThemeId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setDraftThemeId(preset.id);
                          setDraftBgMode('theme');
                          setDraftMoodId('');
                        }}
                        className={`p-2.5 rounded-2xl border text-left flex items-center gap-2.5 ${
                          selected
                            ? 'border-fuchsia-500 bg-fuchsia-500/10'
                            : 'border-slate-200 dark:border-white/10'
                        }`}
                      >
                        <span
                          style={{ background: preset.previewGradient }}
                          className="w-8 h-8 rounded-lg border border-white/20 shrink-0"
                        />
                        <span className="text-xs font-semibold truncate">{preset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl mixy-gradient-bg text-white flex items-center justify-center">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Custom Chat Wallpaper</p>
                    <p className="text-xs text-slate-500">
                      Upload your own background image synced to this chat.
                    </p>
                  </div>
                </div>
                <label className="px-4 h-9 rounded-xl mixy-gradient-bg text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                  {uploadingBg ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {uploadingBg ? 'Uploading...' : 'Upload Image'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleUploadWallpaper(e)}
                  />
                </label>
              </div>
            </div>
          )}

          {tab === 'moods' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose a MIXY Mood Theme to transform colors and ambient particles for this chat.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {DM_MOOD_PRESETS.map((mood) => {
                  const selected = draftBgMode === 'mood' && draftMoodId === mood.id;
                  return (
                    <button
                      key={mood.id}
                      type="button"
                      onClick={() => {
                        setDraftMoodId(mood.id);
                        setDraftBgMode('mood');
                      }}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        selected
                          ? 'border-fuchsia-500 bg-fuchsia-500/10 ring-1 ring-fuchsia-500'
                          : 'border-slate-200 dark:border-white/10 hover:border-fuchsia-400/50'
                      }`}
                    >
                      <div
                        style={{ background: mood.backgroundCss }}
                        className="h-14 rounded-xl mb-2.5 flex items-center justify-between px-3"
                      >
                        <span className="text-2xl">{mood.emoji}</span>
                        <span className="text-xl">{mood.particleEmoji}</span>
                      </div>
                      <p className="text-sm font-bold">{mood.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{mood.tagline}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'fonts' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Chat Font Family
                </h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  {DM_FONT_OPTIONS.map((font) => (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => setDraftFont(font.id)}
                      className={`p-3 rounded-xl border text-left flex items-center justify-between ${
                        draftFont === font.id
                          ? 'border-fuchsia-500 bg-fuchsia-500/10'
                          : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                      }`}
                    >
                      <div>
                        <p className="text-xs font-semibold">{font.label}</p>
                        <p
                          className="text-sm text-slate-600 dark:text-slate-300 mt-0.5"
                          style={{ fontFamily: font.cssFamily }}
                        >
                          {font.sample}
                        </p>
                      </div>
                      {draftFont === font.id && <Check className="w-4 h-4 text-fuchsia-500" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1.5">Message Text Size</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['sm', 'md', 'lg', 'xl'] as DmTextSize[]).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setDraftTextSize(sz)}
                        className={`h-9 rounded-xl border text-xs font-semibold uppercase ${
                          draftTextSize === sz
                            ? 'mixy-gradient-bg text-white border-transparent'
                            : 'border-slate-200 dark:border-white/15'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1.5">Bubble Size</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['compact', 'cozy', 'spacious'] as DmBubbleSize[]).map((bs) => (
                      <button
                        key={bs}
                        type="button"
                        onClick={() => setDraftBubbleSize(bs)}
                        className={`h-9 rounded-xl border text-xs font-semibold capitalize ${
                          draftBubbleSize === bs
                            ? 'mixy-gradient-bg text-white border-transparent'
                            : 'border-slate-200 dark:border-white/15'
                        }`}
                      >
                        {bs}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1.5">Bubble Corner Radius</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['sharp', 'rounded', 'pill'] as DmCornerRadius[]).map((rad) => (
                      <button
                        key={rad}
                        type="button"
                        onClick={() => setDraftRadius(rad)}
                        className={`h-9 rounded-xl border text-xs font-semibold capitalize ${
                          draftRadius === rad
                            ? 'mixy-gradient-bg text-white border-transparent'
                            : 'border-slate-200 dark:border-white/15'
                        }`}
                      >
                        {rad}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1.5">Text Appearance</label>
                  <select
                    value={draftAppearance}
                    onChange={(e) => setDraftAppearance(e.target.value as DmTextAppearance)}
                    className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold"
                  >
                    {Object.entries(DM_APPEARANCE_CLASSES).map(([k, v]) => (
                      <option key={k} value={k} className="bg-white dark:bg-[#11111B]">
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold">MIXY Bubble Chat Mode</p>
                    <p className="text-xs text-slate-500">
                      Render messages as translucent floating glass droplets.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={draftBubbleMode}
                    onChange={(e) => setDraftBubbleMode(e.target.checked)}
                    className="w-5 h-5 accent-fuchsia-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold">Chat Animations & Special Effects</p>
                    <p className="text-xs text-slate-500">
                      Enable floating hearts, sparkles, confetti & animated gradients.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={draftEffects}
                    onChange={(e) => setDraftEffects(e.target.checked)}
                    className="w-5 h-5 accent-fuchsia-500"
                  />
                </label>
              </div>
            </div>
          )}

          {tab === 'privacy' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold mb-1.5">
                  Disappearing Messages Timer (Synced)
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {DM_DISAPPEARING_OPTIONS.map((opt) => (
                    <button
                      key={opt.seconds}
                      type="button"
                      onClick={() => setDraftDisappearing(opt.seconds)}
                      className={`h-9 rounded-xl border text-xs font-semibold ${
                        draftDisappearing === opt.seconds
                          ? 'mixy-gradient-bg text-white border-transparent'
                          : 'border-slate-200 dark:border-white/15'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold">Read Receipts</p>
                    <p className="text-xs text-slate-500">Show checkmarks when you read messages.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={draftReadReceipts}
                    onChange={(e) => setDraftReadReceipts(e.target.checked)}
                    className="w-5 h-5 accent-fuchsia-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold">Online Status</p>
                    <p className="text-xs text-slate-500">Let people see when you are active now.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={draftShowOnline}
                    onChange={(e) => setDraftShowOnline(e.target.checked)}
                    className="w-5 h-5 accent-fuchsia-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold">Typing Indicator Visibility</p>
                    <p className="text-xs text-slate-500">
                      Broadcast when you are typing in a chat.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={draftShowTyping}
                    onChange={(e) => setDraftShowTyping(e.target.checked)}
                    className="w-5 h-5 accent-fuchsia-500"
                  />
                </label>

                <div>
                  <label className="block text-xs font-bold mb-1">Who Can Message Me</label>
                  <select
                    value={draftWhoCanMessage}
                    onChange={(e) => setDraftWhoCanMessage(e.target.value as DmWhoCanMessage)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  >
                    <option value="everyone" className="bg-white dark:bg-[#11111B]">Everyone</option>
                    <option value="followers" className="bg-white dark:bg-[#11111B]">People I follow</option>
                    <option value="nobody" className="bg-white dark:bg-[#11111B]">No one (Requests disabled)</option>
                  </select>
                </div>
              </div>

              {otherUser && (
                <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex flex-wrap gap-2">
                  {onRestrictUser && (
                    <button
                      type="button"
                      onClick={() => void onRestrictUser(otherUser.uid)}
                      className="px-3.5 h-9 rounded-xl border border-amber-500/40 text-amber-500 text-xs font-semibold hover:bg-amber-500/10"
                    >
                      {isRestricted ? 'Unrestrict' : 'Restrict'} @{otherUser.username}
                    </button>
                  )}
                  {onBlockUser && (
                    <button
                      type="button"
                      onClick={() => void onBlockUser(otherUser.uid)}
                      className="px-3.5 h-9 rounded-xl border border-rose-500/40 text-rose-500 text-xs font-semibold hover:bg-rose-500/10"
                    >
                      Block User
                    </button>
                  )}
                  {onReportUser && (
                    <button
                      type="button"
                      onClick={() => {
                        onReportUser(otherUser.uid);
                        onClose();
                      }}
                      className="px-3.5 h-9 rounded-xl bg-rose-600/15 text-rose-500 text-xs font-semibold hover:bg-rose-600/25"
                    >
                      Report Conversation
                    </button>
                  )}
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/5 text-xs text-slate-600 dark:text-slate-300">
                <strong>Screenshot Privacy Note:</strong> Web browsers cannot block or reliably detect OS-level screenshots. Enable Disappearing Messages or Unsend anytime to keep sensitive chats private.
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-emerald-500">{statusNote}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 h-10 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleApplyAll()}
              disabled={saving}
              className="px-5 h-10 rounded-xl mixy-gradient-bg text-white text-xs font-semibold flex items-center gap-1.5"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Apply & Sync
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
