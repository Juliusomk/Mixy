import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCw, Send, Square, Video, X } from 'lucide-react';
import { uploadMediaFile } from '../../lib/media';

export function MediaCaptureModal({
  initialMode = 'photo',
  onClose,
  onSendCaptured,
}: {
  initialMode?: 'photo' | 'video';
  onClose: () => void;
  onSendCaptured: (url: string, kind: 'image' | 'video') => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [mode, setMode] = useState<'photo' | 'video'>(initialMode);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [permissionErr, setPermissionErr] = useState('');
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async (targetFacing: 'user' | 'environment', needAudio: boolean) => {
    stopCamera();
    setPermissionErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: targetFacing },
        audio: needAudio,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setPermissionErr(
        'Camera or microphone permission was denied or unavailable on this device. Please grant browser access and retry.'
      );
    }
  };

  useEffect(() => {
    void startCamera(facingMode, mode === 'video');
    return () => {
      stopCamera();
    };
  }, [facingMode, mode]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!recording) {
      setRecSec(0);
      return;
    }
    const id = window.setInterval(() => setRecSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  const handleTakePhoto = () => {
    const vid = videoRef.current;
    if (!vid || !vid.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = vid.videoWidth;
    canvas.height = vid.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(vid, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setPreviewUrl(url);
        stopCamera();
      },
      'image/jpeg',
      0.9
    );
  };

  const handleToggleVideoRecord = () => {
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      setRecording(false);
      return;
    }
    if (!streamRef.current) return;
    const rec = new MediaRecorder(streamRef.current);
    chunksRef.current = [];
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      setCapturedBlob(blob);
      setPreviewUrl(url);
      stopCamera();
    };
    rec.start();
    recorderRef.current = rec;
    setRecording(true);
  };

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedBlob(null);
    void startCamera(facingMode, mode === 'video');
  };

  const handleSend = async () => {
    if (!capturedBlob || uploading) return;
    setUploading(true);
    try {
      const ext = mode === 'photo' ? 'jpg' : 'webm';
      const uploaded = await uploadMediaFile(capturedBlob, `mixy-cam-${Date.now()}.${ext}`);
      await onSendCaptured(uploaded.url, mode === 'photo' ? 'image' : 'video');
      onClose();
    } catch (err) {
      setPermissionErr(err instanceof Error ? err.message : 'Failed to upload media.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-[#0D0D16] border border-white/15 overflow-hidden text-white flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/10 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setPreviewUrl(null);
                setCapturedBlob(null);
                setMode('photo');
              }}
              className={`px-3 py-1 rounded-lg flex items-center gap-1.5 ${
                mode === 'photo' ? 'mixy-gradient-bg text-white' : 'text-slate-300'
              }`}
            >
              <Camera className="w-3.5 h-3.5" /> Photo
            </button>
            <button
              type="button"
              onClick={() => {
                setPreviewUrl(null);
                setCapturedBlob(null);
                setMode('video');
              }}
              className={`px-3 py-1 rounded-lg flex items-center gap-1.5 ${
                mode === 'video' ? 'mixy-gradient-bg text-white' : 'text-slate-300'
              }`}
            >
              <Video className="w-3.5 h-3.5" /> Video
            </button>
          </div>
          <div className="flex items-center gap-2">
            {!previewUrl && (
              <button
                type="button"
                onClick={() => setFacingMode((f) => (f === 'user' ? 'environment' : 'user'))}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                title="Flip camera"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
              aria-label="Close camera"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="relative aspect-[3/4] bg-black flex items-center justify-center">
          {permissionErr ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm text-rose-400">{permissionErr}</p>
              <button
                type="button"
                onClick={() => void startCamera(facingMode, mode === 'video')}
                className="px-4 py-2 rounded-xl mixy-gradient-bg text-xs font-semibold"
              >
                Retry Camera Access
              </button>
            </div>
          ) : previewUrl ? (
            mode === 'photo' ? (
              <img src={previewUrl} alt="Captured snapshot" className="w-full h-full object-cover" />
            ) : (
              <video src={previewUrl} controls autoPlay playsInline className="w-full h-full object-cover" />
            )
          ) : (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          )}

          {recording && (
            <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-rose-600/90 text-xs font-bold flex items-center gap-1.5 tabular-nums">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              REC {recSec}s
            </div>
          )}
        </div>

        <div className="p-4 flex items-center justify-center gap-4 bg-[#12121E]">
          {previewUrl ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                disabled={uploading}
                className="px-4 h-11 rounded-xl border border-white/20 text-sm font-semibold hover:bg-white/10"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={uploading}
                className="flex-1 h-11 rounded-xl mixy-gradient-bg text-white text-sm font-semibold flex items-center justify-center gap-2"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {uploading ? 'Sending...' : 'Send to Chat'}
              </button>
            </>
          ) : mode === 'photo' ? (
            <button
              type="button"
              onClick={handleTakePhoto}
              disabled={Boolean(permissionErr)}
              aria-label="Capture photo"
              className="w-16 h-16 rounded-full border-4 border-white p-1 flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-40"
            >
              <span className="w-full h-full rounded-full bg-white block" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggleVideoRecord}
              disabled={Boolean(permissionErr)}
              aria-label={recording ? 'Stop recording' : 'Start video recording'}
              className={`w-16 h-16 rounded-full border-4 border-white flex items-center justify-center transition-transform ${
                recording ? 'bg-rose-600' : 'bg-rose-500 hover:scale-105'
              } disabled:opacity-40`}
            >
              {recording ? <Square className="w-6 h-6 fill-white" /> : <Video className="w-6 h-6" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
