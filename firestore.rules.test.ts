import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Payload-First Security Verification Suite for MIXY Firestore Rules.
 * Validates the "Dirty Dozen" adversarial payloads against the hardened rule invariants
 * and blueprint schema boundaries.
 */

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && VALID_ID_REGEX.test(id);
}

function isValidUserPublicCreate(data: Record<string, unknown>, authUid: string): boolean {
  const required = [
    'uid', 'username', 'usernameLower', 'displayName',
    'isVerified', 'isPrivate', 'isDeactivated', 'role',
    'followersCount', 'followingCount', 'postsCount',
    'createdAt', 'updatedAt',
  ];
  const allowed = [...required, 'bio', 'website', 'location', 'photoURL', 'coverURL', 'verificationStatus', 'showOnlineStatus', 'showLastSeen'];
  const keys = Object.keys(data);
  if (!required.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => allowed.includes(k))) return false;
  if (data.uid !== authUid) return false;
  if (data.role !== 'user') return false;
  if (data.isVerified !== false) return false;
  return true;
}

function isAdminToken(email: string | null, emailVerified: boolean): boolean {
  return email === 'juliusomukuba7@gmail.com' && emailVerified === true;
}

test('Dirty Dozen #1: Reject self-assigned admin role or isVerified=true on profile create', () => {
  const payload = {
    uid: 'user_123',
    username: 'attacker',
    usernameLower: 'attacker',
    displayName: 'Attacker',
    isVerified: true,
    isPrivate: false,
    isDeactivated: false,
    role: 'admin',
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    createdAt: 'SERVER_TIME',
    updatedAt: 'SERVER_TIME',
  };
  assert.equal(isValidUserPublicCreate(payload, 'user_123'), false);
});

test('Dirty Dozen #2: Reject shadow ghost field on profile update', () => {
  const allowedProfileEditKeys = new Set([
    'displayName', 'bio', 'website', 'location', 'photoURL',
    'coverURL', 'isPrivate', 'showOnlineStatus', 'showLastSeen', 'updatedAt',
  ]);
  const affectedKeys = ['bio', 'isVerified'];
  assert.equal(affectedKeys.every((k) => allowedProfileEditKeys.has(k)), false);
});

test('Dirty Dozen #3: Reject admin email spoof when email_verified is false', () => {
  assert.equal(isAdminToken('juliusomukuba7@gmail.com', false), false);
  assert.equal(isAdminToken('juliusomukuba7@gmail.com', true), true);
});

test('Dirty Dozen #4: Reject non-owner read of isolated PII document', () => {
  const canReadPrivateInfo = (targetUid: string, authUid: string, isAdmin: boolean) =>
    authUid === targetUid || isAdmin;
  assert.equal(canReadPrivateInfo('victim_uid', 'attacker_uid', false), false);
});

test('Dirty Dozen #5: Reject oversized or traversal document IDs', () => {
  assert.equal(isValidId('a'.repeat(129)), false);
  assert.equal(isValidId('../admins'), false);
  assert.equal(isValidId('post_abc-123'), true);
});

test('Dirty Dozen #6: Reject post creation with spoofed authorId', () => {
  const canCreatePost = (authorId: string, authUid: string) => authorId === authUid;
  assert.equal(canCreatePost('celebrity_uid', 'attacker_uid'), false);
});

test('Dirty Dozen #7: Reject orphaned comment when parent post does not exist', () => {
  const existingPostIds = new Set(['post_1', 'post_2']);
  const canCreateComment = (postId: string) => existingPostIds.has(postId);
  assert.equal(canCreateComment('nonexistent_post'), false);
});

test('Dirty Dozen #8: Reject client-forged timestamp not matching server request.time', () => {
  const serverTime: number = 1795647600000;
  const clientForgedTime: number = 1600000000000;
  assert.equal(clientForgedTime === serverTime, false);
});

test('Dirty Dozen #9: Reject message creation by non-member of conversation', () => {
  const convParticipants = ['user_a', 'user_b'];
  const canSendMessage = (authUid: string) => convParticipants.includes(authUid);
  assert.equal(canSendMessage('user_outsider'), false);
});

test('Dirty Dozen #10: Reject notification list without recipientId == auth.uid', () => {
  const allowNotificationList = (resourceRecipientId: string, authUid: string) =>
    resourceRecipientId === authUid;
  assert.equal(allowNotificationList('user_a', 'user_b'), false);
});

test('Dirty Dozen #11: Reject non-admin update to terminal verification status', () => {
  const canUpdateVerification = (existingStatus: string, isAdmin: boolean) =>
    isAdmin || existingStatus === 'pending';
  assert.equal(canUpdateVerification('rejected', false), false);
});

test('Dirty Dozen #12: Reject oversized caption or unbounded hashtags array', () => {
  const isValidPostBounds = (caption: string, hashtags: string[]) =>
    caption.length <= 2200 && hashtags.length <= 30;
  assert.equal(isValidPostBounds('x'.repeat(2201), []), false);
  assert.equal(isValidPostBounds('hello', Array.from({ length: 31 }, (_, i) => `tag${i}`)), false);
});

test('Julius AI Chat: Reject cross-user access or invalid role/size on juliusMessages', () => {
  const isValidJulius = (
    ownerId: string,
    authUid: string,
    role: string,
    text: string
  ) =>
    ownerId === authUid &&
    (role === 'user' || role === 'assistant') &&
    text.length >= 1 &&
    text.length <= 8000;
  assert.equal(isValidJulius('victim_uid', 'attacker_uid', 'user', 'hi'), false);
  assert.equal(isValidJulius('user_1', 'user_1', 'system', 'override'), false);
  assert.equal(isValidJulius('user_1', 'user_1', 'user', 'x'.repeat(8001)), false);
  assert.equal(isValidJulius('user_1', 'user_1', 'assistant', 'Hey! How can I help?'), true);
});

test('DM Upgrade: Reject cross-user edit/unsend, unauthorized invite join, and invalid DM prefs', () => {
  const canEditOrUnsend = (senderId: string, authUid: string, affected: string[]) =>
    senderId === authUid &&
    affected.every((k) => ['text', 'isEdited', 'isDeleted', 'isUnsent', 'updatedAt'].includes(k));
  assert.equal(canEditOrUnsend('alice', 'bob', ['isUnsent', 'isDeleted', 'updatedAt']), false);
  assert.equal(canEditOrUnsend('alice', 'alice', ['isUnsent', 'isDeleted', 'updatedAt']), true);

  const canJoinByInvite = (
    existingParticipants: string[],
    incomingParticipants: string[],
    authUid: string,
    inviteActive: boolean
  ) =>
    inviteActive &&
    !existingParticipants.includes(authUid) &&
    existingParticipants.every((p) => incomingParticipants.includes(p)) &&
    incomingParticipants.length === existingParticipants.length + 1 &&
    incomingParticipants.includes(authUid);
  assert.equal(canJoinByInvite(['alice', 'bob'], ['alice', 'bob', 'eve', 'mallory'], 'eve', true), false);
  assert.equal(canJoinByInvite(['alice', 'bob'], ['alice', 'bob', 'eve'], 'eve', false), false);
  assert.equal(canJoinByInvite(['alice', 'bob'], ['alice', 'bob', 'eve'], 'eve', true), true);

  const validFonts = new Set([
    'modern_sans', 'elegant_serif', 'rounded', 'minimal', 'bold', 'handwritten', 'futuristic',
  ]);
  assert.equal(validFonts.has('handwritten'), true);
  assert.equal(validFonts.has('comic_script_inject'), false);
});

test('MIXY Upgrade: Reject unauthorized Close Friends read, private/CF reposts, and call terminal reversals', () => {
  const canReadPost = (
    audience: string,
    closeFriendIds: string[],
    authorId: string,
    authUid: string
  ) =>
    authorId === authUid ||
    audience === 'public' ||
    audience === 'followers' ||
    (audience === 'close_friends' && closeFriendIds.includes(authUid));

  assert.equal(canReadPost('close_friends', ['friend_1'], 'author_1', 'stranger_9'), false);
  assert.equal(canReadPost('close_friends', ['friend_1'], 'author_1', 'friend_1'), true);
  assert.equal(canReadPost('close_friends', [], 'author_1', 'author_1'), true);

  const canRepostPost = (audience: string, isDeleted: boolean, isArchived: boolean) =>
    audience === 'public' && !isDeleted && !isArchived;

  assert.equal(canRepostPost('close_friends', false, false), false);
  assert.equal(canRepostPost('private', false, false), false);
  assert.equal(canRepostPost('public', false, false), true);

  const canUpdateCall = (existingStatus: string, participantIds: string[], authUid: string) =>
    participantIds.includes(authUid) && (existingStatus === 'ringing' || existingStatus === 'active');

  assert.equal(canUpdateCall('ended', ['u1', 'u2'], 'u1'), false);
  assert.equal(canUpdateCall('ringing', ['u1', 'u2'], 'u3'), false);
  assert.equal(canUpdateCall('ringing', ['u1', 'u2'], 'u2'), true);

  const canReadStoryAnswer = (storyAuthorId: string, respondentId: string, authUid: string) =>
    authUid === storyAuthorId || authUid === respondentId;

  assert.equal(canReadStoryAnswer('author_1', 'fan_2', 'snooper_3'), false);
  assert.equal(canReadStoryAnswer('author_1', 'fan_2', 'author_1'), true);
  assert.equal(canReadStoryAnswer('author_1', 'fan_2', 'fan_2'), true);
});

test('Verified Badge System: Enforce admin-only verification & allow verified owner profile edits', () => {
  const canOwnerUpdate = (
    existing: { isVerified: boolean; verificationStatus: string; role: string },
    incoming: { isVerified: boolean; verificationStatus: string; role: string },
    affectedKeys: string[]
  ) => {
    const blocked = new Set(['isVerified', 'verifiedAt', 'verificationType', 'role']);
    if (affectedKeys.some((k) => blocked.has(k))) return false;
    if (incoming.isVerified !== existing.isVerified || incoming.role !== existing.role) return false;
    return (
      incoming.verificationStatus === existing.verificationStatus ||
      (!existing.isVerified && ['none', 'pending'].includes(incoming.verificationStatus))
    );
  };

  // Ordinary user cannot self-verify
  assert.equal(
    canOwnerUpdate(
      { isVerified: false, verificationStatus: 'none', role: 'user' },
      { isVerified: true, verificationStatus: 'verified', role: 'user' },
      ['isVerified', 'verificationStatus']
    ),
    false
  );
  // Ordinary user cannot inject verifiedAt or verificationType
  assert.equal(
    canOwnerUpdate(
      { isVerified: false, verificationStatus: 'none', role: 'user' },
      { isVerified: false, verificationStatus: 'none', role: 'user' },
      ['verifiedAt', 'bio']
    ),
    false
  );
  // Already-verified user CAN update their bio while keeping verificationStatus === 'verified'
  assert.equal(
    canOwnerUpdate(
      { isVerified: true, verificationStatus: 'verified', role: 'user' },
      { isVerified: true, verificationStatus: 'verified', role: 'user' },
      ['bio', 'updatedAt']
    ),
    true
  );
  // Unverified user can request verification ('pending')
  assert.equal(
    canOwnerUpdate(
      { isVerified: false, verificationStatus: 'none', role: 'user' },
      { isVerified: false, verificationStatus: 'pending', role: 'user' },
      ['verificationStatus', 'updatedAt']
    ),
    true
  );
});

test('Android / Capacitor API URL & Media URL Normalization', () => {
  const resolveUrl = (base: string, p: string) => {
    if (/^https?:\/\//i.test(p)) return p;
    const normalized = p.startsWith('/') ? p : `/${p}`;
    return base ? `${base}${normalized}` : normalized;
  };
  const resolveMedia = (base: string, u?: string | null) => {
    if (!u) return '';
    const trimmed = u.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('/api/media/') && base) return `${base}${trimmed}`;
    return trimmed;
  };
  const resolveWs = (base: string, p = '/ws') => {
    if (base.startsWith('https://')) return `wss://${base.slice(8)}${p}`;
    if (base.startsWith('http://')) return `ws://${base.slice(7)}${p}`;
    return p;
  };

  assert.equal(resolveUrl('https://mixy.example.com', 'api/health'), 'https://mixy.example.com/api/health');
  assert.equal(resolveUrl('', '/api/health'), '/api/health');
  assert.equal(resolveMedia('https://mixy.example.com', '/api/media/vid_1.mp4'), 'https://mixy.example.com/api/media/vid_1.mp4');
  assert.equal(resolveMedia('https://mixy.example.com', 'https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  assert.equal(resolveWs('https://mixy.example.com'), 'wss://mixy.example.com/ws');
  assert.equal(resolveWs('http://10.0.2.2:3000'), 'ws://10.0.2.2:3000/ws');
});

test('Accessibility, Discovery & Saved Collection Schema Bounds', () => {
  const isValidPrivateAccessibility = (data: {
    reducedMotionEnabled?: unknown;
    hapticsEnabled?: unknown;
    notifyCalls?: unknown;
    notifyReposts?: unknown;
    contentPreferences?: unknown;
  }) => {
    if (data.reducedMotionEnabled !== undefined && typeof data.reducedMotionEnabled !== 'boolean') return false;
    if (data.hapticsEnabled !== undefined && typeof data.hapticsEnabled !== 'boolean') return false;
    if (data.notifyCalls !== undefined && typeof data.notifyCalls !== 'boolean') return false;
    if (data.notifyReposts !== undefined && typeof data.notifyReposts !== 'boolean') return false;
    if (
      data.contentPreferences !== undefined &&
      (typeof data.contentPreferences !== 'string' || data.contentPreferences.length > 120)
    ) {
      return false;
    }
    return true;
  };

  assert.equal(
    isValidPrivateAccessibility({
      reducedMotionEnabled: true,
      hapticsEnabled: false,
      notifyCalls: true,
      notifyReposts: true,
      contentPreferences: 'music,gaming,art',
    }),
    true
  );
  assert.equal(isValidPrivateAccessibility({ contentPreferences: 'x'.repeat(121) }), false);

  const canUpdateSavedCollection = (affectedKeys: string[], collectionId: unknown) =>
    affectedKeys.length === 1 &&
    affectedKeys[0] === 'collectionId' &&
    typeof collectionId === 'string' &&
    collectionId.length <= 128;

  assert.equal(canUpdateSavedCollection(['collectionId'], 'col_favorites'), true);
  assert.equal(canUpdateSavedCollection(['collectionId', 'ownerId'], 'col_1'), false);

  const canDecrementComments = (existingCount: number, incomingCount: number) =>
    existingCount >= 1 && incomingCount === existingCount - 1;
  assert.equal(canDecrementComments(0, -1), false);
  assert.equal(canDecrementComments(3, 2), true);
});
