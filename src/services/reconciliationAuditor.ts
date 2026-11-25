import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  where,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';
import type {
  CompanyProfile,
  GovernmentTransaction,
  Project,
  RateLibraryItem,
} from '../types/bunyan';
import type { ReportsWorkspaceStorage } from '../types/reports';
import {
  cancelPendingProjectSync,
  hasPendingSyncForProject,
  pushSingleProjectImmediate,
} from './cloudSyncService';
import { mergeRemoteProjectsWithLocal, parseSyncTimestampMs } from './cloudSyncMerge';
import {
  assertVerifiedCloudPath,
  db,
  handleFirestoreError,
  OperationType,
  withExponentialBackoff,
} from './firebase';
import {
  ensureProjectExistsInCloud,
  normalizeFirestoreData,
  sanitizeFirestoreId,
  saveCompanyProfileToCloud,
  saveRateItemToCloud,
  saveReportsWorkspaceToCloud,
  saveTransactionToCloud,
} from './firestoreStorage';
import { normalizeReportsWorkspace } from './reportStorageService';

export type ReconciliationEntityType =
  | 'project'
  | 'company_profile'
  | 'rate_item'
  | 'transaction'
  | 'reports_workspace';

export type ReconciliationDriftStatus =
  | 'MATCHED'
  | 'CONTENT_DRIFT'
  | 'LOCAL_ONLY'
  | 'CLOUD_ONLY'
  | 'PENDING_LOCAL';

export type ReconciliationAction = 'none' | 'push_local' | 'pull_cloud';

export interface WorkspaceSnapshotData {
  projects: Project[];
  companyProfile: CompanyProfile;
  rateLibrary: RateLibraryItem[];
  transactions: GovernmentTransaction[];
  reportsWorkspace: ReportsWorkspaceStorage;
}

export interface CloudReconciliationSnapshot {
  projects: Project[];
  companyProfile: CompanyProfile | null;
  companyUpdatedAt?: string | null;
  rateLibrary: RateLibraryItem[];
  transactions: GovernmentTransaction[];
  reportsWorkspace: ReportsWorkspaceStorage | null;
  reportsUpdatedAt?: string | null;
  fetchedAt: string;
  source: 'server' | 'offline_cache';
}

export interface ReconciliationFieldDiff {
  field: string;
  localValue: unknown;
  cloudValue: unknown;
}

export interface ReconciliationAuditItem {
  id: string;
  entityKey: string;
  entityType: ReconciliationEntityType;
  labelAr: string;
  labelEn: string;
  subtitle?: string;
  driftStatus: ReconciliationDriftStatus;
  localHash: string | null;
  cloudHash: string | null;
  localUpdatedAt: string | null;
  cloudUpdatedAt: string | null;
  changedFields: string[];
  fieldDiffs: ReconciliationFieldDiff[];
  recommendedAction: ReconciliationAction;
  terminalLocked: boolean;
  localRecord?: unknown;
  cloudRecord?: unknown;
}

export interface ReconciliationAuditReport {
  auditedAt: string;
  source: 'server' | 'offline_cache';
  totalCount: number;
  matchedCount: number;
  driftCount: number;
  contentDriftCount: number;
  localOnlyCount: number;
  cloudOnlyCount: number;
  pendingLocalCount: number;
  overallStatus: 'IN_SYNC' | 'DRIFT_DETECTED';
  items: ReconciliationAuditItem[];
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

function sortCanonicalDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortCanonicalDeep(item));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const sorted: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      sorted[k] = sortCanonicalDeep(v);
    }
    return sorted;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

/**
 * Produces deterministic canonical JSON independent of property insertion order.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortCanonicalDeep(value));
}

/**
 * Computes a deterministic 128-bit dual FNV-1a digest rendered as 32 lowercase hex chars.
 * Synchronous and identical across Node.js tests and browser runtimes.
 */
export function computeCanonicalHash(value: unknown): string {
  const input = typeof value === 'string' ? value : stableStringify(value);
  const mask64 = 0xffffffffffffffffn;
  const prime64 = 0x100000001b3n;

  let h1 = 0xcbf29ce484222325n;
  let h2 = 0x84222325cbf29ce4n;

  for (let i = 0; i < input.length; i++) {
    const code = BigInt(input.charCodeAt(i));
    h1 ^= code & 0xffn;
    h1 = (h1 * prime64) & mask64;
    if (code > 0xffn) {
      h1 ^= (code >> 8n) & 0xffn;
      h1 = (h1 * prime64) & mask64;
    }

    h2 ^= ((code * 31n) ^ BigInt(i + 1)) & 0xffffn;
    h2 = (h2 * prime64) & mask64;
  }

  return (
    h1.toString(16).padStart(16, '0') + h2.toString(16).padStart(16, '0')
  );
}

export function formatShortHash(hash: string | null | undefined): string {
  if (!hash) return '—';
  return `${hash.slice(0, 6)}..${hash.slice(-4)}`;
}

/**
 * Mirrors the exact persisted payload written by saveProjectToCloud in firestoreStorage.ts,
 * stripping ephemeral binary URLs (localDataUrl, svgContent, pdfDataUrl) and server timestamps.
 */
export function canonicalizeProjectForHash(project: Project): Record<string, unknown> {
  const safeId = sanitizeFirestoreId(project.id);
  const rawCode = (project.code || safeId).trim().slice(0, 40);
  const safeCode = rawCode.length >= 2 ? rawCode : `${rawCode}_PRJ`.slice(0, 40);

  return sortCanonicalDeep({
    id: safeId,
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
    takeoffMeasurements: stripUndefinedDeep((project.takeoffMeasurements || []).slice(0, 500)),
    takeoffSummaryConfig: project.takeoffSummaryConfig || {
      overheadPercent: 10,
      profitPercent: 12,
      vatPercent: 5,
    },
  }) as Record<string, unknown>;
}

export function canonicalizeCompanyProfileForHash(
  profile: CompanyProfile
): Record<string, unknown> {
  return sortCanonicalDeep({
    nameAr: (profile.nameAr || 'مؤسسة بنيان').slice(0, 200),
    nameEn: (profile.nameEn || 'Bunyan Engineering').slice(0, 200),
    licenseNumber: (profile.licenseNumber || 'SHJ-0001').slice(0, 80),
    municipalityClass: (profile.municipalityClass || '').slice(0, 120),
    trnNumber: (profile.trnNumber || '').slice(0, 40),
    addressAr: (profile.addressAr || '').slice(0, 300),
    addressEn: (profile.addressEn || '').slice(0, 300),
    phone: (profile.phone || '').slice(0, 40),
    email: (profile.email || '').slice(0, 160),
  }) as Record<string, unknown>;
}

export function canonicalizeRateItemForHash(item: RateLibraryItem): Record<string, unknown> {
  const safeId = sanitizeFirestoreId(item.id);
  const rawCode = (item.code || safeId).trim().slice(0, 20);
  return sortCanonicalDeep({
    id: safeId,
    code: rawCode.length >= 2 ? rawCode : `${rawCode}_R`.slice(0, 20),
    category: String(item.category).slice(0, 40),
    nameAr: (item.nameAr || item.nameEn || 'بند').slice(0, 200),
    nameEn: (item.nameEn || item.nameAr || 'Item').slice(0, 200),
    unit: String(item.unit || 'unit').slice(0, 20),
    rateAed: Math.max(0, Number(item.rateAed) || 0),
    equipmentRate: Math.max(0, Number(item.equipmentRate) || 0),
    materialSpec: (item.materialSpec || '').slice(0, 200),
  }) as Record<string, unknown>;
}

export function canonicalizeTransactionForHash(
  tx: GovernmentTransaction
): Record<string, unknown> {
  const safeId = sanitizeFirestoreId(tx.id);
  return sortCanonicalDeep({
    id: safeId,
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
  }) as Record<string, unknown>;
}

export function canonicalizeReportsWorkspaceForHash(
  workspace: Partial<ReportsWorkspaceStorage>
): Record<string, unknown> {
  const normalized = normalizeReportsWorkspace(workspace);
  return sortCanonicalDeep({
    savedReports: stripUndefinedDeep((normalized.savedReports || []).slice(0, 200)),
    customTemplates: stripUndefinedDeep(normalized.customTemplates || {}),
    printSettings: stripUndefinedDeep(normalized.printSettings || {}),
    auditLogs: stripUndefinedDeep((normalized.auditLogs || []).slice(0, 250)),
  }) as Record<string, unknown>;
}

export function detectFieldDiffs(
  localCanonical: Record<string, unknown>,
  cloudCanonical: Record<string, unknown>
): ReconciliationFieldDiff[] {
  const keys = Array.from(
    new Set([...Object.keys(localCanonical), ...Object.keys(cloudCanonical)])
  ).sort();
  const diffs: ReconciliationFieldDiff[] = [];
  for (const key of keys) {
    const lv = localCanonical[key];
    const cv = cloudCanonical[key];
    if (stableStringify(lv) !== stableStringify(cv)) {
      diffs.push({
        field: key,
        localValue: lv,
        cloudValue: cv,
      });
    }
  }
  return diffs;
}

function toIsoOrNull(value: unknown): string | null {
  const ms = parseSyncTimestampMs(value);
  return ms > 0 ? new Date(ms).toISOString() : null;
}

function chooseRecommendedAction(
  driftStatus: ReconciliationDriftStatus,
  localUpdatedAt: string | null,
  cloudUpdatedAt: string | null,
  terminalLocked: boolean
): ReconciliationAction {
  if (driftStatus === 'MATCHED') return 'none';
  if (driftStatus === 'PENDING_LOCAL' || driftStatus === 'LOCAL_ONLY') {
    return terminalLocked ? 'pull_cloud' : 'push_local';
  }
  if (driftStatus === 'CLOUD_ONLY') {
    return 'pull_cloud';
  }
  if (terminalLocked) {
    return 'pull_cloud';
  }
  const localMs = parseSyncTimestampMs(localUpdatedAt);
  const cloudMs = parseSyncTimestampMs(cloudUpdatedAt);
  if (cloudMs > localMs + 1500) {
    return 'pull_cloud';
  }
  return 'push_local';
}

export function diffWorkspaceSnapshots(
  local: WorkspaceSnapshotData,
  cloud: CloudReconciliationSnapshot,
  options?: {
    hasPendingProjectSync?: (projectId: string) => boolean;
    canAdminOverrideTerminalLock?: boolean;
  }
): ReconciliationAuditReport {
  const hasPending = options?.hasPendingProjectSync ?? hasPendingSyncForProject;
  const canOverrideLock = Boolean(options?.canAdminOverrideTerminalLock);
  const items: ReconciliationAuditItem[] = [];

  // 1. Projects
  const localProjectsById = new Map<string, Project>();
  for (const p of local.projects) {
    localProjectsById.set(sanitizeFirestoreId(p.id), p);
  }
  const cloudProjectsById = new Map<string, Project>();
  for (const p of cloud.projects) {
    cloudProjectsById.set(sanitizeFirestoreId(p.id), p);
  }
  const projectIds = Array.from(
    new Set([...localProjectsById.keys(), ...cloudProjectsById.keys()])
  );

  for (const pid of projectIds) {
    const lp = localProjectsById.get(pid);
    const cp = cloudProjectsById.get(pid);
    const localCanon = lp ? canonicalizeProjectForHash(lp) : null;
    const cloudCanon = cp ? canonicalizeProjectForHash(cp) : null;
    const localHash = localCanon ? computeCanonicalHash(localCanon) : null;
    const cloudHash = cloudCanon ? computeCanonicalHash(cloudCanon) : null;
    const isPending = lp ? hasPending(lp.id) || hasPending(pid) : false;

    let driftStatus: ReconciliationDriftStatus;
    if (lp && !cp) {
      driftStatus = isPending ? 'PENDING_LOCAL' : 'LOCAL_ONLY';
    } else if (!lp && cp) {
      driftStatus = 'CLOUD_ONLY';
    } else if (isPending) {
      driftStatus = 'PENDING_LOCAL';
    } else if (localHash === cloudHash) {
      driftStatus = 'MATCHED';
    } else {
      driftStatus = 'CONTENT_DRIFT';
    }

    const fieldDiffs =
      localCanon && cloudCanon && localHash !== cloudHash
        ? detectFieldDiffs(localCanon, cloudCanon)
        : [];
    const localUpdatedAt = toIsoOrNull(lp?.updatedAt);
    const cloudUpdatedAt = toIsoOrNull(cp?.updatedAt);
    const terminalLocked = Boolean(cp && cp.status === 'completed' && !canOverrideLock);

    items.push({
      id: pid,
      entityKey: `project:${pid}`,
      entityType: 'project',
      labelAr: lp?.name || cp?.name || pid,
      labelEn: lp?.nameEn || cp?.nameEn || pid,
      subtitle: lp?.code || cp?.code,
      driftStatus,
      localHash,
      cloudHash,
      localUpdatedAt,
      cloudUpdatedAt,
      changedFields: fieldDiffs.map((d) => d.field),
      fieldDiffs,
      recommendedAction: chooseRecommendedAction(
        driftStatus,
        localUpdatedAt,
        cloudUpdatedAt,
        terminalLocked
      ),
      terminalLocked,
      localRecord: lp,
      cloudRecord: cp,
    });
  }

  // 2. Company Profile (singleton)
  {
    const localCanon = canonicalizeCompanyProfileForHash(local.companyProfile);
    const cloudCanon = cloud.companyProfile
      ? canonicalizeCompanyProfileForHash(cloud.companyProfile)
      : null;
    const localHash = computeCanonicalHash(localCanon);
    const cloudHash = cloudCanon ? computeCanonicalHash(cloudCanon) : null;
    const driftStatus: ReconciliationDriftStatus = !cloudCanon
      ? 'LOCAL_ONLY'
      : localHash === cloudHash
      ? 'MATCHED'
      : 'CONTENT_DRIFT';
    const fieldDiffs =
      cloudCanon && localHash !== cloudHash ? detectFieldDiffs(localCanon, cloudCanon) : [];
    items.push({
      id: 'company_profile',
      entityKey: 'company_profile:singleton',
      entityType: 'company_profile',
      labelAr: local.companyProfile.nameAr || 'ملف المنشأة والتراخيص',
      labelEn: local.companyProfile.nameEn || 'Company Profile & Licensing',
      subtitle: local.companyProfile.licenseNumber || cloud.companyProfile?.licenseNumber,
      driftStatus,
      localHash,
      cloudHash,
      localUpdatedAt: null,
      cloudUpdatedAt: toIsoOrNull(cloud.companyUpdatedAt),
      changedFields: fieldDiffs.map((d) => d.field),
      fieldDiffs,
      recommendedAction: chooseRecommendedAction(
        driftStatus,
        null,
        toIsoOrNull(cloud.companyUpdatedAt),
        false
      ),
      terminalLocked: false,
      localRecord: local.companyProfile,
      cloudRecord: cloud.companyProfile ?? undefined,
    });
  }

  // 3. Rate Library
  const localRatesById = new Map<string, RateLibraryItem>();
  for (const r of local.rateLibrary) {
    localRatesById.set(sanitizeFirestoreId(r.id), r);
  }
  const cloudRatesById = new Map<string, RateLibraryItem>();
  for (const r of cloud.rateLibrary) {
    cloudRatesById.set(sanitizeFirestoreId(r.id), r);
  }
  for (const rid of new Set([...localRatesById.keys(), ...cloudRatesById.keys()])) {
    const lr = localRatesById.get(rid);
    const cr = cloudRatesById.get(rid);
    const localCanon = lr ? canonicalizeRateItemForHash(lr) : null;
    const cloudCanon = cr ? canonicalizeRateItemForHash(cr) : null;
    const localHash = localCanon ? computeCanonicalHash(localCanon) : null;
    const cloudHash = cloudCanon ? computeCanonicalHash(cloudCanon) : null;
    const driftStatus: ReconciliationDriftStatus =
      lr && !cr
        ? 'LOCAL_ONLY'
        : !lr && cr
        ? 'CLOUD_ONLY'
        : localHash === cloudHash
        ? 'MATCHED'
        : 'CONTENT_DRIFT';
    const fieldDiffs =
      localCanon && cloudCanon && localHash !== cloudHash
        ? detectFieldDiffs(localCanon, cloudCanon)
        : [];
    const cloudUpdatedAt = toIsoOrNull((cr as unknown as { updatedAt?: unknown })?.updatedAt);
    items.push({
      id: rid,
      entityKey: `rate_item:${rid}`,
      entityType: 'rate_item',
      labelAr: lr?.nameAr || cr?.nameAr || rid,
      labelEn: lr?.nameEn || cr?.nameEn || rid,
      subtitle: lr?.code || cr?.code,
      driftStatus,
      localHash,
      cloudHash,
      localUpdatedAt: null,
      cloudUpdatedAt,
      changedFields: fieldDiffs.map((d) => d.field),
      fieldDiffs,
      recommendedAction: chooseRecommendedAction(driftStatus, null, cloudUpdatedAt, false),
      terminalLocked: false,
      localRecord: lr,
      cloudRecord: cr,
    });
  }

  // 4. Government Transactions
  const localTxById = new Map<string, GovernmentTransaction>();
  for (const tx of local.transactions) {
    localTxById.set(sanitizeFirestoreId(tx.id), tx);
  }
  const cloudTxById = new Map<string, GovernmentTransaction>();
  for (const tx of cloud.transactions) {
    cloudTxById.set(sanitizeFirestoreId(tx.id), tx);
  }
  for (const tid of new Set([...localTxById.keys(), ...cloudTxById.keys()])) {
    const lt = localTxById.get(tid);
    const ct = cloudTxById.get(tid);
    const localCanon = lt ? canonicalizeTransactionForHash(lt) : null;
    const cloudCanon = ct ? canonicalizeTransactionForHash(ct) : null;
    const localHash = localCanon ? computeCanonicalHash(localCanon) : null;
    const cloudHash = cloudCanon ? computeCanonicalHash(cloudCanon) : null;
    const driftStatus: ReconciliationDriftStatus =
      lt && !ct
        ? 'LOCAL_ONLY'
        : !lt && ct
        ? 'CLOUD_ONLY'
        : localHash === cloudHash
        ? 'MATCHED'
        : 'CONTENT_DRIFT';
    const fieldDiffs =
      localCanon && cloudCanon && localHash !== cloudHash
        ? detectFieldDiffs(localCanon, cloudCanon)
        : [];
    const localUpdatedAt = toIsoOrNull(lt?.lastUpdatedDate);
    const cloudUpdatedAt = toIsoOrNull(
      (ct as unknown as { updatedAt?: unknown })?.updatedAt || ct?.lastUpdatedDate
    );
    const terminalLocked = Boolean(ct && ct.status === 'approved' && !canOverrideLock);
    items.push({
      id: tid,
      entityKey: `transaction:${tid}`,
      entityType: 'transaction',
      labelAr: lt?.serviceName || ct?.serviceName || tid,
      labelEn: lt?.serviceNameEn || ct?.serviceNameEn || tid,
      subtitle: lt?.transactionNumber || ct?.transactionNumber,
      driftStatus,
      localHash,
      cloudHash,
      localUpdatedAt,
      cloudUpdatedAt,
      changedFields: fieldDiffs.map((d) => d.field),
      fieldDiffs,
      recommendedAction: chooseRecommendedAction(
        driftStatus,
        localUpdatedAt,
        cloudUpdatedAt,
        terminalLocked
      ),
      terminalLocked,
      localRecord: lt,
      cloudRecord: ct,
    });
  }

  // 5. Reports Workspace (singleton)
  {
    const localCanon = canonicalizeReportsWorkspaceForHash(local.reportsWorkspace);
    const cloudCanon = cloud.reportsWorkspace
      ? canonicalizeReportsWorkspaceForHash(cloud.reportsWorkspace)
      : null;
    const localHash = computeCanonicalHash(localCanon);
    const cloudHash = cloudCanon ? computeCanonicalHash(cloudCanon) : null;
    const driftStatus: ReconciliationDriftStatus = !cloudCanon
      ? 'LOCAL_ONLY'
      : localHash === cloudHash
      ? 'MATCHED'
      : 'CONTENT_DRIFT';
    const fieldDiffs =
      cloudCanon && localHash !== cloudHash ? detectFieldDiffs(localCanon, cloudCanon) : [];
    items.push({
      id: 'reports_workspace',
      entityKey: 'reports_workspace:singleton',
      entityType: 'reports_workspace',
      labelAr: 'بيئة عمل مركز التقارير والقوالب',
      labelEn: 'Reports Workspace & Audit Logs',
      subtitle: `${local.reportsWorkspace.savedReports.length} saved · ${local.reportsWorkspace.auditLogs.length} logs`,
      driftStatus,
      localHash,
      cloudHash,
      localUpdatedAt: null,
      cloudUpdatedAt: toIsoOrNull(cloud.reportsUpdatedAt),
      changedFields: fieldDiffs.map((d) => d.field),
      fieldDiffs,
      recommendedAction: chooseRecommendedAction(
        driftStatus,
        null,
        toIsoOrNull(cloud.reportsUpdatedAt),
        false
      ),
      terminalLocked: false,
      localRecord: local.reportsWorkspace,
      cloudRecord: cloud.reportsWorkspace ?? undefined,
    });
  }

  // Sort drifted items first, then by entityType
  const statusRank: Record<ReconciliationDriftStatus, number> = {
    CONTENT_DRIFT: 0,
    PENDING_LOCAL: 1,
    LOCAL_ONLY: 2,
    CLOUD_ONLY: 3,
    MATCHED: 4,
  };
  items.sort((a, b) => {
    const rankDiff = statusRank[a.driftStatus] - statusRank[b.driftStatus];
    if (rankDiff !== 0) return rankDiff;
    return a.entityKey.localeCompare(b.entityKey);
  });

  const matchedCount = items.filter((i) => i.driftStatus === 'MATCHED').length;
  const contentDriftCount = items.filter((i) => i.driftStatus === 'CONTENT_DRIFT').length;
  const localOnlyCount = items.filter((i) => i.driftStatus === 'LOCAL_ONLY').length;
  const cloudOnlyCount = items.filter((i) => i.driftStatus === 'CLOUD_ONLY').length;
  const pendingLocalCount = items.filter((i) => i.driftStatus === 'PENDING_LOCAL').length;
  const driftCount = items.length - matchedCount;

  return {
    auditedAt: cloud.fetchedAt,
    source: cloud.source,
    totalCount: items.length,
    matchedCount,
    driftCount,
    contentDriftCount,
    localOnlyCount,
    cloudOnlyCount,
    pendingLocalCount,
    overallStatus: driftCount === 0 ? 'IN_SYNC' : 'DRIFT_DETECTED',
    items,
  };
}

async function fetchQueryStrictServer(
  q: Query<DocumentData>,
  path: string
): Promise<{ snap: QuerySnapshot<DocumentData>; source: 'server' }> {
  assertVerifiedCloudPath(OperationType.LIST, path);
  try {
    const snap = await withExponentialBackoff(() => getDocsFromServer(q));
    return { snap, source: 'server' };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

async function fetchDocStrictServer(
  ref: DocumentReference<DocumentData>,
  path: string
): Promise<{ snap: DocumentSnapshot<DocumentData>; source: 'server' }> {
  assertVerifiedCloudPath(OperationType.GET, path);
  try {
    const snap = await withExponentialBackoff(() => getDocFromServer(ref));
    return { snap, source: 'server' };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

/**
 * Fetches live snapshots across all 5 per-user Firestore collections strictly from server (Fail-Closed).
 */
export async function fetchCloudReconciliationSnapshot(
  ownerId: string
): Promise<CloudReconciliationSnapshot> {
  const safeUid = sanitizeFirestoreId(ownerId);

  const [projectsRes, companyRes, ratesRes, txRes, reportsRes] = await Promise.all([
    fetchQueryStrictServer(
      query(collection(db, 'projects'), where('ownerId', '==', safeUid)),
      'projects'
    ),
    fetchDocStrictServer(doc(db, 'company_profiles', safeUid), `company_profiles/${safeUid}`),
    fetchQueryStrictServer(
      query(collection(db, 'rate_library'), where('ownerId', '==', safeUid)),
      'rate_library'
    ),
    fetchQueryStrictServer(
      query(collection(db, 'government_transactions'), where('ownerId', '==', safeUid)),
      'government_transactions'
    ),
    fetchDocStrictServer(doc(db, 'report_workspaces', safeUid), `report_workspaces/${safeUid}`),
  ]);

  const anyCache = false;

  const projects = projectsRes.snap.docs.map((d) =>
    normalizeFirestoreData(d.data() as Project)
  );
  const rateLibrary = ratesRes.snap.docs.map((d) =>
    normalizeFirestoreData(d.data() as RateLibraryItem)
  );
  const transactions = txRes.snap.docs.map((d) =>
    normalizeFirestoreData(d.data() as GovernmentTransaction)
  );

  let companyProfile: CompanyProfile | null = null;
  let companyUpdatedAt: string | null = null;
  if (companyRes.snap.exists()) {
    const raw = normalizeFirestoreData(companyRes.snap.data() as Record<string, unknown>);
    companyUpdatedAt = toIsoOrNull(raw.updatedAt);
    companyProfile = {
      nameAr: String(raw.nameAr || ''),
      nameEn: String(raw.nameEn || ''),
      licenseNumber: String(raw.licenseNumber || ''),
      municipalityClass: String(raw.municipalityClass || ''),
      trnNumber: String(raw.trnNumber || ''),
      addressAr: String(raw.addressAr || ''),
      addressEn: String(raw.addressEn || ''),
      phone: String(raw.phone || ''),
      email: String(raw.email || ''),
    };
  }

  let reportsWorkspace: ReportsWorkspaceStorage | null = null;
  let reportsUpdatedAt: string | null = null;
  if (reportsRes.snap.exists()) {
    const raw = normalizeFirestoreData(reportsRes.snap.data() as Record<string, unknown>);
    reportsUpdatedAt = toIsoOrNull(raw.updatedAt);
    reportsWorkspace = normalizeReportsWorkspace({
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
    });
  }

  return {
    projects,
    companyProfile,
    companyUpdatedAt,
    rateLibrary,
    transactions,
    reportsWorkspace,
    reportsUpdatedAt,
    fetchedAt: new Date().toISOString(),
    source: anyCache ? 'offline_cache' : 'server',
  };
}

export async function runLiveReconciliationAudit(params: {
  ownerId: string;
  local: WorkspaceSnapshotData;
  canAdminOverrideTerminalLock?: boolean;
}): Promise<{ report: ReconciliationAuditReport; cloudSnapshot: CloudReconciliationSnapshot }> {
  const cloudSnapshot = await fetchCloudReconciliationSnapshot(params.ownerId);
  const report = diffWorkspaceSnapshots(params.local, cloudSnapshot, {
    hasPendingProjectSync: hasPendingSyncForProject,
    canAdminOverrideTerminalLock: params.canAdminOverrideTerminalLock,
  });
  return { report, cloudSnapshot };
}

/**
 * Pushes a single audited local record to Firestore.
 */
export async function resolvePushItemToCloud(params: {
  item: ReconciliationAuditItem;
  ownerId: string;
  localProjects: Project[];
  onManifestAttached?: (updatedProject: Project) => void;
}): Promise<void> {
  const { item, ownerId, localProjects, onManifestAttached } = params;
  if (!item.localRecord) {
    throw new Error(`No local snapshot exists for ${item.entityKey}`);
  }
  if (item.terminalLocked) {
    throw new Error(
      `Record ${item.id} is locked in Firestore (completed/approved) and requires Admin privileges.`
    );
  }

  switch (item.entityType) {
    case 'project': {
      await pushSingleProjectImmediate(
        item.localRecord as Project,
        ownerId,
        onManifestAttached
      );
      break;
    }
    case 'company_profile': {
      await saveCompanyProfileToCloud(item.localRecord as CompanyProfile, ownerId);
      break;
    }
    case 'rate_item': {
      await saveRateItemToCloud(item.localRecord as RateLibraryItem, ownerId);
      break;
    }
    case 'transaction': {
      const tx = item.localRecord as GovernmentTransaction;
      const parentProject = localProjects.find(
        (p) => sanitizeFirestoreId(p.id) === sanitizeFirestoreId(tx.projectId)
      );
      if (parentProject) {
        await ensureProjectExistsInCloud(parentProject, ownerId);
      }
      await saveTransactionToCloud(tx, ownerId, { forceOverwrite: true });
      break;
    }
    case 'reports_workspace': {
      await saveReportsWorkspaceToCloud(item.localRecord as ReportsWorkspaceStorage, ownerId);
      break;
    }
  }
}

/**
 * Applies a pulled cloud record over the local workspace snapshot (pure patch builder).
 */
export function applyPulledItemToLocalWorkspace(
  item: ReconciliationAuditItem,
  local: WorkspaceSnapshotData
): Partial<WorkspaceSnapshotData> {
  if (!item.cloudRecord) {
    throw new Error(`No cloud snapshot exists for ${item.entityKey}`);
  }

  switch (item.entityType) {
    case 'project': {
      const cloudProj = item.cloudRecord as Project;
      const targetId = sanitizeFirestoreId(cloudProj.id);
      // Force-merge single cloud project over local while hydrating SVG/local sheets
      const mergedSingle = mergeRemoteProjectsWithLocal(
        local.projects.filter((p) => sanitizeFirestoreId(p.id) === targetId),
        [cloudProj],
        () => false
      );
      // Wait: mergeRemoteProjectsWithLocal skips remote if localUpdatedMs > remoteUpdatedMs + 1500.
      // Because user explicitly invoked Pull Cloud -> Local, force replace by merging against a timestamp-neutral copy:
      const localMatching = local.projects.find((p) => sanitizeFirestoreId(p.id) === targetId);
      const forcedMerged = mergeRemoteProjectsWithLocal(
        localMatching ? [{ ...localMatching, updatedAt: '1970-01-01T00:00:00.000Z' }] : [],
        [cloudProj],
        () => false
      );
      const replacement = forcedMerged[0] || mergedSingle[0] || cloudProj;
      const exists = local.projects.some((p) => sanitizeFirestoreId(p.id) === targetId);
      const nextProjects = exists
        ? local.projects.map((p) => (sanitizeFirestoreId(p.id) === targetId ? replacement : p))
        : [...local.projects, replacement];
      return { projects: nextProjects };
    }
    case 'company_profile': {
      return { companyProfile: item.cloudRecord as CompanyProfile };
    }
    case 'rate_item': {
      const cloudRate = item.cloudRecord as RateLibraryItem;
      const targetId = sanitizeFirestoreId(cloudRate.id);
      const exists = local.rateLibrary.some((r) => sanitizeFirestoreId(r.id) === targetId);
      const nextRates = exists
        ? local.rateLibrary.map((r) => (sanitizeFirestoreId(r.id) === targetId ? cloudRate : r))
        : [...local.rateLibrary, cloudRate];
      return { rateLibrary: nextRates };
    }
    case 'transaction': {
      const cloudTx = item.cloudRecord as GovernmentTransaction;
      const targetId = sanitizeFirestoreId(cloudTx.id);
      const exists = local.transactions.some((t) => sanitizeFirestoreId(t.id) === targetId);
      const nextTxs = exists
        ? local.transactions.map((t) => (sanitizeFirestoreId(t.id) === targetId ? cloudTx : t))
        : [cloudTx, ...local.transactions];
      return { transactions: nextTxs };
    }
    case 'reports_workspace': {
      return {
        reportsWorkspace: normalizeReportsWorkspace(
          item.cloudRecord as Partial<ReportsWorkspaceStorage>
        ),
      };
    }
  }
}

export async function resolvePullItemToLocal(params: {
  item: ReconciliationAuditItem;
  local: WorkspaceSnapshotData;
  ownerId: string | null;
}): Promise<Partial<WorkspaceSnapshotData>> {
  const { item, local, ownerId } = params;
  if (item.entityType === 'project') {
    const cloudProj = item.cloudRecord as Project | undefined;
    if (cloudProj) {
      cancelPendingProjectSync(cloudProj.id, ownerId);
    }
    cancelPendingProjectSync(item.id, ownerId);
  }
  return applyPulledItemToLocalWorkspace(item, local);
}
