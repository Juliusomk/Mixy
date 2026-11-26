import React, { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AtSign,
  Bell,
  CheckCheck,
  Heart,
  MessageCircle,
  Phone,
  Repeat,
  Settings,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, formatRelativeTime, handleFirestoreError, OperationType } from '../lib/firebase';
import type { NotificationItem } from '../types/mixy';
import { UserAvatar, UserVerifiedBadge, VerifiedBadge } from './MixyLogo';

export function NotificationsView({
  onOpenProfile,
  onOpenMessages,
  onOpenSettings,
}: {
  onOpenProfile: (uid: string) => void;
  onOpenMessages: () => void;
  onOpenSettings: () => void;
}) {
  const { userPublic } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    if (!userPublic) return;
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', userPublic.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const sorted = snap.docs
          .map((d) => d.data() as NotificationItem)
          .sort(
            (a, b) =>
              (b.createdAt?.toDate?.().getTime() || 0) -
              (a.createdAt?.toDate?.().getTime() || 0)
          );
        setItems(sorted);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );
    return () => unsub();
  }, [userPublic]);

  const markAllRead = async () => {
    const unread = items.filter((n) => !n.isRead);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    for (const n of unread) {
      batch.update(doc(db, 'notifications', n.id), { isRead: true });
    }
    await batch.commit();
  };

  const handleOpenNotification = async (n: NotificationItem) => {
    if (!n.isRead) {
      await updateDoc(doc(db, 'notifications', n.id), { isRead: true });
    }
    if (
      n.type === 'message' ||
      n.type === 'missed_call' ||
      n.type === 'incoming_call' ||
      n.type === 'group_invite'
    ) {
      onOpenMessages();
    } else if (n.actorId) {
      onOpenProfile(n.actorId);
    }
  };

  const getTypeIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'like':
        return <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />;
      case 'follow':
        return <UserPlus className="w-4 h-4 text-sky-500" />;
      case 'repost':
        return <Repeat className="w-4 h-4 text-emerald-500" />;
      case 'missed_call':
      case 'incoming_call':
        return <Phone className="w-4 h-4 text-rose-500" />;
      case 'comment':
      case 'reply':
      case 'message':
      case 'group_invite':
        return <MessageCircle className="w-4 h-4 text-fuchsia-500" />;
      case 'mention':
      case 'tag':
        return <AtSign className="w-4 h-4 text-indigo-400" />;
      case 'story_reaction':
        return <Sparkles className="w-4 h-4 text-amber-400" />;
      case 'verification':
        return <VerifiedBadge className="w-4 h-4" />;
      default:
        return <ShieldAlert className="w-4 h-4 text-amber-500" />;
    }
  };

  const displayed = filter === 'unread' ? items.filter((i) => !i.isRead) : items;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Activity across likes, comments, follows, messages, and mentions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={markAllRead}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <CheckCheck className="w-4 h-4 text-fuchsia-500" /> Mark all read
          </button>
          <button
            onClick={onOpenSettings}
            className="w-9 h-9 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
            title="Notification preferences"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-white/5 w-fit">
        {(['all', 'unread'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize ${
              filter === f
                ? 'bg-white dark:bg-[#1A1A28] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-12 text-center space-y-3">
          <Bell className="w-10 h-10 text-slate-400 mx-auto" />
          <p className="font-semibold">You're all caught up</p>
          <p className="text-sm text-slate-500">
            New follows, likes, comments, story reactions, and messages will appear here in real time.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] divide-y divide-slate-100 dark:divide-white/5 overflow-hidden">
          {displayed.map((n) => (
            <div
              key={n.id}
              className={`flex items-center justify-between gap-3 p-4 transition-colors ${
                !n.isRead ? 'bg-fuchsia-500/[0.06]' : ''
              }`}
            >
              <button
                onClick={() => handleOpenNotification(n)}
                className="flex items-center gap-3 text-left flex-1 min-w-0"
              >
                <div className="relative">
                  <UserAvatar src={n.actorPhotoURL} name={n.actorUsername} size="md" />
                  <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 flex items-center justify-center">
                    {getTypeIcon(n.type)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  {n.actorUsername && (
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1 mb-0.5">
                      <span>@{n.actorUsername}</span>
                      <UserVerifiedBadge uid={n.actorId} className="w-3.5 h-3.5" />
                    </p>
                  )}
                  <p className="text-sm leading-snug">{n.text}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{formatRelativeTime(n.createdAt)}</p>
                </div>
              </button>

              <div className="flex items-center gap-2 shrink-0">
                {!n.isRead && (
                  <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500" title="Unread" />
                )}
                <button
                  onClick={() => deleteDoc(doc(db, 'notifications', n.id))}
                  className="p-2 text-slate-400 hover:text-rose-500 rounded-lg"
                  aria-label="Remove notification"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
