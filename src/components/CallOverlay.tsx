import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  PictureInPicture2,
  RefreshCw,
  Signal,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCall } from '../context/CallContext';
import { UserAvatar, UserVerifiedBadge } from './MixyLogo';

function formatCallDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function RemoteVideoTile({
  uid,
  stream,
  label,
  speakerOn,
  micMuted,
  camOff,
  onSetMainVideoEl,
}: {
  uid: string;
  stream: MediaStream | undefined;
  label: string;
  speakerOn: boolean;
  micMuted?: boolean;
  camOff?: boolean;
  onSetMainVideoEl?: (el: HTMLVideoElement | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.muted = !speakerOn;
      // Apply saved speaker output device if browser supports setSinkId
      const savedSpeaker = localStorage.getItem('mixy_preferred_speaker_id');
      const audioEl = audioRef.current as HTMLAudioElement & {
        setSinkId?: (id: string) => Promise<void>;
      };
      if (savedSpeaker && typeof audioEl.setSinkId === 'function') {
        void audioEl.setSinkId(savedSpeaker).catch(() => {});
      }
    }
  }, [stream, speakerOn]);

  useEffect(() => {
    onSetMainVideoEl?.(videoRef.current);
  }, [onSetMainVideoEl, stream]);

  const hasVideo = Boolean(stream && stream.getVideoTracks().some((t) => t.enabled) && !camOff);

  return (
    <div className="relative w-full h-full rounded-3xl overflow-hidden bg-slate-900 border border-white/10 flex items-center justify-center">
      <audio ref={audioRef} autoPlay playsInline />
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-3 text-white">
          <div className="w-20 h-20 rounded-full mixy-gradient-bg flex items-center justify-center text-2xl font-bold shadow-xl">
            {label[0]?.toUpperCase() || 'M'}
          </div>
          <span className="text-sm font-semibold inline-flex items-center gap-1">
            <span>{label}</span>
            <UserVerifiedBadge uid={uid} className="w-3.5 h-3.5" />
          </span>
          {camOff && <span className="text-xs text-slate-400">Camera off</span>}
        </div>
      )}
      <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md text-white text-xs font-semibold flex items-center gap-1.5">
        <span>{label}</span>
        <UserVerifiedBadge uid={uid} className="w-3.5 h-3.5" />
        {micMuted && <MicOff className="w-3 h-3 text-rose-400" />}
      </div>
    </div>
  );
}

export function CallOverlay() {
  const {
    activeCall,
    localStream,
    remoteStreams,
    peerMediaStates,
    micMuted,
    camOff,
    speakerOn,
    durationSec,
    networkStats,
    callError,
    acceptIncomingCall,
    declineIncomingCall,
    endCall,
    toggleMic,
    toggleCamera,
    flipCamera,
    toggleSpeaker,
    clearCallError,
  } = useCall();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const mainRemoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, activeCall?.status]);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Ignore fullscreen denial
    }
  };

  const togglePiP = async () => {
    const el = mainRemoteVideoRef.current;
    if (!el || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await el.requestPictureInPicture();
      }
    } catch {
      // Ignore PiP unsupported
    }
  };

  if (!activeCall && callError) {
    return (
      <div className="fixed top-4 right-4 z-[70] max-w-xs rounded-2xl bg-white dark:bg-[#151524] border border-rose-500/30 shadow-2xl p-3.5 flex items-start gap-2.5 text-xs">
        <PhoneOff className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
        <span className="flex-1 text-slate-800 dark:text-slate-100">{callError}</span>
        <button type="button" onClick={clearCallError} className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (!activeCall) return null;

  const primaryPeer = activeCall.remotePeers[0];
  const remoteEntries = Object.entries(remoteStreams);
  const isIncomingRinging =
    activeCall.direction === 'incoming' && activeCall.status === 'ringing';
  const isVideo = activeCall.callType === 'video';

  const qualityBadgeColor =
    networkStats.quality === 'excellent'
      ? 'text-emerald-400'
      : networkStats.quality === 'good'
        ? 'text-sky-400'
        : networkStats.quality === 'fair'
          ? 'text-amber-400'
          : 'text-slate-300';

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[70] bg-slate-950/95 backdrop-blur-2xl flex flex-col justify-between p-4 sm:p-6 text-white"
    >
      {/* Top Status Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="px-3 py-1 rounded-full bg-white/10 text-xs font-semibold flex items-center gap-1.5">
            {isVideo ? <Video className="w-3.5 h-3.5 text-fuchsia-400" /> : <Phone className="w-3.5 h-3.5 text-emerald-400" />}
            {activeCall.isGroup ? 'Group ' : ''}
            {isVideo ? 'Video Call' : 'Voice Call'}
          </span>
          {activeCall.status === 'active' && (
            <span className={`text-xs font-semibold flex items-center gap-1 ${qualityBadgeColor}`}>
              <Signal className="w-3.5 h-3.5" />
              <span className="capitalize">{networkStats.quality}</span>
              {networkStats.rttMs !== null && <span>({networkStats.rttMs}ms)</span>}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isVideo && activeCall.status === 'active' && (
            <>
              <button
                type="button"
                onClick={() => void togglePiP()}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                title="Picture-in-Picture"
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Call Stage */}
      <div className="flex-1 my-4 flex items-center justify-center min-h-0 relative">
        {isVideo && activeCall.status === 'active' && remoteEntries.length > 0 ? (
          <div
            className={`w-full h-full grid gap-3 ${
              remoteEntries.length === 1
                ? 'grid-cols-1 max-w-4xl'
                : remoteEntries.length <= 2
                  ? 'grid-cols-1 sm:grid-cols-2 max-w-5xl'
                  : 'grid-cols-2 max-w-5xl'
            }`}
          >
            {remoteEntries.map(([uid, stream], idx) => {
              const meta = activeCall.remotePeers.find((p) => p.uid === uid);
              const state = peerMediaStates[uid] || {};
              return (
                <RemoteVideoTile
                  key={uid}
                  uid={uid}
                  stream={stream}
                  label={meta?.displayName || meta?.username || 'Participant'}
                  speakerOn={speakerOn}
                  micMuted={state.micMuted}
                  camOff={state.camOff}
                  onSetMainVideoEl={(el) => {
                    if (idx === 0) mainRemoteVideoRef.current = el;
                  }}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center text-center space-y-4">
            {/* Hidden audio elements for voice-only active streams */}
            {remoteEntries.map(([uid, stream]) => (
              <RemoteAudioHidden key={uid} stream={stream} speakerOn={speakerOn} />
            ))}
            <div className="relative">
              <div className="absolute -inset-3 rounded-full bg-fuchsia-500/25 animate-pulse" />
              <UserAvatar
                src={primaryPeer?.photoURL}
                name={primaryPeer?.displayName || primaryPeer?.username || 'MIXY Call'}
                size="xl"
              />
            </div>
            <div>
              <h2 className="text-2xl font-bold flex items-center justify-center gap-1.5">
                <span>
                  {activeCall.isGroup
                    ? `Group Call (${activeCall.participantIds.length})`
                    : primaryPeer?.displayName || primaryPeer?.username || 'MIXY User'}
                </span>
                {!activeCall.isGroup && primaryPeer?.uid && (
                  <UserVerifiedBadge uid={primaryPeer.uid} className="w-5 h-5" />
                )}
              </h2>
              <p className="text-sm text-slate-300 mt-1 tabular-nums">
                {isIncomingRinging
                  ? `Incoming ${isVideo ? 'video' : 'voice'} call...`
                  : activeCall.status === 'ringing'
                    ? 'Calling...'
                    : activeCall.status === 'connecting'
                      ? 'Connecting...'
                      : formatCallDuration(durationSec)}
              </p>
            </div>
          </div>
        )}

        {/* Self Preview Floating PiP Tile during Video Call */}
        {isVideo && localStream && !camOff && (
          <div className="absolute bottom-3 right-3 w-28 sm:w-36 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-white/30 bg-black shadow-2xl">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          </div>
        )}
      </div>

      {/* Bottom Call Controls */}
      <div className="flex flex-col items-center gap-3 pb-2">
        {activeCall.status === 'active' && (
          <p className="text-xs font-semibold text-slate-400 tabular-nums">
            {formatCallDuration(durationSec)}
          </p>
        )}

        {isIncomingRinging ? (
          <div className="flex items-center gap-8">
            <button
              type="button"
              onClick={() => void declineIncomingCall()}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center shadow-lg shadow-rose-500/30 transition-transform group-active:scale-95">
                <PhoneOff className="w-7 h-7" />
              </span>
              <span className="text-xs font-semibold text-slate-300">Decline</span>
            </button>
            <button
              type="button"
              onClick={() => void acceptIncomingCall()}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-bounce transition-transform group-active:scale-95">
                {isVideo ? <Video className="w-7 h-7" /> : <Phone className="w-7 h-7" />}
              </span>
              <span className="text-xs font-semibold text-emerald-300">Accept</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 px-5 py-3 rounded-full bg-white/10 backdrop-blur-xl border border-white/15">
            <button
              type="button"
              onClick={toggleMic}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                micMuted ? 'bg-rose-500 text-white' : 'bg-white/15 hover:bg-white/25'
              }`}
              title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {isVideo && (
              <>
                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                    camOff ? 'bg-rose-500 text-white' : 'bg-white/15 hover:bg-white/25'
                  }`}
                  title={camOff ? 'Turn camera on' : 'Turn camera off'}
                >
                  {camOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => void flipCamera()}
                  className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
                  title="Flip front / back camera"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={toggleSpeaker}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                speakerOn ? 'bg-white/15 hover:bg-white/25' : 'bg-amber-500/80 text-white'
              }`}
              title={speakerOn ? 'Speaker on' : 'Speaker muted'}
            >
              {speakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>

            <button
              type="button"
              onClick={() => void endCall('ended')}
              className="w-14 h-12 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center shadow-lg shadow-rose-500/30"
              title="End call"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RemoteAudioHidden({
  stream,
  speakerOn,
}: {
  stream: MediaStream;
  speakerOn: boolean;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      ref.current.muted = !speakerOn;
    }
  }, [stream, speakerOn]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}
