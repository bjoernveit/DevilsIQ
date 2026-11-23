# HoopIQ Firestore Security Specification

## 1. Data Invariants
1. **Identity Integrity**: A `users/{userId}` document can only be created for `request.auth.uid == userId`. No PII (emails, phone numbers, addresses) is stored in `users`.
2. **Privilege Escalation Prevention**: A new user cannot self-assign `role: "coach"` or create `coaches/{userId}` unless `team_meta/bootstrap` does not yet exist and is atomically created in the same batch (`existsAfter`). Only an existing coach (`exists(/databases/$(database)/documents/coaches/$(request.auth.uid))`) can promote another user or modify `role`.
3. **Playbook Protection**: Only verified coaches (`isCoach()`) can create, update, or delete `questions/{questionId}` and `team_meta/quiz_config`. Players can only read questions and config.
4. **Attempt Ownership & Immutability**: A player can only create an `attempts/{attemptId}` document where `incoming().playerId == request.auth.uid`. Client updates to submitted attempts are forbidden. Only coaches may delete attempts.
5. **Temporal Integrity & Bounded Payloads**: Every `createdAt` and `updatedAt` timestamp must equal `request.time`. All strings, IDs, and arrays are strictly size-bounded.

## 2. The "Dirty Dozen" Attack Payloads
1. **Self-Promotion After Bootstrap**: Player signs up and sends `role: "coach"` in `users/{uid}` when `team_meta/bootstrap` already exists -> `PERMISSION_DENIED`.
2. **Direct Coach Doc Injection**: Player attempts `setDoc(doc(db, 'coaches', playerUid), ...)` -> `PERMISSION_DENIED`.
3. **Ghost Field Shadow Write**: User includes `{ isAdmin: true }` or `{ extraField: 123 }` on `users/{uid}` -> `PERMISSION_DENIED` (`hasOnly()` blocks ghost fields).
4. **Question Tampering by Player**: Player attempts to create or update `questions/q1` -> `PERMISSION_DENIED`.
5. **Score Spoofing for Teammate**: Player A submits an attempt with `playerId: playerB_uid` -> `PERMISSION_DENIED`.
6. **Attempt Score Modification**: Player tries to `updateDoc` an existing `attempts/att1` to raise `totalScore` -> `PERMISSION_DENIED`.
7. **Timestamp Backdating**: User submits `createdAt: "2020-01-01"` instead of `serverTimestamp()` (`request.time`) -> `PERMISSION_DENIED`.
8. **ID Poisoning**: User creates document with 500-char ID or invalid characters `../admin` -> `PERMISSION_DENIED` (`isValidId()`).
9. **Payload Size Exhaustion**: Coach or player sends a 5000-char title or 50 tags -> `PERMISSION_DENIED`.
10. **Unauthenticated Read/Write**: Unauthenticated caller attempts `getDocs(collection(db, 'questions'))` -> `PERMISSION_DENIED`.
11. **Bootstrap Overwrite**: Attacker tries to overwrite `team_meta/bootstrap` to hijack `coachUid` -> `PERMISSION_DENIED` (update/delete forbidden).
12. **Quiz Config Tampering**: Player tries to edit `team_meta/quiz_config` -> `PERMISSION_DENIED`.
