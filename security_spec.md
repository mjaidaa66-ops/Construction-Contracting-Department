# Bunyan Core System — Security Specification (Phase 0)

## 1. Data Invariants
1. **Identity Ownership**: Every `Project`, `GovernmentTransaction`, `DocumentManifest`, `DocumentChunk`, and `RateLibraryItem` must carry an `ownerId` strictly equal to `request.auth.uid` at creation, and `ownerId` is immutable on update.
2. **Master Gate Relational Integrity**: A `DocumentChunk` under `/document_manifests/{manifestId}/chunks/{chunkId}` cannot be read or written unless the parent `DocumentManifest` exists and belongs to `request.auth.uid` (or the caller is an Admin).
3. **Orphan Prevention**: A `GovernmentTransaction` or `DocumentManifest` referencing a `projectId` must verify via `exists()` that the target project document exists and is owned by the caller (or Admin).
4. **Privilege Escalation Guard**: Users creating or updating `/users/{userId}` cannot self-assign `'admin'` role unless they are already verified Admins; `role` changes by non-admins are blocked.
5. **Temporal Integrity**: `createdAt` is immutable and must equal `request.time` on creation; `updatedAt` must equal `request.time` on both creation and update.
6. **Chunk Size Ceiling**: `DocumentChunk.data` is strictly capped at 900,000 characters (~800KB binary base64 slice) to guarantee Firestore's 1MB document limit is never exceeded.
7. **Terminal Status Lock**: Completed projects (`status == 'completed'`) and approved transactions (`status == 'approved'`) cannot be mutated by non-admin users once terminal state is reached.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Cross-Tenant Project Read**: Non-owner authenticated user attempts `get(/projects/proj-01)`. Expected: `PERMISSION_DENIED`.
2. **OwnerId Spoofing on Create**: User `uid-A` creates `/projects/proj-X` with `ownerId: "uid-B"`. Expected: `PERMISSION_DENIED`.
3. **Shadow Ghost Field Injection**: User creates `/projects/proj-X` with an extra field `isVerifiedByMunicipality: true`. Expected: `PERMISSION_DENIED`.
4. **Role Self-Escalation**: Non-admin user writes `/users/{uid}` with `role: "admin"`. Expected: `PERMISSION_DENIED`.
5. **Unverified Email Spoofing**: Request with `email: "mjaidaa66@gmail.com"` and `email_verified: false`. Expected: `PERMISSION_DENIED`.
6. **ID Poisoning Attack**: Create document at `/projects/${'A'.repeat(500)}`. Expected: `PERMISSION_DENIED`.
7. **Orphaned Transaction Write**: Create `/government_transactions/tx-99` with nonexistent `projectId: "missing-proj"`. Expected: `PERMISSION_DENIED`.
8. **Orphaned Chunk Write**: Create `/document_manifests/missing/chunks/c0` where parent manifest does not exist. Expected: `PERMISSION_DENIED`.
9. **Oversized Chunk Exhaustion**: Create chunk with `data.size() > 900000`. Expected: `PERMISSION_DENIED`.
10. **Blanket List Scraping**: User calls `getDocs(collection(db, 'projects'))` without `where('ownerId', '==', uid)`. Expected: `PERMISSION_DENIED`.
11. **Terminal State Mutation**: Non-admin attempts to update a project whose `existing().status == 'completed'`. Expected: `PERMISSION_DENIED`.
12. **Client Timestamp Forgery**: Create project with `createdAt: "2020-01-01T00:00:00Z"` instead of `serverTimestamp()`. Expected: `PERMISSION_DENIED`.
