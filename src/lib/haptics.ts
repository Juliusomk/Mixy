const HAPTICS_KEY = 'mixy_haptics_enabled';
const REDUCED_MOTION_KEY = 'mixy_reduced_motion';

let hapticsEnabled =
  typeof window !== 'undefined' ? localStorage.getItem(HAPTICS_KEY) !== 'false' : true;

export function getHapticsEnabled(): boolean {
  return hapticsEnabled;
}

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(HAPTICS_KEY, enabled ? 'true' : 'false');
    } catch {
      // ignore storage errors
    }
  }
}

export function setReducedMotionPreference(enabled: boolean): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-reduced-motion', enabled ? 'true' : 'false');
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(REDUCED_MOTION_KEY, enabled ? 'true' : 'false');
    } catch {
      // ignore storage errors
    }
  }
}

export function getStoredReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(REDUCED_MOTION_KEY) === 'true';
  } catch {
    return false;
  }
}

export function isReducedMotionActive(): boolean {
  if (typeof document !== 'undefined') {
    if (document.documentElement.getAttribute('data-reduced-motion') === 'true') {
      return true;
    }
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return false;
}

export function triggerHaptic(style: 'light' | 'medium' | 'success' | 'warning' = 'light'): void {
  if (!hapticsEnabled || isReducedMotionActive()) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    const pattern =
      style === 'success'
        ? [10, 30, 14]
        : style === 'warning'
          ? [18, 25, 18]
          : style === 'medium'
            ? 14
            : 8;
    navigator.vibrate(pattern);
  } catch {
    // ignore unsupported browsers
  }
}
