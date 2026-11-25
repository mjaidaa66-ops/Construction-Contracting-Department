import type {
  PrintAuditLogEntry,
  PrintSettings,
  ReportTemplate,
  ReportTemplateStyleId,
  ReportsWorkspaceStorage,
  SavedReportRecord,
} from '../types/reports';
import { DEFAULT_PRINT_SETTINGS, cloneDefaultTemplates } from '../utils/reportTemplates';

const DB_NAME = 'bunyan_offline_cache';
const STORE_WORKSPACE = 'workspace_snapshot';
const REPORTS_WORKSPACE_KEY = 'bunyan_reports_workspace';
const LS_FALLBACK_KEY = 'bunyan_reports_workspace_v1';

export function createDefaultReportsWorkspace(): ReportsWorkspaceStorage {
  return {
    savedReports: [],
    customTemplates: cloneDefaultTemplates(),
    printSettings: { ...DEFAULT_PRINT_SETTINGS },
    auditLogs: [],
  };
}

function mergeWithDefaults(partial: Partial<ReportsWorkspaceStorage> | null | undefined): ReportsWorkspaceStorage {
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

function openWorkspaceDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_WORKSPACE)) {
          db.createObjectStore(STORE_WORKSPACE);
        }
        if (!db.objectStoreNames.contains('binary_files')) {
          db.createObjectStore('binary_files');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function normalizeReportsWorkspace(
  partial: Partial<ReportsWorkspaceStorage> | null | undefined
): ReportsWorkspaceStorage {
  return mergeWithDefaults(partial);
}

function getScopedStorageKeys(scopeUid?: string | null): { idbKey: string; lsKey: string } {
  const cleanUid = scopeUid ? scopeUid.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
  if (!cleanUid) {
    return {
      idbKey: REPORTS_WORKSPACE_KEY,
      lsKey: LS_FALLBACK_KEY,
    };
  }
  return {
    idbKey: `${REPORTS_WORKSPACE_KEY}_${cleanUid}`,
    lsKey: `${LS_FALLBACK_KEY}_${cleanUid}`,
  };
}

export async function loadReportsWorkspace(
  scopeUid?: string | null
): Promise<ReportsWorkspaceStorage> {
  const { idbKey, lsKey } = getScopedStorageKeys(scopeUid);
  let lsParsed: Partial<ReportsWorkspaceStorage> | null = null;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(lsKey);
      if (raw) lsParsed = JSON.parse(raw) as Partial<ReportsWorkspaceStorage>;
    }
  } catch {
    lsParsed = null;
  }

  const db = await openWorkspaceDb();
  if (!db) {
    return mergeWithDefaults(lsParsed);
  }

  try {
    const idbData = await new Promise<Partial<ReportsWorkspaceStorage> | null>((resolve) => {
      try {
        if (!db.objectStoreNames.contains(STORE_WORKSPACE)) {
          resolve(null);
          return;
        }
        const tx = db.transaction(STORE_WORKSPACE, 'readonly');
        const store = tx.objectStore(STORE_WORKSPACE);
        const req = store.get(idbKey);
        req.onsuccess = () => resolve((req.result as Partial<ReportsWorkspaceStorage>) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    db.close();
    return mergeWithDefaults(idbData || lsParsed);
  } catch {
    db.close();
    return mergeWithDefaults(lsParsed);
  }
}

export async function saveReportsWorkspace(
  state: ReportsWorkspaceStorage,
  scopeUid?: string | null
): Promise<void> {
  const { idbKey, lsKey } = getScopedStorageKeys(scopeUid);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(lsKey, JSON.stringify(state));
    }
  } catch {
    // Ignore localStorage quota failures; IndexedDB handles larger payloads
  }

  const db = await openWorkspaceDb();
  if (!db) return;

  try {
    await new Promise<void>((resolve) => {
      try {
        if (!db.objectStoreNames.contains(STORE_WORKSPACE)) {
          resolve();
          return;
        }
        const tx = db.transaction(STORE_WORKSPACE, 'readwrite');
        tx.objectStore(STORE_WORKSPACE).put(state, idbKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } finally {
    db.close();
  }
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
