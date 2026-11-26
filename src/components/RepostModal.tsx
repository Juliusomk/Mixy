import React, { useState } from 'react';
import { Check, Loader2, Lock, Repeat2, Send, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toggleRepostItem } from '../lib/socialActions';
import type { AudienceType } from '../types/mixy';

export function RepostModal({
  open,
  targetType,
  targetId,
  originalAuthorId,
  originalAuthorUsername,
  audience,
  alreadyReposted,
  previewText,
  onClose,
  onOpenShare,
}: {
  open: boolean;
  targetType: 'post' | 'reel';
  targetId: string;
  originalAuthorId: string;
  originalAuthorUsername: string;
  audience?: AudienceType;
  alreadyReposted: boolean;
  previewText?: string;
  onClose: () => void;
  onOpenShare?: () => void;
}) {
  const { userPublic } = useAuth();
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open || !userPublic) return null;

  const isRestricted =
    targetType === 'post'
      ? Boolean(audience && audience !== 'public')
      : audience === 'private' || audience === 'close_friends';

  const handleConfirm = async () => {
    if (saving) return;
    if (isRestricted && !alreadyReposted) {
      setError('Only public posts can be reposted to feeds. You can share this in a Direct Message instead.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await toggleRepostItem({
        currentUser: userPublic,
        targetType,
        targetId,
        originalAuthorId,
        originalAuthorUsername,
        currentlyReposted: alreadyReposted,
        caption: caption.trim() || undefined,
      });
      setCaption('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update repost.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat2 className="w-5 h-5 text-emerald-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {alreadyReposted ? 'Manage Repost' : `Repost @${originalAuthorUsername}`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
            aria-label="Close repost modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isRestricted && !alreadyReposted ? (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 p-4 flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-100 space-y-1">
                <p className="font-bold">Public reposting unavailable for this {targetType}</p>
                <p className="opacity-85">
                  Posts shared only with Followers, Close Friends, or Private audiences cannot be reposted publicly. You can still share them privately in Direct Messages.
                </p>
              </div>
            </div>
          ) : (
            <>
              {previewText && (
                <div className="rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-3 text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    @{originalAuthorUsername}:
                  </span>{' '}
                  {previewText}
                </div>
              )}

              {!alreadyReposted && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5">
                    Add your thoughts (optional)
                  </label>
                  <textarea
                    rows={3}
                    maxLength={240}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Say why you're sharing this..."
                    className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="text-right text-[11px] text-slate-400 tabular-nums mt-1">
                    {caption.length}/240
                  </div>
                </div>
              )}

              {error && (
                <p className="text-xs text-rose-500 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  {error}
                </p>
              )}

              <button
                type="button"
                disabled={saving}
                onClick={() => void handleConfirm()}
                className={`w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors ${
                  alreadyReposted
                    ? 'bg-rose-500 text-white hover:bg-rose-600'
                    : 'bg-emerald-500 text-white hover:bg-emerald-600'
                }`}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : alreadyReposted ? (
                  'Undo Repost'
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Repost to Feed & Profile
                  </>
                )}
              </button>
            </>
          )}

          {onOpenShare && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenShare();
              }}
              className="w-full h-10 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-center gap-2"
            >
              <Send className="w-3.5 h-3.5 text-fuchsia-500" />
              Send in Direct Message instead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
