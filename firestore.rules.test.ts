/**
 * Phase 0 Adversarial Security Rules Verification Specification
 * Verifies the "Dirty Dozen" payloads against firestore.rules expectations.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expectedResult: 'PERMISSION_DENIED';
  payload?: Record<string, unknown>;
}

export const DIRTY_DOZEN_TEST_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Cross-Tenant Project Read',
    collectionPath: 'projects/proj-01',
    operation: 'get',
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 2,
    name: 'OwnerId Spoofing on Create',
    collectionPath: 'projects/proj-spoof',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
    payload: { id: 'proj-spoof', ownerId: 'other-uid', code: 'BNY-999' }
  },
  {
    id: 3,
    name: 'Shadow Ghost Field Injection',
    collectionPath: 'projects/proj-shadow',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
    payload: { id: 'proj-shadow', ownerId: 'caller-uid', isSuperVerified: true }
  },
  {
    id: 4,
    name: 'Role Self-Escalation',
    collectionPath: 'users/caller-uid',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
    payload: { uid: 'caller-uid', role: 'admin', email: 'attacker@example.com' }
  },
  {
    id: 5,
    name: 'Unverified Email Spoofing',
    collectionPath: 'projects/proj-01',
    operation: 'get',
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 6,
    name: 'ID Poisoning Attack',
    collectionPath: `projects/${'A'.repeat(200)}`,
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 7,
    name: 'Orphaned Transaction Write',
    collectionPath: 'government_transactions/tx-orphan',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
    payload: { id: 'tx-orphan', ownerId: 'caller-uid', projectId: 'non-existent' }
  },
  {
    id: 8,
    name: 'Orphaned Chunk Write',
    collectionPath: 'document_manifests/missing-manifest/chunks/chunk-0',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 9,
    name: 'Oversized Chunk Exhaustion',
    collectionPath: 'document_manifests/m-1/chunks/chunk-0',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
    payload: { id: 'chunk-0', manifestId: 'm-1', index: 0, dataLength: 950000 }
  },
  {
    id: 10,
    name: 'Blanket List Scraping',
    collectionPath: 'projects',
    operation: 'list',
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 11,
    name: 'Terminal State Mutation',
    collectionPath: 'projects/proj-completed',
    operation: 'update',
    expectedResult: 'PERMISSION_DENIED',
    payload: { status: 'under_construction' }
  },
  {
    id: 12,
    name: 'Client Timestamp Forgery',
    collectionPath: 'projects/proj-ts',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
    payload: { createdAt: '2020-01-01T00:00:00.000Z' }
  }
];
