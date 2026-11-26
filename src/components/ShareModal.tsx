import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Check, Copy, Loader2, Search, Send, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getOrCreateDirectConversation, sendConversationMessage } from '../lib/socialActions';
import type { Conversation, UserPublic } from '../types/mixy';
import { UserAvatar, UserVerifiedBadge } from './MixyLogo';

export function ShareModal({
  itemType,
  itemId,
  previewText,
  authorUsername,
  mediaPreviewUrl,
  shareUrl,
  onClose,
}: {
  itemType: 'post' | 'reel' | 'story';
  itemId: string;
  previewText: string;
  authorUsername?: string;
  mediaPreviewUrl?: string;
  shareUrl: string;
  onClose: () => void;
}) {
  const { userPublic, userPrivate, followingIds } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [people, setPeople] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [personalCaption, setPersonalCaption] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sentKeys, setSentKeys] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const blockedSet = useMemo(() => new Set(userPrivate?.blockedIds || []), [userPrivate?.blockedIds]);

  useEffect(() => {
    if (!userPublic) return;
    void (async () => {
      try {
        const [convSnap, usersSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'conversations'),
              where('participantIds', 'array-contains', userPublic.uid)
            )
          ),
          getDocs(query(collection(db, 'users'), where('isDeactivated', '==', false))),
        ]);
        setConversations(convSnap.docs.map((d) => d.data() as Conversation));
        setPeople(
          usersSnap.docs
            .map((d) => d.data() as UserPublic)
            .filter((u) => u.uid !== userPublic.uid && !blockedSet.has(u.uid))
            .slice(0, 40)
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'conversations');
      } finally {
        setLoading(false);
      }
    })();
  }, [userPublic, blockedSet]);

  const targets = useMemo(() => {
    const list: {
      key: string;
      label: string;
      sub: string;
      avatar?: string;
      isGroup?: boolean;
      conv?: Conversation;
      user?: UserPublic;
    }[] = [];

    for (const c of conversations) {
      if (c.isGroup) {
        list.push({
          key: `conv:${c.id}`,
          label: c.groupName || 'Group Chat',
          sub: `${c.participantIds.length} members`,
          avatar: c.groupPhotoURL,
          isGroup: true,
          conv: c,
        });
      }
    }
    for (const u of people) {
      list.push({
        key: `user:${u.uid}`,
        label: u.displayName,
        sub: `@${u.username}`,
        avatar: u.photoURL,
        user: u,
      });
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) => t.label.toLowerCase().includes(q) || t.sub.toLowerCase().includes(q)
    );
  }, [conversations, people, search]);

  const bumpShareCount = async () => {
    if (itemType === 'story') return;
    try {
      await updateDoc(doc(db, itemType === 'post' ? 'posts' : 'reels', itemId), {
        sharesCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // ignore counter race
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    await bumpShareCount();
    setTimeout(() => setCopied(false), 2000);
  };

  const sendToTarget = async (target: (typeof targets)[number]) => {
    if (!userPublic) return;
    let conv: Conversation | undefined = target.conv;
    if (!conv && target.user) {
      const convId = await getOrCreateDirectConversation(
        userPublic,
        target.user,
        followingIds.has(target.user.uid)
      );
      conv =
        conversations.find((c) => c.id === convId) ||
        ({
          id: convId,
          isGroup: false,
          createdBy: userPublic.uid,
          participantIds: [userPublic.uid, target.user.uid].sort(),
        } as Conversation);
    }
    if (!conv) return;

    const msgType =
      itemType === 'post'
        ? 'post_share'
        : itemType === 'reel'
          ? 'reel_share'
          : 'story_share';

    await sendConversationMessage({
      currentUser: userPublic,
      conversation: conv,
      type: msgType,
      text: personalCaption.trim() || previewText,
      mediaURL: mediaPreviewUrl,
      sharedItemId: itemId,
      sharedItemPreview: previewText,
      sharedCreatorUsername: authorUsername,
      sharedCaption: personalCaption.trim() || undefined,
    });
    await bumpShareCount();
    setSentKeys((prev) => new Set(prev).add(target.key));
  };

  const handleBulkSend = async () => {
    if (selectedKeys.length === 0 || sending) return;
    setSending(true);
    try {
      for (const k of selectedKeys) {
        const t = targets.find((x) => x.key === k);
        if (t && !sentKeys.has(k)) {
          await sendToTarget(t);
        }
      }
      setSelectedKeys([]);
    } finally {
      setSending(false);
    }
  };

  const labelType = itemType === 'post' ? 'Post' : itemType === 'reel' ? 'Reel' : 'Story';

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 p-5 space-y-3.5 max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Repost {labelType} to DM</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
            aria-label="Close share dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-between text-xs font-medium hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
        >
          <span className="truncate text-slate-600 dark:text-slate-300">{shareUrl}</span>
          <span className="inline-flex items-center gap-1.5 text-fuchsia-500 font-semibold shrink-0 ml-2">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy link'}
          </span>
        </button>

        <input
          type="text"
          maxLength={300}
          value={personalCaption}
          onChange={(e) => setPersonalCaption(e.target.value)}
          placeholder="Add a personal caption (optional)..."
          className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
        />

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

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-fuchsia-500" />
            </div>
          ) : targets.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No friends or groups found.</p>
          ) : (
            targets.map((t) => {
              const isSent = sentKeys.has(t.key);
              const isSelected = selectedKeys.includes(t.key);
              return (
                <div
                  key={t.key}
                  onClick={() => {
                    if (isSent) return;
                    setSelectedKeys((prev) =>
                      isSelected ? prev.filter((x) => x !== t.key) : [...prev, t.key]
                    );
                  }}
                  className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-fuchsia-500/12 border border-fuchsia-500/50'
                      : 'hover:bg-slate-50 dark:hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar src={t.avatar} name={t.label} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                        <span className="truncate">{t.label}</span>
                        {t.user && (
                          <UserVerifiedBadge
                            uid={t.user.uid}
                            fallback={t.user.isVerified}
                            className="w-3.5 h-3.5"
                          />
                        )}
                        {t.isGroup && <Users className="w-3 h-3 text-fuchsia-400 shrink-0" />}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{t.sub}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (sending || isSent) return;
                      setSending(true);
                      try {
                        await sendToTarget(t);
                      } finally {
                        setSending(false);
                      }
                    }}
                    disabled={sending || isSent}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 ${
                      isSent
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : isSelected
                          ? 'bg-fuchsia-500 text-white'
                          : 'mixy-gradient-bg text-white hover:opacity-90'
                    }`}
                  >
                    {isSent ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                    {isSent ? 'Sent' : isSelected ? 'Selected' : 'Send'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {selectedKeys.length > 0 && (
          <button
            type="button"
            onClick={() => void handleBulkSend()}
            disabled={sending}
            className="w-full h-11 rounded-xl mixy-gradient-bg text-white text-sm font-semibold flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send to {selectedKeys.length} Selected {selectedKeys.length === 1 ? 'Chat' : 'Chats'}
          </button>
        )}
      </div>
    </div>
  );
}
