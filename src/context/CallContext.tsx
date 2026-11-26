import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { db, generateId } from '../lib/firebase';
import { realtimeClient } from '../lib/realtime';
import { sendCallNotification } from '../lib/socialActions';
import {
  playCallConnectTone,
  playCallEndTone,
  startCallRingtone,
  stopCallRingtone,
} from '../lib/soundEffects';
import {
  createPeerEntry,
  flushIceQueue,
  readPeerStats,
  type CallNetworkStats,
  type PeerConnectionEntry,
} from '../lib/webrtc';
import type { CallType, Conversation, UserPublic } from '../types/mixy';

export interface ActiveCallSession {
  callId: string;
  conversationId: string;
  callType: CallType;
  isGroup: boolean;
  direction: 'outgoing' | 'incoming';
  status: 'ringing' | 'connecting' | 'active';
  participantIds: string[];
  remotePeers: {
    uid: string;
    username: string;
    displayName: string;
    photoURL?: string;
  }[];
  startedAtMs: number | null;
}

interface CallContextValue {
  activeCall: ActiveCallSession | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  peerMediaStates: Record<string, { micMuted?: boolean; camOff?: boolean }>;
  micMuted: boolean;
  camOff: boolean;
  speakerOn: boolean;
  cameraFacing: 'user' | 'environment';
  durationSec: number;
  networkStats: CallNetworkStats;
  callError: string;
  startCall: (params: {
    conversation: Conversation;
    peers: UserPublic[];
    callType: CallType;
  }) => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  declineIncomingCall: () => Promise<void>;
  endCall: (reason?: 'ended' | 'missed') => Promise<void>;
  toggleMic: () => void;
  toggleCamera: () => void;
  flipCamera: () => Promise<void>;
  toggleSpeaker: () => void;
  clearCallError: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { userPublic, userPrivate, isSleeping, followingIds } = useAuth();

  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [peerMediaStates, setPeerMediaStates] = useState<
    Record<string, { micMuted?: boolean; camOff?: boolean }>
  >({});
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [durationSec, setDurationSec] = useState(0);
  const [networkStats, setNetworkStats] = useState<CallNetworkStats>({
    quality: 'connecting',
    rttMs: null,
  });
  const [callError, setCallError] = useState('');

  const activeCallRef = useRef<ActiveCallSession | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerConnectionEntry>>(new Map());
  const ringTimeoutRef = useRef<number | null>(null);
  const durationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    if (userPrivate?.preferredCameraFacing) {
      setCameraFacing(userPrivate.preferredCameraFacing);
    }
  }, [userPrivate?.preferredCameraFacing]);

  const cleanupCallResources = useCallback(() => {
    stopCallRingtone();
    if (ringTimeoutRef.current !== null) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (durationTimerRef.current !== null) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    for (const entry of peersRef.current.values()) {
      try {
        entry.pc.close();
      } catch {
        // Ignore
      }
    }
    peersRef.current.clear();
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) {
        t.stop();
      }
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStreams({});
    setPeerMediaStates({});
    setMicMuted(false);
    setCamOff(false);
    setDurationSec(0);
    setNetworkStats({ quality: 'connecting', rttMs: null });
    setActiveCall(null);
  }, []);

  const acquireUserMedia = useCallback(
    async (callType: CallType, facing: 'user' | 'environment'): Promise<MediaStream> => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support WebRTC microphone/camera calling.');
      }
      const savedMic = localStorage.getItem('mixy_preferred_mic_id') || '';
      const audioConstraint: MediaTrackConstraints | boolean = savedMic
        ? { deviceId: { ideal: savedMic }, echoCancellation: true, noiseSuppression: true }
        : { echoCancellation: true, noiseSuppression: true };
      const videoConstraint: MediaTrackConstraints | boolean =
        callType === 'video'
          ? { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : false;
      return navigator.mediaDevices.getUserMedia({
        audio: audioConstraint,
        video: videoConstraint,
      });
    },
    []
  );

  const ensurePeerEntry = useCallback(
    (callId: string, peerUid: string): PeerConnectionEntry => {
      const existing = peersRef.current.get(peerUid);
      if (existing) return existing;
      const entry = createPeerEntry({
        callId,
        peerUid,
        localStream: localStreamRef.current,
        onRemoteStream: (uid, stream) => {
          setRemoteStreams((prev) => ({ ...prev, [uid]: stream }));
        },
        onConnectionStateChange: (_uid, state) => {
          if (state === 'connected') {
            setActiveCall((prev) =>
              prev && prev.callId === callId
                ? {
                    ...prev,
                    status: 'active',
                    startedAtMs: prev.startedAtMs || Date.now(),
                  }
                : prev
            );
          }
        },
      });
      peersRef.current.set(peerUid, entry);
      return entry;
    },
    []
  );

  // Live duration & WebRTC stats polling while active
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'active') return;
    const started = activeCall.startedAtMs || Date.now();
    durationTimerRef.current = window.setInterval(() => {
      setDurationSec(Math.max(0, Math.floor((Date.now() - started) / 1000)));
      const firstPeer = peersRef.current.values().next().value as PeerConnectionEntry | undefined;
      if (firstPeer) {
        void readPeerStats(firstPeer.pc).then(setNetworkStats);
      }
    }, 1000);
    return () => {
      if (durationTimerRef.current !== null) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };
  }, [activeCall?.callId, activeCall?.status, activeCall?.startedAtMs]);

  const persistCallUpdate = useCallback(
    async (
      callId: string,
      status: 'active' | 'ended' | 'missed' | 'declined',
      sec = 0
    ) => {
      try {
        const payload: Record<string, unknown> = {
          status,
          durationSec: Math.max(0, Math.round(sec)),
          updatedAt: serverTimestamp(),
        };
        if (status === 'active') payload.startedAt = serverTimestamp();
        if (status === 'ended' || status === 'missed' || status === 'declined') {
          payload.endedAt = serverTimestamp();
        }
        await updateDoc(doc(db, 'calls', callId), payload);
      } catch {
        // Ignore if already in terminal state
      }
    },
    []
  );

  const endCall = useCallback(
    async (reason: 'ended' | 'missed' = 'ended') => {
      const cur = activeCallRef.current;
      if (!cur || !userPublic) {
        cleanupCallResources();
        return;
      }
      const elapsed = cur.startedAtMs
        ? Math.max(0, Math.floor((Date.now() - cur.startedAtMs) / 1000))
        : 0;
      const recipientIds = cur.participantIds.filter((id) => id !== userPublic.uid);
      realtimeClient.sendCallSignal({
        type: 'call:end',
        callId: cur.callId,
        recipientIds,
        reason,
      });
      playCallEndTone();
      const finalStatus = cur.status === 'ringing' && cur.direction === 'outgoing' ? 'missed' : reason;
      await persistCallUpdate(cur.callId, finalStatus, elapsed);
      if (finalStatus === 'missed' && cur.direction === 'outgoing') {
        for (const rid of recipientIds) {
          await sendCallNotification({
            recipientId: rid,
            actor: userPublic,
            type: 'missed_call',
            callId: cur.callId,
            callType: cur.callType,
          });
        }
      }
      cleanupCallResources();
    },
    [userPublic, cleanupCallResources, persistCallUpdate]
  );

  const startCall = useCallback(
    async ({
      conversation,
      peers,
      callType,
    }: {
      conversation: Conversation;
      peers: UserPublic[];
      callType: CallType;
    }) => {
      if (!userPublic || activeCallRef.current) return;
      setCallError('');
      const callId = generateId('call');
      const recipientIds = conversation.participantIds.filter((id) => id !== userPublic.uid);
      const facing = userPrivate?.preferredCameraFacing || 'user';

      try {
        const stream = await acquireUserMedia(callType, facing);
        localStreamRef.current = stream;
        setLocalStream(stream);
        setCameraFacing(facing);

        const session: ActiveCallSession = {
          callId,
          conversationId: conversation.id,
          callType,
          isGroup: conversation.isGroup,
          direction: 'outgoing',
          status: 'ringing',
          participantIds: conversation.participantIds,
          remotePeers: peers.map((p) => ({
            uid: p.uid,
            username: p.username,
            displayName: p.displayName,
            photoURL: p.photoURL,
          })),
          startedAtMs: null,
        };
        setActiveCall(session);

        await setDoc(doc(db, 'calls', callId), {
          id: callId,
          conversationId: conversation.id,
          callerId: userPublic.uid,
          callerUsername: userPublic.username,
          callerPhotoURL: userPublic.photoURL || '',
          participantIds: conversation.participantIds,
          isGroup: conversation.isGroup,
          callType,
          status: 'ringing',
          durationSec: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        realtimeClient.sendCallSignal({
          type: 'call:invite',
          callId,
          conversationId: conversation.id,
          callType,
          isGroup: conversation.isGroup,
          participantIds: conversation.participantIds,
          recipientIds,
          callerUsername: userPublic.username,
          callerDisplayName: userPublic.displayName,
          callerPhotoURL: userPublic.photoURL || '',
        });

        if (userPrivate?.dmSoundEnabled !== false) {
          startCallRingtone('outgoing');
        }

        // Auto-miss after 35 seconds if nobody answers
        ringTimeoutRef.current = window.setTimeout(() => {
          const latest = activeCallRef.current;
          if (latest && latest.callId === callId && latest.status === 'ringing') {
            void endCall('missed');
          }
        }, 35_000);
      } catch (err) {
        cleanupCallResources();
        setCallError(
          err instanceof Error
            ? err.message
            : 'Unable to access microphone or camera. Please check browser permissions.'
        );
      }
    },
    [userPublic, userPrivate, acquireUserMedia, cleanupCallResources, endCall]
  );

  const acceptIncomingCall = useCallback(async () => {
    const cur = activeCallRef.current;
    if (!cur || !userPublic) return;
    stopCallRingtone();
    setCallError('');
    const facing = userPrivate?.preferredCameraFacing || 'user';
    try {
      const stream = await acquireUserMedia(cur.callType, facing);
      localStreamRef.current = stream;
      setLocalStream(stream);
      setCameraFacing(facing);
      setActiveCall((prev) => (prev ? { ...prev, status: 'connecting' } : prev));
      playCallConnectTone();

      const targets = cur.participantIds.filter((id) => id !== userPublic.uid);
      realtimeClient.sendCallSignal({
        type: 'call:accept',
        callId: cur.callId,
        conversationId: cur.conversationId,
        recipientIds: targets,
      });
    } catch (err) {
      setCallError(
        err instanceof Error
          ? err.message
          : 'Could not access microphone/camera to answer call.'
      );
      await declineIncomingCall();
    }
  }, [userPublic, userPrivate, acquireUserMedia]);

  const declineIncomingCall = useCallback(async () => {
    const cur = activeCallRef.current;
    if (!cur || !userPublic) {
      cleanupCallResources();
      return;
    }
    const targets = cur.participantIds.filter((id) => id !== userPublic.uid);
    realtimeClient.sendCallSignal({
      type: 'call:decline',
      callId: cur.callId,
      recipientIds: targets,
      reason: 'declined',
    });
    await persistCallUpdate(cur.callId, 'declined', 0);
    cleanupCallResources();
  }, [userPublic, cleanupCallResources, persistCallUpdate]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream || !activeCallRef.current || !userPublic) return;
    const nextMuted = !micMuted;
    for (const t of stream.getAudioTracks()) {
      t.enabled = !nextMuted;
    }
    setMicMuted(nextMuted);
    const targets = activeCallRef.current.participantIds.filter((id) => id !== userPublic.uid);
    realtimeClient.sendCallSignal({
      type: 'call:media-state',
      callId: activeCallRef.current.callId,
      recipientIds: targets,
      micMuted: nextMuted,
      camOff,
    });
  }, [micMuted, camOff, userPublic]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream || !activeCallRef.current || !userPublic) return;
    const nextOff = !camOff;
    for (const t of stream.getVideoTracks()) {
      t.enabled = !nextOff;
    }
    setCamOff(nextOff);
    const targets = activeCallRef.current.participantIds.filter((id) => id !== userPublic.uid);
    realtimeClient.sendCallSignal({
      type: 'call:media-state',
      callId: activeCallRef.current.callId,
      recipientIds: targets,
      micMuted,
      camOff: nextOff,
    });
  }, [camOff, micMuted, userPublic]);

  const flipCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    const cur = activeCallRef.current;
    if (!stream || !cur || cur.callType !== 'video') return;
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    try {
      const nextVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const newVideoTrack = nextVideoStream.getVideoTracks()[0];
      if (!newVideoTrack) return;
      newVideoTrack.enabled = !camOff;

      // Replace old video track on local stream
      for (const oldTrack of stream.getVideoTracks()) {
        stream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      stream.addTrack(newVideoTrack);
      setLocalStream(new MediaStream(stream.getTracks()));
      setCameraFacing(nextFacing);

      // Replace track on all active RTCPeerConnections
      for (const entry of peersRef.current.values()) {
        const sender = entry.pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newVideoTrack);
        }
      }
    } catch {
      setCallError('Unable to switch camera on this device.');
    }
  }, [cameraFacing, camOff]);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((v) => !v);
  }, []);

  // Listen to WebSocket call signaling events
  useEffect(() => {
    if (!userPublic) return;
    return realtimeClient.onCallSignal(async (ev) => {
      const cur = activeCallRef.current;

      if (ev.type === 'call:invite') {
        if (cur) {
          realtimeClient.sendCallSignal({
            type: 'call:decline',
            callId: ev.callId,
            targetUid: ev.callerUid,
            reason: 'busy',
          });
          return;
        }
        // Check Sleep Mode & Priority bypass
        const priorityIds = userPrivate?.sleepPriorityIds || [];
        if (isSleeping && !priorityIds.includes(ev.callerUid)) {
          realtimeClient.sendCallSignal({
            type: 'call:decline',
            callId: ev.callId,
            targetUid: ev.callerUid,
            reason: 'sleep_mode',
          });
          return;
        }
        // Check call permissions
        const perm =
          ev.callType === 'video'
            ? userPrivate?.callVideoAllowed || 'everyone'
            : userPrivate?.callVoiceAllowed || 'everyone';
        if (
          perm === 'nobody' ||
          (perm === 'followers' && !followingIds.has(ev.callerUid))
        ) {
          realtimeClient.sendCallSignal({
            type: 'call:decline',
            callId: ev.callId,
            targetUid: ev.callerUid,
            reason: 'restricted',
          });
          return;
        }

        if (userPrivate?.callIncomingBanner === false) {
          return;
        }

        setActiveCall({
          callId: ev.callId,
          conversationId: ev.conversationId,
          callType: ev.callType,
          isGroup: ev.isGroup,
          direction: 'incoming',
          status: 'ringing',
          participantIds: ev.participantIds,
          remotePeers: [
            {
              uid: ev.callerUid,
              username: ev.callerUsername,
              displayName: ev.callerDisplayName || ev.callerUsername,
              photoURL: ev.callerPhotoURL,
            },
          ],
          startedAtMs: null,
        });

        realtimeClient.sendCallSignal({
          type: 'call:ringing',
          callId: ev.callId,
          targetUid: ev.callerUid,
        });
        if (!isSleeping && userPrivate?.dmSoundEnabled !== false) {
          startCallRingtone('incoming');
        }
        return;
      }

      if (!cur || ev.callId !== cur.callId) return;

      if (ev.type === 'call:accept') {
        stopCallRingtone();
        if (ringTimeoutRef.current !== null) {
          clearTimeout(ringTimeoutRef.current);
          ringTimeoutRef.current = null;
        }
        playCallConnectTone();
        setActiveCall((prev) =>
          prev
            ? {
                ...prev,
                status: 'active',
                startedAtMs: prev.startedAtMs || Date.now(),
              }
            : prev
        );
        void persistCallUpdate(cur.callId, 'active', 0);

        const entry = ensurePeerEntry(cur.callId, ev.fromUid);
        const offer = await entry.pc.createOffer();
        await entry.pc.setLocalDescription(offer);
        realtimeClient.sendCallSignal({
          type: 'call:offer',
          callId: cur.callId,
          targetUid: ev.fromUid,
          sdp: offer,
        });
        return;
      }

      if (ev.type === 'call:offer') {
        const entry = ensurePeerEntry(cur.callId, ev.fromUid);
        await entry.pc.setRemoteDescription(new RTCSessionDescription(ev.sdp));
        entry.remoteDescSet = true;
        await flushIceQueue(entry);
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        realtimeClient.sendCallSignal({
          type: 'call:answer',
          callId: cur.callId,
          targetUid: ev.fromUid,
          sdp: answer,
        });
        setActiveCall((prev) =>
          prev
            ? {
                ...prev,
                status: 'active',
                startedAtMs: prev.startedAtMs || Date.now(),
              }
            : prev
        );
        return;
      }

      if (ev.type === 'call:answer') {
        const entry = peersRef.current.get(ev.fromUid);
        if (!entry) return;
        await entry.pc.setRemoteDescription(new RTCSessionDescription(ev.sdp));
        entry.remoteDescSet = true;
        await flushIceQueue(entry);
        return;
      }

      if (ev.type === 'call:ice') {
        const entry = ensurePeerEntry(cur.callId, ev.fromUid);
        if (entry.remoteDescSet) {
          try {
            await entry.pc.addIceCandidate(new RTCIceCandidate(ev.candidate));
          } catch {
            // Ignore
          }
        } else {
          entry.iceQueue.push(ev.candidate);
        }
        return;
      }

      if (ev.type === 'call:media-state') {
        setPeerMediaStates((prev) => ({
          ...prev,
          [ev.fromUid]: { micMuted: ev.micMuted, camOff: ev.camOff },
        }));
        return;
      }

      if (ev.type === 'call:decline' || ev.type === 'call:end') {
        if (cur.isGroup && peersRef.current.size > 1 && ev.type === 'call:end') {
          const leftEntry = peersRef.current.get(ev.fromUid);
          leftEntry?.pc.close();
          peersRef.current.delete(ev.fromUid);
          setRemoteStreams((prev) => {
            const copy = { ...prev };
            delete copy[ev.fromUid];
            return copy;
          });
          return;
        }
        if (ev.type === 'call:decline') {
          if (ev.reason === 'sleep_mode') {
            setCallError('Recipient currently has Sleep Mode enabled.');
          } else if (ev.reason === 'busy') {
            setCallError('Recipient is currently on another call.');
          }
        }
        playCallEndTone();
        cleanupCallResources();
      }
    });
  }, [
    userPublic,
    userPrivate,
    isSleeping,
    followingIds,
    ensurePeerEntry,
    persistCallUpdate,
    cleanupCallResources,
  ]);

  return (
    <CallContext.Provider
      value={{
        activeCall,
        localStream,
        remoteStreams,
        peerMediaStates,
        micMuted,
        camOff,
        speakerOn,
        cameraFacing,
        durationSec,
        networkStats,
        callError,
        startCall,
        acceptIncomingCall,
        declineIncomingCall,
        endCall,
        toggleMic,
        toggleCamera,
        flipCamera,
        toggleSpeaker,
        clearCallError: () => setCallError(''),
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside CallProvider');
  return ctx;
}
