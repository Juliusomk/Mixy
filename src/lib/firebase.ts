import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration — Firestore client is offline.');
    }
  }
}

// Validation constants synchronized directly with firebase-blueprint.json
export const BLUEPRINT_LIMITS = {
  USERNAME_REGEX: /^[a-zA-Z0-9_.]{3,30}$/,
  USERNAME_LOWER_REGEX: /^[a-z0-9_.]{3,30}$/,
  ID_REGEX: /^[a-zA-Z0-9_-]{1,128}$/,
  DISPLAY_NAME_MAX: 60,
  BIO_MAX: 300,
  WEBSITE_MAX: 200,
  LOCATION_MAX: 80,
  CAPTION_MAX: 2200,
  REEL_CAPTION_MAX: 1000,
  REEL_DESC_MAX: 2000,
  COMMENT_MAX: 1000,
  MESSAGE_TEXT_MAX: 2000,
  JULIUS_PROMPT_MAX: 2000,
  JULIUS_MSG_MAX: 8000,
  NOTE_MAX: 100,
  STORY_TEXT_MAX: 300,
  HASHTAGS_MAX: 30,
  MENTIONS_MAX: 20,
  MEDIA_ITEMS_MAX: 10,
} as const;

export function generateId(prefix = 'mx'): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${raw}`.slice(0, 64);
}

export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[a-zA-Z0-9_]+/g) || [];
  const unique = Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())));
  return unique.slice(0, BLUEPRINT_LIMITS.HASHTAGS_MAX);
}

export function extractMentions(text: string): string[] {
  const matches = text.match(/@[a-zA-Z0-9_.]+/g) || [];
  const unique = Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())));
  return unique.slice(0, BLUEPRINT_LIMITS.MENTIONS_MAX);
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

export function formatRelativeTime(ts: { toDate?: () => Date } | Date | null | undefined): string {
  if (!ts) return 'Just now';
  const date = typeof (ts as { toDate?: () => Date }).toDate === 'function'
    ? (ts as { toDate: () => Date }).toDate()
    : ts instanceof Date
      ? ts
      : new Date();
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
