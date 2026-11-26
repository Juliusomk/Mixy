const rawBase =
  (typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL) ||
  '';

export const API_BASE_URL = rawBase.trim().replace(/\/+$/, '');

export function isNativeCapacitor(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  };
  try {
    if (win.Capacitor?.isNativePlatform?.()) return true;
  } catch {
    // ignore
  }
  return window.location.protocol === 'capacitor:';
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalized}` : normalized;
}

export function mediaUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/api/media/') && API_BASE_URL) {
    return `${API_BASE_URL}${trimmed}`;
  }
  return trimmed;
}

export function wsUrl(path = '/ws'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE_URL) {
    if (API_BASE_URL.startsWith('https://')) {
      return `wss://${API_BASE_URL.slice('https://'.length)}${normalized}`;
    }
    if (API_BASE_URL.startsWith('http://')) {
      return `ws://${API_BASE_URL.slice('http://'.length)}${normalized}`;
    }
  }
  if (typeof window === 'undefined') return normalized;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${normalized}`;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}
