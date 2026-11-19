import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
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
    const manifest = manifestSnap.data() as DocumentManifest;

    const chunksQuery = query(
      collection(db, 'document_manifests', safeId, 'chunks'),
      orderBy('index', 'asc')
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
    const ref = doc(db, 'users', safeUid);
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      const profile = {
        uid: safeUid,
        email: params.email,
        displayName: params.displayName || 'Engineer',
        role: params.role && params.role !== 'admin' ? params.role : 'engineer',
        companyName: params.companyName || '',
        licenseNumber: params.licenseNumber || '',
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

    const existingData = existing.data() as UserProfile;
    const updated = {
      uid: safeUid,
      email: existingData.email,
      displayName: params.displayName || existingData.displayName,
      role: existingData.role,
      companyName: params.companyName ?? existingData.companyName ?? '',
      licenseNumber: params.licenseNumber ?? existingData.licenseNumber ?? '',
      biometricRegistered: params.biometricRegistered ?? existingData.biometricRegistered,
      createdAt: existingData.createdAt,
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, updated);
    return {
      ...existingData,
      ...updated,
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
    const payload: Record<string, unknown> = {
      id: safeId,
      ownerId: existing.exists() ? (existing.data().ownerId as string) : safeOwnerId,
      code: (project.code || safeId).slice(0, 40),
      name: (project.name || 'مشروع جديد').slice(0, 200),
      nameEn: (project.nameEn || project.name || 'New Project').slice(0, 200),
      category: project.category || 'المشاريع الإنشائية',
      projectType: project.projectType,
      status: project.status,
      ownerName: project.ownerName || '',
      ownerPhone: project.ownerPhone || '',
      ownerEmail: project.ownerEmail || '',
      ownerNationalId: project.ownerNationalId || '',
      consultantOffice: project.consultantOffice || '',
      consultantEngineer: project.consultantEngineer || '',
      consultantPhone: project.consultantPhone || '',
      consultantLicenseNo: project.consultantLicenseNo || '',
      residentEngineer: project.residentEngineer || '',
      contractorBranch: project.contractorBranch || '',
      permitNumber: project.permitNumber || '',
      permitDate: project.permitDate || '',
      permitExpiryDate: project.permitExpiryDate || '',
      licensingAuthority: project.licensingAuthority || '',
      approvedBudget: Number(project.approvedBudget) || 0,
      invoicedAmount: Number(project.invoicedAmount) || 0,
      paidAmount: Number(project.paidAmount) || 0,
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

export async function deleteProjectFromCloud(projectId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(projectId);
  const path = `projects/${safeId}`;
  try {
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
      const list = snap.docs.map((d) => d.data() as Project);
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
      transactionNumber: tx.transactionNumber,
      serviceName: tx.serviceName,
      serviceNameEn: tx.serviceNameEn || tx.serviceName,
      status: tx.status,
      submissionDate: tx.submissionDate,
      lastUpdatedDate: tx.lastUpdatedDate,
      reviewEngineer: tx.reviewEngineer,
      notes: tx.notes || '',
      officialPortalUrl: tx.officialPortalUrl,
      createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
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
        snap.docs.map((d) => d.data() as GovernmentTransaction),
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
    await setDoc(doc(db, 'rate_library', safeId), {
      id: safeId,
      ownerId: sanitizeFirestoreId(ownerId),
      code: item.code,
      category: item.category,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      unit: item.unit,
      rateAed: Number(item.rateAed) || 0,
      materialSpec: item.materialSpec || '',
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
        snap.docs.map((d) => d.data() as RateLibraryItem),
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
