# MIXY Security Specification (Payload-First Security TDD)

## 1. Data Invariants

1. **Identity & PII Isolation**: Public profile documents (`/users/{userId}`) never store PII (`email`, `phone`, `dob`, `blockedIds`, `hiddenWords`). All PII and private preferences live in `/users/{userId}/private/info`, accessible only to `request.auth.uid == userId` or `isAdmin()`.
2. **Verified Email Gate**: Standard mutations require `request.auth != null && request.auth.token.email_verified == true`. Admin overrides require `isAdmin()` verified via `/admins/{uid}` or verified admin email (`juliusomukuba7@gmail.com` with `email_verified == true`).
3. **Immutable Ownership & Timestamps**: `authorId`, `ownerId`, `senderId`, `followerId`, and `createdAt` cannot be modified after creation. Server time `request.time` is enforced on `createdAt` and `updatedAt`.
4. **Action-Based Updates**: Every `allow update` block begins with `isValid[Entity](incoming())` and partitions mutations into explicit action branches guarded by `incoming().diff(existing()).affectedKeys().hasOnly([...])`.
5. **Bounded Arrays & Path Hardening**: Every document ID path variable is validated with `isValidId(id)` on `get`, `create`, `update`, and `delete`. Every string has a strict `.size()` upper bound and every array has a `.size() <= MAX` bound.
6. **Master Gate & Conversation Isolation**: Messages inside `/conversations/{conversationId}/messages/{messageId}` can only be created by verified members of the parent conversation (`exists(/databases/.../members/$(request.auth.uid))`), and `allow list` validates `request.auth.uid in resource.data.participantIds` directly without `get()`/`exists()` calls.
7. **Terminal State Locking**: Reports (`resolved`, `dismissed`) and Verification Requests (`approved`, `rejected`) cannot be modified by non-admins once in a terminal status.
8. **DM Privacy, Unsend & Group Invite Enforcement**: Only the original sender can edit or unsend a message (`isUnsent`), non-participants cannot inject or read messages/scheduledMessages, DM typography/privacy enums (`dmFontFamily`, `dmWhoCanMessage`) are strictly validated, and `/groupInvites` permits only single-document `get` on active codes (never blanket scraping) while self-join verifies the invite token matches the group conversation.
9. **Close Friends Isolation**: Posts, Stories, and Moments targeted to `close_friends` carry an explicit bounded `closeFriendIds` array (`<= 200`) and are strictly readable/listable ONLY when `request.auth.uid in resource.data.closeFriendIds` or by the author/admin (with zero `get()`/`exists()` in `allow list`).
10. **Reposts Privacy Gate & Call Terminal Locking**: `/reposts/{repostId}` blocks reposting any `private` or `close_friends` post via rule-level parent document verification (`get(...).data.audience == 'public'`), and `/calls/{callId}` isolates call records strictly to `participantIds` with terminal state locking once `ended`, `missed`, or `declined`.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Privilege Escalation on Profile Create**: User registers `/users/{uid}` with `role: "admin"` or `isVerified: true`.
2. **Shadow Update on Profile Edit**: User updates `/users/{uid}` bio while sneaking `isVerified: true` or `role: "admin"` into the payload.
3. **Email Spoofing Admin Bypass**: Attacker authenticates with unverified email token (`email_verified: false`) matching admin email.
4. **PII Leak Read**: Non-owner authenticated user calls `getDoc` on `/users/{otherUid}/private/info`.
5. **ID Poisoning**: Attacker writes to `/posts/{1500_char_junk_id}` or `/posts/..%2Fadmins`.
6. **Impersonated Post Author**: User creates a post in `/posts/{postId}` setting `authorId` to another user's UID.
7. **Orphaned Comment on Missing Post**: User creates `/posts/nonexistent_post/comments/c1` where parent post does not exist.
8. **Fake Timestamp Backdating**: User creates a post with `createdAt` set to a client-chosen past date instead of `request.time`.
9. **Unauthorized Message Injection**: Non-participant writes a message into `/conversations/{convId}/messages/{msgId}`.
10. **Blanket List Scraping**: User queries `/notifications` without scoping to `recipientId == request.auth.uid`.
11. **Terminal State Reversal**: User tries to change a `verificationRequests` document from `rejected` back to `pending` or `approved`.
12. **Unbounded Array / Payload Exhaustion**: Attacker submits a post with 500 hashtags or a 1MB caption string.
13. **Cross-User Message Tampering / Unsend Spoof**: Conversation participant attempts to edit or unsend another user's message.
14. **Revoked / Forged Group Invite Join**: User attempts to self-join a group conversation when invite link is disabled or revoked.
15. **Close Friends Leak**: User outside `closeFriendIds` attempts to get or list a `close_friends` post, story, or moment.
16. **Private / Close Friends Repost Bypass**: User attempts to create a `/reposts/{id}` referencing a `private` or `close_friends` post.
17. **Call Eavesdrop / Terminal Reversal**: Non-participant reads `/calls/{callId}` or participant tries to reopen an `ended` call.


