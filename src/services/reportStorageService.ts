import type {
  PrintAuditLogEntry,
  PrintSettings,
  ReportTemplate,
  ReportTemplateStyleId,
  ReportsWorkspaceStorage,
  SavedReportRecord,
} from '../types/reports';
import { DEFAULT_PRINT_SETTINGS, cloneDefaultTemplates } from '../utils/reportTemplates';

export function createDefaultReportsWorkspace(): ReportsWorkspaceStorage {
  return {
    savedReports: [],
    customTemplates: cloneDefaultTemplates(),
    printSettings: { ...DEFAULT_PRINT_SETTINGS },
    auditLogs: [],
  };
}

function mergeWithDefaults(
  partial: Partial<ReportsWorkspaceStorage> | null | undefined
): ReportsWorkspaceStorage {
  const defaults = createDefaultReportsWorkspace();
  if (!partial) return defaults;
  const mergedTemplates: Record<ReportTemplateStyleId, ReportTemplate> = {
    ...defaults.customTemplates,
  };
  if (partial.customTemplates) {
    (Object.keys(defaults.customTemplates) as ReportTemplateStyleId[]).forEach((key) => {
      if (partial.customTemplates?.[key]) {
        mergedTemplates[key] = {
          ...defaults.customTemplates[key],
          ...partial.customTemplates[key],
        };
      }
    });
  }
  return {
    savedReports: Array.isArray(partial.savedReports) ? partial.savedReports : [],
    customTemplates: mergedTemplates,
    printSettings: {
      ...defaults.printSettings,
      ...(partial.printSettings || {}),
    },
    auditLogs: Array.isArray(partial.auditLogs) ? partial.auditLogs : [],
  };
}

export function normalizeReportsWorkspace(
  partial: Partial<ReportsWorkspaceStorage> | null | undefined
): ReportsWorkspaceStorage {
  return mergeWithDefaults(partial);
}

export function upsertSavedReportInState(
  prev: ReportsWorkspaceStorage,
  record: SavedReportRecord
): ReportsWorkspaceStorage {
  const exists = prev.savedReports.some((r) => r.id === record.id);
  const nextSaved = exists
    ? prev.savedReports.map((r) => (r.id === record.id ? record : r))
    : [record, ...prev.savedReports];
  return {
    ...prev,
    savedReports: nextSaved,
  };
}

export function toggleFavoriteInState(
  prev: ReportsWorkspaceStorage,
  reportId: string
): ReportsWorkspaceStorage {
  return {
    ...prev,
    savedReports: prev.savedReports.map((r) =>
      r.id === reportId
        ? { ...r, isFavorite: !r.isFavorite, updatedAt: new Date().toISOString() }
        : r
    ),
  };
}

export function deleteSavedReportInState(
  prev: ReportsWorkspaceStorage,
  reportId: string
): ReportsWorkspaceStorage {
  return {
    ...prev,
    savedReports: prev.savedReports.filter((r) => r.id !== reportId),
  };
}

export function appendPrintAuditLogInState(
  prev: ReportsWorkspaceStorage,
  entry: PrintAuditLogEntry
): ReportsWorkspaceStorage {
  return {
    ...prev,
    auditLogs: [entry, ...prev.auditLogs].slice(0, 250),
  };
}

export function updateTemplateInState(
  prev: ReportsWorkspaceStorage,
  template: ReportTemplate
): ReportsWorkspaceStorage {
  return {
    ...prev,
    customTemplates: {
      ...prev.customTemplates,
      [template.id]: {
        ...template,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

export function updatePrintSettingsInState(
  prev: ReportsWorkspaceStorage,
  printSettings: PrintSettings
): ReportsWorkspaceStorage {
  return {
    ...prev,
    printSettings,
  };
}
