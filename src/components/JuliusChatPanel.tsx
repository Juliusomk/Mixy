import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Calendar,
  Check,
  Compass,
  Copy,
  FileText,
  Film,
  Hash,
  Loader2,
  MessageSquare,
  Mic,
  Music,
  PenTool,
  Send,
  Shield,
  Sparkles,
  Square,
  Trash2,
  UserPlus,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import {
  auth,
  BLUEPRINT_LIMITS,
  db,
  formatRelativeTime,
  generateId,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { triggerHaptic } from '../lib/haptics';
import { uploadMediaFile } from '../lib/media';
import { toggleFollowUser } from '../lib/socialActions';
import type { JuliusMessage, UserPublic } from '../types/mixy';
import { UserAvatar, UserVerifiedBadge } from './MixyLogo';

export type JuliusStudioMode = 'chat' | 'writing' | 'studio' | 'assistant';

const MODE_TABS: { id: JuliusStudioMode; label: string; icon: React.ReactNode }[] = [
  { id: 'chat', label: 'Chat', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { id: 'writing', label: 'Writing', icon: <PenTool className="w-3.5 h-3.5" /> },
  { id: 'studio', label: 'Studio', icon: <Wand2 className="w-3.5 h-3.5" /> },
  { id: 'assistant', label: 'Guide', icon: <Compass className="w-3.5 h-3.5" /> },
];

const STARTER_PROMPTS: Record<JuliusStudioMode, string[]> = {
  chat: [
    "Hey Julius! What's a fun way to spark engagement with my followers today?",
    'Suggest 5 icebreaker questions I can post on my Story',
    'Help me plan a weekend photo dump theme',
    'Give me an upbeat pep talk before posting my first Reel',
  ],
  writing: [
    'Write 3 catchy captions + hashtags for a sunset city photo',
    'Rewrite my profile bio to sound confident, friendly, and memorable',
    'Fix the grammar and polish this caption: "just chillin wit da squad tonight vibe is immaculate"',
    'Give me 3 natural ways to reply to a friend congratulating me on a new project',
  ],
  studio: [
    'Give me 3 creative Reel video ideas with hook, body, and call-to-action',
    'Build a 5-day MIXY content calendar for a lifestyle & music creator',
    'Write a rhythmic 8-bar rap/song verse about chasing dreams under city lights',
    'Outline a 4-frame interactive MIXY Story sequence using a Poll and Question sticker',
  ],
  assistant: [
    'Explain how Close Friends, Sleep Mode, and Saved Collections work in MIXY',
    'Give me practical privacy and account safety tips for public creators',
    'How can I grow an authentic community on MIXY without spam?',
    'Suggest ways to customize my MIXY DM chat themes and profile effects',
  ],
};

export function JuliusAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass =
    size === 'sm' ? 'w-9 h-9' : size === 'lg' ? 'w-14 h-14' : 'w-11 h-11';
  const iconClass =
    size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';

  return (
    <div className="relative shrink-0">
      <div
        className={`${sizeClass} rounded-full mixy-gradient-bg p-[2px] shadow-md shadow-fuchsia-500/25`}
      >
        <div className="w-full h-full rounded-full bg-[#0D0D18] flex items-center justify-center text-white">
          <Bot className={`${iconClass} text-fuchsia-300`} />
        </div>
      </div>
      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-[#10101A]" />
    </div>
  );
}

export function JuliusChatPanel({
  onBack,
  standalone = false,
  onOpenProfile,
}: {
  onBack?: () => void;
  standalone?: boolean;
  onOpenProfile?: (uid: string) => void;
}) {
  const { userPublic, userPrivate, usersById, followingIds } = useAuth();
  const [mode, setMode] = useState<JuliusStudioMode>('chat');
  const [messages, setMessages] = useState<JuliusMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Voice Input state
  const [listening, setListening] = useState(false);
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  const speechRecRef = useRef<{ stop?: () => void } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  // TTS Playback state
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // Bio Improver confirmation state
  const [bioDraft, setBioDraft] = useState<string | null>(null);
  const [savingBio, setSavingBio] = useState(false);

  // Text / Chat Summarizer modal/drawer state
  const [showSummarizer, setShowSummarizer] = useState(false);
  const [summarizeInput, setSummarizeInput] = useState('');

  // Follow busy state in Guide Suggested Creators
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      try {
        speechRecRef.current?.stop?.();
      } catch {
        // ignore
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      ttsAudioRef.current?.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!userPublic) return;
    setLoadingHistory(true);
    const q = query(
      collection(db, 'users', userPublic.uid, 'juliusMessages'),
      where('ownerId', '==', userPublic.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as JuliusMessage)
          .sort((a, b) => {
            const at = a.createdAt?.toDate?.().getTime() ?? Date.now();
            const bt = b.createdAt?.toDate?.().getTime() ?? Date.now();
            return at - bt;
          });
        setMessages(list);
        setLoadingHistory(false);
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      },
      (err) => {
        setLoadingHistory(false);
        handleFirestoreError(err, OperationType.LIST, `users/${userPublic.uid}/juliusMessages`);
      }
    );
    return () => unsub();
  }, [userPublic]);

  const suggestedCreators = useMemo(() => {
    if (!userPublic) return [];
    const blocked = new Set(userPrivate?.blockedIds || []);
    return Array.from(usersById.values())
      .filter(
        (u) =>
          u.uid !== userPublic.uid &&
          !u.isDeactivated &&
          !blocked.has(u.uid) &&
          !followingIds.has(u.uid)
      )
      .sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0))
      .slice(0, 4);
  }, [usersById, userPublic, userPrivate?.blockedIds, followingIds]);

  const sendToJulius = async (promptText: string, overrideMode?: JuliusStudioMode) => {
    const clean = promptText.trim().slice(0, BLUEPRINT_LIMITS.JULIUS_PROMPT_MAX);
    if (!userPublic || !clean || sending) return;

    setErrorMsg(null);
    setSending(true);
    setInput('');
    triggerHaptic('light');

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setErrorMsg('Please sign in again to chat with Julius.');
      setSending(false);
      return;
    }

    const recentHistory = messages.slice(-16).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    const userMsgId = generateId('jm');
    try {
      await setDoc(doc(db, 'users', userPublic.uid, 'juliusMessages', userMsgId), {
        id: userMsgId,
        ownerId: userPublic.uid,
        role: 'user',
        text: clean,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      setSending(false);
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `users/${userPublic.uid}/juliusMessages/${userMsgId}`
      );
    }

    try {
      const idToken = await currentUser.getIdToken();
      const resp = await apiFetch('/api/ai/julius', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          message: clean,
          mode: overrideMode || mode,
          history: recentHistory,
          userContext: {
            displayName: userPublic.displayName,
            username: userPublic.username,
          },
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };

      if (!resp.ok || !data.reply) {
        setErrorMsg(data.error || 'Julius could not respond right now.');
        setSending(false);
        return;
      }

      const aiMsgId = generateId('jm');
      try {
        await setDoc(doc(db, 'users', userPublic.uid, 'juliusMessages', aiMsgId), {
          id: aiMsgId,
          ownerId: userPublic.uid,
          role: 'assistant',
          text: data.reply.slice(0, BLUEPRINT_LIMITS.JULIUS_MSG_MAX),
          createdAt: serverTimestamp(),
        });
        triggerHaptic('success');
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.CREATE,
          `users/${userPublic.uid}/juliusMessages/${aiMsgId}`
        );
      }
    } catch {
      setErrorMsg('Network error reaching Julius. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendToJulius(input);
  };

  const handleClearChat = async () => {
    if (!userPublic || messages.length === 0 || clearing) return;
    setClearing(true);
    try {
      const batch = writeBatch(db);
      for (const m of messages.slice(0, 450)) {
        batch.delete(doc(db, 'users', userPublic.uid, 'juliusMessages', m.id));
      }
      await batch.commit();
      setConfirmClear(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userPublic.uid}/juliusMessages`);
    } finally {
      setClearing(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      // Clipboard unavailable
    }
  };

  const stopSpeechPlayback = () => {
    ttsAudioRef.current?.pause();
    ttsAudioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMsgId(null);
  };

  const handleSpeakMessage = async (msgId: string, text: string) => {
    if (speakingMsgId === msgId) {
      stopSpeechPlayback();
      return;
    }
    stopSpeechPlayback();

    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setTtsLoadingId(msgId);
    try {
      const token = await currentUser.getIdToken();
      const resp = await apiFetch('/api/ai/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: text.slice(0, 1400),
          voiceName: 'Puck',
        }),
      });
      if (resp.ok) {
        const data = (await resp.json().catch(() => ({}))) as {
          audioBase64?: string;
          mimeType?: string;
        };
        if (data.audioBase64) {
          const audio = new Audio(
            `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`
          );
          ttsAudioRef.current = audio;
          setSpeakingMsgId(msgId);
          audio.onended = () => setSpeakingMsgId((prev) => (prev === msgId ? null : prev));
          audio.onerror = () => setSpeakingMsgId((prev) => (prev === msgId ? null : prev));
          await audio.play();
          return;
        }
      }
      // Browser speech synthesis fallback if server TTS is unavailable
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(text.slice(0, 1000));
        utter.onend = () => setSpeakingMsgId((prev) => (prev === msgId ? null : prev));
        utter.onerror = () => setSpeakingMsgId((prev) => (prev === msgId ? null : prev));
        setSpeakingMsgId(msgId);
        window.speechSynthesis.speak(utter);
      } else {
        setErrorMsg('Voice playback is unavailable right now.');
      }
    } catch {
      setErrorMsg('Could not play voice response right now.');
    } finally {
      setTtsLoadingId(null);
    }
  };

  const toggleVoiceInput = async () => {
    if (listening) {
      try {
        speechRecRef.current?.stop?.();
      } catch {
        // ignore
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      setListening(false);
      return;
    }

    setErrorMsg(null);
    const win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.lang = 'en-US';
        rec.interimResults = false;
        rec.onresult = (evt) => {
          const transcript = evt.results?.[0]?.[0]?.transcript || '';
          if (transcript) {
            setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        };
        rec.onerror = () => setListening(false);
        rec.onend = () => setListening(false);
        speechRecRef.current = rec;
        setListening(true);
        triggerHaptic('light');
        rec.start();
        return;
      } catch {
        setListening(false);
      }
    }

    // Fallback: record audio clip and transcribe with /api/ai/transcribe
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      voiceChunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) voiceChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const blob = new Blob(voiceChunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size < 200) return;
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        setTranscribingVoice(true);
        try {
          const uploaded = await uploadMediaFile(blob, 'julius-voice.webm');
          const token = await currentUser.getIdToken();
          const resp = await apiFetch('/api/ai/transcribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ mediaURL: uploaded.url }),
          });
          const data = (await resp.json().catch(() => ({}))) as {
            transcript?: string;
            error?: string;
          };
          if (resp.ok && data.transcript) {
            setInput((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript!));
          } else {
            setErrorMsg(data.error || 'Could not transcribe voice input.');
          }
        } catch {
          setErrorMsg('Voice transcription failed.');
        } finally {
          setTranscribingVoice(false);
        }
      };
      recorderRef.current = rec;
      setListening(true);
      triggerHaptic('light');
      rec.start();
    } catch {
      setErrorMsg('Microphone permission is required for voice input.');
      setListening(false);
    }
  };

  const handleApplyBio = async () => {
    if (!userPublic || !bioDraft) return;
    const cleanBio = bioDraft.trim().slice(0, BLUEPRINT_LIMITS.BIO_MAX);
    if (!cleanBio) return;
    setSavingBio(true);
    try {
      await updateDoc(doc(db, 'users', userPublic.uid), {
        bio: cleanBio,
        updatedAt: serverTimestamp(),
      });
      setBioDraft(null);
      triggerHaptic('success');
      setStatusNote('Your MIXY profile bio has been updated!');
      window.setTimeout(() => setStatusNote(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userPublic.uid}`);
    } finally {
      setSavingBio(false);
    }
  };

  return (
    <div
      className={`flex flex-col ${
        standalone
          ? 'rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] overflow-hidden h-[calc(100vh-140px)] min-h-[560px]'
          : 'h-full'
      }`}
    >
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#10101A]/95 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <JuliusAvatar size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold truncate">Julius AI Studio</p>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-fuchsia-500/15 text-fuchsia-500 text-[10px] font-bold">
                  <Sparkles className="w-2.5 h-2.5" /> AI
                </span>
              </div>
              <p className="text-[11px] text-emerald-500 font-medium truncate">
                {sending
                  ? 'Julius is composing...'
                  : 'Automated AI companion · Not a human user'}
              </p>
            </div>
          </div>

          {messages.length > 0 && (
            <div className="flex items-center gap-1.5">
              {confirmClear ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleClearChat()}
                    disabled={clearing}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-500 text-white text-xs font-semibold hover:bg-rose-600 disabled:opacity-50"
                  >
                    {clearing ? 'Clearing...' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                  title="Clear chat history"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {MODE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setMode(t.id);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                mode === t.id
                  ? 'mixy-gradient-bg text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode Quick Tools Bar */}
      {mode !== 'chat' && (
        <div className="px-4 py-2 border-b border-slate-200/80 dark:border-white/10 bg-slate-50/90 dark:bg-white/[0.02] flex flex-wrap items-center gap-1.5">
          {mode === 'writing' && (
            <>
              <button
                type="button"
                onClick={() =>
                  setInput('Write 3 engaging MIXY captions and 5 hashtags for a post about: ')
                }
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[11px] font-semibold inline-flex items-center gap-1 hover:border-fuchsia-500"
              >
                <Hash className="w-3 h-3 text-fuchsia-500" /> Caption + Hashtags
              </button>
              <button
                type="button"
                onClick={() =>
                  void sendToJulius(
                    `Improve my MIXY bio. My current bio is: "${userPublic?.bio || 'New on MIXY!'}". Give me 1 clean, punchy bio under 200 characters.`,
                    'writing'
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[11px] font-semibold inline-flex items-center gap-1 hover:border-fuchsia-500"
              >
                <Sparkles className="w-3 h-3 text-fuchsia-500" /> Bio Improver
              </button>
              <button
                type="button"
                onClick={() => setInput('Rewrite and polish this text clearly: ')}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[11px] font-semibold inline-flex items-center gap-1 hover:border-fuchsia-500"
              >
                <PenTool className="w-3 h-3 text-cyan-500" /> Rewrite & Grammar
              </button>
              <button
                type="button"
                onClick={() => setInput('Suggest 3 friendly DM replies to: ')}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[11px] font-semibold inline-flex items-center gap-1 hover:border-fuchsia-500"
              >
                <MessageSquare className="w-3 h-3 text-emerald-500" /> Reply Helper
              </button>
            </>
          )}

          {mode === 'studio' && (
            <>
              <button
                type="button"
                onClick={() =>
                  void sendToJulius(
                    'Give me 3 creative Post & Story ideas I can share on MIXY today.',
                    'studio'
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[11px] font-semibold inline-flex items-center gap-1 hover:border-fuchsia-500"
              >
                <Sparkles className="w-3 h-3 text-fuchsia-500" /> Post & Story Ideas
              </button>
              <button
                type="button"
                onClick={() =>
                  void sendToJulius(
                    'Create a practical 5-day MIXY creator content calendar for me.',
                    'studio'
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[11px] font-semibold inline-flex items-center gap-1 hover:border-fuchsia-500"
              >
                <Calendar className="w-3 h-3 text-cyan-500" /> Content Calendar
              </button>
              <button
                type="button"
                onClick={() => setInput('Write original rap/song lyrics about: ')}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[11px] font-semibold inline-flex items-center gap-1 hover:border-fuchsia-500"
              >
                <Music className="w-3 h-3 text-amber-500" /> Song / Rap Lyrics
              </button>
              <button
                type="button"
                onClick={() => setInput('Write a 20-second vertical Reel script about: ')}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[11px] font-semibold inline-flex items-center gap-1 hover:border-fuchsia-500"
              >
                <Film className="w-3 h-3 text-rose-500" /> Reel Script
              </button>
            </>
          )}

          {mode === 'assistant' && (
            <>
              <button
                type="button"
                onClick={() =>
                  void sendToJulius(
                    'Give me a quick interactive tour of MIXY features (Feed, Stories, Reels, DMs, Sleep Mode, Saved Collections).',
                    'assistant'
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[11px] font-semibold inline-flex items-center gap-1 hover:border-fuchsia-500"
              >
                <BookOpen className="w-3 h-3 text-fuchsia-500" /> MIXY Guide
              </button>
              <button
                type="button"
                onClick={() =>
                  void sendToJulius(
                    'What privacy & safety settings should I review on MIXY to keep my account safe?',
                    'assistant'
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[11px] font-semibold inline-flex items-center gap-1 hover:border-fuchsia-500"
              >
                <Shield className="w-3 h-3 text-emerald-500" /> Privacy Advisor
              </button>
              <button
                type="button"
                onClick={() => setShowSummarizer((v) => !v)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 ${
                  showSummarizer
                    ? 'mixy-gradient-bg text-white border-transparent'
                    : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-fuchsia-500'
                }`}
              >
                <FileText className="w-3 h-3" /> Summarize Text
              </button>
            </>
          )}
        </div>
      )}

      {/* Text Summarizer Drawer */}
      {showSummarizer && (
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#141422] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">Paste text or conversation to summarize</span>
            <button type="button" onClick={() => setShowSummarizer(false)} className="text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea
            rows={3}
            maxLength={1700}
            value={summarizeInput}
            onChange={(e) => setSummarizeInput(e.target.value)}
            placeholder="Paste notes, thread messages, or article text here..."
            className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!summarizeInput.trim() || sending}
              onClick={() => {
                const payload = `Summarize the key points and action items clearly:\n\n${summarizeInput.trim()}`;
                setSummarizeInput('');
                setShowSummarizer(false);
                void sendToJulius(payload, 'assistant');
              }}
              className="px-3.5 h-8 rounded-xl mixy-gradient-bg text-white text-xs font-semibold disabled:opacity-40"
            >
              Summarize with Julius
            </button>
          </div>
        </div>
      )}

      {/* Bio Confirmation Banner */}
      {bioDraft !== null && (
        <div className="px-4 py-3 border-b border-fuchsia-500/30 bg-fuchsia-500/10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-fuchsia-600 dark:text-fuchsia-300">
              Confirm Profile Bio Update (max {BLUEPRINT_LIMITS.BIO_MAX} chars)
            </p>
            <button type="button" onClick={() => setBioDraft(null)} className="text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea
            rows={2}
            maxLength={BLUEPRINT_LIMITS.BIO_MAX}
            value={bioDraft}
            onChange={(e) => setBioDraft(e.target.value)}
            className="w-full p-2.5 rounded-xl bg-white dark:bg-[#10101A] border border-fuchsia-500/30 text-xs"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setBioDraft(null)}
              className="px-3 h-8 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingBio || !bioDraft.trim()}
              onClick={() => void handleApplyBio()}
              className="px-3.5 h-8 rounded-xl mixy-gradient-bg text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              {savingBio && <Loader2 className="w-3 h-3 animate-spin" />}
              Confirm & Apply Bio
            </button>
          </div>
        </div>
      )}

      {statusNote && (
        <div className="px-4 py-2 bg-emerald-500/15 border-b border-emerald-500/25 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
          {statusNote}
        </div>
      )}

      {/* Chat Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 mixy-aurora-surface">
        {mode === 'assistant' && suggestedCreators.length > 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#141422]/90 p-3.5 space-y-2.5">
            <p className="text-xs font-bold flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-fuchsia-500" /> Suggested Creators on MIXY
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {suggestedCreators.map((u: UserPublic) => {
                const busy = followBusyId === u.uid;
                return (
                  <div
                    key={u.uid}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenProfile?.(u.uid)}
                      className="flex items-center gap-2 min-w-0 text-left flex-1"
                    >
                      <UserAvatar src={u.photoURL} name={u.displayName} size="xs" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold flex items-center gap-1 truncate">
                          <span className="truncate">{u.displayName}</span>
                          <UserVerifiedBadge uid={u.uid} fallback={u.isVerified} className="w-3 h-3" />
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">@{u.username}</p>
                      </div>
                    </button>
                    {userPublic && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setFollowBusyId(u.uid);
                          try {
                            await toggleFollowUser(userPublic, u, false);
                            triggerHaptic('success');
                          } finally {
                            setFollowBusyId(null);
                          }
                        }}
                        className="px-2.5 h-7 rounded-lg mixy-gradient-bg text-white text-[11px] font-semibold shrink-0 disabled:opacity-50"
                      >
                        {busy ? '...' : 'Follow'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loadingHistory ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-fuchsia-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-6 space-y-5">
            <JuliusAvatar size="lg" />
            <div className="space-y-1.5 max-w-md">
              <h2 className="text-lg font-bold">
                Hey {userPublic?.displayName?.split(' ')[0] || 'there'}, I'm Julius AI!
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Your transparent AI studio inside MIXY. Switch between Chat, Writing, Creative Studio, and Guide tabs anytime.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-2 w-full max-w-lg">
              {STARTER_PROMPTS[mode].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendToJulius(prompt)}
                  disabled={sending}
                  className="text-left p-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] hover:border-fuchsia-500/50 hover:bg-fuchsia-500/5 transition-colors text-xs font-medium flex items-start gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-fuchsia-500 shrink-0 mt-0.5" />
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.role === 'user';
            const isSpeaking = speakingMsgId === msg.id;
            const isTtsLoading = ttsLoadingId === msg.id;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`group flex items-end gap-2 max-w-[88%] ${
                    isMine ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  {isMine ? (
                    <UserAvatar
                      src={userPublic?.photoURL}
                      name={userPublic?.displayName || 'You'}
                      size="xs"
                    />
                  ) : (
                    <JuliusAvatar size="sm" />
                  )}

                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm space-y-1.5 ${
                      isMine
                        ? 'mixy-gradient-bg text-white rounded-br-sm'
                        : 'bg-white dark:bg-[#171726] border border-slate-200 dark:border-white/10 rounded-bl-sm shadow-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
                    <div className="flex items-center justify-between gap-3 text-[10px] opacity-70">
                      <span>{isMine ? 'You' : 'Julius AI'}</span>
                      <span>{formatRelativeTime(msg.createdAt)}</span>
                    </div>
                  </div>

                  {!isMine && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleCopy(msg.id, msg.text)}
                        className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400"
                        title="Copy response"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isTtsLoading}
                        onClick={() => void handleSpeakMessage(msg.id, msg.text)}
                        className={`p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 ${
                          isSpeaking ? 'text-fuchsia-500' : 'text-slate-400'
                        }`}
                        title={isSpeaking ? 'Stop audio' : 'Read aloud'}
                      >
                        {isTtsLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isSpeaking ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {mode === 'writing' && (
                        <button
                          type="button"
                          onClick={() => setBioDraft(msg.text.slice(0, BLUEPRINT_LIMITS.BIO_MAX))}
                          className="p-1.5 rounded-full hover:bg-fuchsia-500/15 text-fuchsia-500"
                          title="Use as Profile Bio draft"
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {sending && (
          <div className="flex items-end gap-2">
            <JuliusAvatar size="sm" />
            <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-white dark:bg-[#171726] border border-slate-200 dark:border-white/10 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-fuchsia-500" />
              <span>Julius is thinking...</span>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="px-4 py-2 bg-rose-500/10 border-t border-rose-500/20 flex items-center justify-between gap-2 text-xs text-rose-500">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="font-semibold hover:underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-slate-200 dark:border-white/10 flex items-center gap-2 bg-white dark:bg-[#10101A]"
      >
        <button
          type="button"
          onClick={() => void toggleVoiceInput()}
          disabled={transcribingVoice || sending}
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            listening
              ? 'bg-rose-500 text-white animate-pulse'
              : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
          }`}
          title={listening ? 'Stop voice input' : 'Speak prompt'}
          aria-label={listening ? 'Stop voice input' : 'Speak prompt'}
        >
          {transcribingVoice ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : listening ? (
            <Square className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>
        <input
          type="text"
          maxLength={BLUEPRINT_LIMITS.JULIUS_PROMPT_MAX}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            listening
              ? 'Listening...'
              : mode === 'writing'
                ? 'Describe your post or paste text to polish...'
                : mode === 'studio'
                  ? 'Ask Julius Studio for ideas, lyrics, or Reel scripts...'
                  : mode === 'assistant'
                    ? 'Ask how MIXY features or privacy settings work...'
                    : 'Message Julius AI...'
          }
          className="flex-1 h-10 px-4 rounded-full bg-slate-100 dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="w-10 h-10 rounded-full mixy-gradient-bg text-white flex items-center justify-center disabled:opacity-40 shadow-md shadow-fuchsia-500/20"
          title="Send to Julius"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
