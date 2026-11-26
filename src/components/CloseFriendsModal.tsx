import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, ShieldCheck, Star, X } from 'lucide-react';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { UserPublic } from '../types/mixy';
import { UserAvatar, VerifiedBadge } from './MixyLogo';

export function CloseFriendsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { userPublic, userPrivate, followingIds } = useAuth();
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [savingUid, setSavingUid] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, 'users'), where('isDeactivated', '==', false)),
      (snap) => {
        setUsers(snap.docs.map((d) => d.data() as UserPublic));
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'users');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [open]);

  const closeFriendsSet = useMemo(
    () => new Set(userPrivate?.closeFriendsIds || []),
    [userPrivate?.closeFriendsIds]
  );

  const filteredUsers = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return users
      .filter((u) => u.uid !== userPublic?.uid)
      .filter((u) => {
        if (!q) return true;
        return (
          u.username.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aIn = closeFriendsSet.has(a.uid) ? 1 : 0;
        const bIn = closeFriendsSet.has(b.uid) ? 1 : 0;
        if (aIn !== bIn) return bIn - aIn;
        const aF = followingIds.has(a.uid) ? 1 : 0;
        const bF = followingIds.has(b.uid) ? 1 : 0;
        return bF - aF;
      });
  }, [users, userPublic?.uid, searchText, closeFriendsSet, followingIds]);

  const toggleCloseFriend = async (targetUid: string) => {
    if (!userPublic || savingUid) return;
    setSavingUid(targetUid);
    const exists = closeFriendsSet.has(targetUid);
    try {
      await updateDoc(doc(db, 'users', userPublic.uid, 'private', 'info'), {
        closeFriendsIds: exists ? arrayRemove(targetUid) : arrayUnion(targetUid),
        updatedAt: serverTimestamp(),
      });
    } finally {
      setSavingUid(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md max-h-[85vh] rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
              <Star className="w-5 h-5 fill-emerald-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Close Friends
              </h2>
              <p className="text-[11px] text-slate-500">
                {closeFriendsSet.size} selected · Only they see your green-ring stories & posts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
            aria-label="Close Close Friends modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search people to add to Close Friends..."
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5 px-2">
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No matching users found.
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isAdded = closeFriendsSet.has(u.uid);
              return (
                <div
                  key={u.uid}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar src={u.photoURL} name={u.displayName} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1">
                        <span className="truncate">{u.displayName}</span>
                        {u.isVerified && (
                          <VerifiedBadge className="w-3.5 h-3.5" verificationType={u.verificationType} />
                        )}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        @{u.username}
                        {followingIds.has(u.uid) ? ' · Following' : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={savingUid === u.uid}
                    onClick={() => void toggleCloseFriend(u.uid)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 ${
                      isAdded
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                        : 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-emerald-500/15 hover:text-emerald-600'
                    }`}
                  >
                    {savingUid === u.uid ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isAdded ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Added
                      </>
                    ) : (
                      'Add'
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 dark:bg-white/[0.02] border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            People aren't notified when you edit this list.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
