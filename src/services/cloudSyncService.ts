import type { Unsubscribe } from 'firebase/firestore';
import type {
  CompanyProfile,
  DocumentManifest,
  GovernmentTransaction,
  Project,
  RateLibraryItem,
  TakeoffSheet,
} from '../types/bunyan';
import type { ReportsWorkspaceStorage } from '../types/reports';
import {
  mergeRemoteProjectsWithLocal as mergeRemoteProjectsPure,
  parseSyncTimestampMs,
} from './cloudSyncMerge';
import {
  assertVerifiedCloudPath,
  computeIdempotencyKey,
  isAppCheckConfigured,
  isFirestoreOfflinePersistenceEnabled,
  OperationType,
} from './firebase';
import {
  clearCommittedIdempotencyCache,
  downloadChunkedDocument,
  ensureProjectExistsInCloud,
  saveCompanyProfileToCloud,
  saveProjectToCloud,
  saveRateItemToCloud,
  saveReportsWorkspaceToCloud,
  saveTransactionToCloud,
  subscribeCompanyProfile,
  subscribeProjects,
  subscribeRateLibrary,
  subscribeReportsWorkspace,
  subscribeTransactions,
  uploadChunkedDocument,
  type SnapshotSyncMetadata,
} from './firestoreStorage';
import { normalizeReportsWorkspace } from './reportStorageService';

export type CloudSyncStateStatus =
  | 'synced'
  | 'syncing'
  | 'offline_cached'
  | 'auth_required'
  | 'cloud_unreachable';

export interface CloudSyncState {
  status: CloudSyncStateStatus;
  isOnline: boolean;
  isAuthenticated: boolean;
  isServerReachable?: boolean;
  appCheckActive?: boolean;
  persistenceEnabled: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastIdempotencyKey?: string | null;
}

const inMemoryBinaryCache = new Map<string, string>();
const inFlightSheetUploads = new Map<
  string,
  Promise<{ sheet: TakeoffSheet; manifest: DocumentManifest | null }>
>();
const inFlightProjectIds = new Set<string>();
const syncStateListeners = new Set<(state: CloudSyncState) => void>();

export async function cacheSessionBinary(key: string, dataUrl: string): Promise<void> {
  inMemoryBinaryCache.set(key, dataUrl);
}

export async function getCachedSessionBinary(key: string): Promise<string | null> {
  return inMemoryBinaryCache.get(key) ?? null;
}

function deriveFailClosedStatus(state: {
  isOnline: boolean;
  isAuthenticated: boolean;
  isServerReachable?: boolean;
  pendingCount: number;
}): CloudSyncStateStatus {
  if (!state.isAuthenticated) return 'auth_required';
  if (!state.isOnline || state.isServerReachable === false) return 'cloud_unreachable';
  if (state.pendingCount > 0) return 'syncing';
  return 'synced';
}

let currentSyncState: CloudSyncState = {
  status: 'auth_required',
  isOnline:
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true,
  isAuthenticated: false,
  isServerReachable: false,
  appCheckActive: isAppCheckConfigured,
  persistenceEnabled: isFirestoreOfflinePersistenceEnabled,
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  lastIdempotencyKey: null,
};

function notifySyncListeners(): void {
  const snapshot = { ...currentSyncState };
  syncStateListeners.forEach((listener) => listener(snapshot));
}

export function getCloudSyncState(): CloudSyncState {
  return { ...currentSyncState };
}

export function subscribeCloudSyncState(
  listener: (state: CloudSyncState) => void
): () => void {
  syncStateListeners.add(listener);
  listener({ ...currentSyncState });
  return () => {
    syncStateListeners.delete(listener);
  };
}

function updateCloudSyncState(patch: Partial<CloudSyncState>): void {
  currentSyncState = { ...currentSyncState, ...patch };
  notifySyncListeners();
}

export function resetSyncQueueForAccountSwitch(isAuthenticated: boolean): void {
  inFlightProjectIds.clear();
  inMemoryBinaryCache.clear();
  clearCommittedIdempotencyCache();
  updateCloudSyncState({
    isAuthenticated,
    pendingCount: 0,
    lastSyncedAt: null,
    lastError: null,
    lastIdempotencyKey: null,
    status: deriveFailClosedStatus({
      isOnline: currentSyncState.isOnline,
      isAuthenticated,
      isServerReachable: currentSyncState.isServerReachable,
      pendingCount: 0,
    }),
  });
}

export function setNetworkOnlineStatus(isOnline: boolean): void {
  updateCloudSyncState({
    isOnline,
    isServerReachable: isOnline ? currentSyncState.isServerReachable : false,
    lastError: isOnline ? currentSyncState.lastError : 'Network offline — Fail-Closed active',
    status: deriveFailClosedStatus({
      isOnline,
      isAuthenticated: currentSyncState.isAuthenticated,
      isServerReachable: isOnline ? currentSyncState.isServerReachable : false,
      pendingCount: inFlightProjectIds.size,
    }),
  });
}

export function setServerReachableStatus(
  isServerReachable: boolean,
  errorMessage: string | null = null
): void {
  updateCloudSyncState({
    isServerReachable,
    lastError: errorMessage,
    status: deriveFailClosedStatus({
      isOnline: currentSyncState.isOnline,
      isAuthenticated: currentSyncState.isAuthenticated,
      isServerReachable,
      pendingCount: inFlightProjectIds.size,
    }),
  });
}

export function setAuthSyncStatus(isAuthenticated: boolean): void {
  updateCloudSyncState({
    isAuthenticated,
    status: deriveFailClosedStatus({
      isOnline: currentSyncState.isOnline,
      isAuthenticated,
      isServerReachable: currentSyncState.isServerReachable,
      pendingCount: inFlightProjectIds.size,
    }),
  });
}

export function hasPendingSyncForProject(projectId: string): boolean {
  return inFlightProjectIds.has(projectId);
}

export function cancelPendingProjectSync(projectId: string, _ownerId?: string | null): void {
  inFlightProjectIds.delete(projectId);
  updateCloudSyncState({
    pendingCount: inFlightProjectIds.size,
    status: deriveFailClosedStatus({
      isOnline: currentSyncState.isOnline,
      isAuthenticated: currentSyncState.isAuthenticated,
      isServerReachable: currentSyncState.isServerReachable,
      pendingCount: inFlightProjectIds.size,
    }),
  });
}

/**
 * Uploads any newly attached PDF/image sheet into atomic Firestore DocumentManifest + 800KB chunks.
 * Fails closed when unauthenticated or offline.
 */
export async function uploadSheetBinaryToCloud(params: {
  project: Project;
  sheet: TakeoffSheet;
  ownerId: string | null;
}): Promise<{ sheet: TakeoffSheet; manifest: DocumentManifest | null }> {
  const { project, sheet, ownerId } = params;

  if (
    sheet.sheetType === 'blueprint_svg' ||
    !sheet.pdfDataUrl ||
    sheet.pdfManifestId
  ) {
    return { sheet, manifest: null };
  }

  assertVerifiedCloudPath(OperationType.CREATE, `projects/${project.id}/sheet/${sheet.id}`);
  if (!ownerId) {
    throw new Error('FAIL_CLOSED_UNAUTHENTICATED: Cannot upload sheet without verified ownerId.');
  }

  const dedupeKey = `${project.id}:${sheet.id}`;
  const existingUpload = inFlightSheetUploads.get(dedupeKey);
  if (existingUpload) {
    return existingUpload;
  }

  const uploadPromise = (async () => {
    await ensureProjectExistsInCloud(project, ownerId);

    const mimeType =
      sheet.sheetType === 'pdf_document'
        ? 'application/pdf'
        : sheet.pdfDataUrl!.match(/^data:([^;]+);/)?.[1] || 'image/png';

    const manifest = await uploadChunkedDocument({
      ownerId,
      projectId: project.id,
      fileName: `${sheet.code || sheet.id}.${sheet.sheetType === 'pdf_document' ? 'pdf' : 'png'}`,
      mimeType,
      base64DataUrl: sheet.pdfDataUrl!,
    });

    inMemoryBinaryCache.set(manifest.id, sheet.pdfDataUrl!);
    inMemoryBinaryCache.set(sheet.id, sheet.pdfDataUrl!);

    return {
      manifest,
      sheet: {
        ...sheet,
        pdfManifestId: manifest.id,
      },
    };
  })();

  inFlightSheetUploads.set(dedupeKey, uploadPromise);
  try {
    return await uploadPromise;
  } finally {
    inFlightSheetUploads.delete(dedupeKey);
  }
}

/**
 * Resolves a sheet binary URL strictly from Firestore DocumentManifest chunks (with read-through session memo).
 */
export async function resolveSheetBinaryUrl(sheet: TakeoffSheet): Promise<string | null> {
  if (sheet.pdfDataUrl) {
    return sheet.pdfDataUrl;
  }
  if (sheet.pdfManifestId) {
    const memo = inMemoryBinaryCache.get(sheet.pdfManifestId);
    if (memo) return memo;
    assertVerifiedCloudPath(OperationType.GET, `document_manifests/${sheet.pdfManifestId}`);
    const downloaded = await downloadChunkedDocument(sheet.pdfManifestId);
    if (downloaded?.dataUrl) {
      inMemoryBinaryCache.set(sheet.pdfManifestId, downloaded.dataUrl);
      return downloaded.dataUrl;
    }
  }
  return null;
}

async function uploadPendingBinariesOnProject(
  project: Project,
  ownerId: string
): Promise<{ project: Project; changed: boolean }> {
  let changed = false;

  const nextSheets: TakeoffSheet[] = [];
  for (const s of project.takeoffSheets || []) {
    if (s.sheetType !== 'blueprint_svg' && s.pdfDataUrl && !s.pdfManifestId) {
      const res = await uploadSheetBinaryToCloud({ project, sheet: s, ownerId });
      if (res.manifest) changed = true;
      nextSheets.push(res.sheet);
    } else {
      nextSheets.push(s);
    }
  }

  const nextDocs = [];
  for (const d of project.documents || []) {
    if (d.localDataUrl && !d.manifestId) {
      await ensureProjectExistsInCloud(project, ownerId);
      const manifest = await uploadChunkedDocument({
        ownerId,
        projectId: project.id,
        fileName: d.name,
        mimeType: d.mimeType || 'application/octet-stream',
        base64DataUrl: d.localDataUrl,
      });
      inMemoryBinaryCache.set(manifest.id, d.localDataUrl);
      changed = true;
      nextDocs.push({ ...d, manifestId: manifest.id });
    } else {
      nextDocs.push(d);
    }
  }

  if (!changed) return { project, changed: false };
  return {
    changed: true,
    project: {
      ...project,
      takeoffSheets: nextSheets,
      documents: nextDocs,
    },
  };
}

/**
 * Fail-Closed atomic project commit with idempotency key & exponential backoff.
 */
export async function commitProjectToCloudFailClosed(params: {
  project: Project;
  ownerId: string;
  forceOverwrite?: boolean;
  onManifestAttached?: (updatedProject: Project) => void;
}): Promise<Project> {
  const { project, ownerId, forceOverwrite, onManifestAttached } = params;
  assertVerifiedCloudPath(OperationType.WRITE, `projects/${project.id}`);

  const idemKey = computeIdempotencyKey('project_commit', project.id, project);
  inFlightProjectIds.add(project.id);
  updateCloudSyncState({
    status: 'syncing',
    pendingCount: inFlightProjectIds.size,
    lastError: null,
    lastIdempotencyKey: idemKey,
  });

  try {
    const { project: withManifests, changed } = await uploadPendingBinariesOnProject(
      project,
      ownerId
    );
    if (changed && onManifestAttached) {
      onManifestAttached(withManifests);
    }
    await saveProjectToCloud(withManifests, ownerId, {
      forceOverwrite,
      idempotencyKey: idemKey,
    });
    inFlightProjectIds.delete(project.id);
    const nowIso = new Date().toISOString();
    updateCloudSyncState({
      pendingCount: inFlightProjectIds.size,
      isServerReachable: true,
      lastSyncedAt: nowIso,
      lastError: null,
      status: inFlightProjectIds.size > 0 ? 'syncing' : 'synced',
    });
    return withManifests;
  } catch (err) {
    inFlightProjectIds.delete(project.id);
    const msg = err instanceof Error ? err.message : String(err);
    updateCloudSyncState({
      pendingCount: inFlightProjectIds.size,
      isServerReachable: false,
      lastError: msg,
      status: 'cloud_unreachable',
    });
    throw err;
  }
}

export async function pushSingleProjectImmediate(
  project: Project,
  ownerId: string,
  onManifestAttached?: (updatedProject: Project) => void
): Promise<Project> {
  return commitProjectToCloudFailClosed({
    project,
    ownerId,
    forceOverwrite: true,
    onManifestAttached,
  });
}

export async function commitCompanyProfileFailClosed(
  profile: CompanyProfile,
  ownerId: string
): Promise<void> {
  assertVerifiedCloudPath(OperationType.WRITE, `company_profiles/${ownerId}`);
  const idemKey = computeIdempotencyKey('company_commit', ownerId, profile);
  updateCloudSyncState({
    status: 'syncing',
    lastError: null,
    lastIdempotencyKey: idemKey,
  });
  try {
    await saveCompanyProfileToCloud(profile, ownerId, { idempotencyKey: idemKey });
    updateCloudSyncState({
      status: inFlightProjectIds.size > 0 ? 'syncing' : 'synced',
      isServerReachable: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateCloudSyncState({
      status: 'cloud_unreachable',
      isServerReachable: false,
      lastError: msg,
    });
    throw err;
  }
}

export async function commitReportsWorkspaceFailClosed(
  workspace: ReportsWorkspaceStorage,
  ownerId: string
): Promise<void> {
  assertVerifiedCloudPath(OperationType.WRITE, `report_workspaces/${ownerId}`);
  const idemKey = computeIdempotencyKey('reports_commit', ownerId, workspace);
  updateCloudSyncState({
    status: 'syncing',
    lastError: null,
    lastIdempotencyKey: idemKey,
  });
  try {
    await saveReportsWorkspaceToCloud(workspace, ownerId, { idempotencyKey: idemKey });
    updateCloudSyncState({
      status: inFlightProjectIds.size > 0 ? 'syncing' : 'synced',
      isServerReachable: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateCloudSyncState({
      status: 'cloud_unreachable',
      isServerReachable: false,
      lastError: msg,
    });
    throw err;
  }
}

export async function syncNowAll(params: {
  ownerId: string;
  projects: Project[];
  companyProfile: CompanyProfile;
  rateLibrary: RateLibraryItem[];
  transactions: GovernmentTransaction[];
  reportsWorkspace?: ReportsWorkspaceStorage;
  onManifestAttached?: (updatedProject: Project) => void;
}): Promise<void> {
  const {
    ownerId,
    projects,
    companyProfile,
    rateLibrary,
    transactions,
    reportsWorkspace,
    onManifestAttached,
  } = params;

  assertVerifiedCloudPath(OperationType.WRITE, 'workspace/syncNowAll');

  updateCloudSyncState({
    status: 'syncing',
    isAuthenticated: true,
    lastError: null,
  });

  try {
    await saveCompanyProfileToCloud(companyProfile, ownerId);

    for (const p of projects) {
      await commitProjectToCloudFailClosed({
        project: p,
        ownerId,
        onManifestAttached,
      });
    }

    for (const r of rateLibrary) {
      await saveRateItemToCloud(r, ownerId);
    }

    for (const tx of transactions) {
      await saveTransactionToCloud(tx, ownerId);
    }

    if (reportsWorkspace) {
      await saveReportsWorkspaceToCloud(reportsWorkspace, ownerId);
    }

    const nowIso = new Date().toISOString();
    updateCloudSyncState({
      status: 'synced',
      isServerReachable: true,
      pendingCount: 0,
      lastSyncedAt: nowIso,
      lastError: null,
    });
  } catch (err) {
    updateCloudSyncState({
      status: 'cloud_unreachable',
      isServerReachable: false,
      lastError: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export { parseSyncTimestampMs };

export function mergeRemoteProjectsWithLocal(
  localProjects: Project[],
  remoteProjects: Project[]
): Project[] {
  return mergeRemoteProjectsPure(localProjects, remoteProjects, hasPendingSyncForProject);
}

/**
 * Protected real-time onSnapshot listeners across all 5 per-user collections.
 * Requires verified auth & server connectivity; surfaces listener faults explicitly (Fail-Closed).
 */
export function subscribeWorkspaceRealtime(params: {
  ownerId: string;
  onRemoteProjects: (remoteProjects: Project[], meta: SnapshotSyncMetadata) => void;
  onRemoteCompanyProfile: (profile: CompanyProfile, meta: SnapshotSyncMetadata) => void;
  onRemoteRateLibrary: (items: RateLibraryItem[], meta: SnapshotSyncMetadata) => void;
  onRemoteTransactions: (txs: GovernmentTransaction[], meta: SnapshotSyncMetadata) => void;
  onRemoteReportsWorkspace?: (
    workspace: ReportsWorkspaceStorage,
    meta: SnapshotSyncMetadata
  ) => void;
  onCloudBootstrapNeeded?: () => void;
  onFatalSyncError?: (error: Error) => void;
}): Unsubscribe {
  const {
    ownerId,
    onRemoteProjects,
    onRemoteCompanyProfile,
    onRemoteRateLibrary,
    onRemoteTransactions,
    onRemoteReportsWorkspace,
    onCloudBootstrapNeeded,
    onFatalSyncError,
  } = params;

  assertVerifiedCloudPath(OperationType.LIST, 'workspace/realtime');

  let projectsServerSnapshotSeen = false;
  let companyServerSnapshotSeen = false;
  let hasCloudProjectsEver = false;
  let hasCloudCompanyProfile = false;
  let bootstrapFired = false;

  const checkBootstrap = () => {
    if (
      !bootstrapFired &&
      projectsServerSnapshotSeen &&
      companyServerSnapshotSeen &&
      !hasCloudProjectsEver &&
      !hasCloudCompanyProfile
    ) {
      bootstrapFired = true;
      onCloudBootstrapNeeded?.();
    }
  };

  const handleMeta = (meta: SnapshotSyncMetadata) => {
    if (!currentSyncState.isOnline) {
      updateCloudSyncState({ status: 'cloud_unreachable', isServerReachable: false });
      return;
    }
    if (meta.hasPendingWrites || inFlightProjectIds.size > 0) {
      updateCloudSyncState({ status: 'syncing' });
      return;
    }
    if (!meta.fromCache) {
      updateCloudSyncState({
        status: 'synced',
        isServerReachable: true,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
      });
    }
  };

  const handleListenerError = (err: Error) => {
    updateCloudSyncState({
      status: 'cloud_unreachable',
      isServerReachable: false,
      lastError: err.message,
    });
    onFatalSyncError?.(err);
  };

  const unsubProjects = subscribeProjects(
    ownerId,
    (list, meta) => {
      if (list.length > 0) {
        hasCloudProjectsEver = true;
      }
      if (!meta.fromCache || list.length > 0) {
        onRemoteProjects(list, meta);
      }
      if (!meta.fromCache) {
        projectsServerSnapshotSeen = true;
        checkBootstrap();
      }
      handleMeta(meta);
    },
    handleListenerError
  );

  const unsubCompany = subscribeCompanyProfile(
    ownerId,
    (profile, meta) => {
      if (profile) {
        hasCloudCompanyProfile = true;
        onRemoteCompanyProfile(profile, meta);
      }
      if (!meta.fromCache) {
        companyServerSnapshotSeen = true;
        checkBootstrap();
      }
      handleMeta(meta);
    },
    handleListenerError
  );

  const unsubRates = subscribeRateLibrary(
    ownerId,
    (items, meta) => {
      if (items.length > 0 || !meta.fromCache) {
        onRemoteRateLibrary(items, meta);
      }
      handleMeta(meta);
    },
    handleListenerError
  );

  const unsubTx = subscribeTransactions(
    ownerId,
    (txs, meta) => {
      if (txs.length > 0 || !meta.fromCache) {
        onRemoteTransactions(txs, meta);
      }
      handleMeta(meta);
    },
    handleListenerError
  );

  const unsubReports = subscribeReportsWorkspace(
    ownerId,
    (workspace, meta) => {
      if (workspace && onRemoteReportsWorkspace) {
        onRemoteReportsWorkspace(normalizeReportsWorkspace(workspace), meta);
      }
      handleMeta(meta);
    },
    handleListenerError
  );

  return () => {
    unsubProjects();
    unsubCompany();
    unsubRates();
    unsubTx();
    unsubReports();
  };
}
