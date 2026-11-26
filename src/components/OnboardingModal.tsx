import React, { useState } from 'react';
import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  MessageCircle,
  Sparkles,
  X,
} from 'lucide-react';
import { triggerHaptic } from '../lib/haptics';

const ONBOARDING_STORAGE_PREFIX = 'mixy_onboarding_done_v1_';

export function hasCompletedOnboarding(uid?: string | null): boolean {
  if (!uid) return true;
  try {
    return localStorage.getItem(`${ONBOARDING_STORAGE_PREFIX}${uid}`) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingCompleted(uid?: string | null): void {
  if (!uid) return;
  try {
    localStorage.setItem(`${ONBOARDING_STORAGE_PREFIX}${uid}`, '1');
  } catch {
    // ignore storage errors
  }
}

const TOUR_STEPS = [
  {
    title: 'Welcome to MIXY',
    subtitle: 'Your vibrant space for posts, vertical Reels, 24h Stories, and Moments.',
    description:
      'Double-tap any photo or video to send a quick heart, explore trending hashtags, and follow creators you love.',
    icon: Sparkles,
    badge: 'Feed & Moments',
    accent: 'from-fuchsia-500 to-purple-600',
  },
  {
    title: 'Smart Discover & Collections',
    subtitle: 'Curate what inspires you and organize everything you save.',
    description:
      'Pick topic interests in Explore to tune your feed, bookmark posts or Reels, and sort saved gems into custom Collections on your profile.',
    icon: Compass,
    badge: 'Explore & Save',
    accent: 'from-sky-500 to-indigo-600',
  },
  {
    title: 'Expressive Direct Messages',
    subtitle: 'Custom chat themes, floating bubbles, voice notes, and calls.',
    description:
      'Customize conversation backgrounds synced with your friends, drop voice notes with instant transcripts, or hop onto a voice/video call.',
    icon: MessageCircle,
    badge: 'Real-Time DMs',
    accent: 'from-emerald-500 to-teal-600',
  },
  {
    title: 'Meet Julius AI Studio',
    subtitle: 'Your built-in creative writing and MIXY social assistant.',
    description:
      'Brainstorm captions, hashtags, Reel scripts, or profile bios, speak hands-free with voice input, and listen to spoken replies anytime.',
    icon: Bot,
    badge: 'Julius AI',
    accent: 'from-amber-500 to-rose-600',
  },
];

export function OnboardingModal({
  open,
  uid,
  onClose,
}: {
  open: boolean;
  uid?: string | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);

  if (!open) return null;

  const current = TOUR_STEPS[step];
  const Icon = current.icon;
  const isLast = step === TOUR_STEPS.length - 1;

  const finish = () => {
    triggerHaptic('success');
    markOnboardingCompleted(uid);
    setStep(0);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="MIXY welcome tour"
    >
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#11111B] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden mixy-view-enter">
        {/* Top Visual Banner */}
        <div
          className={`relative px-6 pt-8 pb-7 text-white bg-gradient-to-br ${current.accent}`}
        >
          <button
            type="button"
            onClick={finish}
            aria-label="Dismiss tour"
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/25 hover:bg-black/40 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-[11px] font-bold uppercase tracking-wide mb-4">
            <Icon className="w-3.5 h-3.5" />
            <span>{current.badge}</span>
          </div>

          <h2 className="text-2xl font-extrabold tracking-tight">{current.title}</h2>
          <p className="text-sm text-white/90 mt-1">{current.subtitle}</p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {current.description}
          </p>

          {/* Step Indicators */}
          <div className="flex items-center justify-center gap-2">
            {TOUR_STEPS.map((s, idx) => (
              <button
                key={s.title}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setStep(idx);
                }}
                aria-label={`Go to step ${idx + 1}`}
                className={`h-2 rounded-full transition-all ${
                  idx === step
                    ? 'w-7 mixy-gradient-bg'
                    : 'w-2 bg-slate-300 dark:bg-white/20 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setStep((s) => Math.max(0, s - 1));
                }}
                className="px-4 h-11 rounded-xl border border-slate-200 dark:border-white/15 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                className="px-4 h-11 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
              >
                Skip tour
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (isLast) {
                  finish();
                } else {
                  triggerHaptic('light');
                  setStep((s) => s + 1);
                }
              }}
              className="px-5 h-11 rounded-xl mixy-gradient-bg text-white text-sm font-semibold inline-flex items-center gap-1.5 shadow-lg shadow-fuchsia-500/20"
            >
              {isLast ? (
                <>
                  <Check className="w-4 h-4" /> Get Started
                </>
              ) : (
                <>
                  Next <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
