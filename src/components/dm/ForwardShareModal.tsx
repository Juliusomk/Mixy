import React, { useMemo, useState } from 'react';
import { Check, Copy, Loader2, Search, Send, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getOrCreateDirectConversation, sendConversationMessage } from '../../lib/socialActions';
import type { Conversation, Message, UserPublic } from '../../types/mixy';
import { UserAvatar, UserVerifiedBadge } from '../MixyLogo';

export function ForwardShareModal({
  title,
  messagesToForward,
  shareUrl,
  conversations,
  usersMap,
  onClose,
}: {
  title: string;
  messagesToForward: Message[];
  shareUrl?: string;
  conversations: Conversation[];
  usersMap: Map<string, UserPublic>;
  onClose: () => void;
}) {
  const { userPublic, followingIds, userPrivate } = useAuth();
  const [search, setSearch] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const blockedSet = useMemo(() => new Set(userPrivate?.blockedIds || []), [userPrivate?.blockedIds]);

  const targets = useMemo(() => {
    const items: {
      key: string;
      label: string;
      sub: string;
      avatar?: string;
      conv?: Conversation;
      user?: UserPublic;
    }[] = [];

    for (const c of conversations) {
      if (c.isGroup) {
        items.push({
          key: `conv:${c.id}`,
          label: c.groupName || 'Group Chat',
          sub: `${c.participantIds.length} members`,
          avatar: c.groupPhotoURL,
          conv: c,
        });
      }
    }
    for (const u of usersMap.values()) {
      if (u.uid === userPublic?.uid || blockedSet.has(u.uid)) continue;
      items.push({
        key: `user:${u.uid}`,
        label: u.displayName,
        sub: `@${u.username}`,
        avatar: u.photoURL,
        user: u,
      });
    }
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.sub.toLowerCase().includes(q)
    );
  }, [conversations, usersMap, userPublic?.uid, blockedSet, search]);

  const handleSendAll = async () => {
    if (!userPublic || selectedTargets.length === 0 || sending) return;
    setSending(true);
    try {
      for (const key of selectedTargets) {
        const entry = targets.find((t) => t.key === key);
        if (!entry) continue;
        let conv: Conversation | undefined = entry.conv;
        if (!conv && entry.user) {
          const cid = await getOrCreateDirectConversation(
            userPublic,
            entry.user,
            followingIds.has(entry.user.uid)
          );
          conv =
            conversations.find((c) => c.id === cid) ||
            ({
              id: cid,
              isGroup: false,
              createdBy: userPublic.uid,
              participantIds: [userPublic.uid, entry.user.uid].sort(),
            } as Conversation);
        }
        if (!conv) continue;

        if (caption.trim()) {
          await sendConversationMessage({
            currentUser: userPublic,
            conversation: conv,
            type: 'text',
            text: caption.trim(),
          });
        }
        for (const msg of messagesToForward) {
          await sendConversationMessage({
            currentUser: userPublic,
            conversation: conv,
            type: msg.type === 'poll' || msg.type === 'system' ? 'text' : msg.type,
            text: msg.text || (msg.pollQuestion ? `Poll: ${msg.pollQuestion}` : undefined),
            mediaURL: msg.mediaURL,
            mediaItems: msg.mediaItems,
            fileName: msg.fileName,
            fileSize: msg.fileSize,
            fileMime: msg.fileMime,
            sharedItemId: msg.sharedItemId,
            sharedItemPreview: msg.sharedItemPreview,
            sharedCreatorUsername: msg.sharedCreatorUsername || msg.senderUsername,
            sharedCaption: msg.sharedCaption,
            forwardedFrom: msg.forwardedFrom || msg.senderUsername,
          });
        }
      }
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 p-5 space-y-3.5 max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {shareUrl && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(shareUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
            className="w-full h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between text-xs font-semibold"
          >
            <span className="truncate text-slate-500">{shareUrl}</span>
            <span className="text-fuchsia-500 flex items-center gap-1 shrink-0 ml-2">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Link'}
            </span>
          </button>
        )}

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search friends or groups..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-100 dark:bg-white/5 text-xs focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
          />
        </div>

        <input
          type="text"
          maxLength={300}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add an optional personal message..."
          className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
        />

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {targets.map((t) => {
            const selected = selectedTargets.includes(t.key);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() =>
                  setSelectedTargets((prev) =>
                    selected ? prev.filter((x) => x !== t.key) : [...prev, t.key]
                  )
                }
                className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left ${
                  selected
                    ? 'border-fuchsia-500 bg-fuchsia-500/10'
                    : 'border-transparent hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserAvatar src={t.avatar} name={t.label} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold flex items-center gap-1 truncate">
                      <span className="truncate">{t.label}</span>
                      {t.user && (
                        <UserVerifiedBadge
                          uid={t.user.uid}
                          fallback={t.user.isVerified}
                          className="w-3.5 h-3.5"
                        />
                      )}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{t.sub}</p>
                  </div>
                </div>
                {selected && <Check className="w-4 h-4 text-fuchsia-500 shrink-0" />}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => void handleSendAll()}
          disabled={selectedTargets.length === 0 || sending}
          className="w-full h-11 rounded-xl mixy-gradient-bg text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send to {selectedTargets.length || 0} {selectedTargets.length === 1 ? 'Chat' : 'Chats'}
        </button>
      </div>
    </div>
  );
}
