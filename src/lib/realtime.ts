import { wsUrl } from './api';
import { auth } from './firebase';

export type CallSignalEvent =
  | {
      type: 'call:invite';
      callId: string;
      conversationId: string;
      callType: 'voice' | 'video';
      isGroup: boolean;
      participantIds: string[];
      callerUid: string;
      callerUsername: string;
      callerDisplayName: string;
      callerPhotoURL: string;
    }
  | {
      type: 'call:invite-ack';
      callId: string;
      reachableUids: string[];
    }
  | {
      type: 'call:ringing' | 'call:accept' | 'call:decline' | 'call:end' | 'call:media-state';
      callId: string;
      conversationId?: string;
      fromUid: string;
      micMuted?: boolean;
      camOff?: boolean;
      reason?: string;
    }
  | {
      type: 'call:offer' | 'call:answer';
      callId: string;
      fromUid: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: 'call:ice';
      callId: string;
      fromUid: string;
      candidate: RTCIceCandidateInit;
    };

type PresenceListener = (online: Record<string, boolean>, lastSeen: Record<string, string>) => void;
type TypingListener = (conversationId: string, uid: string, isTyping: boolean) => void;
type CallSignalListener = (event: CallSignalEvent) => void;

class MixyRealtimeClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private onlineMap: Record<string, boolean> = {};
  private lastSeenMap: Record<string, string> = {};
  private presenceListeners = new Set<PresenceListener>();
  private typingListeners = new Set<TypingListener>();
  private callListeners = new Set<CallSignalListener>();
  private showOnline = true;

  async connect(showOnline = true): Promise<void> {
    this.showOnline = showOnline;
    const user = auth.currentUser;
    if (!user) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = await user.getIdToken();
    const socket = new WebSocket(wsUrl('/ws'));
    this.ws = socket;

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'auth',
          token,
          showOnline: this.showOnline,
        })
      );
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown> & {
          type?: string;
          online?: Record<string, boolean>;
          lastSeen?: Record<string, string>;
          uid?: string;
          isOnline?: boolean;
          lastSeenAt?: string;
          conversationId?: string;
          isTyping?: boolean;
        };

        if (msg.type === 'presence:snapshot') {
          this.onlineMap = msg.online || {};
          this.lastSeenMap = msg.lastSeen || {};
          this.emitPresence();
        } else if (msg.type === 'presence:update' && msg.uid) {
          this.onlineMap = { ...this.onlineMap, [msg.uid]: Boolean(msg.isOnline) };
          if (msg.lastSeenAt) {
            this.lastSeenMap = { ...this.lastSeenMap, [msg.uid]: msg.lastSeenAt };
          }
          this.emitPresence();
        } else if (msg.type === 'typing' && msg.conversationId && msg.uid) {
          for (const cb of this.typingListeners) {
            cb(msg.conversationId, msg.uid, Boolean(msg.isTyping));
          }
        } else if (typeof msg.type === 'string' && msg.type.startsWith('call:')) {
          for (const cb of this.callListeners) {
            cb(msg as unknown as CallSignalEvent);
          }
        }
      } catch {
        // Ignore non-JSON frames
      }
    };

    socket.onclose = () => {
      this.ws = null;
      if (auth.currentUser && this.reconnectTimer === null) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null;
          void this.connect(this.showOnline);
        }, 3000);
      }
    };
  }

  disconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  updateVisibility(showOnline: boolean): void {
    this.showOnline = showOnline;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'presence:visibility', showOnline }));
    }
  }

  sendTyping(conversationId: string, recipientIds: string[], isTyping: boolean): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'typing',
          conversationId,
          recipientIds,
          isTyping,
        })
      );
    }
  }

  sendCallSignal(payload: Record<string, unknown>): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  onPresence(cb: PresenceListener): () => void {
    this.presenceListeners.add(cb);
    cb(this.onlineMap, this.lastSeenMap);
    return () => this.presenceListeners.delete(cb);
  }

  onTyping(cb: TypingListener): () => void {
    this.typingListeners.add(cb);
    return () => this.typingListeners.delete(cb);
  }

  onCallSignal(cb: CallSignalListener): () => void {
    this.callListeners.add(cb);
    return () => this.callListeners.delete(cb);
  }

  private emitPresence(): void {
    for (const cb of this.presenceListeners) {
      cb(this.onlineMap, this.lastSeenMap);
    }
  }
}

export const realtimeClient = new MixyRealtimeClient();
