import { apiFetch, apiUrl, mediaUrl } from './api';
import { auth } from './firebase';

export { mediaUrl };

export interface UploadedMediaResult {
  url: string;
  mediaType: 'image' | 'video' | 'audio' | 'file';
  mimeType: string;
  size: number;
}

export const CHUNK_SIZE_BYTES = 768 * 1024;
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

const EXT_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  '3gp': 'video/3gpp',
  '3g2': 'video/3gpp2',
  ogv: 'video/ogg',
  mpeg: 'video/mpeg',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
};

export function inferMimeType(file: File | Blob, fallbackName?: string): string {
  const raw = (file.type || '').split(';')[0].trim().toLowerCase();
  if (raw && raw !== 'application/octet-stream') return raw;
  const name = file instanceof File ? file.name : fallbackName || '';
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx !== -1) {
    const ext = name.slice(dotIdx + 1).toLowerCase();
    if (EXT_MIME_MAP[ext]) return EXT_MIME_MAP[ext];
  }
  return '';
}

export function inferMediaKind(file: File): 'image' | 'video' {
  const mime = inferMimeType(file);
  if (mime.startsWith('video/')) return 'video';
  return 'image';
}

export function inferAttachmentKind(file: File): 'image' | 'video' | 'audio' | 'file' {
  const mime = inferMimeType(file);
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  return 'file';
}

/**
 * Optimizes large raster images client-side before upload while preserving aspect ratio.
 */
export async function optimizeImageFile(file: File, maxDimension = 1600): Promise<File> {
  const mime = inferMimeType(file);
  if (!mime.startsWith('image/') || mime === 'image/gif' || mime === 'image/heic' || mime === 'image/heif') {
    return file;
  }
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width <= maxDimension && height <= maxDimension && file.size <= 700_000) {
        resolve(file);
        return;
      }
      const scale = Math.min(maxDimension / width, maxDimension / height, 1);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          const safeName = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
          const optimized = new File([blob], safeName, {
            type: 'image/jpeg',
          });
          resolve(optimized);
        },
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

function uploadDirectWithProgress(
  formData: FormData,
  token: string,
  onProgress?: (percent: number) => void
): Promise<UploadedMediaResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl('/api/media/upload'));
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0 && onProgress) {
        const pct = Math.min(98, Math.max(5, Math.round((evt.loaded / evt.total) * 95)));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      let body: Partial<UploadedMediaResult> & { error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText || '{}') as Partial<UploadedMediaResult> & { error?: string };
      } catch {
        // non-JSON response
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.url) {
        onProgress?.(100);
        resolve(body as UploadedMediaResult);
      } else {
        reject(new Error(body.error || `Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error while uploading media.'));
    xhr.ontimeout = () => reject(new Error('Media upload timed out.'));
    xhr.send(formData);
  });
}

async function uploadChunkWithRetry(
  uploadId: string,
  index: number,
  slice: Blob,
  token: string
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const chunkForm = new FormData();
    chunkForm.append('uploadId', uploadId);
    chunkForm.append('index', String(index));
    chunkForm.append('chunk', slice, `chunk_${index}`);

    try {
      const resp = await apiFetch('/api/media/upload/chunk', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: chunkForm,
      });
      if (resp.ok) return;
      const errBody = (await resp.json().catch(() => ({}))) as { error?: string };
      if (attempt === 1 || resp.status < 500) {
        throw new Error(errBody.error || `Chunk ${index + 1} upload failed (${resp.status})`);
      }
    } catch (err) {
      if (attempt === 1) {
        throw err instanceof Error ? err : new Error(`Chunk ${index + 1} upload failed`);
      }
    }
  }
}

export async function uploadMediaFile(
  file: File | Blob,
  filename?: string,
  onProgress?: (percent: number) => void
): Promise<UploadedMediaResult> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to upload media.');
  }
  const token = await user.getIdToken();
  const originalName = file instanceof File ? file.name : filename || 'recording.webm';
  const preparedFile =
    file instanceof File && inferMediaKind(file) === 'image'
      ? await optimizeImageFile(file)
      : file;

  if (preparedFile.size <= 0) {
    throw new Error('Selected media file is empty.');
  }
  if (preparedFile.size > MAX_MEDIA_BYTES) {
    throw new Error('Media file is larger than 100 MB. Please choose a smaller clip.');
  }

  onProgress?.(5);

  // Direct single-request upload for smaller files (<= 768 KB)
  if (preparedFile.size <= CHUNK_SIZE_BYTES) {
    const formData = new FormData();
    if (preparedFile instanceof File) {
      formData.append('file', preparedFile);
    } else {
      formData.append('file', preparedFile, originalName);
    }
    return uploadDirectWithProgress(formData, token, onProgress);
  }

  // Chunked upload for larger photos/videos (> 768 KB) so every HTTP request stays well below proxy limits
  const resolvedName = preparedFile instanceof File ? preparedFile.name : originalName;
  const mimeType = inferMimeType(preparedFile, resolvedName) || 'video/mp4';
  const totalChunks = Math.ceil(preparedFile.size / CHUNK_SIZE_BYTES);

  const initResp = await apiFetch('/api/media/upload/init', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mimeType,
      filename: resolvedName,
      totalSize: preparedFile.size,
      totalChunks,
    }),
  });
  if (!initResp.ok) {
    const errBody = (await initResp.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || `Could not start upload (${initResp.status})`);
  }
  const { uploadId } = (await initResp.json()) as { uploadId: string };

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * CHUNK_SIZE_BYTES;
    const end = Math.min(start + CHUNK_SIZE_BYTES, preparedFile.size);
    const slice = preparedFile.slice(start, end, mimeType);
    await uploadChunkWithRetry(uploadId, index, slice, token);
    const pct = Math.min(95, Math.round(((index + 1) / totalChunks) * 90) + 5);
    onProgress?.(pct);
  }

  const completeResp = await apiFetch('/api/media/upload/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ uploadId }),
  });
  if (!completeResp.ok) {
    const errBody = (await completeResp.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || `Upload finalization failed (${completeResp.status})`);
  }
  onProgress?.(100);
  return (await completeResp.json()) as UploadedMediaResult;
}
