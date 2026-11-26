import React from 'react';
import { Coffee, Moon, Sparkles, Sun, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function SleepingMoonBanner() {
  const {
    userPrivate,
    isSleeping,
    wakeUpSleepMode,
    enableSleepMode,
    dailyUsageMinutes,
    screenTimeAlertDue,
    dismissScreenTimeAlert,
  } = useAuth();

  return (
    <>
      {isSleeping && (
        <div className="mb-4 rounded-2xl border border-indigo-200 dark:border-indigo-500/25 bg-indigo-50/90 dark:bg-indigo-950/35 px-4 py-3 flex items-center justify-between gap-3 mixy-card-shadow">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
              <Moon className="w-5 h-5 mixy-moon-float" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-1.5">
                Currently resting – Notifications paused
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              </p>
              <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 truncate">
                Online status is hidden. Priority contacts can still reach you.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void wakeUpSleepMode()}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-white/10 border border-indigo-200 dark:border-white/15 text-xs font-semibold text-indigo-700 dark:text-white hover:bg-indigo-100 dark:hover:bg-white/20 flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors"
          >
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            Wake Up
          </button>
        </div>
      )}

      {screenTimeAlertDue && !isSleeping && (
        <div className="mb-4 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3 mixy-card-shadow">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Coffee className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-amber-950 dark:text-amber-100">
                Mindful break check-in ({dailyUsageMinutes}m today)
              </p>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-200/80">
                You reached your daily wellness reminder threshold. Rest your eyes or switch to Sleep Mode.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                dismissScreenTimeAlert();
                void enableSleepMode();
              }}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500"
            >
              Sleep Mode
            </button>
            <button
              type="button"
              onClick={dismissScreenTimeAlert}
              className="p-1.5 rounded-lg text-amber-700 dark:text-amber-200 hover:bg-amber-200/50 dark:hover:bg-white/10"
              aria-label="Dismiss break reminder"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Optional Focus Lock Modal when user explicitly enabled sleepFocusLock */}
      {isSleeping && userPrivate?.sleepFocusLock && (
        <div className="fixed inset-0 z-[55] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#121222] border border-slate-200 dark:border-white/10 p-6 text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/15 text-indigo-500 flex items-center justify-center">
              <Moon className="w-8 h-8 mixy-moon-float" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Sleep Mode Focus Lock
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                Currently resting – Notifications are paused and your active status is hidden so you can recharge.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void wakeUpSleepMode()}
              className="w-full h-11 rounded-xl mixy-gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Sun className="w-4 h-4" />
              Wake Up & Unlock MIXY
            </button>
          </div>
        </div>
      )}
    </>
  );
}
