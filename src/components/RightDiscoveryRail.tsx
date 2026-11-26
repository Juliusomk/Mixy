import React, { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { Bot, Sparkles, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, formatCount, handleFirestoreError, OperationType } from '../lib/firebase';
import { toggleFollowUser } from '../lib/socialActions';
import type { NoteItem, UserPublic } from '../types/mixy';
import { JuliusAvatar } from './JuliusChatPanel';
import { UserAvatar, UserVerifiedBadge, VerifiedBadge } from './MixyLogo';

export function RightDiscoveryRail({
  onOpenProfile,
  onOpenMessages,
  onOpenJulius,
}: {
  onOpenProfile: (uid: string) => void;
  onOpenMessages: () => void;
  onOpenJulius: () => void;
}) {
  const { userPublic, followingIds, pendingFollowIds, userPrivate, onlineUsers } = useAuth();
  const [suggested, setSuggested] = useState<UserPublic[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);

  useEffect(() => {
    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), where('isDeactivated', '==', false), limit(16)),
      (snap) => {
        const blocked = new Set(userPrivate?.blockedIds || []);
        const list = snap.docs
          .map((d) => d.data() as UserPublic)
          .filter(
            (u) =>
              u.uid !== userPublic?.uid &&
              !followingIds.has(u.uid) &&
              !blocked.has(u.uid)
          )
          .slice(0, 5);
        setSuggested(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubNotes = onSnapshot(
      query(
        collection(db, 'notes'),
        where('expiresAt', '>', Timestamp.now()),
        orderBy('expiresAt', 'desc'),
        limit(8)
      ),
      (snap) => {
        const now = Date.now();
        setNotes(
          snap.docs
            .map((d) => d.data() as NoteItem)
            .filter((n) => (n.expiresAt?.toDate?.().getTime() || 0) > now)
            .slice(0, 4)
        );
      },
      () => {}
    );

    return () => {
      unsubUsers();
      unsubNotes();
    };
  }, [userPublic?.uid, followingIds, userPrivate?.blockedIds]);

  return (
    <aside className="hidden xl:block w-80 shrink-0 space-y-5">
      {/* Julius AI Companion Card */}
      <button
        type="button"
        onClick={onOpenJulius}
        className="w-full text-left rounded-3xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/10 via-white to-cyan-500/10 dark:from-fuchsia-500/15 dark:via-[#10101A] dark:to-cyan-500/10 p-4 flex items-center gap-3 hover:border-fuchsia-500/60 transition-colors"
      >
        <JuliusAvatar size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold">Chat with Julius</span>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md mixy-gradient-bg text-white text-[10px] font-bold">
              <Bot className="w-2.5 h-2.5" /> AI
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
            Ideas, captions, or casual chat anytime
          </p>
        </div>
      </button>

      {/* Suggested Accounts */}
      <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-fuchsia-500" />
            Suggested for you
          </h2>
        </div>

        {suggested.length === 0 ? (
          <p className="text-xs text-slate-500">You follow everyone currently active on MIXY.</p>
        ) : (
          <div className="space-y-3">
            {suggested.map((person) => {
              const isPending = pendingFollowIds.has(person.uid);
              return (
                <div key={person.uid} className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => onOpenProfile(person.uid)}
                    className="flex items-center gap-2.5 min-w-0 text-left"
                  >
                    <UserAvatar
                      src={person.photoURL}
                      name={person.displayName}
                      size="sm"
                      isOnline={person.showOnlineStatus !== false && Boolean(onlineUsers[person.uid])}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate flex items-center gap-1">
                        <span className="truncate">{person.displayName}</span>
                        {person.isVerified && (
                          <VerifiedBadge
                            className="w-3 h-3"
                            verificationType={person.verificationType}
                          />
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        @{person.username} · {formatCount(person.followersCount)}
                      </p>
                    </div>
                  </button>
                  <button
                    disabled={followBusyId === person.uid}
                    onClick={async () => {
                      if (!userPublic) return;
                      setFollowBusyId(person.uid);
                      try {
                        await toggleFollowUser(userPublic, person, false);
                      } finally {
                        setFollowBusyId(null);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 ${
                      isPending
                        ? 'border border-slate-200 dark:border-white/15'
                        : 'mixy-gradient-bg text-white hover:opacity-90'
                    }`}
                  >
                    {followBusyId === person.uid ? '...' : isPending ? 'Requested' : 'Follow'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active DM Notes */}
      <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Live Notes
          </h2>
          <button
            onClick={onOpenMessages}
            className="text-xs text-fuchsia-500 font-semibold hover:underline"
          >
            Open DMs
          </button>
        </div>

        {notes.length === 0 ? (
          <p className="text-xs text-slate-500">No active notes. Share a quick vibe in DMs!</p>
        ) : (
          <div className="space-y-2.5">
            {notes.map((n) => (
              <div
                key={n.id}
                className="w-full flex items-center gap-2.5 text-left p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <button
                  onClick={() => onOpenProfile(n.authorId)}
                  className="shrink-0"
                >
                  <UserAvatar src={n.authorPhotoURL} name={n.authorUsername} size="xs" />
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => onOpenProfile(n.authorId)}
                    className="text-xs font-semibold truncate hover:underline flex items-center gap-1"
                  >
                    <span className="truncate">@{n.authorUsername}</span>
                    <UserVerifiedBadge uid={n.authorId} className="w-3 h-3" />
                  </button>
                  <button
                    onClick={onOpenMessages}
                    className="text-xs text-slate-500 truncate block text-left w-full"
                  >
                    {n.text}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
