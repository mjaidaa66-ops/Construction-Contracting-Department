import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
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
import { db, handleFirestoreError, OperationType } from './firebase';

// 800KB base64 slice size to safely stay below Firestore 1MB per-document cap
export const CHUNK_SIZE_BYTES = 800 * 1024;

export interface SnapshotSyncMetadata {
  hasPendingWrites: boolean;
  fromCache: boolean;
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
 * Slices a File or base64 data URL into 800KB Firestore chunks under
 * document_manifests/{manifestId}/chunks/{chunkId}.
 */
export async function uploadChunkedDocument(params: {
  ownerId: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  base64DataUrl: string;
}): Promise<DocumentManifest> {
  const { ownerId, projectId, fileName, mimeType, base64DataUrl } = params;
  const manifestId = sanitizeFirestoreId(
    `mf_${projectId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  );
  const totalSize = base64DataUrl.length;
  const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE_BYTES));
  const manifestPath = `document_manifests/${manifestId}`;

  try {
    const manifestPayload = {
      id: manifestId,
      ownerId: sanitizeFirestoreId(ownerId),
      projectId: sanitizeFirestoreId(projectId),
      fileName: fileName.slice(0, 250) || 'drawing.pdf',
      mimeType: mimeType.slice(0, 110) || 'application/octet-stream',
      totalSize,
      totalChunks,
      chunkSizeBytes: CHUNK_SIZE_BYTES,
      createdAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'document_manifests', manifestId), manifestPayload);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE_BYTES;
      const slice = base64DataUrl.slice(start, start + CHUNK_SIZE_BYTES);
      const chunkId = `chunk_${String(i).padStart(4, '0')}`;
      await setDoc(doc(db, 'document_manifests', manifestId, 'chunks', chunkId), {
        id: chunkId,
        manifestId,
        ownerId: sanitizeFirestoreId(ownerId),
        index: i,
        data: slice,
        createdAt: serverTimestamp(),
      });
    }

    return {
      id: manifestId,
      ownerId,
      projectId,
      fileName,
      mimeType,
      totalSize,
      totalChunks,
      chunkSizeBytes: CHUNK_SIZE_BYTES,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, manifestPath);
  }
}

/**
 * Reassembles a chunked binary document from Firestore chunks ordered by index.
 */
export async function downloadChunkedDocument(manifestId: string): Promise<{
  manifest: DocumentManifest;
  dataUrl: string;
} | null> {
  const safeId = sanitizeFirestoreId(manifestId);
  const path = `document_manifests/${safeId}`;
  try {
    const manifestSnap = await getDoc(doc(db, 'document_manifests', safeId));
    if (!manifestSnap.exists()) return null;
    const manifest = normalizeFirestoreData(manifestSnap.data() as DocumentManifest);
    const safeOwnerId = sanitizeFirestoreId(manifest.ownerId || '');

    const chunksQuery = query(
      collection(db, 'document_manifests', safeId, 'chunks'),
      where('ownerId', '==', safeOwnerId)
    );
    const chunksSnap = await getDocs(chunksQuery);
    const ordered = chunksSnap.docs
      .map((d) => d.data() as { index: number; data: string })
      .sort((a, b) => a.index - b.index);

    const dataUrl = ordered.map((c) => c.data).join('');
    return { manifest, dataUrl };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function deleteChunkedDocument(manifestId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(manifestId);
  const path = `document_manifests/${safeId}`;
  try {
    const chunksSnap = await getDocs(collection(db, 'document_manifests', safeId, 'chunks'));
    const batch = writeBatch(db);
    chunksSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'document_manifests', safeId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

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
  try {
    const rawDisplay = (params.displayName || 'Engineer').trim().slice(0, 120) || 'Engineer';
    const ref = doc(db, 'users', safeUid);
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      const profile = {
        uid: safeUid,
        email: params.email.slice(0, 200),
        displayName: rawDisplay,
        role: params.role && params.role !== 'admin' ? params.role : 'engineer',
        companyName: (params.companyName || '').slice(0, 160),
        licenseNumber: (params.licenseNumber || '').slice(0, 80),
        biometricRegistered: params.biometricRegistered ?? false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, profile);
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
      displayName: (params.displayName || existingData.displayName || 'Engineer').trim().slice(0, 120),
      role: existingData.role,
      companyName: (params.companyName ?? existingData.companyName ?? '').slice(0, 160),
      licenseNumber: (params.licenseNumber ?? existingData.licenseNumber ?? '').slice(0, 80),
      biometricRegistered: params.biometricRegistered ?? existingData.biometricRegistered,
      createdAt: existing.data().createdAt,
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, updated);
    return {
      ...existingData,
      displayName: updated.displayName,
      companyName: updated.companyName,
      licenseNumber: updated.licenseNumber,
      biometricRegistered: updated.biometricRegistered,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveProjectToCloud(project: Project, ownerId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(project.id);
  const safeOwnerId = sanitizeFirestoreId(ownerId);
  const path = `projects/${safeId}`;
  try {
    const ref = doc(db, 'projects', safeId);
    const existing = await getDoc(ref);
    const rawCode = (project.code || safeId).trim().slice(0, 40);
    const safeCode = rawCode.length >= 2 ? rawCode : `${rawCode}_PRJ`.slice(0, 40);
    const payload: Record<string, unknown> = {
      id: safeId,
      ownerId: existing.exists() ? (existing.data().ownerId as string) : safeOwnerId,
      code: safeCode,
      name: (project.name || 'مشروع جديد').trim().slice(0, 200) || 'مشروع جديد',
      nameEn: (project.nameEn || project.name || 'New Project').trim().slice(0, 200) || 'New Project',
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
      gisData: stripUndefinedDeep(project.gisData),
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
      takeoffMeasurements: stripUndefinedDeep((project.takeoffMeasurements || []).slice(0, 500)),
      takeoffSummaryConfig: project.takeoffSummaryConfig || {
        overheadPercent: 10,
        profitPercent: 12,
        vatPercent: 5,
      },
      createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function ensureProjectExistsInCloud(
  project: Project,
  ownerId: string
): Promise<void> {
  const safeId = sanitizeFirestoreId(project.id);
  const path = `projects/${safeId}`;
  try {
    const existing = await getDoc(doc(db, 'projects', safeId));
    if (!existing.exists()) {
      await saveProjectToCloud(project, ownerId);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteProjectFromCloud(
  projectId: string,
  manifestIds?: string[]
): Promise<void> {
  const safeId = sanitizeFirestoreId(projectId);
  const path = `projects/${safeId}`;
  try {
    if (Array.isArray(manifestIds)) {
      for (const mid of manifestIds) {
        if (!mid) continue;
        try {
          await deleteChunkedDocument(mid);
        } catch {
          // Best-effort cleanup for orphaned chunk manifests
        }
      }
    }
    await deleteDoc(doc(db, 'projects', safeId));
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
  const q = query(collection(db, path), where('ownerId', '==', sanitizeFirestoreId(ownerId)));
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

export async function saveTransactionToCloud(
  tx: GovernmentTransaction,
  ownerId: string
): Promise<void> {
  const safeId = sanitizeFirestoreId(tx.id);
  const path = `government_transactions/${safeId}`;
  try {
    const ref = doc(db, 'government_transactions', safeId);
    const existing = await getDoc(ref);
    await setDoc(ref, {
      id: safeId,
      ownerId: existing.exists() ? existing.data().ownerId : sanitizeFirestoreId(ownerId),
      projectId: sanitizeFirestoreId(tx.projectId),
      authority: tx.authority,
      transactionNumber: (tx.transactionNumber || safeId).slice(0, 80),
      serviceName: (tx.serviceName || 'طلب اعتماد فني').slice(0, 200),
      serviceNameEn: (tx.serviceNameEn || tx.serviceName || 'Approval Request').slice(0, 200),
      status: tx.status,
      submissionDate: tx.submissionDate,
      lastUpdatedDate: tx.lastUpdatedDate,
      reviewEngineer: (tx.reviewEngineer || '').slice(0, 120),
      notes: (tx.notes || '').slice(0, 1000),
      officialPortalUrl: (tx.officialPortalUrl || '').slice(0, 500),
      createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTransactionFromCloud(txId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(txId);
  const path = `government_transactions/${safeId}`;
  try {
    await deleteDoc(doc(db, 'government_transactions', safeId));
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
  const q = query(collection(db, path), where('ownerId', '==', sanitizeFirestoreId(ownerId)));
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
  ownerId: string
): Promise<void> {
  const safeId = sanitizeFirestoreId(item.id);
  const path = `rate_library/${safeId}`;
  try {
    const rawCode = (item.code || safeId).trim().slice(0, 20);
    await setDoc(doc(db, 'rate_library', safeId), {
      id: safeId,
      ownerId: sanitizeFirestoreId(ownerId),
      code: rawCode.length >= 2 ? rawCode : `${rawCode}_R`.slice(0, 20),
      category: String(item.category).slice(0, 40),
      nameAr: (item.nameAr || item.nameEn || 'بند').slice(0, 200),
      nameEn: (item.nameEn || item.nameAr || 'Item').slice(0, 200),
      unit: String(item.unit || 'unit').slice(0, 20),
      rateAed: Math.max(0, Number(item.rateAed) || 0),
      equipmentRate: Math.max(0, Number(item.equipmentRate) || 0),
      materialSpec: (item.materialSpec || '').slice(0, 200),
      updatedAt: serverTimestamp(),
    });
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
  const q = query(collection(db, path), where('ownerId', '==', sanitizeFirestoreId(ownerId)));
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
  ownerId: string
): Promise<void> {
  const safeUid = sanitizeFirestoreId(ownerId);
  const path = `company_profiles/${safeUid}`;
  try {
    await setDoc(doc(db, 'company_profiles', safeUid), {
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
      updatedAt: serverTimestamp(),
    });
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
  ownerId: string
): Promise<void> {
  const safeUid = sanitizeFirestoreId(ownerId);
  const path = `report_workspaces/${safeUid}`;
  try {
    await setDoc(doc(db, 'report_workspaces', safeUid), {
      id: safeUid,
      ownerId: safeUid,
      savedReports: stripUndefinedDeep((workspace.savedReports || []).slice(0, 200)),
      customTemplates: stripUndefinedDeep(workspace.customTemplates || {}),
      printSettings: stripUndefinedDeep(workspace.printSettings || {}),
      auditLogs: stripUndefinedDeep((workspace.auditLogs || []).slice(0, 250)),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeReportsWorkspace(
  ownerId: string,
  onData: (workspace: Partial<ReportsWorkspaceStorage> | null, meta: SnapshotSyncMetadata) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(ownerId);
  const path = `report_workspaces/${safeUid}`;
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
