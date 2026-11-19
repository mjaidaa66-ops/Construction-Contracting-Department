import type {
  BackupData,
  CompanyProfile,
  GovernmentAuthority,
  GovernmentTransaction,
  Project,
  ProjectStatus,
  ProjectType,
  RateLibraryItem,
  TakeoffCategory,
  TransactionStatus,
} from '../types/bunyan';

const VALID_PROJECT_TYPES = new Set<ProjectType>([
  'villa',
  'commercial_tower',
  'residential_complex',
  'warehouse',
  'infrastructure',
  'institutional',
]);

const VALID_PROJECT_STATUSES = new Set<ProjectStatus>([
  'permitting',
  'under_construction',
  'suspended',
  'completed',
]);

const VALID_AUTHORITIES = new Set<GovernmentAuthority>([
  'sharjah_municipality',
  'sewa',
  'szhp',
  'civil_defense',
  'planning_survey',
  'municipalities_affairs',
  'sharjah_housing',
]);

const VALID_TX_STATUSES = new Set<TransactionStatus>([
  'approved',
  'in_review',
  'action_required',
  'pending_inspection',
]);

const VALID_TAKEOFF_CATEGORIES = new Set<TakeoffCategory>([
  'excavation',
  'concrete',
  'steel',
  'masonry',
  'plastering',
  'waterproofing',
  'flooring',
  'painting',
  'ceilings',
  'doors_windows',
  'electrical',
  'plumbing_hvac',
]);

const VALID_UNITS = new Set<RateLibraryItem['unit']>(['m', 'm2', 'm3', 'ton', 'unit']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function finiteNonNegative(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function clampRange(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function nonEmptyStr(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeCompanyProfile(raw: unknown): CompanyProfile | null {
  if (!isPlainObject(raw)) return null;
  const nameAr = nonEmptyStr(raw.nameAr);
  const nameEn = nonEmptyStr(raw.nameEn);
  const licenseNumber = nonEmptyStr(raw.licenseNumber);
  if (!nameAr && !nameEn) return null;
  return {
    nameAr: (nameAr || nameEn || 'مؤسسة بنيان').slice(0, 200),
    nameEn: (nameEn || nameAr || 'Bunyan Engineering').slice(0, 200),
    licenseNumber: (licenseNumber || 'SHJ-0001').slice(0, 80),
    municipalityClass: typeof raw.municipalityClass === 'string' ? raw.municipalityClass.slice(0, 120) : '',
    trnNumber: typeof raw.trnNumber === 'string' ? raw.trnNumber.slice(0, 40) : '',
    addressAr: typeof raw.addressAr === 'string' ? raw.addressAr.slice(0, 300) : '',
    addressEn: typeof raw.addressEn === 'string' ? raw.addressEn.slice(0, 300) : '',
    phone: typeof raw.phone === 'string' ? raw.phone.slice(0, 40) : '',
    email: typeof raw.email === 'string' ? raw.email.slice(0, 160) : '',
  };
}

function validateProject(raw: unknown): { ok: true; project: Project } | { ok: false; reason: string } {
  if (!isPlainObject(raw)) return { ok: false, reason: 'Project entry is not an object' };
  const id = nonEmptyStr(raw.id);
  const code = nonEmptyStr(raw.code);
  const name = nonEmptyStr(raw.name) || nonEmptyStr(raw.nameEn);
  if (!id) return { ok: false, reason: 'Missing project id' };
  if (!code || code.length < 2) return { ok: false, reason: `Project ${id}: invalid or missing code` };
  if (!name) return { ok: false, reason: `Project ${id}: missing name` };
  if (!isPlainObject(raw.gisData)) return { ok: false, reason: `Project ${id}: missing gisData object` };

  const gisRaw = raw.gisData;
  const plotNumber = nonEmptyStr(gisRaw.plotNumber);
  if (!plotNumber) return { ok: false, reason: `Project ${id}: missing gisData.plotNumber` };

  const boundaryRaw = Array.isArray(gisRaw.boundaryPoints) ? gisRaw.boundaryPoints : [];
  const boundaryPoints = boundaryRaw
    .filter(isPlainObject)
    .map((pt, idx) => ({
      x: typeof pt.x === 'number' && Number.isFinite(pt.x) ? pt.x : Number(pt.x),
      y: typeof pt.y === 'number' && Number.isFinite(pt.y) ? pt.y : Number(pt.y),
      label: typeof pt.label === 'string' ? pt.label : `P${idx + 1}`,
    }))
    .filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y));

  const setbacksRaw = isPlainObject(gisRaw.setbacks) ? gisRaw.setbacks : {};

  const projectType: ProjectType = VALID_PROJECT_TYPES.has(raw.projectType as ProjectType)
    ? (raw.projectType as ProjectType)
    : 'villa';
  const status: ProjectStatus = VALID_PROJECT_STATUSES.has(raw.status as ProjectStatus)
    ? (raw.status as ProjectStatus)
    : 'permitting';

  const project: Project = {
    ...(raw as unknown as Project),
    id: id.slice(0, 120),
    code: code.slice(0, 40),
    name: (nonEmptyStr(raw.name) || name).slice(0, 200),
    nameEn: (nonEmptyStr(raw.nameEn) || name).slice(0, 200),
    category: 'المشاريع الإنشائية',
    projectType,
    status,
    ownerName: typeof raw.ownerName === 'string' ? raw.ownerName : '',
    ownerPhone: typeof raw.ownerPhone === 'string' ? raw.ownerPhone : '',
    ownerEmail: typeof raw.ownerEmail === 'string' ? raw.ownerEmail : '',
    ownerNationalId: typeof raw.ownerNationalId === 'string' ? raw.ownerNationalId : '',
    consultantOffice: typeof raw.consultantOffice === 'string' ? raw.consultantOffice : '',
    consultantEngineer: typeof raw.consultantEngineer === 'string' ? raw.consultantEngineer : '',
    consultantPhone: typeof raw.consultantPhone === 'string' ? raw.consultantPhone : '',
    consultantLicenseNo: typeof raw.consultantLicenseNo === 'string' ? raw.consultantLicenseNo : '',
    residentEngineer: typeof raw.residentEngineer === 'string' ? raw.residentEngineer : '',
    contractorBranch: typeof raw.contractorBranch === 'string' ? raw.contractorBranch : '',
    permitNumber: typeof raw.permitNumber === 'string' ? raw.permitNumber : '',
    permitDate: typeof raw.permitDate === 'string' ? raw.permitDate : '',
    permitExpiryDate: typeof raw.permitExpiryDate === 'string' ? raw.permitExpiryDate : '',
    licensingAuthority: typeof raw.licensingAuthority === 'string' ? raw.licensingAuthority : '',
    approvedBudget: finiteNonNegative(raw.approvedBudget, 0),
    invoicedAmount: finiteNonNegative(raw.invoicedAmount, 0),
    paidAmount: finiteNonNegative(raw.paidAmount, 0),
    retentionPercentage: clampRange(raw.retentionPercentage, 0, 50, 10),
    actualProgress: clampRange(raw.actualProgress, 0, 100, 0),
    plannedProgress: clampRange(raw.plannedProgress, 0, 100, 0),
    phases: Array.isArray(raw.phases) ? (raw.phases.slice(0, 50) as Project['phases']) : [],
    paymentMilestones: Array.isArray(raw.paymentMilestones)
      ? (raw.paymentMilestones.slice(0, 50) as Project['paymentMilestones'])
      : [],
    documents: Array.isArray(raw.documents) ? (raw.documents.slice(0, 100) as Project['documents']) : [],
    gisData: {
      plotNumber,
      basinNumber: typeof gisRaw.basinNumber === 'string' ? gisRaw.basinNumber : 'SHJ-01',
      sectorName: typeof gisRaw.sectorName === 'string' ? gisRaw.sectorName : '',
      emirate: typeof gisRaw.emirate === 'string' ? gisRaw.emirate : 'الشارقة / Sharjah',
      latitude:
        typeof gisRaw.latitude === 'number' && Number.isFinite(gisRaw.latitude)
          ? gisRaw.latitude
          : 0,
      longitude:
        typeof gisRaw.longitude === 'number' && Number.isFinite(gisRaw.longitude)
          ? gisRaw.longitude
          : 0,
      plotAreaSqFt: finiteNonNegative(gisRaw.plotAreaSqFt, 0),
      plotAreaSqM: finiteNonNegative(gisRaw.plotAreaSqM, 0),
      builtUpAreaSqFt: finiteNonNegative(gisRaw.builtUpAreaSqFt, 0),
      zoning: typeof gisRaw.zoning === 'string' ? gisRaw.zoning : '',
      setbacks: {
        front: finiteNonNegative(setbacksRaw.front, 0),
        rear: finiteNonNegative(setbacksRaw.rear, 0),
        sideLeft: finiteNonNegative(setbacksRaw.sideLeft, 0),
        sideRight: finiteNonNegative(setbacksRaw.sideRight, 0),
      },
      boundaryPoints,
    },
    bimElements: Array.isArray(raw.bimElements)
      ? (raw.bimElements.slice(0, 500) as Project['bimElements'])
      : undefined,
    takeoffSheets: Array.isArray(raw.takeoffSheets)
      ? (raw.takeoffSheets.slice(0, 50) as Project['takeoffSheets'])
      : [],
    takeoffMeasurements: Array.isArray(raw.takeoffMeasurements)
      ? (raw.takeoffMeasurements.slice(0, 500) as Project['takeoffMeasurements'])
      : [],
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };

  return { ok: true, project };
}

export type BackupValidationResult =
  | { ok: true; data: BackupData; warnings: string[] }
  | { ok: false; error: string };

export function validateAndSanitizeBackupData(raw: unknown): BackupValidationResult {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Backup root payload must be a JSON object.' };
  }
  if (!Array.isArray(raw.projects) || raw.projects.length === 0) {
    return { ok: false, error: 'Backup must include a non-empty projects array.' };
  }

  const warnings: string[] = [];
  const validProjects: Project[] = [];
  const seenProjectIds = new Set<string>();

  for (const item of raw.projects) {
    const check = validateProject(item);
    if (!check.ok) {
      warnings.push(check.reason);
      continue;
    }
    if (seenProjectIds.has(check.project.id)) {
      warnings.push(`Duplicate project id skipped: ${check.project.id}`);
      continue;
    }
    seenProjectIds.add(check.project.id);
    validProjects.push(check.project);
  }

  if (validProjects.length === 0) {
    return {
      ok: false,
      error: `No valid projects found in backup (${warnings[0] || 'schema mismatch'}).`,
    };
  }

  const validTransactions: GovernmentTransaction[] = [];
  if (Array.isArray(raw.transactions)) {
    for (const item of raw.transactions) {
      if (!isPlainObject(item)) {
        warnings.push('Skipped non-object government transaction');
        continue;
      }
      const id = nonEmptyStr(item.id);
      const projectId = nonEmptyStr(item.projectId);
      const transactionNumber = nonEmptyStr(item.transactionNumber);
      const serviceName = nonEmptyStr(item.serviceName);
      if (!id || !projectId || !transactionNumber || !serviceName) {
        warnings.push(`Skipped incomplete transaction (${id || 'unknown'})`);
        continue;
      }
      const authority: GovernmentAuthority = VALID_AUTHORITIES.has(
        item.authority as GovernmentAuthority
      )
        ? (item.authority as GovernmentAuthority)
        : 'sharjah_municipality';
      const status: TransactionStatus = VALID_TX_STATUSES.has(item.status as TransactionStatus)
        ? (item.status as TransactionStatus)
        : 'in_review';
      validTransactions.push({
        id: id.slice(0, 120),
        ownerId: typeof item.ownerId === 'string' ? item.ownerId : undefined,
        projectId: projectId.slice(0, 120),
        authority,
        transactionNumber: transactionNumber.slice(0, 80),
        serviceName: serviceName.slice(0, 200),
        serviceNameEn:
          typeof item.serviceNameEn === 'string' ? item.serviceNameEn.slice(0, 200) : serviceName,
        status,
        submissionDate:
          typeof item.submissionDate === 'string' ? item.submissionDate : new Date().toISOString().slice(0, 10),
        lastUpdatedDate:
          typeof item.lastUpdatedDate === 'string' ? item.lastUpdatedDate : new Date().toISOString().slice(0, 10),
        reviewEngineer:
          typeof item.reviewEngineer === 'string' ? item.reviewEngineer.slice(0, 120) : '',
        notes: typeof item.notes === 'string' ? item.notes.slice(0, 1000) : '',
        officialPortalUrl:
          typeof item.officialPortalUrl === 'string'
            ? item.officialPortalUrl.slice(0, 500)
            : 'https://portal.shjmun.gov.ae',
      });
    }
  }

  const validRates: RateLibraryItem[] = [];
  if (Array.isArray(raw.rateLibrary)) {
    for (const item of raw.rateLibrary) {
      if (!isPlainObject(item)) {
        warnings.push('Skipped non-object rate library item');
        continue;
      }
      const id = nonEmptyStr(item.id);
      const code = nonEmptyStr(item.code);
      const nameAr = nonEmptyStr(item.nameAr) || nonEmptyStr(item.nameEn);
      if (!id || !code || code.length < 2 || !nameAr) {
        warnings.push(`Skipped invalid rate item (${id || 'unknown'})`);
        continue;
      }
      const category: TakeoffCategory = VALID_TAKEOFF_CATEGORIES.has(
        item.category as TakeoffCategory
      )
        ? (item.category as TakeoffCategory)
        : 'concrete';
      const unit: RateLibraryItem['unit'] = VALID_UNITS.has(item.unit as RateLibraryItem['unit'])
        ? (item.unit as RateLibraryItem['unit'])
        : 'unit';
      validRates.push({
        id: id.slice(0, 120),
        ownerId: typeof item.ownerId === 'string' ? item.ownerId : undefined,
        code: code.slice(0, 20),
        category,
        nameAr: nameAr.slice(0, 200),
        nameEn: (nonEmptyStr(item.nameEn) || nameAr).slice(0, 200),
        unit,
        rateAed: finiteNonNegative(item.rateAed, 0),
        materialSpec: typeof item.materialSpec === 'string' ? item.materialSpec.slice(0, 200) : '',
      });
    }
  }

  const companyProfile = sanitizeCompanyProfile(raw.companyProfile);

  return {
    ok: true,
    warnings,
    data: {
      version: typeof raw.version === 'string' && raw.version.trim() ? raw.version : '2026.1',
      exportedAt:
        typeof raw.exportedAt === 'string' && raw.exportedAt.trim()
          ? raw.exportedAt
          : new Date().toISOString(),
      companyProfile: companyProfile || (undefined as unknown as CompanyProfile),
      projects: validProjects,
      transactions: validTransactions,
      rateLibrary: validRates,
    },
  };
}
