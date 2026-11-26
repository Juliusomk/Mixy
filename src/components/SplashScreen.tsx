import React from 'react';
import { MixyLogo } from './MixyLogo';

export function SplashScreen({
  ready,
  onSkip,
}: {
  ready?: boolean;
  onSkip?: () => void;
}) {
  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#07070D] text-white transition-opacity duration-300 ${
        ready ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label="Loading MIXY"
    >
      {/* Ambient gradient glow */}
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          background:
            'radial-gradient(circle at 30% 25%, rgba(217, 70, 239, 0.22), transparent 52%), radial-gradient(circle at 75% 70%, rgba(56, 189, 248, 0.2), transparent 55%)',
        }}
      />

      <div className="relative flex flex-col items-center gap-5 px-6 text-center mixy-splash-float">
        <div className="p-4 rounded-3xl bg-white/[0.04] border border-white/10 shadow-2xl shadow-fuchsia-500/20">
          <MixyLogo size="lg" />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-fuchsia-300/90">
            Create · Connect · Remix
          </p>
          <p className="text-xs text-slate-400">
            Preparing your social universe...
          </p>
        </div>

        <div className="w-36 h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full w-1/2 rounded-full mixy-gradient-bg mixy-splash-bar" />
        </div>

        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="mt-2 text-[11px] text-slate-400 hover:text-white underline-offset-4 hover:underline"
          >
            Enter now
          </button>
        )}
      </div>
    </div>
  );
}
