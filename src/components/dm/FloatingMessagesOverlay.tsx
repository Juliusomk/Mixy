import React, { useEffect, useRef, useState } from 'react';

interface BubbleSpec {
  id: number;
  leftPct: number;
  sizePx: number;
  durationSec: number;
  delaySec: number;
  driftPx: number;
  tint: string;
}

const TINTS = [
  'rgba(236, 72, 153, 0.25)',
  'rgba(56, 189, 248, 0.24)',
  'rgba(168, 85, 247, 0.24)',
  'rgba(255, 255, 255, 0.22)',
  'rgba(244, 114, 182, 0.22)',
];

function createBubbleBatch(batchSeed: number, count = 16): BubbleSpec[] {
  return Array.from({ length: count }, (_, idx) => {
    const r1 = Math.sin(batchSeed * 17 + idx * 31) * 0.5 + 0.5;
    const r2 = Math.cos(batchSeed * 13 + idx * 19) * 0.5 + 0.5;
    const r3 = Math.sin(batchSeed * 29 + idx * 7) * 0.5 + 0.5;
    return {
      id: batchSeed * 100 + idx,
      leftPct: 6 + r1 * 86,
      sizePx: 28 + Math.round(r2 * 44),
      durationSec: 4.6 + r3 * 3.2,
      delaySec: idx * 0.14,
      driftPx: Math.round((r1 - 0.5) * 64),
      tint: TINTS[idx % TINTS.length],
    };
  });
}

export function FloatingMessagesOverlay({
  burstTrigger,
  activeHint,
  onSwipeRestore,
  onOpenInbox,
  onDismissHint,
}: {
  burstTrigger: number;
  activeHint: boolean;
  onSwipeRestore: () => void;
  onOpenInbox: () => void;
  onDismissHint: () => void;
}) {
  const [bubbles, setBubbles] = useState<BubbleSpec[]>([]);
  const [poppedIds, setPoppedIds] = useState<Set<number>>(new Set());
  const touchStartY = useRef<number | null>(null);
  const lastSwipeRestoreRef = useRef<number>(0);

  // Trigger bubble burst when burstTrigger increments
  useEffect(() => {
    if (burstTrigger <= 0) return;
    setPoppedIds(new Set());
    const nextBatch = createBubbleBatch(burstTrigger, 18);
    setBubbles(nextBatch);
    const timer = window.setTimeout(() => {
      setBubbles([]);
    }, 8200);
    return () => clearTimeout(timer);
  }, [burstTrigger]);

  // Swipe-down gesture to restore rising bubbles naturally when pulled down at top
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartY.current = e.touches[0].clientY;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY.current === null || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (dy > 95 && window.scrollY <= 8) {
        const now = Date.now();
        if (now - lastSwipeRestoreRef.current > 2400) {
          lastSwipeRestoreRef.current = now;
          onSwipeRestore();
        }
        touchStartY.current = null;
      }
    };
    const onTouchEnd = () => {
      touchStartY.current = null;
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [onSwipeRestore]);

  if (bubbles.length === 0 && !activeHint) return null;

  return (
    <>
      {/* Non-blocking floating water bubble layer */}
      {bubbles.length > 0 && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30 pointer-events-none overflow-hidden select-none"
        >
          {bubbles.map((b) => {
            if (poppedIds.has(b.id)) return null;
            return (
              <div
                key={b.id}
                onClick={() => {
                  setPoppedIds((prev) => new Set(prev).add(b.id));
                }}
                style={{
                  left: `${b.leftPct}%`,
                  bottom: '-60px',
                  width: `${b.sizePx}px`,
                  height: `${b.sizePx}px`,
                  animation: `mixyBubbleFloat ${b.durationSec}s cubic-bezier(0.22, 1, 0.36, 1) ${b.delaySec}s forwards`,
                  ['--bubble-drift' as string]: `${b.driftPx}px`,
                  boxShadow: `inset 0 2px 12px rgba(255,255,255,0.75), inset 0 -6px 14px ${b.tint}, 0 8px 26px ${b.tint}`,
                }}
                className="absolute rounded-full mixy-bubble-water pointer-events-auto cursor-pointer transition-transform active:scale-125"
              >
                {/* Specular water droplet crescent reflection */}
                <span
                  className="absolute top-[16%] left-[20%] w-[30%] h-[18%] rounded-full bg-white/75 blur-[0.5px] -rotate-25"
                />
                <span
                  className="absolute bottom-[18%] right-[20%] w-[14%] h-[14%] rounded-full bg-white/50"
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Compact non-obstructive prompt pill after first Messages tap */}
      {activeHint && (
        <div className="fixed bottom-20 lg:bottom-6 right-4 z-40 flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#12121E]/90 backdrop-blur-xl border border-white/15 shadow-2xl text-white text-xs animate-in fade-in">
          <span className="text-slate-200">Tap Messages again or</span>
          <button
            type="button"
            onClick={onOpenInbox}
            className="px-2.5 py-1 rounded-lg mixy-gradient-bg font-semibold text-white hover:opacity-90"
          >
            Open Inbox
          </button>
          <button
            type="button"
            onClick={onDismissHint}
            aria-label="Dismiss bubble prompt"
            className="text-slate-400 hover:text-white px-1"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
