import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  Check,
  Film,
  Flag,
  LayoutDashboard,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, formatRelativeTime, generateId, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  Post,
  Reel,
  ReportItem,
  UserPublic,
  VerificationRequest,
  VerificationType,
} from '../types/mixy';
import { VerifiedBadge } from './MixyLogo';

export function AdminDashboardView({
  onOpenProfile,
}: {
  onOpenProfile: (uid: string) => void;
}) {
  const { userPublic, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [verifications, setVerifications] = useState<VerificationRequest[]>([]);
  const [tab, setTab] = useState<'reports' | 'verifications' | 'users'>('reports');
  const [verifyTypeByUid, setVerifyTypeByUid] = useState<Record<string, VerificationType>>({});

  useEffect(() => {
    if (!isAdmin) return;
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => setUsers(snap.docs.map((d) => d.data() as UserPublic)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );
    const unsubPosts = onSnapshot(
      collection(db, 'posts'),
      (snap) => setPosts(snap.docs.map((d) => d.data() as Post)),
      () => {}
    );
    const unsubReels = onSnapshot(
      collection(db, 'reels'),
      (snap) => setReels(snap.docs.map((d) => d.data() as Reel)),
      () => {}
    );
    const unsubReports = onSnapshot(
      query(collection(db, 'reports'), orderBy('createdAt', 'desc')),
      (snap) => setReports(snap.docs.map((d) => d.data() as ReportItem)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'reports')
    );
    const unsubVer = onSnapshot(
      query(collection(db, 'verificationRequests'), orderBy('createdAt', 'desc')),
      (snap) => setVerifications(snap.docs.map((d) => d.data() as VerificationRequest)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'verificationRequests')
    );
    return () => {
      unsubUsers();
      unsubPosts();
      unsubReels();
      unsubReports();
      unsubVer();
    };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-10 text-center">
        <p className="font-bold">Admin access required</p>
      </div>
    );
  }

  const handleReportAction = async (rep: ReportItem, status: ReportItem['status']) => {
    if (!userPublic) return;
    await updateDoc(doc(db, 'reports', rep.id), {
      status,
      reviewedBy: userPublic.uid,
      updatedAt: serverTimestamp(),
    });
  };

  const handleRemoveReportedTarget = async (rep: ReportItem) => {
    if (!userPublic) return;
    if (rep.targetType === 'post') {
      await updateDoc(doc(db, 'posts', rep.targetId), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (rep.targetType === 'user') {
      await updateDoc(doc(db, 'users', rep.targetId), {
        isDeactivated: true,
        updatedAt: serverTimestamp(),
      });
    }
    await handleReportAction(rep, 'resolved');
  };

  const handleVerificationDecision = async (req: VerificationRequest, approve: boolean) => {
    if (!userPublic) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'verificationRequests', req.id), {
      status: approve ? 'approved' : 'rejected',
      reviewedBy: userPublic.uid,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', req.userId), {
      isVerified: approve,
      verificationStatus: approve ? 'verified' : 'rejected',
      verifiedAt: approve ? serverTimestamp() : null,
      verificationType: approve ? 'official' : null,
      updatedAt: serverTimestamp(),
    });
    const nid = generateId('ntf');
    batch.set(doc(db, 'notifications', nid), {
      id: nid,
      recipientId: req.userId,
      actorId: userPublic.uid,
      actorUsername: userPublic.username,
      actorPhotoURL: userPublic.photoURL || '',
      type: 'verification',
      targetId: req.userId,
      text: approve
        ? 'Congratulations! Your MIXY account has been verified.'
        : 'Your MIXY verification request was not approved at this time.',
      isRead: false,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  };

  const openReportsCount = reports.filter((r) => r.status === 'open').length;
  const pendingVerifications = verifications.filter((v) => v.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-fuchsia-500" /> Admin & Moderation
          </h1>
          <p className="text-xs text-slate-500">Platform analytics, safety moderation, and verification queue</p>
        </div>
      </div>

      {/* Analytics KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Accounts', value: users.length, icon: <Users className="w-4 h-4 text-sky-400" /> },
          { label: 'Published Posts', value: posts.filter((p) => !p.isDeleted).length, icon: <ShieldCheck className="w-4 h-4 text-emerald-400" /> },
          { label: 'Active Reels', value: reels.length, icon: <Film className="w-4 h-4 text-fuchsia-400" /> },
          { label: 'Open Reports', value: openReportsCount, icon: <Flag className="w-4 h-4 text-rose-400" /> },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-4 space-y-1.5"
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{kpi.label}</span>
              {kpi.icon}
            </div>
            <div className="text-2xl font-bold tabular-nums">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Moderation Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-white/5 w-fit">
        <button
          onClick={() => setTab('reports')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold ${
            tab === 'reports' ? 'bg-white dark:bg-[#1A1A28] shadow-sm' : 'text-slate-500'
          }`}
        >
          Reports ({openReportsCount} open)
        </button>
        <button
          onClick={() => setTab('verifications')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold ${
            tab === 'verifications' ? 'bg-white dark:bg-[#1A1A28] shadow-sm' : 'text-slate-500'
          }`}
        >
          Verifications ({pendingVerifications})
        </button>
        <button
          onClick={() => setTab('users')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold ${
            tab === 'users' ? 'bg-white dark:bg-[#1A1A28] shadow-sm' : 'text-slate-500'
          }`}
        >
          Accounts ({users.length})
        </button>
      </div>

      {tab === 'reports' && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No reports submitted yet.</p>
          ) : (
            reports.map((rep) => (
              <div
                key={rep.id}
                className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span className="font-semibold uppercase text-fuchsia-500">{rep.targetType}</span>
                    <span>·</span>
                    <span>Status: {rep.status}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(rep.createdAt)}</span>
                  </div>
                  <p className="text-sm font-semibold">{rep.reason}</p>
                  {rep.details && <p className="text-xs text-slate-500">{rep.details}</p>}
                </div>

                {rep.status === 'open' && (
                  <div className="flex items-center gap-2">
                    {(rep.targetType === 'post' || rep.targetType === 'user') && (
                      <button
                        onClick={() => void handleRemoveReportedTarget(rep)}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Action & Resolve
                      </button>
                    )}
                    <button
                      onClick={() => void handleReportAction(rep, 'resolved')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                    >
                      Resolve
                    </button>
                    <button
                      onClick={() => void handleReportAction(rep, 'dismissed')}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'verifications' && (
        <div className="space-y-3">
          {verifications.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No verification requests yet.</p>
          ) : (
            verifications.map((req) => (
              <div
                key={req.id}
                className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <p className="text-sm font-bold flex items-center gap-1.5">
                    <VerifiedBadge className="w-4 h-4" />
                    @{req.username} ({req.fullName})
                  </p>
                  <p className="text-xs text-slate-500">
                    {req.category} · Status: {req.status}
                  </p>
                  <p className="text-xs">{req.reason}</p>
                </div>
                {req.status === 'pending' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void handleVerificationDecision(req, true)}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => void handleVerificationDecision(req, false)}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'users' && (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#10101A] divide-y divide-slate-100 dark:divide-white/5">
          {users.map((u) => (
            <div key={u.uid} className="p-4 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => onOpenProfile(u.uid)}
                className="text-left hover:underline"
              >
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <span>{u.displayName}</span>
                  {u.isVerified && (
                    <VerifiedBadge className="w-4 h-4" verificationType={u.verificationType} />
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  @{u.username} · {u.followersCount} followers · {u.isDeactivated ? 'Deactivated' : 'Active'}
                  {u.isVerified && u.verificationType ? ` · ${u.verificationType}` : ''}
                </p>
              </button>
              <div className="flex items-center gap-2">
                {!u.isVerified && (
                  <select
                    value={verifyTypeByUid[u.uid] || 'official'}
                    onChange={(e) =>
                      setVerifyTypeByUid((prev) => ({
                        ...prev,
                        [u.uid]: e.target.value as VerificationType,
                      }))
                    }
                    className="h-8 px-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/15 text-xs"
                    aria-label="Verification type"
                  >
                    <option value="official">Official</option>
                    <option value="creator">Creator</option>
                  </select>
                )}
                <button
                  onClick={() => {
                    const nextVerified = !u.isVerified;
                    const chosenType = verifyTypeByUid[u.uid] || 'official';
                    void updateDoc(doc(db, 'users', u.uid), {
                      isVerified: nextVerified,
                      verificationStatus: nextVerified ? 'verified' : 'none',
                      verifiedAt: nextVerified ? serverTimestamp() : null,
                      verificationType: nextVerified ? chosenType : null,
                      updatedAt: serverTimestamp(),
                    });
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold"
                >
                  {u.isVerified ? 'Revoke Badge' : 'Verify Badge'}
                </button>
                <button
                  onClick={() =>
                    updateDoc(doc(db, 'users', u.uid), {
                      isDeactivated: !u.isDeactivated,
                      updatedAt: serverTimestamp(),
                    })
                  }
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                    u.isDeactivated ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                  }`}
                >
                  {u.isDeactivated ? 'Reactivate' : 'Suspend'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
