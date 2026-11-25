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
import { isFirestoreOfflinePersistenceEnabled } from './firebase';
import {
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

export type CloudSyncStateStatus = 'synced' | 'syncing' | 'offline_cached';

export interface CloudSyncState {
  status: CloudSyncStateStatus;
  isOnline: boolean;
  isAuthenticated: boolean;
  persistenceEnabled: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface CachedWorkspaceSnapshot {
  projects?: Project[];
  companyProfile?: CompanyProfile;
  rateLibrary?: RateLibraryItem[];
  transactions?: GovernmentTransaction[];
  pendingProjectIds?: string[];
  lastSyncedAt?: string | null;
}

const DB_NAME = 'bunyan_offline_cache';
const DB_VERSION = 1;
const STORE_WORKSPACE = 'workspace';
const STORE_BINARIES = 'sheet_binaries';
const LEGACY_WORKSPACE_KEY = 'bunyan_active_workspace';
const DEBOUNCE_MS = 1500;

function getWorkspaceStorageKey(ownerId?: string | null): string {
  const cleanUid = ownerId ? ownerId.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
  return cleanUid ? `bunyan_workspace_user_${cleanUid}` : 'bunyan_workspace_guest';
}

const inMemoryBinaryCache = new Map<string, string>();
const inFlightSheetUploads = new Map<
  string,
  Promise<{ sheet: TakeoffSheet; manifest: DocumentManifest | null }>
>();
const projectDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingProjectPayloads = new Map<string, Project>();
const pendingCompanyTimer = { current: null as ReturnType<typeof setTimeout> | null };
const pendingReportsTimer = { current: null as ReturnType<typeof setTimeout> | null };
const syncStateListeners = new Set<(state: CloudSyncState) => void>();

let currentSyncState: CloudSyncState = {
  status: 'offline_cached',
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isAuthenticated: false,
  persistenceEnabled: isFirestoreOfflinePersistenceEnabled,
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
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

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE_WORKSPACE)) {
          database.createObjectStore(STORE_WORKSPACE);
        }
        if (!database.objectStoreNames.contains(STORE_BINARIES)) {
          database.createObjectStore(STORE_BINARIES);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  const database = await openOfflineDb();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet<T>(storeName: string, key: string, value: T): Promise<void> {
  const database = await openOfflineDb();
  if (!database) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = database.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadCachedWorkspaceSnapshot(
  ownerId?: string | null
): Promise<CachedWorkspaceSnapshot | null> {
  const scopedKey = getWorkspaceStorageKey(ownerId);
  let cached = await idbGet<CachedWorkspaceSnapshot>(STORE_WORKSPACE, scopedKey);
  if (!cached && !ownerId) {
    cached = await idbGet<CachedWorkspaceSnapshot>(STORE_WORKSPACE, LEGACY_WORKSPACE_KEY);
  }
  if (cached) {
    if (Array.isArray(cached.pendingProjectIds)) {
      const cachedById = new Map((cached.projects || []).map((p) => [p.id, p]));
      for (const pid of cached.pendingProjectIds) {
        const match = cachedById.get(pid);
        if (match) {
          pendingProjectPayloads.set(pid, match);
        }
      }
      updateCloudSyncState({
        pendingCount: pendingProjectPayloads.size,
        lastSyncedAt: cached.lastSyncedAt ?? currentSyncState.lastSyncedAt,
      });
    }
    return cached;
  }
  return null;
}

export async function saveCachedWorkspaceSnapshot(
  patch: Partial<CachedWorkspaceSnapshot>,
  ownerId?: string | null
): Promise<void> {
  const scopedKey = getWorkspaceStorageKey(ownerId);
  const existing = (await idbGet<CachedWorkspaceSnapshot>(STORE_WORKSPACE, scopedKey)) || {};
  const merged: CachedWorkspaceSnapshot = {
    ...existing,
    ...patch,
  };
  await idbSet(STORE_WORKSPACE, scopedKey, merged);
}

export function resetSyncQueueForAccountSwitch(isAuthenticated: boolean): void {
  for (const timer of projectDebounceTimers.values()) {
    clearTimeout(timer);
  }
  projectDebounceTimers.clear();
  pendingProjectPayloads.clear();
  if (pendingCompanyTimer.current) {
    clearTimeout(pendingCompanyTimer.current);
    pendingCompanyTimer.current = null;
  }
  if (pendingReportsTimer.current) {
    clearTimeout(pendingReportsTimer.current);
    pendingReportsTimer.current = null;
  }
  updateCloudSyncState({
    isAuthenticated,
    pendingCount: 0,
    lastSyncedAt: null,
    lastError: null,
    status: isAuthenticated && currentSyncState.isOnline ? 'syncing' : 'offline_cached',
  });
}

export async function cacheBinaryLocally(key: string, dataUrl: string): Promise<void> {
  if (!key || !dataUrl) return;
  inMemoryBinaryCache.set(key, dataUrl);
  await idbSet(STORE_BINARIES, key, dataUrl);
}

export async function getCachedBinaryLocally(key: string): Promise<string | null> {
  if (!key) return null;
  const mem = inMemoryBinaryCache.get(key);
  if (mem) return mem;
  const disk = await idbGet<string>(STORE_BINARIES, key);
  if (disk) {
    inMemoryBinaryCache.set(key, disk);
    return disk;
  }
  return null;
}

/**
 * Ensures any uploaded PDF/image sheet is sliced into 800KB DocumentChunk records
 * under DocumentManifest in Firestore so it loads across devices.
 */
export async function uploadSheetBinaryToCloud(params: {
  project: Project;
  sheet: TakeoffSheet;
  ownerId: string | null;
}): Promise<{ sheet: TakeoffSheet; manifest: DocumentManifest | null }> {
  const { project, sheet, ownerId } = params;

  if (sheet.pdfDataUrl) {
    await cacheBinaryLocally(sheet.id, sheet.pdfDataUrl);
  }

  if (
    !ownerId ||
    !currentSyncState.isOnline ||
    sheet.sheetType === 'blueprint_svg' ||
    !sheet.pdfDataUrl ||
    sheet.pdfManifestId
  ) {
    return { sheet, manifest: null };
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

    await cacheBinaryLocally(manifest.id, sheet.pdfDataUrl!);

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
 * Reassembles a sheet's binary data URL from in-memory cache, IndexedDB, or Firestore DocumentChunks.
 */
export async function resolveSheetBinaryUrl(sheet: TakeoffSheet): Promise<string | null> {
  if (sheet.pdfDataUrl) {
    await cacheBinaryLocally(sheet.id, sheet.pdfDataUrl);
    if (sheet.pdfManifestId) {
      await cacheBinaryLocally(sheet.pdfManifestId, sheet.pdfDataUrl);
    }
    return sheet.pdfDataUrl;
  }

  if (sheet.pdfManifestId) {
    const cachedByManifest = await getCachedBinaryLocally(sheet.pdfManifestId);
    if (cachedByManifest) return cachedByManifest;
  }

  const cachedBySheet = await getCachedBinaryLocally(sheet.id);
  if (cachedBySheet) return cachedBySheet;

  if (sheet.pdfManifestId && currentSyncState.isOnline) {
    const downloaded = await downloadChunkedDocument(sheet.pdfManifestId);
    if (downloaded?.dataUrl) {
      await cacheBinaryLocally(sheet.pdfManifestId, downloaded.dataUrl);
      await cacheBinaryLocally(sheet.id, downloaded.dataUrl);
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
      if (res.manifest) {
        changed = true;
      }
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
      await cacheBinaryLocally(manifest.id, d.localDataUrl);
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

async function commitProjectToCloud(
  project: Project,
  ownerId: string,
  onManifestAttached?: (updatedProject: Project) => void
): Promise<void> {
  const { project: withManifests, changed } = await uploadPendingBinariesOnProject(
    project,
    ownerId
  );

  if (changed && onManifestAttached) {
    onManifestAttached(withManifests);
  }

  await saveProjectToCloud(withManifests, ownerId);
  pendingProjectPayloads.delete(project.id);

  const remainingPending = Array.from(pendingProjectPayloads.keys());
  const nowIso = new Date().toISOString();
  await saveCachedWorkspaceSnapshot(
    {
      pendingProjectIds: remainingPending,
      lastSyncedAt: nowIso,
    },
    ownerId
  );

  updateCloudSyncState({
    pendingCount: remainingPending.length,
    lastSyncedAt: remainingPending.length === 0 ? nowIso : currentSyncState.lastSyncedAt,
    status:
      remainingPending.length > 0
        ? currentSyncState.isOnline && currentSyncState.isAuthenticated
          ? 'syncing'
          : 'offline_cached'
        : 'synced',
    lastError: null,
  });
}

/**
 * Schedules a 1.5s debounced auto-save for a project's measurements, BIM elements,
 * calibrated sheets, and chunked documents while persisting immediately to IndexedDB.
 */
export function scheduleProjectSync(params: {
  project: Project;
  allProjects: Project[];
  ownerId: string | null;
  onManifestAttached?: (updatedProject: Project) => void;
}): void {
  const { project, allProjects, ownerId, onManifestAttached } = params;

  pendingProjectPayloads.set(project.id, project);

  const pendingIds = Array.from(pendingProjectPayloads.keys());
  void saveCachedWorkspaceSnapshot(
    {
      projects: allProjects,
      pendingProjectIds: pendingIds,
    },
    ownerId
  );

  // Cache any newly attached sheet binaries locally right away
  for (const s of project.takeoffSheets || []) {
    if (s.pdfDataUrl) {
      void cacheBinaryLocally(s.id, s.pdfDataUrl);
    }
  }

  const existingTimer = projectDebounceTimers.get(project.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  if (!ownerId || !currentSyncState.isOnline) {
    updateCloudSyncState({
      status: 'offline_cached',
      pendingCount: pendingIds.length,
      isAuthenticated: Boolean(ownerId),
      lastError: null,
    });
    return;
  }

  updateCloudSyncState({
    status: 'syncing',
    pendingCount: pendingIds.length,
    isAuthenticated: true,
    lastError: null,
  });

  const timer = setTimeout(() => {
    projectDebounceTimers.delete(project.id);
    const latest = pendingProjectPayloads.get(project.id) || project;
    void commitProjectToCloud(latest, ownerId, onManifestAttached).catch((err) => {
      updateCloudSyncState({
        status: 'offline_cached',
        pendingCount: pendingProjectPayloads.size,
        lastError: err instanceof Error ? err.message : String(err),
      });
    });
  }, DEBOUNCE_MS);

  projectDebounceTimers.set(project.id, timer);
}

export function scheduleCompanyProfileSync(
  profile: CompanyProfile,
  ownerId: string | null
): void {
  void saveCachedWorkspaceSnapshot({ companyProfile: profile }, ownerId);

  if (pendingCompanyTimer.current) {
    clearTimeout(pendingCompanyTimer.current);
  }

  if (!ownerId || !currentSyncState.isOnline) {
    updateCloudSyncState({
      status: 'offline_cached',
      isAuthenticated: Boolean(ownerId),
    });
    return;
  }

  updateCloudSyncState({ status: 'syncing', lastError: null });

  pendingCompanyTimer.current = setTimeout(() => {
    pendingCompanyTimer.current = null;
    void saveCompanyProfileToCloud(profile, ownerId)
      .then(() => {
        const nowIso = new Date().toISOString();
        void saveCachedWorkspaceSnapshot({ lastSyncedAt: nowIso }, ownerId);
        updateCloudSyncState({
          status: pendingProjectPayloads.size > 0 ? 'syncing' : 'synced',
          lastSyncedAt: nowIso,
          lastError: null,
        });
      })
      .catch((err) => {
        updateCloudSyncState({
          status: 'offline_cached',
          lastError: err instanceof Error ? err.message : String(err),
        });
      });
  }, DEBOUNCE_MS);
}

export function scheduleReportsWorkspaceSync(
  workspace: ReportsWorkspaceStorage,
  ownerId: string | null
): void {
  if (pendingReportsTimer.current) {
    clearTimeout(pendingReportsTimer.current);
  }

  if (!ownerId || !currentSyncState.isOnline) {
    updateCloudSyncState({
      status: 'offline_cached',
      isAuthenticated: Boolean(ownerId),
    });
    return;
  }

  updateCloudSyncState({ status: 'syncing', lastError: null });

  pendingReportsTimer.current = setTimeout(() => {
    pendingReportsTimer.current = null;
    void saveReportsWorkspaceToCloud(workspace, ownerId)
      .then(() => {
        const nowIso = new Date().toISOString();
        void saveCachedWorkspaceSnapshot({ lastSyncedAt: nowIso }, ownerId);
        updateCloudSyncState({
          status: pendingProjectPayloads.size > 0 ? 'syncing' : 'synced',
          lastSyncedAt: nowIso,
          lastError: null,
        });
      })
      .catch((err) => {
        updateCloudSyncState({
          status: 'offline_cached',
          lastError: err instanceof Error ? err.message : String(err),
        });
      });
  }, DEBOUNCE_MS);
}

export async function flushPendingProjectSyncs(
  ownerId: string,
  onManifestAttached?: (updatedProject: Project) => void
): Promise<void> {
  if (!ownerId || !currentSyncState.isOnline) {
    updateCloudSyncState({ status: 'offline_cached', isAuthenticated: Boolean(ownerId) });
    return;
  }

  for (const timer of projectDebounceTimers.values()) {
    clearTimeout(timer);
  }
  projectDebounceTimers.clear();

  const entries = Array.from(pendingProjectPayloads.values());
  if (entries.length === 0) return;

  updateCloudSyncState({
    status: 'syncing',
    pendingCount: entries.length,
    isAuthenticated: true,
    lastError: null,
  });

  try {
    for (const proj of entries) {
      await commitProjectToCloud(proj, ownerId, onManifestAttached);
    }
  } catch (err) {
    updateCloudSyncState({
      status: 'offline_cached',
      pendingCount: pendingProjectPayloads.size,
      lastError: err instanceof Error ? err.message : String(err),
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

  if (!currentSyncState.isOnline) {
    updateCloudSyncState({ status: 'offline_cached', isAuthenticated: Boolean(ownerId) });
    return;
  }

  updateCloudSyncState({
    status: 'syncing',
    isAuthenticated: true,
    lastError: null,
  });

  try {
    await flushPendingProjectSyncs(ownerId, onManifestAttached);

    await saveCompanyProfileToCloud(companyProfile, ownerId);

    for (const p of projects) {
      await commitProjectToCloud(p, ownerId, onManifestAttached);
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
    await saveCachedWorkspaceSnapshot(
      {
        projects,
        companyProfile,
        rateLibrary,
        transactions,
        pendingProjectIds: [],
        lastSyncedAt: nowIso,
      },
      ownerId
    );

    updateCloudSyncState({
      status: 'synced',
      pendingCount: 0,
      lastSyncedAt: nowIso,
      lastError: null,
    });
  } catch (err) {
    updateCloudSyncState({
      status: 'offline_cached',
      lastError: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export function hasPendingSyncForProject(projectId: string): boolean {
  return pendingProjectPayloads.has(projectId) || projectDebounceTimers.has(projectId);
}

export function cancelPendingProjectSync(projectId: string, ownerId?: string | null): void {
  const timer = projectDebounceTimers.get(projectId);
  if (timer) {
    clearTimeout(timer);
    projectDebounceTimers.delete(projectId);
  }
  pendingProjectPayloads.delete(projectId);
  const remainingIds = Array.from(pendingProjectPayloads.keys());
  void saveCachedWorkspaceSnapshot({ pendingProjectIds: remainingIds }, ownerId);
  updateCloudSyncState({
    pendingCount: remainingIds.length,
    status:
      remainingIds.length > 0
        ? currentSyncState.isOnline && currentSyncState.isAuthenticated
          ? 'syncing'
          : 'offline_cached'
        : currentSyncState.isOnline && currentSyncState.isAuthenticated
        ? 'synced'
        : 'offline_cached',
  });
}

export function setNetworkOnlineStatus(isOnline: boolean): void {
  updateCloudSyncState({
    isOnline,
    status: !isOnline
      ? 'offline_cached'
      : currentSyncState.isAuthenticated && pendingProjectPayloads.size === 0
      ? 'synced'
      : currentSyncState.isAuthenticated
      ? 'syncing'
      : 'offline_cached',
  });
}

export function setAuthSyncStatus(isAuthenticated: boolean): void {
  updateCloudSyncState({
    isAuthenticated,
    status:
      isAuthenticated && currentSyncState.isOnline && pendingProjectPayloads.size === 0
        ? 'synced'
        : isAuthenticated && currentSyncState.isOnline
        ? 'syncing'
        : 'offline_cached',
  });
}

export { parseSyncTimestampMs };

export function mergeRemoteProjectsWithLocal(
  localProjects: Project[],
  remoteProjects: Project[]
): Project[] {
  return mergeRemoteProjectsPure(localProjects, remoteProjects, hasPendingSyncForProject);
}

/**
 * Attaches real-time onSnapshot listeners across projects, companyProfile,
 * rateLibrary, governmentTransactions, and reportWorkspaces for instant
 * automatic cross-device synchronization per authenticated Google account.
 */
export function subscribeWorkspaceRealtime(params: {
  ownerId: string;
  onRemoteProjects: (remoteProjects: Project[]) => void;
  onRemoteCompanyProfile: (profile: CompanyProfile) => void;
  onRemoteRateLibrary: (items: RateLibraryItem[]) => void;
  onRemoteTransactions: (txs: GovernmentTransaction[]) => void;
  onRemoteReportsWorkspace?: (workspace: ReportsWorkspaceStorage) => void;
  onCloudBootstrapNeeded?: () => void;
}): Unsubscribe {
  const {
    ownerId,
    onRemoteProjects,
    onRemoteCompanyProfile,
    onRemoteRateLibrary,
    onRemoteTransactions,
    onRemoteReportsWorkspace,
    onCloudBootstrapNeeded,
  } = params;

  let projectsSnapshotSeen = false;
  let companySnapshotSeen = false;
  let hasCloudProjectsEver = false;
  let hasCloudCompanyProfile = false;
  let bootstrapFired = false;

  const checkBootstrap = () => {
    if (
      !bootstrapFired &&
      projectsSnapshotSeen &&
      companySnapshotSeen &&
      !hasCloudProjectsEver &&
      !hasCloudCompanyProfile
    ) {
      bootstrapFired = true;
      onCloudBootstrapNeeded?.();
    }
  };

  const handleMeta = (meta: SnapshotSyncMetadata) => {
    if (!currentSyncState.isOnline) {
      updateCloudSyncState({ status: 'offline_cached' });
      return;
    }
    if (meta.hasPendingWrites || pendingProjectPayloads.size > 0) {
      updateCloudSyncState({
        status: currentSyncState.isOnline ? 'syncing' : 'offline_cached',
      });
      return;
    }
    if (!meta.fromCache) {
      const nowIso = new Date().toISOString();
      updateCloudSyncState({
        status: 'synced',
        lastSyncedAt: nowIso,
        lastError: null,
      });
    }
  };

  const unsubProjects = subscribeProjects(
    ownerId,
    (list, meta) => {
      if (list.length > 0) {
        hasCloudProjectsEver = true;
        onRemoteProjects(list);
      } else if (hasCloudProjectsEver) {
        onRemoteProjects(list);
      }
      if (!meta.fromCache || list.length > 0) {
        projectsSnapshotSeen = true;
        checkBootstrap();
      }
      handleMeta(meta);
    },
    (err) => {
      updateCloudSyncState({ status: 'offline_cached', lastError: err.message });
    }
  );

  const unsubCompany = subscribeCompanyProfile(
    ownerId,
    (profile, meta) => {
      if (profile) {
        hasCloudCompanyProfile = true;
        onRemoteCompanyProfile(profile);
      }
      if (!meta.fromCache || profile !== null) {
        companySnapshotSeen = true;
        checkBootstrap();
      }
      handleMeta(meta);
    },
    (err) => {
      updateCloudSyncState({ lastError: err.message });
    }
  );

  const unsubRates = subscribeRateLibrary(
    ownerId,
    (items, meta) => {
      if (items.length > 0) {
        onRemoteRateLibrary(items);
      }
      handleMeta(meta);
    },
    (err) => {
      updateCloudSyncState({ lastError: err.message });
    }
  );

  const unsubTx = subscribeTransactions(
    ownerId,
    (txs, meta) => {
      if (txs.length > 0 || hasCloudProjectsEver) {
        onRemoteTransactions(txs);
      }
      handleMeta(meta);
    },
    (err) => {
      updateCloudSyncState({ lastError: err.message });
    }
  );

  const unsubReports = subscribeReportsWorkspace(
    ownerId,
    (workspace, meta) => {
      if (workspace && onRemoteReportsWorkspace) {
        onRemoteReportsWorkspace(normalizeReportsWorkspace(workspace));
      }
      handleMeta(meta);
    },
    (err) => {
      updateCloudSyncState({ lastError: err.message });
    }
  );

  return () => {
    unsubProjects();
    unsubCompany();
    unsubRates();
    unsubTx();
    unsubReports();
  };
}
