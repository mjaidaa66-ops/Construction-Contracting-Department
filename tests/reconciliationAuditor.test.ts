import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COMPANY_PROFILE,
  INITIAL_PROJECTS,
  INITIAL_RATE_LIBRARY,
  INITIAL_TRANSACTIONS,
} from '../src/data/uaeSeedData';
import { createDefaultReportsWorkspace } from '../src/services/reportStorageService';
import {
  applyPulledItemToLocalWorkspace,
  canonicalizeCompanyProfileForHash,
  canonicalizeProjectForHash,
  computeCanonicalHash,
  diffWorkspaceSnapshots,
  type CloudReconciliationSnapshot,
  type WorkspaceSnapshotData,
} from '../src/services/reconciliationAuditor';

function buildFixtureWorkspace(): WorkspaceSnapshotData {
  return {
    projects: structuredClone(INITIAL_PROJECTS.slice(0, 3)),
    companyProfile: structuredClone(DEFAULT_COMPANY_PROFILE),
    rateLibrary: structuredClone(INITIAL_RATE_LIBRARY.slice(0, 3)),
    transactions: structuredClone(INITIAL_TRANSACTIONS.slice(0, 2)),
    reportsWorkspace: createDefaultReportsWorkspace(),
  };
}

function buildMatchingCloudSnapshot(local: WorkspaceSnapshotData): CloudReconciliationSnapshot {
  return {
    projects: structuredClone(local.projects),
    companyProfile: structuredClone(local.companyProfile),
    rateLibrary: structuredClone(local.rateLibrary),
    transactions: structuredClone(local.transactions),
    reportsWorkspace: structuredClone(local.reportsWorkspace),
    fetchedAt: '2026-11-25T12:00:00.000Z',
    source: 'server',
  };
}

describe('Reconciliation Auditor Service', () => {
  it('computes identical canonical hashes regardless of key order or undefined properties', () => {
    const a = { z: 10, nested: { b: true, a: 'hello', skipped: undefined }, a: [1, 2, 3] };
    const b = { a: [1, 2, 3], nested: { a: 'hello', b: true }, z: 10 };

    assert.equal(computeCanonicalHash(a), computeCanonicalHash(b));
    assert.equal(computeCanonicalHash(a).length, 32);
  });

  it('ignores ephemeral local binaries (svgContent, pdfDataUrl, localDataUrl) and updatedAt timestamps in project hash', () => {
    const baseProject = structuredClone(INITIAL_PROJECTS[0]);
    const localCopy = structuredClone(baseProject);
    localCopy.updatedAt = '2026-11-25T14:00:00.000Z';
    localCopy.documents = [
      {
        id: 'doc-1',
        name: 'Structural Blueprint',
        category: 'structural',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        uploadedAt: '2026-11-25T10:00:00.000Z',
        manifestId: 'mf_1',
        localDataUrl: 'data:application/pdf;base64,AAAABBBB',
      },
    ];
    const baseSheet = baseProject.takeoffSheets?.[0];
    assert.ok(baseSheet, 'Expected seed project to contain at least one takeoff sheet');
    localCopy.takeoffSheets = [
      {
        ...baseSheet,
        svgContent: '<svg><rect /></svg>',
        pdfDataUrl: 'data:image/png;base64,LOCALONLY',
      },
    ];

    const cloudCopy = structuredClone(baseProject);
    cloudCopy.updatedAt = '2026-11-20T08:00:00.000Z';
    cloudCopy.documents = [
      {
        id: 'doc-1',
        name: 'Structural Blueprint',
        category: 'structural',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        uploadedAt: '2026-11-25T10:00:00.000Z',
        manifestId: 'mf_1',
      },
    ];
    cloudCopy.takeoffSheets = [
      {
        ...baseSheet,
        svgContent: undefined,
        pdfDataUrl: undefined,
      },
    ];

    const hLocal = computeCanonicalHash(canonicalizeProjectForHash(localCopy));
    const hCloud = computeCanonicalHash(canonicalizeProjectForHash(cloudCopy));
    assert.equal(hLocal, hCloud);
  });

  it('reports IN_SYNC with zero drift when local and cloud snapshots match', () => {
    const local = buildFixtureWorkspace();
    const cloud = buildMatchingCloudSnapshot(local);
    // Re-order company profile keys to prove canonicalization holds
    cloud.companyProfile = {
      email: local.companyProfile.email,
      phone: local.companyProfile.phone,
      addressEn: local.companyProfile.addressEn,
      addressAr: local.companyProfile.addressAr,
      trnNumber: local.companyProfile.trnNumber,
      municipalityClass: local.companyProfile.municipalityClass,
      licenseNumber: local.companyProfile.licenseNumber,
      nameEn: local.companyProfile.nameEn,
      nameAr: local.companyProfile.nameAr,
    };

    const report = diffWorkspaceSnapshots(local, cloud, {
      hasPendingProjectSync: () => false,
    });

    assert.equal(report.overallStatus, 'IN_SYNC');
    assert.equal(report.driftCount, 0);
    assert.equal(report.matchedCount, report.totalCount);
    assert.equal(
      computeCanonicalHash(canonicalizeCompanyProfileForHash(local.companyProfile)),
      computeCanonicalHash(canonicalizeCompanyProfileForHash(cloud.companyProfile))
    );
  });

  it('detects CONTENT_DRIFT, LOCAL_ONLY, CLOUD_ONLY, and PENDING_LOCAL accurately with exact changedFields', () => {
    const local = buildFixtureWorkspace();
    const cloud = buildMatchingCloudSnapshot(local);

    // 1. Modify project[0] budget locally -> CONTENT_DRIFT
    local.projects[0].approvedBudget += 250000;
    local.projects[0].updatedAt = '2026-11-25T15:00:00.000Z';

    // 2. Mark project[1] as pending sync and remove from cloud -> PENDING_LOCAL
    const pendingProjectId = local.projects[1].id;
    cloud.projects = cloud.projects.filter((p) => p.id !== pendingProjectId);

    // 3. Add a LOCAL_ONLY rate item
    local.rateLibrary.push({
      ...local.rateLibrary[0],
      id: 'rate-local-only',
      code: 'LOC-99',
    });

    // 4. Add a CLOUD_ONLY transaction
    cloud.transactions.push({
      ...cloud.transactions[0],
      id: 'tx-cloud-only',
      transactionNumber: 'SHJ-CLOUD-999',
    });

    // 5. Mutate company TRN on cloud -> CONTENT_DRIFT
    if (cloud.companyProfile) {
      cloud.companyProfile.trnNumber = '100999888777003';
    }

    const report = diffWorkspaceSnapshots(local, cloud, {
      hasPendingProjectSync: (pid) => pid === pendingProjectId,
      canAdminOverrideTerminalLock: false,
    });

    assert.equal(report.overallStatus, 'DRIFT_DETECTED');
    assert.equal(report.contentDriftCount, 2);
    assert.equal(report.pendingLocalCount, 1);
    assert.equal(report.localOnlyCount, 1);
    assert.equal(report.cloudOnlyCount, 1);

    const driftedProj = report.items.find((i) => i.id === local.projects[0].id);
    assert.ok(driftedProj);
    assert.equal(driftedProj.driftStatus, 'CONTENT_DRIFT');
    assert.ok(driftedProj.changedFields.includes('approvedBudget'));
    assert.equal(driftedProj.recommendedAction, 'push_local');

    const pendingProj = report.items.find((i) => i.id === pendingProjectId);
    assert.ok(pendingProj);
    assert.equal(pendingProj.driftStatus, 'PENDING_LOCAL');

    const localRate = report.items.find((i) => i.id === 'rate-local-only');
    assert.ok(localRate);
    assert.equal(localRate.driftStatus, 'LOCAL_ONLY');

    const cloudTx = report.items.find((i) => i.id === 'tx-cloud-only');
    assert.ok(cloudTx);
    assert.equal(cloudTx.driftStatus, 'CLOUD_ONLY');
    assert.equal(cloudTx.recommendedAction, 'pull_cloud');
  });

  it('enforces terminalLocked for non-admin on completed projects and approved transactions', () => {
    const local = buildFixtureWorkspace();
    local.projects[0].status = 'completed';
    local.projects[0].approvedBudget += 1000;
    local.transactions[0].status = 'approved';
    local.transactions[0].notes = 'Modified locally';

    const cloud = buildMatchingCloudSnapshot(local);
    cloud.projects[0].approvedBudget -= 1000;
    cloud.transactions[0].notes = 'Cloud approved note';

    const nonAdminReport = diffWorkspaceSnapshots(local, cloud, {
      hasPendingProjectSync: () => false,
      canAdminOverrideTerminalLock: false,
    });
    const adminReport = diffWorkspaceSnapshots(local, cloud, {
      hasPendingProjectSync: () => false,
      canAdminOverrideTerminalLock: true,
    });

    const lockedProj = nonAdminReport.items.find((i) => i.id === local.projects[0].id);
    const lockedTx = nonAdminReport.items.find((i) => i.id === local.transactions[0].id);
    assert.equal(lockedProj?.terminalLocked, true);
    assert.equal(lockedProj?.recommendedAction, 'pull_cloud');
    assert.equal(lockedTx?.terminalLocked, true);

    const adminProj = adminReport.items.find((i) => i.id === local.projects[0].id);
    assert.equal(adminProj?.terminalLocked, false);
  });

  it('resolves drift by pulling cloud snapshot over newer local state cleanly', () => {
    const local = buildFixtureWorkspace();
    const cloud = buildMatchingCloudSnapshot(local);

    local.projects[0].approvedBudget = 9999999;
    local.projects[0].updatedAt = '2026-11-29T12:00:00.000Z';
    cloud.projects[0].approvedBudget = 5500000;
    cloud.projects[0].updatedAt = '2026-11-25T10:00:00.000Z';

    const reportBefore = diffWorkspaceSnapshots(local, cloud, {
      hasPendingProjectSync: () => false,
    });
    const driftItem = reportBefore.items.find((i) => i.id === local.projects[0].id);
    assert.ok(driftItem);
    assert.equal(driftItem.driftStatus, 'CONTENT_DRIFT');

    const patch = applyPulledItemToLocalWorkspace(driftItem, local);
    assert.ok(patch.projects);
    const nextLocal: WorkspaceSnapshotData = { ...local, ...patch };
    assert.equal(nextLocal.projects[0].approvedBudget, 5500000);

    const reportAfter = diffWorkspaceSnapshots(nextLocal, cloud, {
      hasPendingProjectSync: () => false,
    });
    assert.equal(reportAfter.overallStatus, 'IN_SYNC');
    assert.equal(reportAfter.driftCount, 0);
  });
});
