import React, { useEffect, useMemo, useState } from 'react';
import { playStarTwinkleChime } from '../lib/soundEffects';

interface StarPoint {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
}

const STAR_COLORS = ['#fbbf24', '#ffffff', '#e879f9', '#a78bfa', '#38bdf8'];

export function SettingsStarIntro({
  animEnabled = true,
  soundEnabled = true,
}: {
  animEnabled?: boolean;
  soundEnabled?: boolean;
}) {
  const [visible, setVisible] = useState(() => {
    if (!animEnabled) return false;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
    return true;
  });
  const [fading, setFading] = useState(false);

  const stars = useMemo<StarPoint[]>(() => {
    return Array.from({ length: 34 }, (_, idx) => ({
      id: idx,
      x: Math.round(((idx * 37 + 13) % 96) + 2),
      y: Math.round(((idx * 53 + 7) % 88) + 4),
      size: (idx % 3) + 2,
      delay: (idx % 7) * 0.09,
      duration: 0.9 + (idx % 4) * 0.25,
      color: STAR_COLORS[idx % STAR_COLORS.length],
    }));
  }, []);

  useEffect(() => {
    if (soundEnabled) {
      playStarTwinkleChime();
    }
    if (!visible) return;
    const fadeTimer = window.setTimeout(() => setFading(true), 1250);
    const doneTimer = window.setTimeout(() => setVisible(false), 1850);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [soundEnabled, visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-40 pointer-events-none overflow-hidden transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Subtle cosmic radial wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(65% 55% at 50% 25%, rgba(168, 85, 247, 0.20), rgba(251, 191, 36, 0.08) 45%, transparent 78%)',
        }}
      />

      {/* Twinkling stars */}
      {stars.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full mixy-star-twinkle"
          style={
            {
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: `${s.size * 2}px`,
              height: `${s.size * 2}px`,
              backgroundColor: s.color,
              boxShadow: `0 0 ${s.size * 4}px ${s.color}`,
              animationDelay: `${s.delay}s`,
              '--star-dur': `${s.duration}s`,
            } as React.CSSProperties
          }
        />
      ))}

      {/* Shooting stars */}
      {[12, 34, 58].map((topPct, i) => (
        <div
          key={topPct}
          className="absolute h-[2px] w-24 rounded-full mixy-shooting-star"
          style={{
            top: `${topPct}%`,
            left: '6%',
            background: 'linear-gradient(90deg, transparent, #fbbf24, #ffffff)',
            boxShadow: '0 0 12px rgba(251, 191, 36, 0.75)',
            animationDelay: `${i * 0.22}s`,
          }}
        />
      ))}
    </div>
  );
}
