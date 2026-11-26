import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  extractMentions,
  generateId,
  handleFirestoreError,
  OperationType,
} from './firebase';
import type { Conversation, NotificationItem, Post, Reel, UserPublic } from '../types/mixy';

async function createNotification(params: {
  recipientId: string;
  actor: UserPublic;
  type: NotificationItem['type'];
  targetId?: string;
  text: string;
}): Promise<void> {
  if (params.recipientId === params.actor.uid) return;
  const nid = generateId('ntf');
  try {
    const payload: Record<string, unknown> = {
      id: nid,
      recipientId: params.recipientId,
      actorId: params.actor.uid,
      actorUsername: params.actor.username,
      actorPhotoURL: params.actor.photoURL || '',
      type: params.type,
      text: params.text.slice(0, 300),
      isRead: false,
      createdAt: serverTimestamp(),
    };
    if (params.targetId) payload.targetId = params.targetId;
    await setDoc(doc(db, 'notifications', nid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `notifications/${nid}`);
  }
}

export async function toggleFollowUser(
  currentUser: UserPublic,
  targetUser: UserPublic,
  _currentlyFollowing?: boolean
): Promise<'followed' | 'requested' | 'unfollowed'> {
  if (!currentUser.uid || !targetUser.uid || currentUser.uid === targetUser.uid) {
    return 'unfollowed';
  }
  const edgeId = `${currentUser.uid}_${targetUser.uid}`;
  const edgeRef = doc(db, 'follows', edgeId);
  const targetRef = doc(db, 'users', targetUser.uid);
  const selfRef = doc(db, 'users', currentUser.uid);

  try {
    const [edgeSnap, targetSnap, selfSnap] = await Promise.all([
      getDoc(edgeRef),
      getDoc(targetRef),
      getDoc(selfRef),
    ]);

    const batch = writeBatch(db);
    if (edgeSnap.exists()) {
      const existingStatus = (edgeSnap.data() as { status?: string }).status;
      batch.delete(edgeRef);
      if (existingStatus === 'active') {
        const targetFollowers = (targetSnap.data()?.followersCount as number) || 0;
        const selfFollowing = (selfSnap.data()?.followingCount as number) || 0;
        if (targetSnap.exists() && targetFollowers > 0) {
          batch.update(targetRef, {
            followersCount: increment(-1),
            updatedAt: serverTimestamp(),
          });
        }
        if (selfSnap.exists() && selfFollowing > 0) {
          batch.update(selfRef, {
            followingCount: increment(-1),
            updatedAt: serverTimestamp(),
          });
        }
      }
      await batch.commit();
      return 'unfollowed';
    }

    const targetPrivate = targetSnap.exists()
      ? Boolean(targetSnap.data()?.isPrivate)
      : Boolean(targetUser.isPrivate);
    const status = targetPrivate ? 'pending' : 'active';
    batch.set(edgeRef, {
      followerId: currentUser.uid,
      targetId: targetUser.uid,
      status,
      createdAt: serverTimestamp(),
    });
    if (status === 'active') {
      batch.update(targetRef, {
        followersCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      batch.update(selfRef, {
        followingCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();

    await createNotification({
      recipientId: targetUser.uid,
      actor: currentUser,
      type: 'follow',
      targetId: currentUser.uid,
      text:
        status === 'pending'
          ? `@${currentUser.username} requested to follow you.`
          : `@${currentUser.username} started following you.`,
    }).catch(() => {});
    return status === 'pending' ? 'requested' : 'followed';
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `follows/${edgeId}`);
  }
}

export async function respondToFollowRequest(
  targetUser: UserPublic,
  followerUid: string,
  accept: boolean
): Promise<void> {
  if (!targetUser.uid || !followerUid || targetUser.uid === followerUid) return;
  const edgeId = `${followerUid}_${targetUser.uid}`;
  const edgeRef = doc(db, 'follows', edgeId);
  const targetRef = doc(db, 'users', targetUser.uid);

  try {
    const edgeSnap = await getDoc(edgeRef);
    if (!edgeSnap.exists()) return;
    const edgeStatus = (edgeSnap.data() as { status?: string }).status;
    if (edgeStatus !== 'pending') return;

    const batch = writeBatch(db);
    if (accept) {
      batch.update(edgeRef, { status: 'active' });
      batch.update(targetRef, {
        followersCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      await createNotification({
        recipientId: followerUid,
        actor: targetUser,
        type: 'follow',
        targetId: targetUser.uid,
        text: `@${targetUser.username} accepted your follow request.`,
      }).catch(() => {});
    } else {
      batch.delete(edgeRef);
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `follows/${edgeId}`);
  }
}

export async function toggleLikePost(
  currentUser: UserPublic,
  post: Post,
  currentlyLiked: boolean
): Promise<void> {
  const likeRef = doc(db, 'posts', post.id, 'likes', currentUser.uid);
  const postRef = doc(db, 'posts', post.id);
  try {
    const batch = writeBatch(db);
    if (currentlyLiked) {
      batch.delete(likeRef);
      batch.update(postRef, { likesCount: increment(-1), updatedAt: serverTimestamp() });
    } else {
      batch.set(likeRef, { userId: currentUser.uid, createdAt: serverTimestamp() });
      batch.update(postRef, { likesCount: increment(1), updatedAt: serverTimestamp() });
    }
    await batch.commit();

    if (!currentlyLiked) {
      await createNotification({
        recipientId: post.authorId,
        actor: currentUser,
        type: 'like',
        targetId: post.id,
        text: `@${currentUser.username} liked your post.`,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `posts/${post.id}/likes/${currentUser.uid}`);
  }
}

export async function toggleLikeReel(
  currentUser: UserPublic,
  reel: Reel,
  currentlyLiked: boolean
): Promise<void> {
  const likeRef = doc(db, 'reels', reel.id, 'likes', currentUser.uid);
  const reelRef = doc(db, 'reels', reel.id);
  try {
    const batch = writeBatch(db);
    if (currentlyLiked) {
      batch.delete(likeRef);
      batch.update(reelRef, { likesCount: increment(-1), updatedAt: serverTimestamp() });
    } else {
      batch.set(likeRef, { userId: currentUser.uid, createdAt: serverTimestamp() });
      batch.update(reelRef, { likesCount: increment(1), updatedAt: serverTimestamp() });
    }
    await batch.commit();

    if (!currentlyLiked) {
      await createNotification({
        recipientId: reel.authorId,
        actor: currentUser,
        type: 'like',
        targetId: reel.id,
        text: `@${currentUser.username} liked your reel.`,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `reels/${reel.id}/likes/${currentUser.uid}`);
  }
}

export async function addItemComment(params: {
  currentUser: UserPublic;
  parentType: 'post' | 'reel';
  parentId: string;
  parentAuthorId: string;
  text: string;
  replyToCommentId?: string;
  replyToAuthorId?: string;
}): Promise<void> {
  const { currentUser, parentType, parentId, parentAuthorId, text, replyToCommentId, replyToAuthorId } = params;
  const colName = parentType === 'post' ? 'posts' : 'reels';
  const cid = generateId('cmt');
  const commentRef = doc(db, colName, parentId, 'comments', cid);
  const parentRef = doc(db, colName, parentId);

  try {
    const batch = writeBatch(db);
    const payload: Record<string, unknown> = {
      id: cid,
      parentId,
      authorId: currentUser.uid,
      authorUsername: currentUser.username,
      authorPhotoURL: currentUser.photoURL || '',
      authorVerified: Boolean(currentUser.isVerified),
      text: text.trim().slice(0, 1000),
      createdAt: serverTimestamp(),
    };
    if (replyToCommentId) payload.replyToCommentId = replyToCommentId;
    batch.set(commentRef, payload);
    batch.update(parentRef, { commentsCount: increment(1), updatedAt: serverTimestamp() });
    await batch.commit();

    if (replyToCommentId && replyToAuthorId) {
      await createNotification({
        recipientId: replyToAuthorId,
        actor: currentUser,
        type: 'reply',
        targetId: parentId,
        text: `@${currentUser.username} replied: "${text.trim().slice(0, 80)}"`,
      });
    } else {
      await createNotification({
        recipientId: parentAuthorId,
        actor: currentUser,
        type: 'comment',
        targetId: parentId,
        text: `@${currentUser.username} commented: "${text.trim().slice(0, 80)}"`,
      });
    }

    // Mention notifications
    const mentions = extractMentions(text);
    if (mentions.length > 0) {
      const usersSnap = await getDocs(
        query(collection(db, 'users'), where('isDeactivated', '==', false))
      );
      for (const uDoc of usersSnap.docs) {
        const u = uDoc.data() as UserPublic;
        if (mentions.includes(u.usernameLower) && u.uid !== currentUser.uid) {
          await createNotification({
            recipientId: u.uid,
            actor: currentUser,
            type: 'mention',
            targetId: parentId,
            text: `@${currentUser.username} mentioned you in a comment.`,
          });
        }
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${colName}/${parentId}/comments/${cid}`);
  }
}

export async function toggleSaveItem(
  currentUser: UserPublic,
  itemId: string,
  itemType: 'post' | 'reel',
  currentlySaved: boolean,
  collectionId?: string
): Promise<void> {
  const saveRef = doc(db, 'users', currentUser.uid, 'savedPosts', itemId);
  const parentRef = doc(db, itemType === 'post' ? 'posts' : 'reels', itemId);
  try {
    const batch = writeBatch(db);
    if (currentlySaved) {
      batch.delete(saveRef);
      batch.update(parentRef, { savesCount: increment(-1), updatedAt: serverTimestamp() });
    } else {
      const payload: Record<string, unknown> = {
        itemId,
        itemType,
        ownerId: currentUser.uid,
        createdAt: serverTimestamp(),
      };
      if (collectionId) payload.collectionId = collectionId;
      batch.set(saveRef, payload);
      batch.update(parentRef, { savesCount: increment(1), updatedAt: serverTimestamp() });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/savedPosts/${itemId}`);
  }
}

export async function getOrCreateDirectConversation(
  currentUser: UserPublic,
  targetUser: UserPublic,
  isTargetKnownFollower: boolean
): Promise<string> {
  if (!currentUser.uid || !targetUser.uid || currentUser.uid === targetUser.uid) {
    throw new Error('Cannot start a direct conversation with yourself.');
  }
  try {
    const existingSnap = await getDocs(
      query(
        collection(db, 'conversations'),
        where('participantIds', 'array-contains', currentUser.uid)
      )
    );
    for (const d of existingSnap.docs) {
      const conv = d.data() as Conversation;
      if (
        !conv.isGroup &&
        conv.participantIds.length === 2 &&
        conv.participantIds.includes(targetUser.uid)
      ) {
        return conv.id;
      }
    }

    const sortedIds = [currentUser.uid, targetUser.uid].sort();
    const convId = `dm_${sortedIds[0].slice(0, 16)}_${sortedIds[1].slice(0, 16)}`;
    const convRef = doc(db, 'conversations', convId);
    const convSnap = await getDoc(convRef).catch(() => null);
    if (convSnap && convSnap.exists()) {
      return convId;
    }

    const batch = writeBatch(db);
    batch.set(convRef, {
      id: convId,
      isGroup: false,
      createdBy: currentUser.uid,
      participantIds: sortedIds,
      lastMessageText: '',
      lastMessageSenderId: '',
      lastMessageType: 'text',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'conversations', convId, 'members', currentUser.uid), {
      userId: currentUser.uid,
      role: 'admin',
      isPinned: false,
      isMuted: false,
      isArchived: false,
      isRequest: false,
      joinedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'conversations', convId, 'members', targetUser.uid), {
      userId: targetUser.uid,
      role: 'member',
      isPinned: false,
      isMuted: false,
      isArchived: false,
      isRequest: !isTargetKnownFollower,
      joinedAt: serverTimestamp(),
    });
    await batch.commit();
    return convId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'conversations');
  }
}

export async function sendConversationMessage(params: {
  currentUser: UserPublic;
  conversation: Conversation;
  type: import('../types/mixy').MessageType;
  text?: string;
  mediaURL?: string;
  mediaItems?: string[];
  fileName?: string;
  fileSize?: number;
  fileMime?: string;
  voiceDurationSec?: number;
  voiceWaveform?: number[];
  effectType?: import('../types/mixy').DmMessageEffect;
  sharedItemId?: string;
  sharedItemPreview?: string;
  sharedCreatorUsername?: string;
  sharedCaption?: string;
  forwardedFrom?: string;
  replyToId?: string;
  replyToPreview?: string;
  pollQuestion?: string;
  pollOptions?: string[];
}): Promise<string | undefined> {
  const {
    currentUser,
    conversation,
    type,
    text,
    mediaURL,
    mediaItems,
    fileName,
    fileSize,
    fileMime,
    voiceDurationSec,
    voiceWaveform,
    effectType,
    sharedItemId,
    sharedItemPreview,
    sharedCreatorUsername,
    sharedCaption,
    forwardedFrom,
    replyToId,
    replyToPreview,
    pollQuestion,
    pollOptions,
  } = params;
  const msgId = generateId('msg');
  const convRef = doc(db, 'conversations', conversation.id);
  const msgRef = doc(db, 'conversations', conversation.id, 'messages', msgId);

  const previewText =
    type === 'image'
      ? 'Sent a photo'
      : type === 'images'
        ? `Sent ${mediaItems?.length || 2} photos`
        : type === 'video'
          ? 'Sent a video'
          : type === 'voice'
            ? 'Sent a voice message'
            : type === 'file'
              ? `Sent file: ${fileName || 'Attachment'}`.slice(0, 120)
              : type === 'post_share'
                ? 'Reposted a post'
                : type === 'reel_share'
                  ? 'Reposted a reel'
                  : type === 'story_share'
                    ? 'Shared a story'
                    : type === 'story_reply'
                      ? 'Replied to a story'
                      : type === 'poll'
                        ? `Poll: ${pollQuestion || 'Vote now'}`.slice(0, 120)
                        : (text || '').slice(0, 120);

  try {
    const batch = writeBatch(db);
    const { Timestamp } = await import('firebase/firestore');
    const msgPayload: Record<string, unknown> = {
      id: msgId,
      conversationId: conversation.id,
      participantIds: conversation.participantIds,
      senderId: currentUser.uid,
      senderUsername: currentUser.username,
      senderPhotoURL: currentUser.photoURL || '',
      type,
      readBy: [currentUser.uid],
      reactions: {},
      isEdited: false,
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (text !== undefined) msgPayload.text = text.slice(0, 2000);
    if (mediaURL) msgPayload.mediaURL = mediaURL;
    if (mediaItems && mediaItems.length > 0) msgPayload.mediaItems = mediaItems.slice(0, 10);
    if (fileName) msgPayload.fileName = fileName.slice(0, 160);
    if (typeof fileSize === 'number') msgPayload.fileSize = Math.max(0, Math.round(fileSize));
    if (fileMime) msgPayload.fileMime = fileMime.slice(0, 120);
    if (typeof voiceDurationSec === 'number') {
      msgPayload.voiceDurationSec = Math.max(0, Math.round(voiceDurationSec));
    }
    if (voiceWaveform && voiceWaveform.length > 0) {
      msgPayload.voiceWaveform = voiceWaveform.slice(0, 64);
    }
    if (effectType && effectType !== 'none') msgPayload.effectType = effectType;
    if (sharedItemId) msgPayload.sharedItemId = sharedItemId;
    if (sharedItemPreview) msgPayload.sharedItemPreview = sharedItemPreview.slice(0, 300);
    if (sharedCreatorUsername) msgPayload.sharedCreatorUsername = sharedCreatorUsername.slice(0, 30);
    if (sharedCaption) msgPayload.sharedCaption = sharedCaption.slice(0, 300);
    if (forwardedFrom) msgPayload.forwardedFrom = forwardedFrom.slice(0, 60);
    if (replyToId) msgPayload.replyToId = replyToId;
    if (replyToPreview) msgPayload.replyToPreview = replyToPreview.slice(0, 200);
    if (pollQuestion) msgPayload.pollQuestion = pollQuestion.slice(0, 200);
    if (pollOptions && pollOptions.length >= 2) {
      msgPayload.pollOptions = pollOptions.slice(0, 6);
      msgPayload.pollVotes = {};
      msgPayload.pollClosed = false;
    }
    if (conversation.disappearingSeconds && conversation.disappearingSeconds > 0) {
      msgPayload.expiresAt = Timestamp.fromDate(
        new Date(Date.now() + conversation.disappearingSeconds * 1000)
      );
    }

    batch.set(msgRef, msgPayload);
    batch.update(convRef, {
      lastMessageText: previewText,
      lastMessageSenderId: currentUser.uid,
      lastMessageType: type,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    // Notify other participants
    for (const pid of conversation.participantIds) {
      if (pid !== currentUser.uid) {
        await createNotification({
          recipientId: pid,
          actor: currentUser,
          type: 'message',
          targetId: conversation.id,
          text: `@${currentUser.username}: ${previewText}`,
        });
      }
    }
    return msgId;
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `conversations/${conversation.id}/messages/${msgId}`
    );
  }
}

export async function submitReport(params: {
  reporterId: string;
  targetType: 'post' | 'reel' | 'user' | 'message' | 'problem';
  targetId: string;
  reason: string;
  details?: string;
}): Promise<void> {
  const rid = generateId('rep');
  try {
    await setDoc(doc(db, 'reports', rid), {
      id: rid,
      reporterId: params.reporterId,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason.slice(0, 120),
      details: (params.details || '').slice(0, 1000),
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `reports/${rid}`);
  }
}

export async function toggleRepostItem(params: {
  currentUser: UserPublic;
  targetType: 'post' | 'reel';
  targetId: string;
  originalAuthorId: string;
  originalAuthorUsername: string;
  caption?: string;
  currentlyReposted?: boolean;
}): Promise<boolean> {
  const {
    currentUser,
    targetType,
    targetId,
    originalAuthorId,
    originalAuthorUsername,
    caption,
  } = params;
  const repostId = `rp_${currentUser.uid}_${targetType}_${targetId}`;
  const repostRef = doc(db, 'reposts', repostId);
  const parentRef = doc(db, targetType === 'post' ? 'posts' : 'reels', targetId);

  try {
    const [repostSnap, parentSnap] = await Promise.all([
      getDoc(repostRef),
      getDoc(parentRef),
    ]);

    if (repostSnap.exists()) {
      const batch = writeBatch(db);
      batch.delete(repostRef);
      if (parentSnap.exists()) {
        const currentCount = (parentSnap.data() as { repostsCount?: number }).repostsCount || 0;
        if (currentCount > 0) {
          batch.update(parentRef, {
            repostsCount: increment(-1),
            updatedAt: serverTimestamp(),
          });
        }
      }
      await batch.commit();
      return false;
    }

    if (!parentSnap.exists()) {
      throw new Error('This content is no longer available.');
    }

    if (targetType === 'post') {
      const p = parentSnap.data() as Post;
      if (p.audience !== 'public' || p.isDeleted || p.isArchived) {
        throw new Error('Only active public posts can be reposted.');
      }
    }

    const batch = writeBatch(db);
    batch.set(repostRef, {
      id: repostId,
      userId: currentUser.uid,
      username: currentUser.username,
      userDisplayName: currentUser.displayName,
      userPhotoURL: currentUser.photoURL || '',
      userVerified: Boolean(currentUser.isVerified),
      targetType,
      targetId,
      originalAuthorId,
      originalAuthorUsername,
      caption: (caption || '').trim().slice(0, 500),
      createdAt: serverTimestamp(),
    });
    batch.update(parentRef, {
      repostsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    void createNotification({
      recipientId: originalAuthorId,
      actor: currentUser,
      type: 'repost',
      targetId,
      text: `@${currentUser.username} reposted your ${targetType}.`,
    }).catch(() => {});
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.includes('public posts')) {
      throw err;
    }
    if (err instanceof Error && err.message.includes('no longer available')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `reposts/${repostId}`);
  }
}

export async function sendCallNotification(params: {
  recipientId: string;
  actor: UserPublic;
  type: 'missed_call' | 'incoming_call';
  callId: string;
  callType: 'voice' | 'video';
}): Promise<void> {
  await createNotification({
    recipientId: params.recipientId,
    actor: params.actor,
    type: params.type,
    targetId: params.callId,
    text:
      params.type === 'missed_call'
        ? `Missed ${params.callType} call from @${params.actor.username}.`
        : `Incoming ${params.callType} call from @${params.actor.username}.`,
  });
}

