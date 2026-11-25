import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  CompanyProfile,
  DocumentManifest,
  GovernmentTransaction,
  Project,
  RateLibraryItem,
  Role,
  UserProfile,
} from '../types/bunyan';
import type { ReportsWorkspaceStorage } from '../types/reports';
import {
  assertVerifiedCloudPath,
  auth,
  computeIdempotencyKey,
  db,
  handleFirestoreError,
  OperationType,
  withExponentialBackoff,
} from './firebase';

// 800KB base64 slice size to safely stay below Firestore 1MB per-document cap
export const CHUNK_SIZE_BYTES = 800 * 1024;
const ADMIN_BOOTSTRAP_EMAIL = 'mjaidaa66@gmail.com';

export interface SnapshotSyncMetadata {
  hasPendingWrites: boolean;
  fromCache: boolean;
}

const committedIdempotencyKeys = new Map<string, string>();

function isCallerAdmin(): boolean {
  return Boolean(
    auth.currentUser?.emailVerified && auth.currentUser?.email === ADMIN_BOOTSTRAP_EMAIL
  );
}

export function sanitizeFirestoreId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        clean[k] = stripUndefinedDeep(v);
      }
    }
    return clean as T;
  }
  return value;
}

function isFirestoreTimestampLike(value: unknown): value is {
  toDate?: () => Date;
  seconds?: number;
  nanoseconds?: number;
} {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.toDate === 'function') return true;
  return (
    typeof obj.seconds === 'number' &&
    typeof obj.nanoseconds === 'number' &&
    !('x' in obj) &&
    Object.keys(obj).length <= 3
  );
}

export function normalizeFirestoreData<T>(value: T): T {
  if (isFirestoreTimestampLike(value)) {
    if (typeof value.toDate === 'function') {
      return value.toDate().toISOString() as unknown as T;
    }
    if (typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000).toISOString() as unknown as T;
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFirestoreData(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeFirestoreData(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Atomically uploads a chunked binary document (manifest + all 800KB chunks in a single writeBatch)
 * using a deterministic idempotency key so retries never create duplicate manifests.
 */
export async function uploadChunkedDocument(params: {
  ownerId: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  base64DataUrl: string;
}): Promise<DocumentManifest> {
  const { ownerId, projectId, fileName, mimeType, base64DataUrl } = params;
  const safeOwnerId = sanitizeFirestoreId(ownerId);
  const safeProjectId = sanitizeFirestoreId(projectId);
  const totalSize = base64DataUrl.length;
  const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE_BYTES));
  if (totalChunks > 100) {
    throw new Error('Document exceeds maximum Firestore chunk limit (100 chunks / ~80MB).');
  }

  const idemKey = computeIdempotencyKey('manifest', safeProjectId, {
    safeOwnerId,
    fileName,
    mimeType,
    totalSize,
    head: base64DataUrl.slice(0, 128),
    tail: base64DataUrl.slice(-128),
  });
  const manifestId = sanitizeFirestoreId(`mf_${idemKey}`);
  const manifestPath = `document_manifests/${manifestId}`;

  assertVerifiedCloudPath(OperationType.CREATE, manifestPath);

  try {
    return await withExponentialBackoff(async () => {
      const manifestRef = doc(db, 'document_manifests', manifestId);
      const existingSnap = await getDocFromServer(manifestRef);
      if (existingSnap.exists()) {
        const existingData = normalizeFirestoreData(existingSnap.data() as DocumentManifest);
        if (
          existingData.totalChunks === totalChunks &&
          existingData.totalSize === totalSize &&
          existingData.projectId === safeProjectId
        ) {
          return existingData;
        }
      }

      const batch = writeBatch(db);
      const manifestPayload = {
        id: manifestId,
        ownerId: safeOwnerId,
        projectId: safeProjectId,
        fileName: fileName.slice(0, 250) || 'drawing.pdf',
        mimeType: mimeType.slice(0, 110) || 'application/octet-stream',
        totalSize,
        totalChunks,
        chunkSizeBytes: CHUNK_SIZE_BYTES,
        createdAt: serverTimestamp(),
      };
      batch.set(manifestRef, manifestPayload);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE_BYTES;
        const slice = base64DataUrl.slice(start, start + CHUNK_SIZE_BYTES);
        const chunkId = `chunk_${String(i).padStart(4, '0')}`;
        batch.set(doc(db, 'document_manifests', manifestId, 'chunks', chunkId), {
          id: chunkId,
          manifestId,
          ownerId: safeOwnerId,
          index: i,
          data: slice,
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();

      return {
        id: manifestId,
        ownerId: safeOwnerId,
        projectId: safeProjectId,
        fileName: manifestPayload.fileName,
        mimeType: manifestPayload.mimeType,
        totalSize,
        totalChunks,
        chunkSizeBytes: CHUNK_SIZE_BYTES,
        createdAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, manifestPath);
  }
}

/**
 * Reassembles a chunked binary document directly from Firestore server chunks ordered by index.
 */
export async function downloadChunkedDocument(manifestId: string): Promise<{
  manifest: DocumentManifest;
  dataUrl: string;
} | null> {
  const safeId = sanitizeFirestoreId(manifestId);
  const path = `document_manifests/${safeId}`;
  assertVerifiedCloudPath(OperationType.GET, path);

  try {
    return await withExponentialBackoff(async () => {
      const manifestSnap = await getDocFromServer(doc(db, 'document_manifests', safeId));
      if (!manifestSnap.exists()) return null;
      const manifest = normalizeFirestoreData(manifestSnap.data() as DocumentManifest);
      const safeOwnerId = sanitizeFirestoreId(manifest.ownerId || '');

      const chunksQuery = query(
        collection(db, 'document_manifests', safeId, 'chunks'),
        where('ownerId', '==', safeOwnerId)
      );
      const chunksSnap = await getDocsFromServer(chunksQuery);
      const ordered = chunksSnap.docs
        .map((d) => d.data() as { index: number; data: string })
        .sort((a, b) => a.index - b.index);

      if (ordered.length < manifest.totalChunks) {
        throw new Error(
          `Incomplete chunked document in Firestore (${ordered.length}/${manifest.totalChunks} chunks).`
        );
      }

      const dataUrl = ordered.map((c) => c.data).join('');
      return { manifest, dataUrl };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function deleteChunkedDocument(manifestId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(manifestId);
  const path = `document_manifests/${safeId}`;
  const callerUid = assertVerifiedCloudPath(OperationType.DELETE, path);

  try {
    await withExponentialBackoff(async () => {
      const manifestRef = doc(db, 'document_manifests', safeId);
      const manifestSnap = await getDocFromServer(manifestRef);
      if (!manifestSnap.exists()) return;

      const manifestOwner = sanitizeFirestoreId(
        String(manifestSnap.data().ownerId || callerUid)
      );
      const chunksSnap = await getDocsFromServer(
        query(
          collection(db, 'document_manifests', safeId, 'chunks'),
          where('ownerId', '==', manifestOwner)
        )
      );
      const batch = writeBatch(db);
      chunksSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(manifestRef);
      await batch.commit();
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Atomic transaction upsert for UserProfile (prevents concurrent overwrite & preserves role/createdAt).
 */
export async function upsertUserProfile(params: {
  uid: string;
  email: string;
  displayName: string;
  role?: Role;
  companyName?: string;
  licenseNumber?: string;
  biometricRegistered?: boolean;
}): Promise<UserProfile> {
  const safeUid = sanitizeFirestoreId(params.uid);
  const path = `users/${safeUid}`;
  assertVerifiedCloudPath(OperationType.WRITE, path);

  try {
    return await withExponentialBackoff(async () => {
      const ref = doc(db, 'users', safeUid);
      return await runTransaction(db, async (tx) => {
        const rawDisplay =
          (params.displayName || 'Engineer').trim().slice(0, 120) || 'Engineer';
        const existing = await tx.get(ref);

        if (!existing.exists()) {
          const safeEmail = (params.email || '').trim().slice(0, 200);
          const profile = {
            uid: safeUid,
            email:
              safeEmail.length >= 3
                ? safeEmail
                : `${safeUid.slice(0, 20)}@bunyan.local`,
            displayName: rawDisplay,
            role: params.role && params.role !== 'admin' ? params.role : 'engineer',
            companyName: (params.companyName || '').slice(0, 160),
            licenseNumber: (params.licenseNumber || '').slice(0, 80),
            biometricRegistered: params.biometricRegistered ?? false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          tx.set(ref, profile);
          return {
            ...profile,
            role: profile.role as Role,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }

        const existingData = normalizeFirestoreData(existing.data() as UserProfile);
        const updated = {
          uid: safeUid,
          email: existingData.email,
          displayName: (
            params.displayName ||
            existingData.displayName ||
            'Engineer'
          )
            .trim()
            .slice(0, 120),
          role: existingData.role,
          companyName: (params.companyName ?? existingData.companyName ?? '').slice(
            0,
            160
          ),
          licenseNumber: (params.licenseNumber ?? existingData.licenseNumber ?? '').slice(
            0,
            80
          ),
          biometricRegistered:
            params.biometricRegistered ?? existingData.biometricRegistered,
          createdAt: existing.data().createdAt,
          updatedAt: serverTimestamp(),
        };
        tx.set(ref, updated);
        return {
          ...existingData,
          displayName: updated.displayName,
          companyName: updated.companyName,
          licenseNumber: updated.licenseNumber,
          biometricRegistered: updated.biometricRegistered,
          updatedAt: new Date().toISOString(),
        };
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

function buildCanonicalProjectPayload(
  project: Project,
  ownerId: string,
  createdAtField: unknown
): Record<string, unknown> {
  const safeId = sanitizeFirestoreId(project.id);
  const rawCode = (project.code || safeId).trim().slice(0, 40);
  const safeCode = rawCode.length >= 2 ? rawCode : `${rawCode}_PRJ`.slice(0, 40);
  return {
    id: safeId,
    ownerId,
    code: safeCode,
    name: (project.name || 'مشروع جديد').trim().slice(0, 200) || 'مشروع جديد',
    nameEn:
      (project.nameEn || project.name || 'New Project').trim().slice(0, 200) ||
      'New Project',
    category: String(project.category || 'المشاريع الإنشائية').slice(0, 100),
    projectType: project.projectType,
    status: project.status,
    ownerName: String(project.ownerName || '').slice(0, 200),
    ownerPhone: String(project.ownerPhone || '').slice(0, 60),
    ownerEmail: String(project.ownerEmail || '').slice(0, 160),
    ownerNationalId: String(project.ownerNationalId || '').slice(0, 60),
    consultantOffice: String(project.consultantOffice || '').slice(0, 200),
    consultantEngineer: String(project.consultantEngineer || '').slice(0, 160),
    consultantPhone: String(project.consultantPhone || '').slice(0, 60),
    consultantLicenseNo: String(project.consultantLicenseNo || '').slice(0, 80),
    residentEngineer: String(project.residentEngineer || '').slice(0, 160),
    contractorBranch: String(project.contractorBranch || '').slice(0, 160),
    permitNumber: String(project.permitNumber || '').slice(0, 80),
    permitDate: String(project.permitDate || '').slice(0, 40),
    permitExpiryDate: String(project.permitExpiryDate || '').slice(0, 40),
    licensingAuthority: String(project.licensingAuthority || '').slice(0, 160),
    approvedBudget: Math.max(0, Number(project.approvedBudget) || 0),
    invoicedAmount: Math.max(0, Number(project.invoicedAmount) || 0),
    paidAmount: Math.max(0, Number(project.paidAmount) || 0),
    retentionPercentage: Math.min(50, Math.max(0, Number(project.retentionPercentage) || 0)),
    actualProgress: Math.min(100, Math.max(0, Number(project.actualProgress) || 0)),
    plannedProgress: Math.min(100, Math.max(0, Number(project.plannedProgress) || 0)),
    phases: stripUndefinedDeep((project.phases || []).slice(0, 50)),
    paymentMilestones: stripUndefinedDeep((project.paymentMilestones || []).slice(0, 50)),
    documents: (project.documents || []).slice(0, 100).map((docItem) => {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(docItem)) {
        if (k !== 'localDataUrl' && v !== undefined) {
          clean[k] = v;
        }
      }
      return clean;
    }),
    gisData: stripUndefinedDeep(project.gisData || {}),
    bimElements: stripUndefinedDeep((project.bimElements || []).slice(0, 500)),
    takeoffSheets: (project.takeoffSheets || []).slice(0, 50).map((s) => {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(s)) {
        if (k !== 'svgContent' && k !== 'pdfDataUrl' && v !== undefined) {
          clean[k] = stripUndefinedDeep(v);
        }
      }
      return clean;
    }),
    takeoffMeasurements: stripUndefinedDeep(
      (project.takeoffMeasurements || []).slice(0, 500)
    ),
    takeoffSummaryConfig: project.takeoffSummaryConfig || {
      overheadPercent: 10,
      profitPercent: 12,
      vatPercent: 5,
    },
    createdAt: createdAtField,
    updatedAt: serverTimestamp(),
  };
}

/**
 * Atomic transactional save for Project with idempotency dedupe & terminal-lock guard.
 */
export async function saveProjectToCloud(
  project: Project,
  ownerId: string,
  options?: { forceOverwrite?: boolean; idempotencyKey?: string }
): Promise<void> {
  const safeId = sanitizeFirestoreId(project.id);
  const safeOwnerId = sanitizeFirestoreId(ownerId);
  const path = `projects/${safeId}`;
  assertVerifiedCloudPath(OperationType.WRITE, path);

  const previewPayload = buildCanonicalProjectPayload(project, safeOwnerId, 'preserved');
  const idemKey =
    options?.idempotencyKey || computeIdempotencyKey('project', safeId, previewPayload);
  if (!options?.forceOverwrite && committedIdempotencyKeys.get(path) === idemKey) {
    return;
  }

  try {
    await withExponentialBackoff(async () => {
      const ref = doc(db, 'projects', safeId);
      await runTransaction(db, async (tx) => {
        const existing = await tx.get(ref);
        if (existing.exists()) {
          const existingData = normalizeFirestoreData(
            existing.data() as Record<string, unknown>
          );
          if (
            existingData.status === 'completed' &&
            !isCallerAdmin() &&
            !options?.forceOverwrite
          ) {
            if (project.status === 'completed') {
              return;
            }
            throw new Error(
              `TERMINAL_LOCK_VIOLATION: Project ${safeId} is completed in Firestore and requires Admin privileges.`
            );
          }
        }
        const effectiveOwnerId = existing.exists()
          ? String(existing.data().ownerId || safeOwnerId)
          : safeOwnerId;
        const createdAtField = existing.exists()
          ? existing.data().createdAt
          : serverTimestamp();
        const payload = buildCanonicalProjectPayload(
          project,
          effectiveOwnerId,
          createdAtField
        );
        tx.set(ref, payload);
      });
    });
    committedIdempotencyKeys.set(path, idemKey);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function ensureProjectExistsInCloud(
  project: Project,
  ownerId: string
): Promise<void> {
  const safeId = sanitizeFirestoreId(project.id);
  const safeOwnerId = sanitizeFirestoreId(ownerId);
  const path = `projects/${safeId}`;
  assertVerifiedCloudPath(OperationType.WRITE, path);

  try {
    await withExponentialBackoff(async () => {
      const ref = doc(db, 'projects', safeId);
      await runTransaction(db, async (tx) => {
        const existing = await tx.get(ref);
        if (!existing.exists()) {
          tx.set(ref, buildCanonicalProjectPayload(project, safeOwnerId, serverTimestamp()));
        }
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Deletes a project, its orphaned transactions, and referenced chunked document manifests
 * strictly via Cloud Firestore (no silent failure).
 */
export async function deleteProjectFromCloud(
  projectId: string,
  manifestIds?: string[],
  orphanedTransactionIds?: string[]
): Promise<void> {
  const safeId = sanitizeFirestoreId(projectId);
  const path = `projects/${safeId}`;
  assertVerifiedCloudPath(OperationType.DELETE, path);

  try {
    if (Array.isArray(manifestIds)) {
      for (const mid of manifestIds) {
        if (!mid) continue;
        await deleteChunkedDocument(mid);
      }
    }

    await withExponentialBackoff(async () => {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'projects', safeId));
      if (Array.isArray(orphanedTransactionIds)) {
        for (const txId of orphanedTransactionIds) {
          if (!txId) continue;
          batch.delete(doc(db, 'government_transactions', sanitizeFirestoreId(txId)));
        }
      }
      await batch.commit();
    });
    committedIdempotencyKeys.delete(path);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeProjects(
  ownerId: string,
  onData: (projects: Project[], meta: SnapshotSyncMetadata) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'projects';
  assertVerifiedCloudPath(OperationType.LIST, path);
  const q = query(
    collection(db, path),
    where('ownerId', '==', sanitizeFirestoreId(ownerId))
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const list = snap.docs.map((d) => normalizeFirestoreData(d.data() as Project));
      onData(list, {
        hasPendingWrites: snap.metadata.hasPendingWrites,
        fromCache: snap.metadata.fromCache,
      });
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

/**
 * Atomic transactional write for GovernmentTransaction (eliminates concurrent update race).
 */
export async function saveTransactionToCloud(
  txRecord: GovernmentTransaction,
  ownerId: string,
  options?: { forceOverwrite?: boolean; idempotencyKey?: string }
): Promise<void> {
  const safeId = sanitizeFirestoreId(txRecord.id);
  const safeOwnerId = sanitizeFirestoreId(ownerId);
  const path = `government_transactions/${safeId}`;
  assertVerifiedCloudPath(OperationType.WRITE, path);

  const idemKey =
    options?.idempotencyKey ||
    computeIdempotencyKey('tx', safeId, {
      ...txRecord,
      projectId: sanitizeFirestoreId(txRecord.projectId),
    });
  if (!options?.forceOverwrite && committedIdempotencyKeys.get(path) === idemKey) {
    return;
  }

  try {
    await withExponentialBackoff(async () => {
      const ref = doc(db, 'government_transactions', safeId);
      await runTransaction(db, async (tx) => {
        const existing = await tx.get(ref);
        if (existing.exists()) {
          const ex = existing.data();
          if (
            ex.status === 'approved' &&
            !isCallerAdmin() &&
            !options?.forceOverwrite
          ) {
            if (
              txRecord.status === 'approved' &&
              String(ex.lastUpdatedDate || '') === String(txRecord.lastUpdatedDate || '') &&
              String(ex.notes || '') === String(txRecord.notes || '')
            ) {
              return;
            }
            throw new Error(
              `TERMINAL_LOCK_VIOLATION: Transaction ${safeId} is approved in Firestore and requires Admin privileges.`
            );
          }
        }

        tx.set(ref, {
          id: safeId,
          ownerId: existing.exists() ? existing.data().ownerId : safeOwnerId,
          projectId: sanitizeFirestoreId(txRecord.projectId),
          authority: txRecord.authority,
          transactionNumber: (txRecord.transactionNumber || safeId).slice(0, 80),
          serviceName: (txRecord.serviceName || 'طلب اعتماد فني').slice(0, 200),
          serviceNameEn: (
            txRecord.serviceNameEn ||
            txRecord.serviceName ||
            'Approval Request'
          ).slice(0, 200),
          status: txRecord.status,
          submissionDate: txRecord.submissionDate,
          lastUpdatedDate: txRecord.lastUpdatedDate,
          reviewEngineer: (txRecord.reviewEngineer || '').slice(0, 120),
          notes: (txRecord.notes || '').slice(0, 1000),
          officialPortalUrl: (txRecord.officialPortalUrl || '').slice(0, 500),
          createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    });
    committedIdempotencyKeys.set(path, idemKey);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTransactionFromCloud(txId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(txId);
  const path = `government_transactions/${safeId}`;
  assertVerifiedCloudPath(OperationType.DELETE, path);

  try {
    await withExponentialBackoff(async () => {
      const ref = doc(db, 'government_transactions', safeId);
      await runTransaction(db, async (tx) => {
        const existing = await tx.get(ref);
        if (!existing.exists()) return;
        if (existing.data().status === 'approved' && !isCallerAdmin()) {
          throw new Error(
            `TERMINAL_LOCK_VIOLATION: Approved transaction ${safeId} cannot be deleted by non-admin.`
          );
        }
        tx.delete(ref);
      });
    });
    committedIdempotencyKeys.delete(path);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeTransactions(
  ownerId: string,
  onData: (txs: GovernmentTransaction[], meta: SnapshotSyncMetadata) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'government_transactions';
  assertVerifiedCloudPath(OperationType.LIST, path);
  const q = query(
    collection(db, path),
    where('ownerId', '==', sanitizeFirestoreId(ownerId))
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      onData(
        snap.docs.map((d) => normalizeFirestoreData(d.data() as GovernmentTransaction)),
        {
          hasPendingWrites: snap.metadata.hasPendingWrites,
          fromCache: snap.metadata.fromCache,
        }
      );
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveRateItemToCloud(
  item: RateLibraryItem,
  ownerId: string,
  options?: { forceOverwrite?: boolean; idempotencyKey?: string }
): Promise<void> {
  const safeId = sanitizeFirestoreId(item.id);
  const safeOwnerId = sanitizeFirestoreId(ownerId);
  const path = `rate_library/${safeId}`;
  assertVerifiedCloudPath(OperationType.WRITE, path);

  const rawCode = (item.code || safeId).trim().slice(0, 20);
  const payload = {
    id: safeId,
    ownerId: safeOwnerId,
    code: rawCode.length >= 2 ? rawCode : `${rawCode}_R`.slice(0, 20),
    category: String(item.category).slice(0, 40),
    nameAr: (item.nameAr || item.nameEn || 'بند').slice(0, 200),
    nameEn: (item.nameEn || item.nameAr || 'Item').slice(0, 200),
    unit: String(item.unit || 'unit').slice(0, 20),
    rateAed: Math.max(0, Number(item.rateAed) || 0),
    equipmentRate: Math.max(0, Number(item.equipmentRate) || 0),
    materialSpec: (item.materialSpec || '').slice(0, 200),
  };
  const idemKey =
    options?.idempotencyKey || computeIdempotencyKey('rate', safeId, payload);
  if (!options?.forceOverwrite && committedIdempotencyKeys.get(path) === idemKey) {
    return;
  }

  try {
    await withExponentialBackoff(async () => {
      await setDoc(doc(db, 'rate_library', safeId), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    });
    committedIdempotencyKeys.set(path, idemKey);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeRateLibrary(
  ownerId: string,
  onData: (items: RateLibraryItem[], meta: SnapshotSyncMetadata) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'rate_library';
  assertVerifiedCloudPath(OperationType.LIST, path);
  const q = query(
    collection(db, path),
    where('ownerId', '==', sanitizeFirestoreId(ownerId))
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      onData(
        snap.docs.map((d) => normalizeFirestoreData(d.data() as RateLibraryItem)),
        {
          hasPendingWrites: snap.metadata.hasPendingWrites,
          fromCache: snap.metadata.fromCache,
        }
      );
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveCompanyProfileToCloud(
  profile: CompanyProfile,
  ownerId: string,
  options?: { forceOverwrite?: boolean; idempotencyKey?: string }
): Promise<void> {
  const safeUid = sanitizeFirestoreId(ownerId);
  const path = `company_profiles/${safeUid}`;
  assertVerifiedCloudPath(OperationType.WRITE, path);

  const payload = {
    id: safeUid,
    ownerId: safeUid,
    nameAr: (profile.nameAr || 'مؤسسة بنيان').slice(0, 200),
    nameEn: (profile.nameEn || 'Bunyan Engineering').slice(0, 200),
    licenseNumber: (profile.licenseNumber || 'SHJ-0001').slice(0, 80),
    municipalityClass: (profile.municipalityClass || '').slice(0, 120),
    trnNumber: (profile.trnNumber || '').slice(0, 40),
    addressAr: (profile.addressAr || '').slice(0, 300),
    addressEn: (profile.addressEn || '').slice(0, 300),
    phone: (profile.phone || '').slice(0, 40),
    email: (profile.email || '').slice(0, 160),
  };
  const idemKey =
    options?.idempotencyKey || computeIdempotencyKey('company', safeUid, payload);
  if (!options?.forceOverwrite && committedIdempotencyKeys.get(path) === idemKey) {
    return;
  }

  try {
    await withExponentialBackoff(async () => {
      await setDoc(doc(db, 'company_profiles', safeUid), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    });
    committedIdempotencyKeys.set(path, idemKey);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeCompanyProfile(
  ownerId: string,
  onData: (profile: CompanyProfile | null, meta: SnapshotSyncMetadata) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(ownerId);
  const path = `company_profiles/${safeUid}`;
  assertVerifiedCloudPath(OperationType.GET, path);

  return onSnapshot(
    doc(db, 'company_profiles', safeUid),
    { includeMetadataChanges: true },
    (snap) => {
      if (!snap.exists()) {
        onData(null, {
          hasPendingWrites: snap.metadata.hasPendingWrites,
          fromCache: snap.metadata.fromCache,
        });
        return;
      }
      const raw = snap.data();
      onData(
        {
          nameAr: String(raw.nameAr || ''),
          nameEn: String(raw.nameEn || ''),
          licenseNumber: String(raw.licenseNumber || ''),
          municipalityClass: String(raw.municipalityClass || ''),
          trnNumber: String(raw.trnNumber || ''),
          addressAr: String(raw.addressAr || ''),
          addressEn: String(raw.addressEn || ''),
          phone: String(raw.phone || ''),
          email: String(raw.email || ''),
        },
        {
          hasPendingWrites: snap.metadata.hasPendingWrites,
          fromCache: snap.metadata.fromCache,
        }
      );
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function saveReportsWorkspaceToCloud(
  workspace: ReportsWorkspaceStorage,
  ownerId: string,
  options?: { forceOverwrite?: boolean; idempotencyKey?: string }
): Promise<void> {
  const safeUid = sanitizeFirestoreId(ownerId);
  const path = `report_workspaces/${safeUid}`;
  assertVerifiedCloudPath(OperationType.WRITE, path);

  const payload = {
    id: safeUid,
    ownerId: safeUid,
    savedReports: stripUndefinedDeep((workspace.savedReports || []).slice(0, 200)),
    customTemplates: stripUndefinedDeep(workspace.customTemplates || {}),
    printSettings: stripUndefinedDeep(workspace.printSettings || {}),
    auditLogs: stripUndefinedDeep((workspace.auditLogs || []).slice(0, 250)),
  };
  const idemKey =
    options?.idempotencyKey || computeIdempotencyKey('reports', safeUid, payload);
  if (!options?.forceOverwrite && committedIdempotencyKeys.get(path) === idemKey) {
    return;
  }

  try {
    await withExponentialBackoff(async () => {
      await setDoc(doc(db, 'report_workspaces', safeUid), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    });
    committedIdempotencyKeys.set(path, idemKey);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeReportsWorkspace(
  ownerId: string,
  onData: (
    workspace: Partial<ReportsWorkspaceStorage> | null,
    meta: SnapshotSyncMetadata
  ) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(ownerId);
  const path = `report_workspaces/${safeUid}`;
  assertVerifiedCloudPath(OperationType.GET, path);

  return onSnapshot(
    doc(db, 'report_workspaces', safeUid),
    { includeMetadataChanges: true },
    (snap) => {
      if (!snap.exists()) {
        onData(null, {
          hasPendingWrites: snap.metadata.hasPendingWrites,
          fromCache: snap.metadata.fromCache,
        });
        return;
      }
      const raw = normalizeFirestoreData(snap.data() as Record<string, unknown>);
      onData(
        {
          savedReports: Array.isArray(raw.savedReports)
            ? (raw.savedReports as ReportsWorkspaceStorage['savedReports'])
            : [],
          customTemplates:
            raw.customTemplates && typeof raw.customTemplates === 'object'
              ? (raw.customTemplates as ReportsWorkspaceStorage['customTemplates'])
              : undefined,
          printSettings:
            raw.printSettings && typeof raw.printSettings === 'object'
              ? (raw.printSettings as ReportsWorkspaceStorage['printSettings'])
              : undefined,
          auditLogs: Array.isArray(raw.auditLogs)
            ? (raw.auditLogs as ReportsWorkspaceStorage['auditLogs'])
            : [],
        },
        {
          hasPendingWrites: snap.metadata.hasPendingWrites,
          fromCache: snap.metadata.fromCache,
        }
      );
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function clearCommittedIdempotencyCache(): void {
  committedIdempotencyKeys.clear();
}
