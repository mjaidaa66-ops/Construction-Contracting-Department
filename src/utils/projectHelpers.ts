import type {
  BackupData,
  Language,
  Project,
  ProjectStatus,
  ProjectType,
} from '../types/bunyan';

export type ProjectSortField =
  | 'updatedAt'
  | 'code'
  | 'name'
  | 'approvedBudget'
  | 'paidAmount'
  | 'actualProgress';

export type SortDirection = 'asc' | 'desc';

export interface ProjectFilterCriteria {
  query?: string;
  status?: ProjectStatus | 'all';
  projectType?: ProjectType | 'all';
  location?: string; // matches gisData.sectorName or gisData.emirate or 'all'
  client?: string; // matches ownerName or 'all'
  sortField?: ProjectSortField;
  sortDir?: SortDirection;
}

export interface PortfolioKpis {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalBudgetAed: number;
  totalPaidAed: number;
  remainingAed: number;
  collectionRatePct: number;
  averageProgressPct: number;
}

export interface ProjectFormInput {
  code: string;
  name: string;
  nameEn: string;
  approvedBudget: string | number;
  paidAmount: string | number;
  actualProgress: string | number;
  plotNumber: string;
  plotAreaSqFt: string | number;
  permitDate?: string;
  permitExpiryDate?: string;
}

export interface ProjectFormValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof ProjectFormInput, string>>;
}

export interface BackupMergePreview {
  totalIncomingProjects: number;
  newProjectsCount: number;
  matchedByIdCount: number;
  codeCollisionCount: number;
  collidingCodes: string[];
  transactionsCount: number;
  ratesCount: number;
}

export function extractUniqueLocations(projects: Project[]): string[] {
  const set = new Set<string>();
  for (const p of projects) {
    const sector = p.gisData?.sectorName?.trim();
    if (sector) set.add(sector);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function extractUniqueClients(projects: Project[]): string[] {
  const set = new Set<string>();
  for (const p of projects) {
    const owner = p.ownerName?.trim();
    if (owner) set.add(owner);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function filterAndSortProjects(
  projects: Project[],
  criteria: ProjectFilterCriteria,
  lang: Language = 'ar'
): Project[] {
  const q = (criteria.query || '').trim().toLowerCase();
  const status = criteria.status || 'all';
  const projectType = criteria.projectType || 'all';
  const location = criteria.location || 'all';
  const client = criteria.client || 'all';
  const sortField = criteria.sortField || 'updatedAt';
  const sortDir = criteria.sortDir || 'desc';

  const filtered = projects.filter((p) => {
    if (status !== 'all' && p.status !== status) return false;
    if (projectType !== 'all' && p.projectType !== projectType) return false;
    if (
      location !== 'all' &&
      p.gisData?.sectorName?.trim() !== location &&
      p.gisData?.emirate?.trim() !== location
    ) {
      return false;
    }
    if (client !== 'all' && p.ownerName?.trim() !== client) {
      return false;
    }
    if (!q) return true;

    return (
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.nameEn.toLowerCase().includes(q) ||
      p.ownerName.toLowerCase().includes(q) ||
      p.permitNumber.toLowerCase().includes(q) ||
      (p.gisData?.plotNumber || '').toLowerCase().includes(q) ||
      (p.gisData?.sectorName || '').toLowerCase().includes(q)
    );
  });

  const dir = sortDir === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    switch (sortField) {
      case 'code':
        return a.code.localeCompare(b.code) * dir;
      case 'name': {
        const na = lang === 'ar' ? a.name : a.nameEn;
        const nb = lang === 'ar' ? b.name : b.nameEn;
        return na.localeCompare(nb) * dir;
      }
      case 'approvedBudget':
        return (a.approvedBudget - b.approvedBudget) * dir;
      case 'paidAmount':
        return (a.paidAmount - b.paidAmount) * dir;
      case 'actualProgress':
        return (a.actualProgress - b.actualProgress) * dir;
      case 'updatedAt':
      default: {
        const ta = Date.parse(a.updatedAt || a.createdAt || '') || 0;
        const tb = Date.parse(b.updatedAt || b.createdAt || '') || 0;
        if (ta !== tb) return (ta - tb) * dir;
        return a.code.localeCompare(b.code);
      }
    }
  });
}

export function computePortfolioKpis(projects: Project[]): PortfolioKpis {
  if (projects.length === 0) {
    return {
      totalProjects: 0,
      activeProjects: 0,
      completedProjects: 0,
      totalBudgetAed: 0,
      totalPaidAed: 0,
      remainingAed: 0,
      collectionRatePct: 0,
      averageProgressPct: 0,
    };
  }

  let activeProjects = 0;
  let completedProjects = 0;
  let totalBudgetAed = 0;
  let totalPaidAed = 0;
  let progressSum = 0;

  for (const p of projects) {
    if (p.status === 'under_construction') activeProjects += 1;
    if (p.status === 'completed') completedProjects += 1;
    totalBudgetAed += Number.isFinite(p.approvedBudget) ? p.approvedBudget : 0;
    totalPaidAed += Number.isFinite(p.paidAmount) ? p.paidAmount : 0;
    progressSum += Number.isFinite(p.actualProgress) ? p.actualProgress : 0;
  }

  const remainingAed = Math.max(0, totalBudgetAed - totalPaidAed);
  const collectionRatePct =
    totalBudgetAed > 0 ? Math.round((totalPaidAed / totalBudgetAed) * 100) : 0;
  const averageProgressPct = Math.round(progressSum / projects.length);

  return {
    totalProjects: projects.length,
    activeProjects,
    completedProjects,
    totalBudgetAed,
    totalPaidAed,
    remainingAed,
    collectionRatePct,
    averageProgressPct,
  };
}

export function validateProjectFormInput(
  input: ProjectFormInput,
  existingProjects: Project[],
  editingProjectId: string | undefined,
  lang: Language
): ProjectFormValidationResult {
  const isAr = lang === 'ar';
  const errors: Partial<Record<keyof ProjectFormInput, string>> = {};

  const trimmedCode = input.code.trim();
  if (trimmedCode.length < 2) {
    errors.code = isAr
      ? 'كود المشروع مطلوب (حرفان على الأقل).'
      : 'Project code is required (at least 2 characters).';
  } else {
    const duplicate = existingProjects.find(
      (p) =>
        p.id !== editingProjectId &&
        p.code.trim().toLowerCase() === trimmedCode.toLowerCase()
    );
    if (duplicate) {
      errors.code = isAr
        ? `كود المشروع "${trimmedCode}" مستخدم بالفعل لمشروع آخر.`
        : `Project code "${trimmedCode}" already exists.`;
    }
  }

  if (!input.name.trim() && !input.nameEn.trim()) {
    errors.name = isAr
      ? 'يرجى إدخال اسم المشروع باللغة العربية أو الإنجليزية.'
      : 'Please enter a project name (Arabic or English).';
    errors.nameEn = errors.name;
  }

  const budget = Number(input.approvedBudget);
  if (!Number.isFinite(budget) || budget < 0) {
    errors.approvedBudget = isAr
      ? 'قيمة المشروع يجب أن تكون رقماً غير سالب.'
      : 'Project budget must be a non-negative number.';
  }

  const paid = Number(input.paidAmount);
  if (!Number.isFinite(paid) || paid < 0) {
    errors.paidAmount = isAr
      ? 'الدفعات المستلمة يجب أن تكون رقماً غير سالب.'
      : 'Payments received must be a non-negative number.';
  } else if (Number.isFinite(budget) && budget >= 0 && paid > budget) {
    errors.paidAmount = isAr
      ? 'الدفعات المستلمة لا يمكن أن تتجاوز قيمة المشروع المعتمدة.'
      : 'Payments received cannot exceed approved project value.';
  }

  const progress = Number(input.actualProgress);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    errors.actualProgress = isAr
      ? 'نسبة الإنجاز يجب أن تكون بين 0 و 100%.'
      : 'Progress must be between 0 and 100%.';
  }

  if (!input.plotNumber.trim()) {
    errors.plotNumber = isAr ? 'رقم القطعة مطلوب.' : 'GIS plot number is required.';
  }

  const area = Number(input.plotAreaSqFt);
  if (!Number.isFinite(area) || area <= 0) {
    errors.plotAreaSqFt = isAr
      ? 'مساحة الأرض يجب أن تكون أكبر من صفر.'
      : 'Plot area must be greater than zero.';
  }

  if (input.permitDate && input.permitExpiryDate) {
    const startMs = Date.parse(input.permitDate);
    const endMs = Date.parse(input.permitExpiryDate);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
      errors.permitExpiryDate = isAr
        ? 'تاريخ انتهاء الرخصة يجب أن يكون بعد تاريخ الإصدار.'
        : 'Permit expiry date cannot be earlier than permit issue date.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function analyzeBackupMergePreview(
  currentProjects: Project[],
  incoming: BackupData
): BackupMergePreview {
  const existingIds = new Set(currentProjects.map((p) => p.id));
  const existingCodeToId = new Map(
    currentProjects.map((p) => [p.code.trim().toLowerCase(), p.id])
  );

  let newProjectsCount = 0;
  let matchedByIdCount = 0;
  const collidingCodes: string[] = [];

  for (const p of incoming.projects) {
    if (existingIds.has(p.id)) {
      matchedByIdCount += 1;
      continue;
    }
    const existingWithSameCode = existingCodeToId.get(p.code.trim().toLowerCase());
    if (existingWithSameCode && existingWithSameCode !== p.id) {
      collidingCodes.push(p.code);
    }
    newProjectsCount += 1;
  }

  return {
    totalIncomingProjects: incoming.projects.length,
    newProjectsCount,
    matchedByIdCount,
    codeCollisionCount: collidingCodes.length,
    collidingCodes,
    transactionsCount: incoming.transactions.length,
    ratesCount: incoming.rateLibrary.length,
  };
}

export function mergeImportedBackupProjects(
  currentProjects: Project[],
  incomingProjects: Project[],
  mode: 'merge' | 'replace',
  nowIso: string = new Date().toISOString()
): Project[] {
  const stampedIncoming = incomingProjects.map((p) => ({ ...p, updatedAt: nowIso }));
  if (mode === 'replace') {
    return stampedIncoming;
  }

  const byId = new Map<string, Project>();
  for (const existing of currentProjects) {
    byId.set(existing.id, existing);
  }
  for (const incoming of stampedIncoming) {
    byId.set(incoming.id, incoming);
  }
  return Array.from(byId.values());
}
