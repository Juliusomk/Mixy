import React, { useState } from 'react';
import { CheckCircle2, Flag, Loader2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { submitReport } from '../lib/socialActions';

const REPORT_REASONS = [
  'Spam or misleading content',
  'Harassment or bullying',
  'Hate speech or symbols',
  'Nudity or inappropriate media',
  'Violence or dangerous behavior',
  'Impersonation or intellectual property',
];

export function ReportModal({
  targetType,
  targetId,
  title,
  onClose,
}: {
  targetType: 'post' | 'reel' | 'user' | 'message' | 'problem';
  targetId: string;
  title?: string;
  onClose: () => void;
}) {
  const { userPublic } = useAuth();
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublic) return;
    setLoading(true);
    try {
      await submitReport({
        reporterId: userPublic.uid,
        targetType,
        targetId,
        reason,
        details,
      });
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Flag className="w-4 h-4 text-rose-500" />
            {title || `Report ${targetType}`}
          </h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="font-semibold">Report submitted</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Our moderation team will review this report shortly.
            </p>
            <button
              onClick={onClose}
              className="w-full h-11 rounded-xl mixy-gradient-bg text-white font-semibold text-sm"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5">Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r} className="bg-white dark:bg-[#12121D]">
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5">Additional context (optional)</label>
              <textarea
                rows={3}
                maxLength={1000}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Tell us more about what happened..."
                className="w-full p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-rose-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-rose-500 disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Submit Report
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
