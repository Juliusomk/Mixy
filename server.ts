import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import express from 'express';
import multer from 'multer';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const UPLOAD_DIR = path.resolve(__dirname, 'uploads');
const DATA_DIR = path.resolve(__dirname, 'data');
const USERNAME_INDEX_FILE = path.join(DATA_DIR, 'usernames.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

interface FirebaseConfig {
  projectId: string;
}

function loadFirebaseConfig(): FirebaseConfig {
  const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
  const raw = fs.readFileSync(cfgPath, 'utf8');
  return JSON.parse(raw) as FirebaseConfig;
}

const FIREBASE_CONFIG = loadFirebaseConfig();

// ============================================================================
// FIREBASE ID TOKEN VERIFIER (Google Public X.509 Certs, Zero IAM Required)
// ============================================================================
interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let certCache: CertCache = { certs: {}, expiresAt: 0 };

async function getGoogleCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < certCache.expiresAt && Object.keys(certCache.certs).length > 0) {
    return certCache.certs;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) {
    throw new Error('Failed to fetch Firebase token certificates');
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const match = /max-age=(\d+)/.exec(cacheControl);
  const maxAgeSec = match ? Number(match[1]) : 3600;
  const certs = (await resp.json()) as Record<string, string>;
  certCache = {
    certs,
    expiresAt: now + maxAgeSec * 1000,
  };
  return certs;
}

interface VerifiedTokenPayload {
  uid: string;
  email?: string;
  email_verified?: boolean;
}

function base64UrlDecode(segment: string): Buffer {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedTokenPayload> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported token algorithm');
  }
  const certs = await getGoogleCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error('Unknown token key ID');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const signature = base64UrlDecode(sigB64);
  if (!verifier.verify(cert, signature)) {
    throw new Error('Invalid token signature');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${FIREBASE_CONFIG.projectId}`;
  if (payload.aud !== FIREBASE_CONFIG.projectId) {
    throw new Error('Token audience mismatch');
  }
  if (payload.iss !== expectedIssuer) {
    throw new Error('Token issuer mismatch');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Missing token subject');
  }
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error('Token expired');
  }
  if (!payload.iat || payload.iat > nowSec + 300) {
    throw new Error('Token issued in the future');
  }

  return {
    uid: payload.sub,
    email: payload.email,
    email_verified: payload.email_verified,
  };
}

// ============================================================================
// SERVER-SIDE USERNAME -> EMAIL LOOKUP INDEX (Never exposed as list)
// ============================================================================
interface UsernameRecord {
  uid: string;
  email: string;
}

function readUsernameIndex(): Record<string, UsernameRecord> {
  try {
    if (!fs.existsSync(USERNAME_INDEX_FILE)) return {};
    return JSON.parse(fs.readFileSync(USERNAME_INDEX_FILE, 'utf8')) as Record<string, UsernameRecord>;
  } catch {
    return {};
  }
}

function writeUsernameIndex(index: Record<string, UsernameRecord>): void {
  fs.writeFileSync(USERNAME_INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
}

// Simple per-IP rate limit for username resolution
const lookupRateMap = new Map<string, { count: number; resetAt: number }>();

function checkLookupRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = lookupRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    lookupRateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 25) return false;
  entry.count += 1;
  return true;
}

// ============================================================================
// EXPRESS APP & MIDDLEWARE
// ============================================================================
const ALLOWED_ORIGIN_SET = new Set<string>(
  [
    'capacitor://localhost',
    'http://localhost',
    'https://localhost',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.APP_URL || '',
    ...(process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ]
    .map((o) => o.replace(/\/+$/, ''))
    .filter(Boolean)
);

function isOriginAllowed(origin: string | undefined, hostHeader: string | undefined): boolean {
  if (!origin) return true;
  const cleanOrigin = origin.replace(/\/+$/, '');
  if (ALLOWED_ORIGIN_SET.has(cleanOrigin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin)) return true;
  if (hostHeader && (cleanOrigin === `https://${hostHeader}` || cleanOrigin === `http://${hostHeader}`)) {
    return true;
  }
  return false;
}

const app = express();
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const hostHeader = req.headers['x-forwarded-host']
    ? String(req.headers['x-forwarded-host']).split(',')[0].trim()
    : req.headers.host;

  if (origin && isOriginAllowed(origin, hostHeader)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});
app.use(express.json({ limit: '1mb' }));

interface AuthenticatedRequest extends express.Request {
  authUser?: VerifiedTokenPayload;
}

async function requireAuth(
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization Bearer token' });
    return;
  }
  const token = authHeader.slice(7).trim();
  try {
    req.authUser = await verifyFirebaseIdToken(token);
    next();
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Invalid token' });
  }
}

// ============================================================================
// AUTH USERNAME ENDPOINTS
// ============================================================================
app.post('/api/auth/register-username', requireAuth, (req: AuthenticatedRequest, res) => {
  const { username } = req.body as { username?: unknown };
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
    res.status(400).json({ error: 'Invalid username format' });
    return;
  }
  if (!req.authUser?.email) {
    res.status(400).json({ error: 'Authenticated account has no email' });
    return;
  }
  const key = username.toLowerCase();
  const index = readUsernameIndex();
  const existing = index[key];
  if (existing && existing.uid !== req.authUser.uid) {
    res.status(409).json({ error: 'Username already registered' });
    return;
  }
  // Remove previous username owned by this uid if changed
  for (const [k, v] of Object.entries(index)) {
    if (v.uid === req.authUser.uid && k !== key) {
      delete index[k];
    }
  }
  index[key] = { uid: req.authUser.uid, email: req.authUser.email };
  writeUsernameIndex(index);
  res.json({ ok: true });
});

app.post('/api/auth/resolve-username', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!checkLookupRateLimit(ip)) {
    res.status(429).json({ error: 'Too many requests, please try again shortly.' });
    return;
  }
  const { username } = req.body as { username?: unknown };
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
    res.status(400).json({ error: 'Invalid username' });
    return;
  }
  const index = readUsernameIndex();
  const rec = index[username.toLowerCase()];
  if (!rec) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.json({ email: rec.email });
});

// ============================================================================
// REAL MEDIA STORAGE API (Photos, Videos, Voice Notes with HTTP Range Support)
// ============================================================================
const ALLOWED_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/bmp': '.bmp',
  'image/x-ms-bmp': '.bmp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-m4v': '.m4v',
  'video/3gpp': '.3gp',
  'video/3gpp2': '.3g2',
  'video/ogg': '.ogv',
  'video/mpeg': '.mpeg',
  'video/x-msvideo': '.avi',
  'video/x-matroska': '.mkv',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/flac': '.flac',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/json': '.json',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
};

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.3gp': 'video/3gpp',
  '.3g2': 'video/3gpp2',
  '.ogv': 'video/ogg',
  '.mpeg': 'video/mpeg',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
};

const DOCUMENT_EXTS = new Set([
  '.pdf', '.txt', '.csv', '.json', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip',
]);

function resolveMediaInfo(
  rawMime: string,
  originalFilename?: string
): { baseMime: string; ext: string; mediaType: 'image' | 'video' | 'audio' | 'file' } | null {
  let baseMime = rawMime.split(';')[0].trim().toLowerCase();
  let ext = ALLOWED_MIME_EXT[baseMime];

  if (!ext && (!baseMime || baseMime === 'application/octet-stream') && originalFilename) {
    const candidateExt = path.extname(originalFilename).toLowerCase();
    const mappedMime = EXT_TO_MIME[candidateExt];
    if (mappedMime && ALLOWED_MIME_EXT[mappedMime]) {
      baseMime = mappedMime;
      ext = ALLOWED_MIME_EXT[mappedMime];
    }
  }

  if (!ext || !baseMime) return null;

  const mediaType = DOCUMENT_EXTS.has(ext)
    ? 'file'
    : baseMime.startsWith('video/')
      ? 'video'
      : baseMime.startsWith('audio/')
        ? 'audio'
        : 'image';

  return { baseMime, ext, mediaType };
}

const CHUNK_BASE_DIR = path.resolve(UPLOAD_DIR, '.chunks');
fs.mkdirSync(CHUNK_BASE_DIR, { recursive: true });

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const MAX_CHUNK_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_CHUNKS = 160;

interface ChunkSession {
  uid: string;
  ext: string;
  baseMime: string;
  mediaType: 'image' | 'video' | 'audio' | 'file';
  totalChunks: number;
  totalSize: number;
  received: Set<number>;
  createdAt: number;
}

const chunkSessions = new Map<string, ChunkSession>();

function cleanupExpiredChunkSessions(): void {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, sess] of chunkSessions.entries()) {
    if (sess.createdAt < cutoff) {
      chunkSessions.delete(id);
      const dir = path.resolve(CHUNK_BASE_DIR, id);
      if (dir.startsWith(CHUNK_BASE_DIR + path.sep)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CHUNK_BYTES },
});

function runMulterSingle(
  middleware: express.RequestHandler
): express.RequestHandler {
  return (req, res, next) => {
    middleware(req, res, (err: unknown) => {
      if (err) {
        const message =
          err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
            ? 'Uploaded chunk or file exceeded request size limit.'
            : err instanceof Error
              ? err.message
              : 'Malformed upload payload';
        res.status(400).json({ error: message });
        return;
      }
      next();
    });
  };
}

app.post(
  '/api/media/upload',
  requireAuth,
  runMulterSingle(upload.single('file')),
  (req: AuthenticatedRequest, res) => {
    if (!req.file || req.file.size === 0) {
      res.status(400).json({ error: 'No media file provided or file is empty' });
      return;
    }
    const resolved = resolveMediaInfo(req.file.mimetype || '', req.file.originalname);
    if (!resolved) {
      res.status(400).json({ error: `Unsupported media type: ${req.file.mimetype || 'unknown'}` });
      return;
    }
    const filename = `${crypto.randomUUID()}${resolved.ext}`;
    const targetPath = path.resolve(UPLOAD_DIR, filename);
    if (!targetPath.startsWith(UPLOAD_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }
    fs.writeFileSync(targetPath, req.file.buffer);

    res.status(201).json({
      url: `/api/media/${filename}`,
      mediaType: resolved.mediaType,
      mimeType: resolved.baseMime,
      size: req.file.size,
    });
  }
);

app.post('/api/media/upload/init', requireAuth, (req: AuthenticatedRequest, res) => {
  cleanupExpiredChunkSessions();
  const uid = req.authUser?.uid;
  if (!uid) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const body = req.body as {
    mimeType?: unknown;
    filename?: unknown;
    totalSize?: unknown;
    totalChunks?: unknown;
  };
  const rawMime = typeof body?.mimeType === 'string' ? body.mimeType : '';
  const rawFilename = typeof body?.filename === 'string' ? body.filename : '';
  const resolved = resolveMediaInfo(rawMime, rawFilename);
  if (!resolved) {
    res.status(400).json({ error: `Unsupported media type: ${rawMime || 'unknown'}` });
    return;
  }

  const totalSize = Number(body?.totalSize);
  const totalChunks = Number(body?.totalChunks);
  if (!Number.isFinite(totalSize) || totalSize <= 0 || totalSize > MAX_MEDIA_BYTES) {
    res.status(400).json({ error: 'Media file exceeds the 100 MB limit.' });
    return;
  }
  if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > MAX_TOTAL_CHUNKS) {
    res.status(400).json({ error: 'Invalid chunk count.' });
    return;
  }

  const uploadId = crypto.randomUUID();
  const dir = path.resolve(CHUNK_BASE_DIR, uploadId);
  if (!dir.startsWith(CHUNK_BASE_DIR + path.sep)) {
    res.status(400).json({ error: 'Invalid upload directory' });
    return;
  }
  fs.mkdirSync(dir, { recursive: true });

  chunkSessions.set(uploadId, {
    uid,
    ext: resolved.ext,
    baseMime: resolved.baseMime,
    mediaType: resolved.mediaType,
    totalChunks,
    totalSize,
    received: new Set(),
    createdAt: Date.now(),
  });

  res.status(201).json({ uploadId });
});

app.post(
  '/api/media/upload/chunk',
  requireAuth,
  runMulterSingle(chunkUpload.single('chunk')),
  (req: AuthenticatedRequest, res) => {
    const uid = req.authUser?.uid;
    const uploadId = typeof req.body?.uploadId === 'string' ? req.body.uploadId : '';
    const index = Number(req.body?.index);

    if (!uid || !UUID_REGEX.test(uploadId)) {
      res.status(400).json({ error: 'Invalid upload session' });
      return;
    }
    const session = chunkSessions.get(uploadId);
    if (!session || session.uid !== uid) {
      res.status(404).json({ error: 'Upload session not found' });
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
      res.status(400).json({ error: 'Invalid chunk index' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Missing chunk payload' });
      return;
    }

    const chunkDir = path.resolve(CHUNK_BASE_DIR, uploadId);
    const chunkPath = path.resolve(chunkDir, `chunk_${index}`);
    if (
      !chunkDir.startsWith(CHUNK_BASE_DIR + path.sep) ||
      !chunkPath.startsWith(chunkDir + path.sep)
    ) {
      res.status(400).json({ error: 'Invalid chunk path' });
      return;
    }

    fs.writeFileSync(chunkPath, req.file.buffer);
    session.received.add(index);
    res.json({ ok: true, index });
  }
);

app.post('/api/media/upload/complete', requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.authUser?.uid;
  const uploadId = typeof req.body?.uploadId === 'string' ? req.body.uploadId : '';
  if (!uid || !UUID_REGEX.test(uploadId)) {
    res.status(400).json({ error: 'Invalid upload session' });
    return;
  }
  const session = chunkSessions.get(uploadId);
  if (!session || session.uid !== uid) {
    res.status(404).json({ error: 'Upload session not found' });
    return;
  }
  if (session.received.size !== session.totalChunks) {
    res.status(400).json({ error: 'Upload incomplete: missing file chunks' });
    return;
  }

  const chunkDir = path.resolve(CHUNK_BASE_DIR, uploadId);
  const filename = `${crypto.randomUUID()}${session.ext}`;
  const targetPath = path.resolve(UPLOAD_DIR, filename);
  if (
    !chunkDir.startsWith(CHUNK_BASE_DIR + path.sep) ||
    !targetPath.startsWith(UPLOAD_DIR + path.sep)
  ) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  try {
    let writtenBytes = 0;
    const writeStream = fs.createWriteStream(targetPath);
    for (let i = 0; i < session.totalChunks; i += 1) {
      const partPath = path.resolve(chunkDir, `chunk_${i}`);
      if (!partPath.startsWith(chunkDir + path.sep) || !fs.existsSync(partPath)) {
        writeStream.destroy();
        fs.rmSync(targetPath, { force: true });
        res.status(400).json({ error: `Missing chunk ${i}` });
        return;
      }
      const chunkBuf = fs.readFileSync(partPath);
      writtenBytes += chunkBuf.length;
      if (writtenBytes > MAX_MEDIA_BYTES) {
        writeStream.destroy();
        fs.rmSync(targetPath, { force: true });
        res.status(413).json({ error: 'Media file exceeds 100 MB limit' });
        return;
      }
      if (!writeStream.write(chunkBuf)) {
        await new Promise<void>((resolve) => writeStream.once('drain', resolve));
      }
    }
    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on('error', reject);
    });

    chunkSessions.delete(uploadId);
    fs.rmSync(chunkDir, { recursive: true, force: true });

    res.status(201).json({
      url: `/api/media/${filename}`,
      mediaType: session.mediaType,
      mimeType: session.baseMime,
      size: writtenBytes,
    });
  } catch {
    fs.rmSync(targetPath, { force: true });
    res.status(500).json({ error: 'Failed to finalize uploaded media' });
  }
});

app.get('/api/media/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  const filePath = path.resolve(UPLOAD_DIR, filename);
  if (!filePath.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }
  const ext = path.extname(filename).toLowerCase();
  const contentType = EXT_TO_MIME[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const isDoc = DOCUMENT_EXTS.has(ext);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (isDoc) {
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = Number.parseInt(parts[0], 10);
    const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
    if (Number.isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      ...(isDoc ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}),
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      ...(isDoc ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}),
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ============================================================================
// JULIUS AI CHAT API (Server-Side Gemini 4 Hydrogen Proxy)
// ============================================================================
const juliusRateMap = new Map<string, { count: number; resetAt: number }>();

function checkJuliusRateLimit(uid: string): boolean {
  const now = Date.now();
  const entry = juliusRateMap.get(uid);
  if (!entry || now > entry.resetAt) {
    juliusRateMap.set(uid, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count += 1;
  return true;
}

function sanitizeContextLabel(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\r\n\t<>`]/g, ' ').trim().slice(0, 60);
}

app.post('/api/ai/julius', requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.authUser?.uid;
  if (!uid) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!checkJuliusRateLimit(uid)) {
    res.status(429).json({ error: 'You are sending messages too quickly. Please wait a moment.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'Julius AI is not configured yet. Please set GEMINI_API_KEY in Secrets.' });
    return;
  }

  const body = req.body as {
    message?: unknown;
    history?: unknown;
    mode?: unknown;
    userContext?: { displayName?: unknown; username?: unknown };
  };

  if (typeof body?.message !== 'string') {
    res.status(400).json({ error: 'Message must be a text string.' });
    return;
  }
  const cleanMessage = body.message.trim();
  if (!cleanMessage || cleanMessage.length > 2000) {
    res.status(400).json({ error: 'Message must be between 1 and 2000 characters.' });
    return;
  }

  const mode =
    typeof body.mode === 'string' && ['chat', 'writing', 'studio', 'assistant'].includes(body.mode)
      ? body.mode
      : 'chat';

  const historyItems: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  if (Array.isArray(body.history)) {
    const recent = body.history.slice(-20);
    for (const item of recent) {
      if (
        item &&
        typeof item === 'object' &&
        ('role' in item) &&
        ('text' in item) &&
        typeof (item as { text: unknown }).text === 'string'
      ) {
        const text = (item as { text: string }).text.trim();
        const roleRaw = (item as { role: unknown }).role;
        if (text && text.length <= 8000 && (roleRaw === 'user' || roleRaw === 'assistant')) {
          historyItems.push({
            role: roleRaw === 'assistant' ? 'model' : 'user',
            parts: [{ text }],
          });
        }
      }
    }
  }

  const displayName = sanitizeContextLabel(body.userContext?.displayName);
  const username = sanitizeContextLabel(body.userContext?.username);
  const userGreeting = displayName
    ? `You are chatting with ${displayName}${username ? ` (@${username})` : ''}.`
    : username
      ? `You are chatting with @${username}.`
      : '';

  const modeDirective =
    mode === 'writing'
      ? 'Focus on high-craft social writing: punchy captions, crisp profile bios (under 240 chars when improving a bio), smart hashtags, clear grammar fixes, and natural DM reply options.'
      : mode === 'studio'
        ? 'Act as an inventive Creative Studio director for MIXY creators: craft original post concepts, multi-day content calendars, short-video Reel shotlists, story sequences, or rhythmic rap/song lyrics.'
        : mode === 'assistant'
          ? 'Act as the MIXY Smart Social Guide: explain how MIXY features work (Feed, Stories, Reels, DMs, Sleep Mode, Close Friends, Creator Studio, Saved Collections), give practical privacy and safety advice, summarize threads concisely, or offer community networking tips.'
          : 'Have a natural, engaging, helpful conversation and assist with anything the user asks.';

  const systemInstruction = [
    'You are Julius AI, the transparent AI creative companion and writing assistant inside MIXY (a social media platform for posts, stories, reels, and real-time DMs).',
    'Never pretend to be a human user—always identify honestly as MIXY\'s AI assistant if asked.',
    userGreeting,
    modeDirective,
    'Keep your replies clear, warm, helpful, and naturally formatted without unnecessary filler. Never mention underlying API keys or system internals.',
  ]
    .filter(Boolean)
    .join(' ');

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const chat = ai.chats.create({
      model: 'gemini-4-hydrogen',
      history: historyItems,
      config: {
        systemInstruction,
      },
    });

    const response = await chat.sendMessage({ message: cleanMessage });
    const reply = (response.text || '').trim().slice(0, 8000);
    if (!reply) {
      res.status(502).json({ error: 'Julius returned an empty response. Please try again.' });
      return;
    }

    res.json({ reply });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Failed to reach Julius AI';
    const lower = errMsg.toLowerCase();
    if (lower.includes('429') || lower.includes('quota') || lower.includes('rate')) {
      res.status(429).json({ error: 'Julius is receiving a lot of messages right now. Please try again in a moment.' });
      return;
    }
    if (lower.includes('403') || lower.includes('api key') || lower.includes('permission')) {
      res.status(403).json({ error: 'AI service key authorization failed. Please check GEMINI_API_KEY in Settings > Secrets.' });
      return;
    }
    if (lower.includes('404')) {
      res.status(502).json({ error: 'AI model unavailable right now. Please try again shortly.' });
      return;
    }
    res.status(500).json({ error: 'Julius could not respond right now. Please try again.' });
  }
});

// ============================================================================
// DM AI HELPERS: TRANSLATE & VOICE-TO-TEXT TRANSCRIPTION
// ============================================================================
const AUDIO_TRANSCRIBE_EXT_MIME: Record<string, string> = {
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
};

app.post('/api/ai/translate', requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.authUser?.uid;
  if (!uid) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!checkJuliusRateLimit(uid)) {
    res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'Translation service is not configured yet.' });
    return;
  }

  const body = req.body as { text?: unknown; targetLanguage?: unknown };
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const targetLanguage = sanitizeContextLabel(body?.targetLanguage) || 'English';

  if (!text || text.length > 2000) {
    res.status(400).json({ error: 'Text must be between 1 and 2000 characters.' });
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Target language: ${targetLanguage}\n\nMessage:\n${text}`,
      config: {
        systemInstruction:
          'You are a precise social chat translator. Translate the user message naturally into the requested target language while preserving tone, emojis, and @mentions. Return ONLY the translated text without quotes or commentary.',
      },
    });
    const translatedText = (response.text || '').trim().slice(0, 4000);
    if (!translatedText) {
      res.status(502).json({ error: 'Empty translation response.' });
      return;
    }
    res.json({ translatedText, targetLanguage });
  } catch {
    res.status(500).json({ error: 'Could not translate message right now.' });
  }
});

app.post('/api/ai/transcribe', requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.authUser?.uid;
  if (!uid) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!checkJuliusRateLimit(uid)) {
    res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'Transcription service is not configured yet.' });
    return;
  }

  const body = req.body as { mediaURL?: unknown };
  const rawUrl = typeof body?.mediaURL === 'string' ? body.mediaURL.trim() : '';
  let mediaPath = rawUrl;
  if (/^https?:\/\//i.test(rawUrl)) {
    try {
      mediaPath = new URL(rawUrl).pathname;
    } catch {
      mediaPath = '';
    }
  }
  if (!mediaPath.startsWith('/api/media/')) {
    res.status(400).json({ error: 'Valid local voice media URL is required.' });
    return;
  }
  const filename = path.basename(mediaPath.split('?')[0]);
  if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
    res.status(400).json({ error: 'Invalid voice media filename.' });
    return;
  }
  const ext = path.extname(filename).toLowerCase();
  const mimeType = AUDIO_TRANSCRIBE_EXT_MIME[ext];
  if (!mimeType) {
    res.status(400).json({ error: 'Unsupported audio format for transcription.' });
    return;
  }
  const filePath = path.resolve(UPLOAD_DIR, filename);
  if (!filePath.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Voice recording not found.' });
    return;
  }
  const stat = fs.statSync(filePath);
  if (stat.size <= 0 || stat.size > 18 * 1024 * 1024) {
    res.status(400).json({ error: 'Voice recording size exceeds transcription limit (18 MB).' });
    return;
  }

  try {
    const base64Audio = fs.readFileSync(filePath).toString('base64');
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Audio,
            },
          },
          { text: 'Transcribe this voice message accurately with natural punctuation.' },
        ],
      },
    });
    const transcript = (response.text || '').trim().slice(0, 4000);
    if (!transcript) {
      res.status(502).json({ error: 'No speech detected in voice note.' });
      return;
    }
    res.json({ transcript });
  } catch {
    res.status(500).json({ error: 'Could not transcribe voice note right now.' });
  }
});

app.post('/api/ai/tts', requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.authUser?.uid;
  if (!uid) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!checkJuliusRateLimit(uid)) {
    res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'Voice synthesis service is not configured yet.' });
    return;
  }

  const body = req.body as { text?: unknown; voiceName?: unknown };
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 1500) {
    res.status(400).json({ error: 'Text must be between 1 and 1500 characters.' });
    return;
  }
  const allowedVoices = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);
  const voiceName =
    typeof body?.voiceName === 'string' && allowedVoices.has(body.voiceName)
      ? body.voiceName
      : 'Kore';

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [{ text }],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });
    const audioBase64 =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioBase64) {
      res.status(502).json({ error: 'Empty audio response from speech service.' });
      return;
    }
    res.json({ audioBase64, mimeType: 'audio/wav' });
  } catch {
    res.status(500).json({ error: 'Could not generate speech audio right now.' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'mixy-server',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

// ============================================================================
// HTTP + WEBSOCKET SERVER (Real-Time Presence & Typing Indicators)
// ============================================================================
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

interface ClientMeta {
  uid: string;
  showOnline: boolean;
}

const clientSockets = new Map<WebSocket, ClientMeta>();
const onlineUsers = new Map<string, Set<WebSocket>>();
const lastSeenMap = new Map<string, string>();

function broadcastPresence(uid: string, isOnline: boolean): void {
  const payload = JSON.stringify({
    type: 'presence:update',
    uid,
    isOnline,
    lastSeenAt: lastSeenMap.get(uid) || new Date().toISOString(),
  });
  for (const [ws] of clientSockets.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function sendToUsers(uids: string[], data: unknown): void {
  const payload = JSON.stringify(data);
  for (const uid of uids) {
    const sockets = onlineUsers.get(uid);
    if (!sockets) continue;
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}

wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        type?: string;
        token?: string;
        showOnline?: boolean;
        conversationId?: string;
        recipientIds?: string[];
        isTyping?: boolean;
        callId?: string;
        callType?: 'voice' | 'video';
        isGroup?: boolean;
        participantIds?: string[];
        callerUsername?: string;
        callerDisplayName?: string;
        callerPhotoURL?: string;
        targetUid?: string;
        sdp?: unknown;
        candidate?: unknown;
        micMuted?: boolean;
        camOff?: boolean;
        reason?: string;
      };

      if (msg.type === 'auth' && typeof msg.token === 'string') {
        const verified = await verifyFirebaseIdToken(msg.token);
        const showOnline = msg.showOnline !== false;
        clientSockets.set(ws, { uid: verified.uid, showOnline });
        if (!onlineUsers.has(verified.uid)) {
          onlineUsers.set(verified.uid, new Set());
        }
        onlineUsers.get(verified.uid)?.add(ws);
        lastSeenMap.set(verified.uid, new Date().toISOString());

        // Send initial visible online snapshot
        const visibleOnline: Record<string, boolean> = {};
        for (const [otherWs, meta] of clientSockets.entries()) {
          if (otherWs.readyState === WebSocket.OPEN && meta.showOnline) {
            visibleOnline[meta.uid] = true;
          }
        }
        ws.send(
          JSON.stringify({
            type: 'presence:snapshot',
            online: visibleOnline,
            lastSeen: Object.fromEntries(lastSeenMap.entries()),
          })
        );

        if (showOnline) {
          broadcastPresence(verified.uid, true);
        }
        return;
      }

      const meta = clientSockets.get(ws);
      if (!meta) return;

      if (msg.type === 'presence:visibility') {
        meta.showOnline = msg.showOnline !== false;
        broadcastPresence(meta.uid, meta.showOnline);
        return;
      }

      if (
        msg.type === 'typing' &&
        typeof msg.conversationId === 'string' &&
        Array.isArray(msg.recipientIds)
      ) {
        const recipients = msg.recipientIds.filter((id) => typeof id === 'string' && id !== meta.uid);
        sendToUsers(recipients, {
          type: 'typing',
          conversationId: msg.conversationId,
          uid: meta.uid,
          isTyping: Boolean(msg.isTyping),
        });
        return;
      }

      // WebRTC Voice & Video Call Signaling Relay (authenticated peers)
      if (
        msg.type === 'call:invite' &&
        typeof msg.callId === 'string' &&
        typeof msg.conversationId === 'string' &&
        Array.isArray(msg.recipientIds)
      ) {
        const recipients = msg.recipientIds.filter((id) => typeof id === 'string' && id !== meta.uid);
        const onlineRecipients: string[] = [];
        for (const rid of recipients) {
          const sockets = onlineUsers.get(rid);
          if (sockets && sockets.size > 0) {
            onlineRecipients.push(rid);
          }
        }
        sendToUsers(recipients, {
          type: 'call:invite',
          callId: msg.callId,
          conversationId: msg.conversationId,
          callType: msg.callType === 'video' ? 'video' : 'voice',
          isGroup: Boolean(msg.isGroup),
          participantIds: Array.isArray(msg.participantIds) ? msg.participantIds : [meta.uid, ...recipients],
          callerUid: meta.uid,
          callerUsername: typeof msg.callerUsername === 'string' ? msg.callerUsername.slice(0, 40) : '',
          callerDisplayName: typeof msg.callerDisplayName === 'string' ? msg.callerDisplayName.slice(0, 60) : '',
          callerPhotoURL: typeof msg.callerPhotoURL === 'string' ? msg.callerPhotoURL.slice(0, 500) : '',
        });
        ws.send(
          JSON.stringify({
            type: 'call:invite-ack',
            callId: msg.callId,
            reachableUids: onlineRecipients,
          })
        );
        return;
      }

      if (
        (msg.type === 'call:ringing' ||
          msg.type === 'call:accept' ||
          msg.type === 'call:decline' ||
          msg.type === 'call:end' ||
          msg.type === 'call:media-state') &&
        typeof msg.callId === 'string'
      ) {
        const targets = Array.isArray(msg.recipientIds)
          ? msg.recipientIds.filter((id) => typeof id === 'string' && id !== meta.uid)
          : msg.targetUid
            ? [msg.targetUid]
            : [];
        if (targets.length > 0) {
          sendToUsers(targets, {
            type: msg.type,
            callId: msg.callId,
            conversationId: msg.conversationId,
            fromUid: meta.uid,
            micMuted: msg.micMuted,
            camOff: msg.camOff,
            reason: msg.reason,
          });
        }
        return;
      }

      if (
        (msg.type === 'call:offer' || msg.type === 'call:answer' || msg.type === 'call:ice') &&
        typeof msg.callId === 'string' &&
        typeof msg.targetUid === 'string'
      ) {
        sendToUsers([msg.targetUid], {
          type: msg.type,
          callId: msg.callId,
          fromUid: meta.uid,
          sdp: msg.sdp,
          candidate: msg.candidate,
        });
      }
    } catch {
      // Ignore malformed WS packets
    }
  });

  ws.on('close', () => {
    const meta = clientSockets.get(ws);
    if (!meta) return;
    clientSockets.delete(ws);
    const set = onlineUsers.get(meta.uid);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        onlineUsers.delete(meta.uid);
        lastSeenMap.set(meta.uid, new Date().toISOString());
        if (meta.showOnline) {
          broadcastPresence(meta.uid, false);
        }
      }
    }
  });
});

// ============================================================================
// VITE / STATIC SERVING
// ============================================================================
async function startServer(): Promise<void> {
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.use((_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MIXY server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MIXY server:', err);
  process.exit(1);
});
