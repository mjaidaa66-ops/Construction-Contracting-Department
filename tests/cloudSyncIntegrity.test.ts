import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  INITIAL_PROJECTS,
  INITIAL_RATE_LIBRARY,
  INITIAL_TRANSACTIONS,
} from '../src/data/uaeSeedData';
import {
  getCloudSyncState,
  hasPendingSyncForProject,
  mergeRemoteProjectsWithLocal,
  resetSyncQueueForAccountSwitch,
  setNetworkOnlineStatus,
  setServerReachableStatus,
} from '../src/services/cloudSyncService';
import {
  assertVerifiedCloudPath,
  computeIdempotencyKey,
  isFirestoreOfflinePersistenceEnabled,
  isTransientFirestoreError,
  OperationType,
  withExponentialBackoff,
} from '../src/services/firebase';

const ROOT = process.cwd();

describe('Fail-Closed Cloud-Only & Firestore Integrity Verification', () => {
  it('enforces strict memoryLocalCache and eliminates silent IndexedDB/localStorage fallbacks across sync services', () => {
    const firebaseSrc = fs.readFileSync(path.join(ROOT, 'src/services/firebase.ts'), 'utf8');
    const syncSrc = fs.readFileSync(path.join(ROOT, 'src/services/cloudSyncService.ts'), 'utf8');
    const reportSrc = fs.readFileSync(path.join(ROOT, 'src/services/reportStorageService.ts'), 'utf8');
    const structSrc = fs.readFileSync(
      path.join(ROOT, 'src/services/structuralFirestoreService.ts'),
      'utf8'
    );
    const auditorSrc = fs.readFileSync(
      path.join(ROOT, 'src/services/reconciliationAuditor.ts'),
      'utf8'
    );

    assert.equal(isFirestoreOfflinePersistenceEnabled, false);
    assert.ok(firebaseSrc.includes('localCache: memoryLocalCache()'));
    assert.ok(firebaseSrc.includes('initializeAppCheck'));

    for (const src of [syncSrc, reportSrc, structSrc, auditorSrc]) {
      assert.equal(src.includes('indexedDB.open'), false, 'IndexedDB fallback must not exist');
      assert.equal(src.includes('localStorage'), false, 'localStorage operational fallback must not exist');
    }
  });

  it('rejects unauthenticated Firestore path access (Fail-Closed) and surfaces cloud_unreachable state', () => {
    resetSyncQueueForAccountSwitch(false);
    assert.equal(getCloudSyncState().status, 'auth_required');

    assert.throws(
      () => assertVerifiedCloudPath(OperationType.WRITE, 'projects/test-proj'),
      /FAIL_CLOSED_UNAUTHENTICATED/
    );

    resetSyncQueueForAccountSwitch(true);
    setServerReachableStatus(false, 'Firestore unreachable');
    assert.equal(getCloudSyncState().status, 'cloud_unreachable');

    setNetworkOnlineStatus(false);
    assert.equal(getCloudSyncState().status, 'cloud_unreachable');

    // Restore clean defaults for subsequent tests
    setNetworkOnlineStatus(true);
    setServerReachableStatus(true, null);
    resetSyncQueueForAccountSwitch(false);
  });

  it('retries only transient Firestore errors with exponential backoff and never retries permission-denied', async () => {
    let transientCalls = 0;
    const result = await withExponentialBackoff(
      async () => {
        transientCalls += 1;
        if (transientCalls < 3) {
          throw Object.assign(new Error('Service unavailable'), { code: 'unavailable' });
        }
        return 'ok';
      },
      { maxAttempts: 4, baseDelayMs: 5, maxDelayMs: 15 }
    );
    assert.equal(result, 'ok');
    assert.equal(transientCalls, 3);

    let permCalls = 0;
    await assert.rejects(
      () =>
        withExponentialBackoff(
          async () => {
            permCalls += 1;
            throw Object.assign(new Error('Missing or insufficient permissions'), {
              code: 'permission-denied',
            });
          },
          { maxAttempts: 4, baseDelayMs: 5, maxDelayMs: 15 }
        ),
      /permission-denied|Missing or insufficient permissions/
    );
    assert.equal(permCalls, 1);
    assert.equal(isTransientFirestoreError({ code: 'aborted' }), true);
    assert.equal(isTransientFirestoreError({ code: 'permission-denied' }), false);
  });

  it('produces deterministic idempotency keys for identical payloads and distinct keys on mutation', () => {
    const p1 = { id: 'proj-1', budget: 500000, status: 'under_construction' };
    const p2 = { id: 'proj-1', budget: 500000, status: 'under_construction' };
    const p3 = { id: 'proj-1', budget: 500001, status: 'under_construction' };

    const k1 = computeIdempotencyKey('project_commit', 'proj-1', p1);
    const k2 = computeIdempotencyKey('project_commit', 'proj-1', p2);
    const k3 = computeIdempotencyKey('project_commit', 'proj-1', p3);

    assert.equal(k1, k2);
    assert.notEqual(k1, k3);
  });

  it('validates all 56 seed projects, 25 rates, and 4 transactions against firestore.rules size and enum constraints', () => {
    const allowedTypes = new Set([
      'villa',
      'commercial_tower',
      'residential_complex',
      'warehouse',
      'infrastructure',
      'institutional',
    ]);
    const allowedStatuses = new Set(['permitting', 'under_construction', 'suspended', 'completed']);

    assert.equal(INITIAL_PROJECTS.length, 56);
    for (const p of INITIAL_PROJECTS) {
      assert.ok(p.id.length >= 1 && p.id.length <= 128);
      assert.ok(p.code.length >= 2 && p.code.length <= 40);
      assert.ok(p.name.length >= 1 && p.name.length <= 200);
      assert.ok(p.nameEn.length >= 1 && p.nameEn.length <= 200);
      assert.ok(allowedTypes.has(p.projectType));
      assert.ok(allowedStatuses.has(p.status));
      assert.ok((p.phases?.length || 0) <= 50);
      assert.ok((p.paymentMilestones?.length || 0) <= 50);
      assert.ok((p.bimElements?.length || 0) <= 500);
      assert.ok((p.takeoffSheets?.length || 0) <= 50);
      assert.ok((p.takeoffMeasurements?.length || 0) <= 500);
    }

    assert.equal(INITIAL_RATE_LIBRARY.length, 25);
    for (const r of INITIAL_RATE_LIBRARY) {
      assert.ok(r.code.length >= 2 && r.code.length <= 20);
      assert.ok(r.nameAr.length >= 1 && r.nameAr.length <= 200);
      assert.ok(r.nameEn.length >= 1 && r.nameEn.length <= 200);
      assert.ok(r.rateAed >= 0);
    }

    assert.equal(INITIAL_TRANSACTIONS.length, 4);
    for (const tx of INITIAL_TRANSACTIONS) {
      assert.ok(tx.id.length >= 1 && tx.id.length <= 128);
      assert.ok(tx.transactionNumber.length >= 1 && tx.transactionNumber.length <= 80);
      assert.ok(tx.serviceName.length >= 1 && tx.serviceName.length <= 200);
    }
  });

  it('treats remote Firestore snapshots as strictly authoritative over stale client clocks when no upload is in flight', () => {
    const sample = INITIAL_PROJECTS[0];
    const skewedLocal = {
      ...sample,
      name: 'نسخة محلية بساعة متقدمة',
      updatedAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    const authoritativeRemote = {
      ...sample,
      name: 'النسخة السحابية المعتمدة',
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
    };

    assert.equal(hasPendingSyncForProject(sample.id), false);
    const merged = mergeRemoteProjectsWithLocal([skewedLocal], [authoritativeRemote]);
    assert.equal(merged.find((p) => p.id === sample.id)?.name, 'النسخة السحابية المعتمدة');
  });

  it('enforces atomic transactions/batches, structural createdAt preservation, and terminal lock safety', () => {
    const structSvc = fs.readFileSync(
      path.join(ROOT, 'src/services/structuralFirestoreService.ts'),
      'utf8'
    );
    const fsStorage = fs.readFileSync(
      path.join(ROOT, 'src/services/firestoreStorage.ts'),
      'utf8'
    );

    assert.ok(structSvc.includes('existingProj.exists() ? existingProj.data().createdAt : serverTimestamp()'));
    assert.ok(structSvc.includes('export async function loadStructuralProjectBundleFromCloud('));
    assert.ok(structSvc.includes('runTransaction(db'));
    assert.ok(structSvc.includes('.slice(0, 50000)'));
    assert.ok(fsStorage.includes('runTransaction(db'));
    assert.ok(fsStorage.includes('writeBatch(db)'));
    assert.ok(fsStorage.includes("existingData.status === 'completed'"));
    assert.ok(fsStorage.includes("ex.status === 'approved'"));
  });
});
