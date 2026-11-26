import React, { useState } from 'react';
import {
  arrayRemove,
  arrayUnion,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  BarChart3,
  Camera,
  Check,
  Copy,
  Crown,
  Link2,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Shield,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { db, generateId } from '../../lib/firebase';
import { uploadMediaFile } from '../../lib/media';
import { sendConversationMessage } from '../../lib/socialActions';
import type { Conversation, UserPublic } from '../../types/mixy';
import { UserAvatar, UserVerifiedBadge } from '../MixyLogo';

export function GroupManageModal({
  conversation,
  usersMap,
  initialTab = 'info',
  onClose,
  onOpenProfile,
}: {
  conversation: Conversation;
  usersMap: Map<string, UserPublic>;
  initialTab?: 'info' | 'members' | 'poll' | 'invite';
  onClose: () => void;
  onOpenProfile?: (uid: string) => void;
}) {
  const { userPublic } = useAuth();
  const [tab, setTab] = useState<'info' | 'members' | 'poll' | 'invite'>(initialTab);
  const [groupName, setGroupName] = useState(conversation.groupName || '');
  const [groupDesc, setGroupDesc] = useState(conversation.groupDescription || '');
  const [groupPhoto, setGroupPhoto] = useState(conversation.groupPhotoURL || '');
  const [announcement, setAnnouncement] = useState(conversation.announcementText || '');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Poll creation
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  const adminSet = new Set([
    conversation.createdBy,
    ...(conversation.groupAdmins || []),
  ]);
  const isAdmin = userPublic ? adminSet.has(userPublic.uid) : false;

  const handleUploadGroupPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadMediaFile(file);
      setGroupPhoto(uploaded.url);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || saving) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'conversations', conversation.id), {
        groupName: groupName.trim().slice(0, 80) || 'MIXY Group',
        groupDescription: groupDesc.trim().slice(0, 300),
        groupPhotoURL: groupPhoto,
        announcementText: announcement.trim().slice(0, 300),
        updatedAt: serverTimestamp(),
      });
      if (conversation.inviteCode) {
        await updateDoc(doc(db, 'groupInvites', conversation.inviteCode), {
          groupName: groupName.trim().slice(0, 80) || 'MIXY Group',
          groupPhotoURL: groupPhoto,
          memberCount: conversation.participantIds.length,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAdminRole = async (targetUid: string) => {
    if (!isAdmin || targetUid === conversation.createdBy) return;
    const currentlyAdmin = adminSet.has(targetUid);
    const nextAdmins = currentlyAdmin
      ? Array.from(adminSet).filter((id) => id !== targetUid)
      : Array.from(new Set([...adminSet, targetUid])).slice(0, 20);

    const batch = writeBatch(db);
    batch.update(doc(db, 'conversations', conversation.id), {
      groupAdmins: nextAdmins,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'conversations', conversation.id, 'members', targetUid), {
      role: currentlyAdmin ? 'member' : 'admin',
    });
    await batch.commit();
  };

  const handleRemoveMember = async (targetUid: string) => {
    if (!isAdmin || targetUid === conversation.createdBy) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'conversations', conversation.id), {
      participantIds: arrayRemove(targetUid),
      groupAdmins: arrayRemove(targetUid),
      updatedAt: serverTimestamp(),
    });
    batch.delete(doc(db, 'conversations', conversation.id, 'members', targetUid));
    await batch.commit();
  };

  const handleAddMember = async (targetUid: string) => {
    if (!isAdmin || conversation.participantIds.includes(targetUid)) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'conversations', conversation.id), {
      participantIds: arrayUnion(targetUid),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'conversations', conversation.id, 'members', targetUid), {
      userId: targetUid,
      role: 'member',
      isPinned: false,
      isMuted: false,
      isArchived: false,
      isRequest: false,
      joinedAt: serverTimestamp(),
    });
    await batch.commit();
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublic || !pollQuestion.trim()) return;
    const cleanOpts = pollOptions.map((o) => o.trim()).filter(Boolean).slice(0, 6);
    if (cleanOpts.length < 2) return;
    setSaving(true);
    try {
      await sendConversationMessage({
        currentUser: userPublic,
        conversation,
        type: 'poll',
        text: pollQuestion.trim(),
        pollQuestion: pollQuestion.trim().slice(0, 200),
        pollOptions: cleanOpts,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateInviteLink = async (enable: boolean) => {
    if (!userPublic || !isAdmin) return;
    setSaving(true);
    try {
      const code = conversation.inviteCode || generateId('inv').slice(0, 16);
      await updateDoc(doc(db, 'conversations', conversation.id), {
        inviteCode: code,
        inviteEnabled: enable,
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'groupInvites', code), {
        inviteCode: code,
        conversationId: conversation.id,
        groupName: conversation.groupName || 'MIXY Group',
        groupPhotoURL: conversation.groupPhotoURL || '',
        memberCount: conversation.participantIds.length,
        createdBy: userPublic.uid,
        isActive: enable,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRotateInvite = async () => {
    if (!userPublic || !isAdmin) return;
    setSaving(true);
    try {
      if (conversation.inviteCode) {
        await updateDoc(doc(db, 'groupInvites', conversation.inviteCode), {
          isActive: false,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      const nextCode = generateId('inv').slice(0, 16);
      await updateDoc(doc(db, 'conversations', conversation.id), {
        inviteCode: nextCode,
        inviteEnabled: true,
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'groupInvites', nextCode), {
        inviteCode: nextCode,
        conversationId: conversation.id,
        groupName: conversation.groupName || 'MIXY Group',
        groupPhotoURL: conversation.groupPhotoURL || '',
        memberCount: conversation.participantIds.length,
        createdBy: userPublic.uid,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } finally {
      setSaving(false);
    }
  };

  const inviteUrl = conversation.inviteCode
    ? `${window.location.origin}/?join=${conversation.inviteCode}`
    : '';

  const nonMembers = Array.from(usersMap.values()).filter(
    (u) => !conversation.participantIds.includes(u.uid)
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#11111B] border border-slate-200 dark:border-white/10 max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-bold">Group Controls</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 pt-3 pb-2.5 flex gap-1.5 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-white/10">
          {[
            { id: 'info', label: 'Info & Pin', icon: <Megaphone className="w-3.5 h-3.5" /> },
            { id: 'members', label: `Members (${conversation.participantIds.length})`, icon: <Shield className="w-3.5 h-3.5" /> },
            { id: 'poll', label: 'Create Poll', icon: <BarChart3 className="w-3.5 h-3.5" /> },
            { id: 'invite', label: 'Invite Link', icon: <Link2 className="w-3.5 h-3.5" /> },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 ${
                tab === t.id
                  ? 'mixy-gradient-bg text-white'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'info' && (
            <form onSubmit={handleSaveInfo} className="space-y-4">
              <div className="flex items-center gap-4">
                <UserAvatar src={groupPhoto} name={groupName || 'Group'} size="lg" />
                {isAdmin && (
                  <label className="px-3.5 h-9 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                    {uploadingPhoto ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5" />
                    )}
                    Change Group Photo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handleUploadGroupPhoto(e)}
                    />
                  </label>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Group Name</label>
                <input
                  type="text"
                  maxLength={80}
                  disabled={!isAdmin}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Group Description</label>
                <textarea
                  rows={2}
                  maxLength={300}
                  disabled={!isAdmin}
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                  placeholder="Describe what this group is about..."
                  className="w-full p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Pinned Group Announcement
                </label>
                <input
                  type="text"
                  maxLength={300}
                  disabled={!isAdmin}
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  placeholder="Optional banner pinned at top of chat..."
                  className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm disabled:opacity-60"
                />
              </div>

              {isAdmin && (
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full h-11 rounded-xl mixy-gradient-bg text-white text-sm font-semibold"
                >
                  {saving ? 'Saving...' : 'Save Group Details'}
                </button>
              )}
            </form>
          )}

          {tab === 'members' && (
            <div className="space-y-4">
              <div className="space-y-2">
                {conversation.participantIds.map((pid) => {
                  const u = usersMap.get(pid);
                  const memberIsAdmin = adminSet.has(pid);
                  return (
                    <div
                      key={pid}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-white/5"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!onOpenProfile) return;
                          onClose();
                          onOpenProfile(pid);
                        }}
                        className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-85 transition-opacity"
                      >
                        <UserAvatar
                          src={u?.photoURL}
                          name={u?.displayName || 'Member'}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate flex items-center gap-1.5 hover:underline">
                            <span className="truncate">{u?.displayName || pid}</span>
                            <UserVerifiedBadge uid={pid} fallback={u?.isVerified} className="w-3.5 h-3.5" />
                            {memberIsAdmin && (
                              <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            )}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            @{u?.username || 'member'} · {memberIsAdmin ? 'Admin' : 'Member'}
                          </p>
                        </div>
                      </button>
                      {isAdmin && pid !== conversation.createdBy && pid !== userPublic?.uid && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleToggleAdminRole(pid)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/15 text-[11px] font-semibold"
                          >
                            {memberIsAdmin ? 'Demote' : 'Make Admin'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemoveMember(pid)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                            title="Remove from group"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {isAdmin && nonMembers.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Add Members
                  </p>
                  <div className="max-h-44 overflow-y-auto space-y-1.5">
                    {nonMembers.slice(0, 20).map((u) => (
                      <div
                        key={u.uid}
                        className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserAvatar src={u.photoURL} name={u.displayName} size="xs" />
                          <span className="text-xs font-semibold inline-flex items-center gap-1">
                            <span>@{u.username}</span>
                            <UserVerifiedBadge uid={u.uid} fallback={u.isVerified} className="w-3 h-3" />
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleAddMember(u.uid)}
                          className="px-2.5 py-1 rounded-lg mixy-gradient-bg text-white text-[11px] font-semibold flex items-center gap-1"
                        >
                          <UserPlus className="w-3 h-3" /> Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'poll' && (
            <form onSubmit={handleCreatePoll} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Poll Question</label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="Where should we hang out tonight?"
                  className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold">Options (2–6)</label>
                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      required={idx < 2}
                      maxLength={80}
                      value={opt}
                      onChange={(e) =>
                        setPollOptions((prev) =>
                          prev.map((v, i) => (i === idx ? e.target.value : v))
                        )
                      }
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 h-9 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs"
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPollOptions((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-slate-400 hover:text-rose-500 px-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions((prev) => [...prev, ''])}
                    className="text-xs font-semibold text-fuchsia-500 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Option
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full h-10 rounded-xl mixy-gradient-bg text-white text-sm font-semibold"
              >
                {saving ? 'Posting Poll...' : 'Send Group Poll'}
              </button>
            </form>
          )}

          {tab === 'invite' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">Group Invite Link</p>
                    <p className="text-xs text-slate-500">
                      Anyone signed into MIXY with this link can join this group.
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => void handleGenerateInviteLink(!conversation.inviteEnabled)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                        conversation.inviteEnabled
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : 'mixy-gradient-bg text-white'
                      }`}
                    >
                      {conversation.inviteEnabled ? 'Active' : 'Enable Link'}
                    </button>
                  )}
                </div>

                {conversation.inviteEnabled && inviteUrl ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={inviteUrl}
                        className="flex-1 h-9 px-3 rounded-xl bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(inviteUrl);
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 1800);
                        }}
                        className="px-3.5 h-9 rounded-xl mixy-gradient-bg text-white text-xs font-semibold flex items-center gap-1"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedLink ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => void handleRotateInvite()}
                        className="text-xs font-semibold text-amber-500 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Reset / Revoke Previous Link
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Invite link is currently turned off for this group.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
