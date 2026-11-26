import { realtimeClient } from './realtime';

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export interface PeerConnectionEntry {
  uid: string;
  pc: RTCPeerConnection;
  remoteStream: MediaStream;
  iceQueue: RTCIceCandidateInit[];
  remoteDescSet: boolean;
}

export interface CallNetworkStats {
  quality: 'excellent' | 'good' | 'fair' | 'connecting';
  rttMs: number | null;
}

export function createPeerEntry(params: {
  callId: string;
  peerUid: string;
  localStream: MediaStream | null;
  onRemoteStream: (peerUid: string, stream: MediaStream) => void;
  onConnectionStateChange?: (peerUid: string, state: RTCPeerConnectionState) => void;
}): PeerConnectionEntry {
  const { callId, peerUid, localStream, onRemoteStream, onConnectionStateChange } = params;
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const remoteStream = new MediaStream();

  if (localStream) {
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }
  }

  const entry: PeerConnectionEntry = {
    uid: peerUid,
    pc,
    remoteStream,
    iceQueue: [],
    remoteDescSet: false,
  };

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      realtimeClient.sendCallSignal({
        type: 'call:ice',
        callId,
        targetUid: peerUid,
        candidate: ev.candidate.toJSON(),
      });
    }
  };

  pc.ontrack = (ev) => {
    if (ev.streams && ev.streams[0]) {
      for (const t of ev.streams[0].getTracks()) {
        if (!remoteStream.getTracks().some((existing) => existing.id === t.id)) {
          remoteStream.addTrack(t);
        }
      }
    } else if (ev.track) {
      if (!remoteStream.getTracks().some((existing) => existing.id === ev.track.id)) {
        remoteStream.addTrack(ev.track);
      }
    }
    onRemoteStream(peerUid, remoteStream);
  };

  pc.onconnectionstatechange = () => {
    onConnectionStateChange?.(peerUid, pc.connectionState);
  };

  return entry;
}

export async function flushIceQueue(entry: PeerConnectionEntry): Promise<void> {
  while (entry.iceQueue.length > 0) {
    const cand = entry.iceQueue.shift();
    if (cand) {
      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch {
        // Ignore stale candidate
      }
    }
  }
}

export async function readPeerStats(pc: RTCPeerConnection): Promise<CallNetworkStats> {
  if (pc.connectionState !== 'connected') {
    return { quality: 'connecting', rttMs: null };
  }
  try {
    const report = await pc.getStats();
    let rttMs: number | null = null;
    report.forEach((stat) => {
      if (stat.type === 'candidate-pair' && 'state' in stat && stat.state === 'succeeded') {
        const rtt = (stat as { currentRoundTripTime?: number }).currentRoundTripTime;
        if (typeof rtt === 'number') {
          rttMs = Math.round(rtt * 1000);
        }
      }
    });
    if (rttMs === null) return { quality: 'good', rttMs: null };
    if (rttMs <= 120) return { quality: 'excellent', rttMs };
    if (rttMs <= 280) return { quality: 'good', rttMs };
    return { quality: 'fair', rttMs };
  } catch {
    return { quality: 'good', rttMs: null };
  }
}
