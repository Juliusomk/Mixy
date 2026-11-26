import type {
  DmBubbleSize,
  DmCornerRadius,
  DmFontFamily,
  DmMessageEffect,
  DmTextAppearance,
  DmTextSize,
} from '../types/mixy';
import { mediaUrl } from './api';

export interface DmThemePreset {
  id: string;
  name: string;
  category: 'theme_store' | 'solid' | 'gradient' | 'animated' | 'wallpaper';
  isLight: boolean;
  isAnimated?: boolean;
  backgroundCss: string;
  previewGradient: string;
  mineBubbleBg: string;
  mineBubbleText: string;
  otherBubbleBg: string;
  otherBubbleText: string;
  accentHex: string;
  headerSurface: string;
}

export interface DmMoodPreset {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  backgroundCss: string;
  isAnimated?: boolean;
  isLight?: boolean;
  mineBubbleBg: string;
  mineBubbleText: string;
  otherBubbleBg: string;
  otherBubbleText: string;
  accentHex: string;
  particleEmoji: string;
}

export const DM_THEME_PRESETS: DmThemePreset[] = [
  {
    id: 'default',
    name: 'MIXY Aurora (Default)',
    category: 'theme_store',
    isLight: false,
    backgroundCss:
      'radial-gradient(60% 55% at 15% 15%, rgba(236, 72, 153, 0.22), transparent 65%), radial-gradient(55% 60% at 88% 20%, rgba(56, 189, 248, 0.18), transparent 65%), radial-gradient(65% 55% at 50% 95%, rgba(245, 158, 11, 0.14), transparent 70%), #090912',
    previewGradient: 'linear-gradient(135deg, #ec4899, #6366f1)',
    mineBubbleBg: 'linear-gradient(135deg, #ec4899, #7c3aed)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: 'rgba(26, 26, 40, 0.92)',
    otherBubbleText: '#f8fafc',
    accentHex: '#d946ef',
    headerSurface: 'rgba(13, 13, 24, 0.85)',
  },
  {
    id: 'ocean_blue',
    name: 'Ocean Blue',
    category: 'theme_store',
    isLight: false,
    isAnimated: true,
    backgroundCss:
      'linear-gradient(135deg, #06182e 0%, #0a3b5c 45%, #075985 75%, #082f49 100%)',
    previewGradient: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
    mineBubbleBg: 'linear-gradient(135deg, #06b6d4, #2563eb)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: 'rgba(12, 42, 68, 0.86)',
    otherBubbleText: '#e0f2fe',
    accentHex: '#38bdf8',
    headerSurface: 'rgba(6, 24, 46, 0.88)',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    category: 'theme_store',
    isLight: false,
    isAnimated: true,
    backgroundCss:
      'linear-gradient(135deg, #2d1238 0%, #7c2d12 45%, #be185d 80%, #4c1d95 100%)',
    previewGradient: 'linear-gradient(135deg, #f97316, #db2777)',
    mineBubbleBg: 'linear-gradient(135deg, #f59e0b, #e11d48)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: 'rgba(46, 20, 42, 0.88)',
    otherBubbleText: '#fff1f2',
    accentHex: '#fb923c',
    headerSurface: 'rgba(38, 15, 38, 0.88)',
  },
  {
    id: 'purple_galaxy',
    name: 'Purple Galaxy',
    category: 'theme_store',
    isLight: false,
    isAnimated: true,
    backgroundCss:
      'radial-gradient(circle at 20% 20%, rgba(168, 85, 247, 0.35), transparent 50%), radial-gradient(circle at 80% 75%, rgba(59, 130, 246, 0.3), transparent 50%), linear-gradient(135deg, #0d061f 0%, #1e1142 50%, #090518 100%)',
    previewGradient: 'linear-gradient(135deg, #9333ea, #3b82f6)',
    mineBubbleBg: 'linear-gradient(135deg, #a855f7, #6366f1)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: 'rgba(30, 17, 66, 0.9)',
    otherBubbleText: '#f3e8ff',
    accentHex: '#c084fc',
    headerSurface: 'rgba(13, 6, 31, 0.88)',
  },
  {
    id: 'neon_dreams',
    name: 'Neon Dreams',
    category: 'theme_store',
    isLight: false,
    isAnimated: true,
    backgroundCss:
      'linear-gradient(135deg, #070514 0%, #240b36 40%, #0b2447 75%, #070514 100%)',
    previewGradient: 'linear-gradient(135deg, #f43f5e, #06b6d4)',
    mineBubbleBg: 'linear-gradient(135deg, #ff0080, #7928ca)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: 'rgba(15, 23, 42, 0.9)',
    otherBubbleText: '#e2e8f0',
    accentHex: '#22d3ee',
    headerSurface: 'rgba(7, 5, 20, 0.9)',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    category: 'theme_store',
    isLight: false,
    backgroundCss:
      'radial-gradient(ellipse at top, #172554 0%, #050816 70%)',
    previewGradient: 'linear-gradient(135deg, #1e293b, #0f172a)',
    mineBubbleBg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: 'rgba(15, 23, 42, 0.92)',
    otherBubbleText: '#f1f5f9',
    accentHex: '#60a5fa',
    headerSurface: 'rgba(5, 8, 22, 0.92)',
  },
  {
    id: 'rose_gold',
    name: 'Rose Gold',
    category: 'theme_store',
    isLight: true,
    backgroundCss:
      'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 50%, #fef3c7 100%)',
    previewGradient: 'linear-gradient(135deg, #fb7185, #f59e0b)',
    mineBubbleBg: 'linear-gradient(135deg, #e11d48, #d97706)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: 'rgba(255, 255, 255, 0.92)',
    otherBubbleText: '#1f2937',
    accentHex: '#e11d48',
    headerSurface: 'rgba(255, 241, 242, 0.92)',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    category: 'theme_store',
    isLight: false,
    backgroundCss:
      'linear-gradient(135deg, #022c22 0%, #064e3b 50%, #0f172a 100%)',
    previewGradient: 'linear-gradient(135deg, #10b981, #0d9488)',
    mineBubbleBg: 'linear-gradient(135deg, #10b981, #059669)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: 'rgba(6, 78, 59, 0.78)',
    otherBubbleText: '#ecfdf5',
    accentHex: '#34d399',
    headerSurface: 'rgba(2, 44, 34, 0.9)',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    category: 'theme_store',
    isLight: false,
    isAnimated: true,
    backgroundCss:
      'linear-gradient(125deg, #064e3b 0%, #1e1b4b 38%, #701a75 72%, #0c4a6e 100%)',
    previewGradient: 'linear-gradient(135deg, #34d399, #a855f7, #38bdf8)',
    mineBubbleBg: 'linear-gradient(135deg, #06b6d4, #a855f7)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: 'rgba(17, 24, 39, 0.84)',
    otherBubbleText: '#f8fafc',
    accentHex: '#2dd4bf',
    headerSurface: 'rgba(15, 23, 42, 0.85)',
  },
  {
    id: 'glass',
    name: 'Glass',
    category: 'theme_store',
    isLight: false,
    backgroundCss:
      'radial-gradient(circle at 18% 20%, rgba(255,255,255,0.14), transparent 45%), radial-gradient(circle at 82% 80%, rgba(236,72,153,0.18), transparent 45%), linear-gradient(145deg, #111827, #1f2937)',
    previewGradient: 'linear-gradient(135deg, #64748b, #cbd5e1)',
    mineBubbleBg: 'rgba(255, 255, 255, 0.22)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: 'rgba(255, 255, 255, 0.1)',
    otherBubbleText: '#f1f5f9',
    accentHex: '#e2e8f0',
    headerSurface: 'rgba(17, 24, 39, 0.72)',
  },
  {
    id: 'minimal_white',
    name: 'Minimal White',
    category: 'theme_store',
    isLight: true,
    backgroundCss: '#f8fafc',
    previewGradient: 'linear-gradient(135deg, #f8fafc, #cbd5e1)',
    mineBubbleBg: '#0f172a',
    mineBubbleText: '#ffffff',
    otherBubbleBg: '#ffffff',
    otherBubbleText: '#0f172a',
    accentHex: '#0f172a',
    headerSurface: 'rgba(255, 255, 255, 0.94)',
  },
  {
    id: 'dark_luxury',
    name: 'Dark Luxury',
    category: 'theme_store',
    isLight: false,
    backgroundCss:
      'radial-gradient(circle at 50% 0%, rgba(217, 119, 6, 0.16), transparent 55%), #070709',
    previewGradient: 'linear-gradient(135deg, #1c1917, #d97706)',
    mineBubbleBg: 'linear-gradient(135deg, #b45309, #d97706)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: '#18181b',
    otherBubbleText: '#fef3c7',
    accentHex: '#fbbf24',
    headerSurface: 'rgba(7, 7, 9, 0.92)',
  },
  // Curated Aesthetic Wallpapers (procedural SVG/CSS patterns, zero external domains)
  {
    id: 'wall_cosmos',
    name: 'Starlight Silk',
    category: 'wallpaper',
    isLight: false,
    backgroundCss:
      'radial-gradient(1.5px 1.5px at 20% 30%, #ffffff 100%, transparent), radial-gradient(1.5px 1.5px at 72% 18%, #f0abfc 100%, transparent), radial-gradient(2px 2px at 45% 65%, #38bdf8 100%, transparent), radial-gradient(1.5px 1.5px at 84% 78%, #ffffff 100%, transparent), linear-gradient(160deg, #060414 0%, #1a0b2e 55%, #0a192f 100%)',
    previewGradient: 'linear-gradient(135deg, #1a0b2e, #0a192f)',
    mineBubbleBg: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: 'rgba(22, 16, 48, 0.88)',
    otherBubbleText: '#f8fafc',
    accentHex: '#e879f9',
    headerSurface: 'rgba(10, 6, 26, 0.88)',
  },
  {
    id: 'wall_linen',
    name: 'Warm Cream Paper',
    category: 'wallpaper',
    isLight: true,
    backgroundCss:
      'repeating-linear-gradient(45deg, rgba(180,83,9,0.025) 0 2px, transparent 2px 10px), linear-gradient(180deg, #fefaf4 0%, #f5efe6 100%)',
    previewGradient: 'linear-gradient(135deg, #fefaf4, #e7dac8)',
    mineBubbleBg: 'linear-gradient(135deg, #7c2d12, #b45309)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: '#ffffff',
    otherBubbleText: '#292524',
    accentHex: '#b45309',
    headerSurface: 'rgba(254, 250, 244, 0.92)',
  },
  // Solid Presets
  {
    id: 'solid_obsidian',
    name: 'Pure Obsidian',
    category: 'solid',
    isLight: false,
    backgroundCss: '#06060a',
    previewGradient: '#06060a',
    mineBubbleBg: 'linear-gradient(135deg, #ec4899, #6366f1)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: '#161622',
    otherBubbleText: '#f8fafc',
    accentHex: '#ec4899',
    headerSurface: 'rgba(6, 6, 10, 0.94)',
  },
  {
    id: 'solid_slate',
    name: 'Cool Slate',
    category: 'solid',
    isLight: false,
    backgroundCss: '#0f172a',
    previewGradient: '#0f172a',
    mineBubbleBg: '#0284c7',
    mineBubbleText: '#ffffff',
    otherBubbleBg: '#1e293b',
    otherBubbleText: '#f1f5f9',
    accentHex: '#38bdf8',
    headerSurface: 'rgba(15, 23, 42, 0.94)',
  },
  {
    id: 'solid_blush',
    name: 'Soft Blush',
    category: 'solid',
    isLight: true,
    backgroundCss: '#fdf2f8',
    previewGradient: '#fdf2f8',
    mineBubbleBg: '#db2777',
    mineBubbleText: '#ffffff',
    otherBubbleBg: '#ffffff',
    otherBubbleText: '#1e293b',
    accentHex: '#db2777',
    headerSurface: 'rgba(253, 242, 248, 0.94)',
  },
];

export const DM_MOOD_PRESETS: DmMoodPreset[] = [
  {
    id: 'happy',
    name: 'Happy',
    emoji: '☀️',
    tagline: 'Bright golden optimism',
    backgroundCss: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 45%, #fbcfe8 100%)',
    isAnimated: true,
    isLight: true,
    mineBubbleBg: 'linear-gradient(135deg, #f59e0b, #ec4899)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: 'rgba(255, 255, 255, 0.94)',
    otherBubbleText: '#1f2937',
    accentHex: '#f59e0b',
    particleEmoji: '✨',
  },
  {
    id: 'chill',
    name: 'Chill',
    emoji: '🌊',
    tagline: 'Breezy ocean calm',
    backgroundCss: 'linear-gradient(135deg, #082f49 0%, #164e63 50%, #1e1b4b 100%)',
    isAnimated: true,
    isLight: false,
    mineBubbleBg: 'linear-gradient(135deg, #06b6d4, #0ea5e9)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: 'rgba(15, 48, 72, 0.88)',
    otherBubbleText: '#e0f2fe',
    accentHex: '#22d3ee',
    particleEmoji: '🫧',
  },
  {
    id: 'friendship',
    name: 'Friendship',
    emoji: '💛',
    tagline: 'Warm heart-to-heart vibes',
    backgroundCss: 'linear-gradient(135deg, #3b0764 0%, #831843 50%, #7c2d12 100%)',
    isAnimated: true,
    isLight: false,
    mineBubbleBg: 'linear-gradient(135deg, #fb7185, #f59e0b)',
    mineBubbleText: '#ffffff',
    otherBubbleBg: 'rgba(62, 16, 48, 0.88)',
    otherBubbleText: '#ffe4e6',
    accentHex: '#fb7185',
    particleEmoji: '💖',
  },
  {
    id: 'focus',
    name: 'Focus',
    emoji: '🎯',
    tagline: 'Clean distraction-free flow',
    backgroundCss: 'linear-gradient(180deg, #0b1120 0%, #111827 100%)',
    isAnimated: false,
    isLight: false,
    mineBubbleBg: '#4f46e5',
    mineBubbleText: '#ffffff',
    otherBubbleBg: '#1f2937',
    otherBubbleText: '#f3f4f6',
    accentHex: '#818cf8',
    particleEmoji: '⚡',
  },
  {
    id: 'gaming',
    name: 'Gaming',
    emoji: '🎮',
    tagline: 'High-contrast RGB arena',
    backgroundCss: 'linear-gradient(135deg, #050510 0%, #140b2d 45%, #06282a 100%)',
    isAnimated: true,
    isLight: false,
    mineBubbleBg: 'linear-gradient(135deg, #22c55e, #06b6d4)',
    mineBubbleText: '#050510',
    otherBubbleBg: 'rgba(17, 24, 39, 0.92)',
    otherBubbleText: '#a7f3d0',
    accentHex: '#4ade80',
    particleEmoji: '🕹️',
  },
];

export const DM_FONT_OPTIONS: {
  id: DmFontFamily;
  label: string;
  cssFamily: string;
  sample: string;
}[] = [
  { id: 'modern_sans', label: 'Modern Sans', cssFamily: "'Plus Jakarta Sans', system-ui, sans-serif", sample: 'Clean everyday flow' },
  { id: 'elegant_serif', label: 'Elegant Serif', cssFamily: "'Cormorant Garamond', Georgia, serif", sample: 'Refined editorial grace' },
  { id: 'rounded', label: 'Rounded', cssFamily: "'Fredoka', system-ui, sans-serif", sample: 'Friendly & playful' },
  { id: 'minimal', label: 'Minimal', cssFamily: "'DM Sans', system-ui, sans-serif", sample: 'Crisp geometric lines' },
  { id: 'bold', label: 'Bold', cssFamily: "'Outfit', system-ui, sans-serif", sample: 'Confident & punchy' },
  { id: 'handwritten', label: 'Handwritten', cssFamily: "'Caveat', cursive", sample: 'Warm personal note' },
  { id: 'futuristic', label: 'Futuristic', cssFamily: "'Orbitron', sans-serif", sample: 'MIXY NEO 2099' },
];

export const DM_TEXT_SIZE_CLASSES: Record<DmTextSize, string> = {
  sm: 'text-xs leading-relaxed',
  md: 'text-sm leading-relaxed',
  lg: 'text-base leading-relaxed',
  xl: 'text-lg leading-snug',
};

export const DM_BUBBLE_PADDING_CLASSES: Record<DmBubbleSize, string> = {
  compact: 'px-3 py-1.5',
  cozy: 'px-3.5 py-2.5',
  spacious: 'px-4.5 py-3.5',
};

export const DM_CORNER_RADIUS_MAP: Record<
  DmCornerRadius,
  { mine: string; other: string; label: string }
> = {
  sharp: { mine: 'rounded-lg rounded-br-none', other: 'rounded-lg rounded-bl-none', label: 'Sharp' },
  rounded: { mine: 'rounded-2xl rounded-br-sm', other: 'rounded-2xl rounded-bl-sm', label: 'Rounded' },
  pill: { mine: 'rounded-3xl rounded-br-md', other: 'rounded-3xl rounded-bl-md', label: 'Pill' },
};

export const DM_APPEARANCE_CLASSES: Record<DmTextAppearance, { label: string; className: string }> = {
  clean: { label: 'Clean', className: '' },
  shadow: { label: 'Drop Shadow', className: 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]' },
  soft_glow: { label: 'Soft Glow', className: '[text-shadow:0_0_12px_rgba(255,255,255,0.42)]' },
  high_contrast: { label: 'High Contrast', className: 'font-semibold tracking-tight' },
};

export const DM_EFFECT_OPTIONS: { id: DmMessageEffect; label: string; emoji: string }[] = [
  { id: 'none', label: 'Standard', emoji: '💬' },
  { id: 'hearts', label: 'Hearts', emoji: '💖' },
  { id: 'sparkles', label: 'Sparkles', emoji: '✨' },
  { id: 'confetti', label: 'Confetti', emoji: '🎉' },
  { id: 'bubbles', label: 'Water Bubbles', emoji: '🫧' },
];

export const DM_DISAPPEARING_OPTIONS = [
  { seconds: 0, label: 'Off' },
  { seconds: 60, label: '1 minute' },
  { seconds: 300, label: '5 minutes' },
  { seconds: 86400, label: '24 hours' },
  { seconds: 604800, label: '7 days' },
];

export function resolveConversationStyle(conv?: {
  themeId?: string;
  moodId?: string;
  backgroundMode?: string;
  backgroundValue?: string;
  customBackgroundURL?: string;
} | null) {
  const baseTheme =
    DM_THEME_PRESETS.find((t) => t.id === (conv?.themeId || 'default')) || DM_THEME_PRESETS[0];

  if (conv?.backgroundMode === 'mood' && conv.moodId) {
    const mood = DM_MOOD_PRESETS.find((m) => m.id === conv.moodId);
    if (mood) {
      return {
        isLight: Boolean(mood.isLight),
        isAnimated: Boolean(mood.isAnimated),
        backgroundStyle: { background: mood.backgroundCss } as React.CSSProperties,
        mineBubbleBg: mood.mineBubbleBg,
        mineBubbleText: mood.mineBubbleText,
        otherBubbleBg: mood.otherBubbleBg,
        otherBubbleText: mood.otherBubbleText,
        accentHex: mood.accentHex,
        headerSurface: mood.isLight ? 'rgba(255,255,255,0.88)' : 'rgba(9,9,18,0.84)',
        mood,
        theme: baseTheme,
      };
    }
  }

  if (conv?.backgroundMode === 'image' && conv.customBackgroundURL) {
    const resolvedBg = mediaUrl(conv.customBackgroundURL);
    return {
      isLight: false,
      isAnimated: false,
      backgroundStyle: {
        backgroundImage: `linear-gradient(rgba(8,8,16,0.45), rgba(8,8,16,0.55)), url("${resolvedBg}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } as React.CSSProperties,
      mineBubbleBg: baseTheme.mineBubbleBg,
      mineBubbleText: baseTheme.mineBubbleText,
      otherBubbleBg: 'rgba(15, 15, 28, 0.86)',
      otherBubbleText: '#f8fafc',
      accentHex: baseTheme.accentHex,
      headerSurface: 'rgba(10, 10, 20, 0.85)',
      mood: null,
      theme: baseTheme,
    };
  }

  if (
    (conv?.backgroundMode === 'solid' || conv?.backgroundMode === 'gradient') &&
    conv.backgroundValue
  ) {
    return {
      isLight: baseTheme.isLight,
      isAnimated: conv.backgroundMode === 'gradient',
      backgroundStyle: { background: conv.backgroundValue } as React.CSSProperties,
      mineBubbleBg: baseTheme.mineBubbleBg,
      mineBubbleText: baseTheme.mineBubbleText,
      otherBubbleBg: baseTheme.otherBubbleBg,
      otherBubbleText: baseTheme.otherBubbleText,
      accentHex: baseTheme.accentHex,
      headerSurface: baseTheme.headerSurface,
      mood: null,
      theme: baseTheme,
    };
  }

  return {
    isLight: baseTheme.isLight,
    isAnimated: Boolean(baseTheme.isAnimated),
    backgroundStyle: { background: baseTheme.backgroundCss } as React.CSSProperties,
    mineBubbleBg: baseTheme.mineBubbleBg,
    mineBubbleText: baseTheme.mineBubbleText,
    otherBubbleBg: baseTheme.otherBubbleBg,
    otherBubbleText: baseTheme.otherBubbleText,
    accentHex: baseTheme.accentHex,
    headerSurface: baseTheme.headerSurface,
    mood: null,
    theme: baseTheme,
  };
}
