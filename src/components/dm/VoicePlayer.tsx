import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Pause, Play, Sparkles } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { auth } from '../../lib/firebase';
import { mediaUrl as resolveMediaUrl } from '../../lib/media';

const DEFAULT_WAVEFORM = [
  18, 36, 52, 28, 72, 88, 44, 64, 92, 56, 38, 76, 62, 48, 84, 54, 32, 68, 42, 26,
];

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem < 10 ? '0' : ''}${rem}`;
}

export function VoicePlayer({
  mediaURL,
  durationSec,
  waveform,
  transcript,
  isMine,
  onTranscriptSaved,
}: {
  mediaURL: string;
  durationSec?: number;
  waveform?: number[];
  transcript?: string;
  isMine: boolean;
  onTranscriptSaved?: (text: string) => Promise<void> | void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const [progress, setProgress] = useState(0);
  const [totalDur, setTotalDur] = useState(durationSec || 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [localTranscript, setLocalTranscript] = useState(transcript || '');
  const [transcribeErr, setTranscribeErr] = useState('');

  useEffect(() => {
    setLocalTranscript(transcript || '');
  }, [transcript]);

  useEffect(() => {
    if (durationSec && durationSec > 0) {
      setTotalDur(durationSec);
    }
  }, [durationSec]);

  const bars = waveform && waveform.length >= 8 ? waveform : DEFAULT_WAVEFORM;

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speed;
  }, [speed]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const cycleSpeed = () => {
    setSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1));
  };

  const handleSeekBar = (idx: number) => {
    const el = audioRef.current;
    if (!el) return;
    const effectiveDur =
      el.duration && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : totalDur;
    if (effectiveDur <= 0) return;
    const pct = (idx + 0.5) / bars.length;
    el.currentTime = pct * effectiveDur;
    setProgress(pct);
    setCurrentTime(el.currentTime);
  };

  const handleTranscribe = async () => {
    if (transcribing || localTranscript) return;
    setTranscribing(true);
    setTranscribeErr('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Sign in required.');
      const resp = await apiFetch('/api/ai/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mediaURL: resolveMediaUrl(mediaURL) }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        transcript?: string;
        error?: string;
      };
      if (!resp.ok || !data.transcript) {
        throw new Error(data.error || 'Could not transcribe voice note.');
      }
      setLocalTranscript(data.transcript);
      await onTranscriptSaved?.(data.transcript);
    } catch (err) {
      setTranscribeErr(err instanceof Error ? err.message : 'Transcription failed.');
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div className="space-y-1.5 min-w-[220px] max-w-[280px]">
      <audio
        ref={audioRef}
        src={resolveMediaUrl(mediaURL)}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setTotalDur(d);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          const effective =
            el.duration && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : totalDur;
          if (effective > 0) {
            setCurrentTime(el.currentTime);
            setProgress(Math.min(1, el.currentTime / effective));
          }
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setCurrentTime(0);
        }}
      />

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Pause voice note' : 'Play voice note'}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 ${
            isMine
              ? 'bg-white/25 hover:bg-white/35 text-white'
              : 'mixy-gradient-bg text-white'
          }`}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        {/* Interactive Waveform Bars */}
        <div className="flex-1 flex items-center gap-[2.5px] h-8 cursor-pointer" aria-label="Voice waveform">
          {bars.map((val, idx) => {
            const pct = idx / bars.length;
            const active = pct <= progress && progress > 0;
            const hPct = Math.max(20, Math.min(100, val));
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSeekBar(idx)}
                className="flex-1 h-full flex items-center justify-center"
                title={`Seek to ${Math.round(pct * 100)}%`}
              >
                <span
                  style={{ height: `${hPct}%` }}
                  className={`w-full rounded-full transition-colors ${
                    active
                      ? isMine
                        ? 'bg-white'
                        : 'bg-fuchsia-500'
                      : isMine
                        ? 'bg-white/40'
                        : 'bg-slate-400/45'
                  }`}
                />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={cycleSpeed}
          className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums shrink-0 ${
            isMine
              ? 'bg-black/25 text-white hover:bg-black/35'
              : 'bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20'
          }`}
          title="Change playback speed"
        >
          {speed}x
        </button>
      </div>

      <div className="flex items-center justify-between text-[10px] opacity-85">
        <span className="tabular-nums">
          {formatDuration(playing ? currentTime : totalDur)}
        </span>
        {!localTranscript && (
          <button
            type="button"
            onClick={() => void handleTranscribe()}
            disabled={transcribing}
            className="inline-flex items-center gap-1 font-semibold hover:underline disabled:opacity-50"
          >
            {transcribing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {transcribing ? 'Transcribing...' : 'Transcribe'}
          </button>
        )}
      </div>

      {localTranscript && (
        <div
          className={`text-xs px-2.5 py-1.5 rounded-xl flex items-start gap-1.5 ${
            isMine ? 'bg-black/25 text-white/95' : 'bg-slate-100 dark:bg-white/10'
          }`}
        >
          <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-75" />
          <p className="leading-snug">{localTranscript}</p>
        </div>
      )}

      {transcribeErr && <p className="text-[10px] text-rose-300">{transcribeErr}</p>}
    </div>
  );
}
