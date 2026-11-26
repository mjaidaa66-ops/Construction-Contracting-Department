import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import confetti from 'canvas-confetti';
import { CloudOff, Loader2, LogIn, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { BunyanLogo } from './components/common/BunyanLogo';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { CommandCenter } from './components/command/CommandCenter';
import { HolographicDashboard } from './components/command/HolographicDashboard';
import { Sidebar, type ActiveModule } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { Button, Card, SkeletonBlock, StatusIndicator, ToastProvider, useToast } from './components/ui';
import { deriveWorkspaceAlerts } from './utils/workspaceAlerts';
import { getRolePermissions } from './utils/rbacPermissions';
import {
  DEFAULT_COMPANY_PROFILE,
  INITIAL_PROJECTS,
  INITIAL_RATE_LIBRARY,
  INITIAL_TRANSACTIONS,
} from './data/uaeSeedData';
import { mergeImportedBackupProjects } from './utils/projectHelpers';
import { purgeSeededDemoDocuments } from './utils/projectFilesEngine';
import {
  assertVerifiedCloudPath,
  auth,
  FIRESTORE_DATABASE_ID,
  formatFirebaseAuthError,
  isAppCheckConfigured,
  OperationType,
  probeFirestoreServerReachability,
  signInWithGooglePopup,
  signOutFirebase,
  type CloudReachabilityReport,
} from './services/firebase';
import {
  deleteProjectFromCloud,
  deleteTransactionFromCloud,
  ensureProjectExistsInCloud,
  saveRateItemToCloud,
  saveTransactionToCloud,
  upsertUserProfile,
} from './services/firestoreStorage';
import {
  commitCompanyProfileFailClosed,
  commitProjectToCloudFailClosed,
  commitReportsWorkspaceFailClosed,
  getCloudSyncState,
  mergeRemoteProjectsWithLocal,
  resetSyncQueueForAccountSwitch,
  setAuthSyncStatus,
  setNetworkOnlineStatus,
  setServerReachableStatus,
  subscribeCloudSyncState,
  subscribeWorkspaceRealtime,
  syncNowAll,
  type CloudSyncState,
} from './services/cloudSyncService';
import {
  appendPrintAuditLogInState,
  createDefaultReportsWorkspace,
} from './services/reportStorageService';
import type { WorkspaceSnapshotData } from './services/reconciliationAuditor';
import type {
  BackupData,
  CompanyProfile,
  GovernmentTransaction,
  Language,
  Project,
  RateLibraryItem,
  Role,
  ThemeMode,
} from './types/bunyan';
import type { PrintAuditLogEntry, ReportsWorkspaceStorage } from './types/reports';

const ProjectsModule = lazy(() =>
  import('./components/projects/ProjectsModule').then((m) => ({
    default: m.ProjectsModule,
  }))
);
const GovernmentPortal = lazy(() =>
  import('./components/government/GovernmentPortal').then((m) => ({
    default: m.GovernmentPortal,
  }))
);
const SettingsAuthModule = lazy(() =>
  import('./components/settings/SettingsAuthModule').then((m) => ({
    default: m.SettingsAuthModule,
  }))
);
const GlobalCommandModal = lazy(() =>
  import('./components/layout/GlobalCommandModal').then((m) => ({
    default: m.GlobalCommandModal,
  }))
);
const NotificationsDrawer = lazy(() =>
  import('./components/layout/NotificationsDrawer').then((m) => ({
    default: m.NotificationsDrawer,
  }))
);
const BunyanExportCenter = lazy(() =>
  import('./components/export/BunyanExportCenter').then((m) => ({
    default: m.BunyanExportCenter,
  }))
);
const FinancialSummaryModule = lazy(() =>
  import('./components/financials/FinancialSummaryModule').then((m) => ({
    default: m.FinancialSummaryModule,
  }))
);
const DocumentsModule = lazy(() =>
  import('./components/documents/DocumentsModule').then((m) => ({
    default: m.DocumentsModule,
  }))
);
const BunyanBimTakeoffStudio = lazy(() =>
  import('./components/studio/BunyanBimTakeoffStudio').then((m) => ({
    default: m.BunyanBimTakeoffStudio,
  }))
);
const BimModule = lazy(() =>
  import('./components/bim/BimModule').then((m) => ({
    default: m.BimModule,
  }))
);
const TakeoffModule = lazy(() =>
  import('./components/takeoff/TakeoffModule').then((m) => ({
    default: m.TakeoffModule,
  }))
);
const GisPlotExplorer = lazy(() =>
  import('./components/gis/GisPlotExplorer').then((m) => ({
    default: m.GisPlotExplorer,
  }))
);
const ReportsCenterModule = lazy(() =>
  import('./components/reports/ReportsCenterModule').then((m) => ({
    default: m.ReportsCenterModule,
  }))
);
const StructuralWorkspace = lazy(() =>
  import('./components/structural/StructuralWorkspace').then((m) => ({
    default: m.StructuralWorkspace,
  }))
);
const DigitalTwinStage3D = lazy(() =>
  import('./components/bim/DigitalTwinStage3D').then((m) => ({
    default: m.DigitalTwinStage3D,
  }))
);

function ModuleLoadingFallback({ lang = 'ar' }: { lang?: Language }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center py-8 gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        <BunyanLogo size="xl" lang={lang} />
        <div className="text-xs font-medium text-[var(--text-secondary)]">
          {lang === 'ar' ? 'جاري تحميل الوحدة الهندسية...' : 'Loading engineering workspace...'}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-24 w-full" />
      </div>
      <SkeletonBlock className="h-64 w-full" />
    </div>
  );
}

function BunyanWorkspace() {
  const [lang, setLang] = useState<Language>('ar');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [activeModule, setActiveModule] = useState<ActiveModule>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('bunyan_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Operational state starts empty until verified Cloud Firestore server snapshot hydrates (Fail-Closed)
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [transactions, setTransactions] = useState<GovernmentTransaction[]>([]);
  const [rateLibrary, setRateLibrary] = useState<RateLibraryItem[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);

  const [currentRole, setCurrentRole] = useState<Role>('admin');
  const [biometricRegistered, setBiometricRegistered] = useState<boolean>(true);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [firestoreConnected, setFirestoreConnected] = useState<boolean>(false);
  const [cloudWorkspaceHydrated, setCloudWorkspaceHydrated] = useState<boolean>(false);
  const [reachabilityReport, setReachabilityReport] = useState<CloudReachabilityReport | null>(null);
  const [cloudBlockingError, setCloudBlockingError] = useState<string | null>(null);
  const [probingCloud, setProbingCloud] = useState<boolean>(false);
  const [syncState, setSyncState] = useState<CloudSyncState>(() => getCloudSyncState());
  const [highlightedMeasurementId, setHighlightedMeasurementId] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [reportsStorage, setReportsStorage] = useState<ReportsWorkspaceStorage>(() =>
    createDefaultReportsWorkspace()
  );
  const { pushToast } = useToast();
  const perms = useMemo(() => getRolePermissions(currentRole), [currentRole]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 650);
    return () => clearTimeout(timer);
  }, []);

  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const companyRef = useRef(companyProfile);
  companyRef.current = companyProfile;
  const ratesRef = useRef(rateLibrary);
  ratesRef.current = rateLibrary;
  const txRef = useRef(transactions);
  txRef.current = transactions;
  const reportsRef = useRef(reportsStorage);
  reportsRef.current = reportsStorage;
  const langRef = useRef(lang);
  langRef.current = lang;

  const cloudUid = firebaseUser?.emailVerified ? firebaseUser.uid : null;
  const cloudUidRef = useRef<string | null>(cloudUid);
  cloudUidRef.current = cloudUid;
  const prevAuthUidRef = useRef<string | null | undefined>(undefined);

  const clearOperationalWorkspace = useCallback(() => {
    setProjects([]);
    setActiveProjectId('');
    setTransactions([]);
    setRateLibrary([]);
    setCompanyProfile(DEFAULT_COMPANY_PROFILE);
    setReportsStorage(createDefaultReportsWorkspace());
    setHighlightedMeasurementId(null);
    setCloudWorkspaceHydrated(false);
  }, []);

  const verifyCloudPath = useCallback(async (): Promise<CloudReachabilityReport> => {
    setProbingCloud(true);
    try {
      const report = await probeFirestoreServerReachability();
      setReachabilityReport(report);
      setFirestoreConnected(report.reachable);
      setServerReachableStatus(report.reachable, report.error);
      if (report.reachable) {
        setCloudBlockingError(null);
      } else {
        setCloudBlockingError(report.error || 'Firestore server is unreachable');
      }
      return report;
    } finally {
      setProbingCloud(false);
    }
  }, []);

  const handleAttachManifestProject = (withManifests: Project) => {
    setProjects((prev) => prev.map((p) => (p.id === withManifests.id ? withManifests : p)));
  };

  // Sync HTML dir/lang and Tailwind dark class
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem('bunyan_sidebar_collapsed', String(sidebarCollapsed));
    } catch {
      // Ignore storage quota errors (UI layout preference only)
    }
  }, [sidebarCollapsed]);

  // Global Cmd/Ctrl + K quick command search shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Subscribe to Fail-Closed cloud sync state + live browser online/offline verification
  useEffect(() => {
    const unsubSync = subscribeCloudSyncState(setSyncState);

    const handleOnline = () => {
      setNetworkOnlineStatus(true);
      void verifyCloudPath();
    };
    const handleOffline = () => {
      setNetworkOnlineStatus(false);
      setFirestoreConnected(false);
      setCloudWorkspaceHydrated(false);
      setCloudBlockingError(
        langRef.current === 'ar'
          ? 'انقطع الاتصال بالشبكة — تم إغلاق الوصول للبيانات أمنياً (Fail-Closed).'
          : 'Network disconnected — Fail-Closed cloud gate active.'
      );
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubSync();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [verifyCloudPath]);

  // Startup Firestore connectivity probe + Per-User Verified Google Auth listener (Fail-Closed)
  useEffect(() => {
    void verifyCloudPath();

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setAuthReady(true);
      const nextUid = user && user.emailVerified ? user.uid : null;
      const prevUid = prevAuthUidRef.current;
      const isAccountSwitch = prevUid !== undefined && prevUid !== nextUid;
      prevAuthUidRef.current = nextUid;

      setFirebaseUser(user);
      const verified = Boolean(nextUid);

      if (isAccountSwitch) {
        resetSyncQueueForAccountSwitch(verified);
        clearOperationalWorkspace();
      } else {
        setAuthSyncStatus(verified);
      }

      if (!verified || !nextUid || !user) {
        clearOperationalWorkspace();
        void verifyCloudPath();
        return;
      }

      const probe = await verifyCloudPath();
      if (!probe.reachable) {
        return;
      }

      try {
        await upsertUserProfile({
          uid: nextUid,
          email: user.email || '',
          displayName: user.displayName || 'Organization Engineer',
          role: currentRole,
          companyName: companyRef.current.nameEn,
          licenseNumber: companyRef.current.licenseNumber,
          biometricRegistered,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setCloudBlockingError(msg);
        pushToast(msg, 'error');
      }
    });

    return () => unsubAuth();
  }, [clearOperationalWorkspace, verifyCloudPath]);

  // Live Firestore real-time onSnapshot listeners across all 5 per-user collections (Fail-Closed)
  useEffect(() => {
    if (!cloudUid || !firestoreConnected || !syncState.isOnline) {
      return;
    }

    let unsubRealtime: (() => void) | null = null;
    try {
      unsubRealtime = subscribeWorkspaceRealtime({
        ownerId: cloudUid,
        onRemoteProjects: (cloudProjects, meta) => {
          const cleanedRemote = purgeSeededDemoDocuments(cloudProjects);
          setProjects((prev) => {
            const merged = mergeRemoteProjectsWithLocal(prev, cleanedRemote.projects);
            return merged;
          });
          setActiveProjectId((curr) =>
            curr && cleanedRemote.projects.some((p) => p.id === curr)
              ? curr
              : cleanedRemote.projects[0]?.id || ''
          );
          if (!meta.fromCache) {
            setCloudWorkspaceHydrated(true);
            setCloudBlockingError(null);
          }
          if (cleanedRemote.removedCount > 0) {
            for (const proj of cleanedRemote.projects) {
              const orig = cloudProjects.find((c) => c.id === proj.id);
              if (orig && (orig.documents?.length || 0) !== proj.documents.length) {
                void commitProjectToCloudFailClosed({
                  project: proj,
                  ownerId: cloudUid,
                  onManifestAttached: handleAttachManifestProject,
                }).catch((err) => {
                  console.error('Failed purging legacy demo doc metadata in cloud:', err);
                });
              }
            }
          }
        },
        onRemoteCompanyProfile: (remoteCompany, meta) => {
          setCompanyProfile(remoteCompany);
          if (!meta.fromCache) {
            setCloudWorkspaceHydrated(true);
          }
        },
        onRemoteRateLibrary: (cloudRates) => {
          setRateLibrary(cloudRates);
        },
        onRemoteTransactions: (cloudTxs) => {
          setTransactions(cloudTxs);
        },
        onRemoteReportsWorkspace: (remoteReports) => {
          setReportsStorage(remoteReports);
        },
        onCloudBootstrapNeeded: () => {
          // Verified first-time user with an empty Cloud Firestore workspace:
          // atomically seed initial UAE workspace records directly into Firestore.
          const seedReports = createDefaultReportsWorkspace();
          void syncNowAll({
            ownerId: cloudUid,
            projects: INITIAL_PROJECTS,
            companyProfile: DEFAULT_COMPANY_PROFILE,
            rateLibrary: INITIAL_RATE_LIBRARY,
            transactions: INITIAL_TRANSACTIONS,
            reportsWorkspace: seedReports,
            onManifestAttached: handleAttachManifestProject,
          })
            .then(() => {
              setProjects(INITIAL_PROJECTS);
              setActiveProjectId(INITIAL_PROJECTS[0]?.id || '');
              setCompanyProfile(DEFAULT_COMPANY_PROFILE);
              setRateLibrary(INITIAL_RATE_LIBRARY);
              setTransactions(INITIAL_TRANSACTIONS);
              setReportsStorage(seedReports);
              setCloudWorkspaceHydrated(true);
              setCloudBlockingError(null);
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              setCloudBlockingError(msg);
              setCloudWorkspaceHydrated(false);
              pushToast(msg, 'error');
            });
        },
        onFatalSyncError: (err) => {
          setCloudBlockingError(err.message);
          setFirestoreConnected(false);
          setCloudWorkspaceHydrated(false);
          pushToast(
            langRef.current === 'ar'
              ? `فقدان المزامنة السحابية (Fail-Closed): ${err.message}`
              : `Realtime cloud listener failed (Fail-Closed): ${err.message}`,
            'error'
          );
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCloudBlockingError(msg);
      setFirestoreConnected(false);
    }

    return () => {
      unsubRealtime?.();
    };
  }, [cloudUid, firestoreConnected, syncState.isOnline, pushToast]);

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];
  const cloudAccessReady = Boolean(
    cloudUid &&
      firestoreConnected &&
      syncState.isOnline &&
      syncState.isServerReachable !== false &&
      cloudWorkspaceHydrated
  );

  const workspaceAlerts = useMemo(
    () => deriveWorkspaceAlerts({ projects, transactions, syncState, lang }),
    [projects, transactions, syncState, lang]
  );

  const actorDisplayName =
    firebaseUser?.displayName ||
    firebaseUser?.email ||
    (currentRole === 'admin'
      ? lang === 'ar' ? 'المدير التنفيذي' : 'Executive Admin'
      : currentRole === 'engineer'
      ? lang === 'ar' ? 'المهندس المقيم' : 'Project Engineer'
      : lang === 'ar' ? 'المحاسب المالي' : 'Project Accountant');

  const requireVerifiedCloudWrite = (operation: OperationType, path: string): string | null => {
    try {
      if (!firestoreConnected || syncState.isServerReachable === false) {
        throw new Error(
          langRef.current === 'ar'
            ? 'المسار السحابي مغلق أمنياً (Fail-Closed): تعذر التحقق من اتصال خادم Firestore.'
            : 'Fail-Closed: Firestore server connectivity is unverified.'
        );
      }
      return assertVerifiedCloudPath(operation, path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCloudBlockingError(msg);
      pushToast(msg, 'error');
      return null;
    }
  };

  const handleSaveReportsStorage = (
    updater: (prev: ReportsWorkspaceStorage) => ReportsWorkspaceStorage
  ) => {
    const activeUid = requireVerifiedCloudWrite(
      OperationType.WRITE,
      `report_workspaces/${cloudUidRef.current || 'unknown'}`
    );
    if (!activeUid) return;

    const prevSnapshot = reportsRef.current;
    const next = updater(prevSnapshot);
    setReportsStorage(next);

    void commitReportsWorkspaceFailClosed(next, activeUid).catch((err) => {
      setReportsStorage(prevSnapshot);
      const msg = err instanceof Error ? err.message : String(err);
      pushToast(
        langRef.current === 'ar'
          ? `فشل حفظ إعدادات التقارير في السحابة وتم التراجع: ${msg}`
          : `Cloud reports commit failed (rolled back): ${msg}`,
        'error'
      );
    });
  };

  const handleRecordAuditLog = (entry: Omit<PrintAuditLogEntry, 'id' | 'timestamp'>) => {
    const fullEntry: PrintAuditLogEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
    };
    handleSaveReportsStorage((prev) => appendPrintAuditLogInState(prev, fullEntry));
  };

  const handleSaveProject = (updated: Project) => {
    const activeUid = requireVerifiedCloudWrite(OperationType.WRITE, `projects/${updated.id}`);
    if (!activeUid) return;

    const prevProjects = projectsRef.current;
    const prevActiveId = activeProjectId;
    const stamped: Project = {
      ...updated,
      updatedAt: new Date().toISOString(),
    };
    const isNew = !prevProjects.some((p) => p.id === stamped.id);
    const nextProjects = isNew
      ? [stamped, ...prevProjects]
      : prevProjects.map((p) => (p.id === stamped.id ? stamped : p));

    setProjects(nextProjects);
    if (isNew) {
      setActiveProjectId(stamped.id);
      confetti({ particleCount: 55, spread: 60, origin: { y: 0.7 } });
    }

    void commitProjectToCloudFailClosed({
      project: stamped,
      ownerId: activeUid,
      onManifestAttached: handleAttachManifestProject,
    }).catch((err) => {
      setProjects(prevProjects);
      setActiveProjectId(prevActiveId);
      const msg = err instanceof Error ? err.message : String(err);
      pushToast(
        langRef.current === 'ar'
          ? `فشل حفظ المشروع سحابياً وتم التراجع لحماية تطابق البيانات: ${msg}`
          : `Cloud project commit failed (rolled back): ${msg}`,
        'error'
      );
    });
  };

  const handleEngineeringProjectUpdate = (updated: Project) => {
    if (!perms.canEditEngineering) {
      pushToast(
        lang === 'ar'
          ? 'تعديل البيانات الهندسية متاح للمدير والمهندس فقط.'
          : 'Engineering edits require Admin or Engineer role.',
        'error'
      );
      return;
    }
    handleSaveProject(updated);
  };

  const handleFinancialProjectUpdate = (updated: Project) => {
    if (!perms.canEditFinancials) {
      pushToast(
        lang === 'ar'
          ? 'تعديل الدفعات المالية متاح للمدير والمحاسب فقط.'
          : 'Financial payment updates require Admin or Accountant role.',
        'error'
      );
      return;
    }
    handleSaveProject(updated);
  };

  const handleDeleteProject = async (id: string) => {
    if (!perms.canDeleteProjects) {
      pushToast(
        lang === 'ar' ? 'حذف المشاريع متاح لدور المدير (Admin) فقط.' : 'Project deletion requires Admin role.',
        'error'
      );
      return;
    }
    const activeUid = requireVerifiedCloudWrite(OperationType.DELETE, `projects/${id}`);
    if (!activeUid) return;

    const target = projectsRef.current.find((p) => p.id === id);
    const manifestIds = target
      ? [
          ...(target.documents || []).map((d) => d.manifestId).filter((x): x is string => Boolean(x)),
          ...(target.takeoffSheets || []).map((s) => s.pdfManifestId).filter((x): x is string => Boolean(x)),
        ]
      : [];

    const orphanedTx = txRef.current.filter((t) => t.projectId === id);

    try {
      await deleteProjectFromCloud(id, manifestIds);
      for (const tx of orphanedTx) {
        await deleteTransactionFromCloud(tx.id);
      }

      const next = projectsRef.current.filter((p) => p.id !== id);
      const remainingTx = txRef.current.filter((t) => t.projectId !== id);
      setProjects(next);
      setTransactions(remainingTx);
      setHighlightedMeasurementId(null);
      if (activeProjectId === id) {
        setActiveProjectId(next[0]?.id || '');
      }
      pushToast(
        lang === 'ar' ? 'تم حذف المشروع وملفاته نهائياً من Cloud Firestore' : 'Project deleted from Firestore',
        'success'
      );
    } catch (err) {
      console.error('Cloud project deletion failed:', err);
      pushToast(
        err instanceof Error
          ? err.message
          : lang === 'ar'
          ? 'فشل حذف المشروع من السحابة (Fail-Closed).'
          : 'Cloud deletion failed (Fail-Closed).',
        'error'
      );
    }
  };

  const handleSaveTransaction = async (tx: GovernmentTransaction) => {
    if (!perms.canManageGovernment) {
      pushToast(
        lang === 'ar'
          ? 'إدارة المعاملات البلدية متاح للمدير والمهندس فقط.'
          : 'Municipal clearances require Admin or Engineer role.',
        'error'
      );
      return;
    }
    const activeUid = requireVerifiedCloudWrite(
      OperationType.WRITE,
      `government_transactions/${tx.id}`
    );
    if (!activeUid) return;

    const prevTx = txRef.current;
    const exists = prevTx.some((item) => item.id === tx.id);
    const next = exists
      ? prevTx.map((item) => (item.id === tx.id ? tx : item))
      : [tx, ...prevTx];
    setTransactions(next);

    try {
      const parentProject = projectsRef.current.find((p) => p.id === tx.projectId);
      if (parentProject) {
        await ensureProjectExistsInCloud(parentProject, activeUid);
      }
      await saveTransactionToCloud(tx, activeUid);
    } catch (err) {
      setTransactions(prevTx);
      console.error('Cloud transaction save failed:', err);
      pushToast(
        err instanceof Error
          ? err.message
          : lang === 'ar'
          ? 'فشلت مزامنة المعاملة سحابياً وتم التراجع.'
          : 'Cloud transaction commit failed (rolled back).',
        'error'
      );
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!perms.canManageGovernment) {
      pushToast(
        lang === 'ar'
          ? 'حذف المعاملات متاح للمدير والمهندس فقط.'
          : 'Deleting clearances requires Admin or Engineer role.',
        'error'
      );
      return;
    }
    const activeUid = requireVerifiedCloudWrite(
      OperationType.DELETE,
      `government_transactions/${id}`
    );
    if (!activeUid) return;

    try {
      await deleteTransactionFromCloud(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error('Cloud transaction deletion failed:', err);
      pushToast(
        err instanceof Error
          ? err.message
          : lang === 'ar'
          ? 'تعذر حذف المعاملة من Cloud Firestore.'
          : 'Failed deleting clearance from Cloud Firestore.',
        'error'
      );
    }
  };

  const handleUpdateRate = async (item: RateLibraryItem) => {
    if (!perms.canEditFinancials && !perms.canEditEngineering) return;
    const activeUid = requireVerifiedCloudWrite(OperationType.WRITE, `rate_library/${item.id}`);
    if (!activeUid) return;

    const prevRates = ratesRef.current;
    setRateLibrary(prevRates.map((r) => (r.id === item.id ? item : r)));
    try {
      await saveRateItemToCloud(item, activeUid);
    } catch (err) {
      setRateLibrary(prevRates);
      console.error('Cloud rate update failed:', err);
      pushToast(
        err instanceof Error
          ? err.message
          : lang === 'ar'
          ? 'تعذرت مزامنة فئة التسعير سحابياً وتم التراجع.'
          : 'Cloud rate commit failed (rolled back).',
        'error'
      );
    }
  };

  const handleAddRate = async (item: RateLibraryItem) => {
    if (!perms.canEditFinancials && !perms.canEditEngineering) return;
    const activeUid = requireVerifiedCloudWrite(OperationType.CREATE, `rate_library/${item.id}`);
    if (!activeUid) return;

    const prevRates = ratesRef.current;
    setRateLibrary([...prevRates, item]);
    try {
      await saveRateItemToCloud(item, activeUid);
    } catch (err) {
      setRateLibrary(prevRates);
      console.error('Cloud rate creation failed:', err);
      pushToast(
        err instanceof Error
          ? err.message
          : lang === 'ar'
          ? 'تعذر إضافة فئة التسعير في Firestore وتم التراجع.'
          : 'Cloud rate creation failed (rolled back).',
        'error'
      );
    }
  };

  const handleUpdateCompany = (profile: CompanyProfile) => {
    if (!perms.canManageCompanySettings) {
      pushToast(
        lang === 'ar' ? 'تعديل إعدادات الشركة متاح لدور المدير فقط.' : 'Company settings require Admin role.',
        'error'
      );
      return;
    }
    const activeUid = requireVerifiedCloudWrite(
      OperationType.WRITE,
      `company_profiles/${cloudUidRef.current || 'unknown'}`
    );
    if (!activeUid) return;

    const prevCompany = companyRef.current;
    setCompanyProfile(profile);
    void commitCompanyProfileFailClosed(profile, activeUid).catch((err) => {
      setCompanyProfile(prevCompany);
      const msg = err instanceof Error ? err.message : String(err);
      pushToast(
        langRef.current === 'ar'
          ? `فشل حفظ ملف المنشأة سحابياً وتم التراجع: ${msg}`
          : `Company profile cloud commit failed (rolled back): ${msg}`,
        'error'
      );
    });
  };

  const handleSignInGoogle = async () => {
    try {
      const user = await signInWithGooglePopup();
      if (user) {
        if (!user.emailVerified) {
          pushToast(
            langRef.current === 'ar'
              ? 'حساب Google غير موثق البريد الإلكتروني — لا يمكن فتح المسار السحابي.'
              : 'Google account email is not verified — Fail-Closed gate remains locked.',
            'error'
          );
          return;
        }
        pushToast(
          langRef.current === 'ar'
            ? `مرحباً ${user.displayName || user.email} — جاري التحقق من المسار السحابي ومزامنة Cloud Firestore`
            : `Welcome ${user.displayName || user.email} — verifying Cloud Firestore path`,
          'success'
        );
      }
    } catch (err) {
      pushToast(formatFirebaseAuthError(err, langRef.current), 'error');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutFirebase();
      clearOperationalWorkspace();
      pushToast(
        langRef.current === 'ar'
          ? 'تم تسجيل الخروج وإغلاق الجلسة السحابية بأمان.'
          : 'Signed out and locked cloud workspace (Fail-Closed).',
        'info'
      );
    } catch (err) {
      pushToast(formatFirebaseAuthError(err, langRef.current), 'error');
    }
  };

  const handleSyncNow = async () => {
    let targetUid = cloudUid;
    if (!targetUid) {
      try {
        const user = await signInWithGooglePopup();
        if (user?.emailVerified) {
          targetUid = user.uid;
        }
      } catch (err) {
        console.warn('Google sign-in for cloud sync skipped:', err);
        pushToast(formatFirebaseAuthError(err, lang), 'error');
        return;
      }
    }
    if (!targetUid) return;

    const probe = await verifyCloudPath();
    if (!probe.reachable) {
      pushToast(
        lang === 'ar'
          ? 'تعذر الاتصال بخادم Firestore (Fail-Closed).'
          : 'Firestore server unreachable (Fail-Closed).',
        'error'
      );
      return;
    }

    try {
      await syncNowAll({
        ownerId: targetUid,
        projects: projectsRef.current,
        companyProfile: companyRef.current,
        rateLibrary: ratesRef.current,
        transactions: txRef.current,
        reportsWorkspace: reportsRef.current,
        onManifestAttached: handleAttachManifestProject,
      });
      setCloudWorkspaceHydrated(true);
      setCloudBlockingError(null);
      confetti({ particleCount: 65, spread: 70, origin: { y: 0.65 } });
      pushToast(
        lang === 'ar' ? 'تمت المزامنة السحابية الفورية مع Firestore' : 'Workspace synced to Firestore',
        'success'
      );
    } catch (err) {
      console.error('Manual cloud sync failed:', err);
      pushToast(
        err instanceof Error
          ? err.message
          : lang === 'ar'
          ? 'فشلت المزامنة السحابية (Fail-Closed).'
          : 'Cloud sync failed (Fail-Closed).',
        'error'
      );
    }
  };

  const backupData: BackupData = {
    version: '2026.1',
    exportedAt: new Date().toISOString(),
    companyProfile,
    projects,
    transactions,
    rateLibrary,
  };

  const handleImportBackup = (data: BackupData, mode: 'merge' | 'replace' = 'replace') => {
    if (!perms.canManageProjects) {
      pushToast(
        lang === 'ar'
          ? 'صلاحية الدور الحالي لا تسمح باستيراد النسخ الاحتياطية.'
          : 'Current role cannot restore backups.',
        'error'
      );
      return;
    }
    const activeUid = requireVerifiedCloudWrite(OperationType.WRITE, 'workspace/backup_import');
    if (!activeUid) return;

    const prevProjects = projectsRef.current;
    const prevTx = txRef.current;
    const prevRates = ratesRef.current;
    const prevCompany = companyRef.current;
    const prevActiveId = activeProjectId;

    const nowIso = new Date().toISOString();
    const nextProjects = mergeImportedBackupProjects(
      prevProjects,
      data.projects,
      mode,
      nowIso
    );

    const mergeById = <T extends { id: string }>(current: T[], incoming: T[]): T[] => {
      if (mode === 'replace') {
        return incoming.length > 0 ? incoming : current;
      }
      const map = new Map<string, T>(current.map((item) => [item.id, item]));
      for (const item of incoming) {
        map.set(item.id, item);
      }
      return Array.from(map.values());
    };

    const nextTransactions = mergeById(
      prevTx,
      Array.isArray(data.transactions) ? data.transactions : []
    );
    const nextRates = mergeById(
      prevRates,
      Array.isArray(data.rateLibrary) ? data.rateLibrary : []
    );
    const nextCompany = data.companyProfile || prevCompany;

    setProjects(nextProjects);
    const keepCurrentActive =
      mode === 'merge' && nextProjects.some((p) => p.id === activeProjectId);
    if (!keepCurrentActive && nextProjects[0]) {
      setActiveProjectId(nextProjects[0].id);
    }
    setTransactions(nextTransactions);
    setRateLibrary(nextRates);
    if (data.companyProfile) {
      setCompanyProfile(nextCompany);
    }

    const syncTargets =
      mode === 'replace'
        ? nextProjects
        : data.projects.map((p) => ({ ...p, updatedAt: nowIso }));

    void syncNowAll({
      ownerId: activeUid,
      projects: syncTargets,
      companyProfile: nextCompany,
      rateLibrary: nextRates,
      transactions: nextTransactions,
      reportsWorkspace: reportsRef.current,
      onManifestAttached: handleAttachManifestProject,
    })
      .then(() => {
        pushToast(
          langRef.current === 'ar'
            ? 'تم استيراد النسخة الاحتياطية ومزامنتها بالكامل مع Cloud Firestore.'
            : 'Backup restored and committed atomically to Cloud Firestore.',
          'success'
        );
      })
      .catch((err) => {
        setProjects(prevProjects);
        setActiveProjectId(prevActiveId);
        setTransactions(prevTx);
        setRateLibrary(prevRates);
        setCompanyProfile(prevCompany);
        const msg = err instanceof Error ? err.message : String(err);
        pushToast(
          langRef.current === 'ar'
            ? `فشل اعتماد النسخة الاحتياطية في السحابة وتم التراجع: ${msg}`
            : `Cloud backup restore failed (rolled back): ${msg}`,
          'error'
        );
      });
  };

  const renderFailClosedGate = () => {
    const isAr = lang === 'ar';
    const needsAuth = !cloudUid;
    const isDisconnected = !syncState.isOnline || !firestoreConnected || syncState.isServerReachable === false;
    const isHydrating = Boolean(cloudUid && !isDisconnected && !cloudWorkspaceHydrated);

    return (
      <div className="max-w-5xl mx-auto py-6 lg:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <Card padded className="lg:col-span-7 flex flex-col justify-between space-y-6 border-[var(--border-hairline)]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl border border-rose-500/25 bg-rose-500/10 flex items-center justify-center shrink-0">
                    {isHydrating ? (
                      <Loader2 className="w-6 h-6 text-[var(--accent-blue)] animate-spin" />
                    ) : isDisconnected ? (
                      <CloudOff className="w-6 h-6 text-rose-500 dark:text-rose-400" />
                    ) : (
                      <ShieldAlert className="w-6 h-6 text-amber-500" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <h1 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                      {isHydrating
                        ? isAr
                          ? 'جاري مزامنة مساحة العمل الحية من Cloud Firestore...'
                          : 'Hydrating Authoritative Cloud Firestore Workspace...'
                        : needsAuth
                        ? isAr
                          ? 'بوابة الأمان السحابية (Fail-Closed) — يتطلب توثيق Google'
                          : 'Fail-Closed Cloud Security Gate — Verified Google Sign-In Required'
                        : isAr
                        ? 'بوابة الأمان السحابية (Fail-Closed) — تعذر الوصول لخادم Firestore'
                        : 'Fail-Closed Cloud Gate — Firestore Server Unreachable'}
                    </h1>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      {isAr
                        ? 'تطبيق المنظمة للتوأم الرقمي والهندسة 5D BIM يعمل حصرياً عبر مسار سحابي إلزامي ومُتحقق منه بدون أي تخزين محلي بديل لمنع تضارب النسخ.'
                        : 'Organization 3D Digital Twin & 5D BIM operates strictly on a verified Fail-Closed Cloud Firestore path with zero offline local-storage fallback.'}
                    </p>
                  </div>
                </div>

                <StatusIndicator
                  tone={isHydrating ? 'info' : 'danger'}
                  label={
                    isHydrating
                      ? isAr ? 'جاري التحقق...' : 'Verifying...'
                      : isAr ? 'مغلق أمنياً (Fail-Closed)' : 'Locked (Fail-Closed)'
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-2">
                  <span className="text-[var(--text-muted)]">
                    {isAr ? 'مصادقة Google الموثقة' : 'Verified Google Auth'}
                  </span>
                  <StatusIndicator
                    tone={cloudUid ? 'success' : 'danger'}
                    label={
                      cloudUid
                        ? firebaseUser?.email || (isAr ? 'موثق' : 'Verified')
                        : !authReady
                        ? isAr ? 'جاري الفحص...' : 'Checking...'
                        : isAr ? 'غير موثق' : 'Required'
                    }
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-2">
                  <span className="text-[var(--text-muted)]">
                    {isAr ? 'اتصال خادم Firestore الحي' : 'Live Firestore Server'}
                  </span>
                  <StatusIndicator
                    tone={firestoreConnected && syncState.isOnline ? 'success' : 'danger'}
                    label={
                      firestoreConnected && syncState.isOnline
                        ? `${isAr ? 'متصل' : 'Reachable'}${
                            reachabilityReport ? ` (${reachabilityReport.latencyMs}ms)` : ''
                          }`
                        : isAr
                        ? 'غير متصل'
                        : 'Unreachable'
                    }
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-2">
                  <span className="text-[var(--text-muted)]">
                    {isAr ? 'قاعدة البيانات' : 'Database ID'}
                  </span>
                  <span dir="ltr" className="font-mono text-[11px] text-[var(--accent-cyan)] truncate">
                    {FIRESTORE_DATABASE_ID}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-2">
                  <span className="text-[var(--text-muted)]">
                    {isAr ? 'حماية App Check' : 'Firebase App Check'}
                  </span>
                  <span
                    className={`font-semibold ${
                      isAppCheckConfigured
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {isAppCheckConfigured
                      ? isAr
                        ? 'مفعل (reCAPTCHA v3)'
                        : 'Active (reCAPTCHA v3)'
                      : isAr
                      ? 'بانتظار مفتاح الموقع'
                      : 'Site Key Unconfigured'}
                  </span>
                </div>
              </div>

              {cloudBlockingError && (
                <div className="p-3.5 rounded-xl border border-rose-500/35 bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400 break-all">
                  {cloudBlockingError}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[var(--border-hairline)]">
              {needsAuth && (
                <Button
                  variant="cyan"
                  icon={<LogIn className="w-4 h-4" />}
                  onClick={() => void handleSignInGoogle()}
                >
                  {isAr ? 'تسجيل الدخول بحساب Google الموثق' : 'Sign In with Verified Google Account'}
                </Button>
              )}

              <Button
                variant="outline"
                loading={probingCloud}
                icon={<RefreshCw className="w-4 h-4" />}
                onClick={() => void verifyCloudPath()}
              >
                {isAr ? 'إعادة التحقق من المسار السحابي' : 'Retry Cloud Verification'}
              </Button>

              {cloudUid && firestoreConnected && syncState.isOnline && (
                <Button
                  variant="primary"
                  icon={<ShieldCheck className="w-4 h-4" />}
                  onClick={() => void handleSyncNow()}
                >
                  {isAr ? 'مزامنة وفتح مساحة العمل' : 'Verify & Open Cloud Workspace'}
                </Button>
              )}
            </div>
          </Card>

          <Card className="lg:col-span-5 p-4 flex flex-col justify-between gap-3 border-[var(--border-hairline)]">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div dir="ltr" className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-[var(--accent-blue)] font-semibold">
                  GLOBAL 3D AEC ENGINE
                </div>
                <div className="text-sm font-bold text-[var(--text-primary)]">
                  {isAr ? 'بيئة التوأم الرقمي والهندسة 5D BIM' : 'Interactive 3D Digital Twin Stage'}
                </div>
              </div>
              <BunyanLogo size="sm" iconOnly lang={lang} />
            </div>

            <Suspense fallback={<SkeletonBlock className="h-[300px] lg:h-[320px] w-full rounded-xl" />}>
              <DigitalTwinStage3D
                lang={lang}
                theme={theme}
                heightClass="h-[300px] lg:h-[320px]"
                compact
              />
            </Suspense>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono text-[var(--text-muted)] pt-1 border-t border-[var(--border-hairline)]">
              <span>IFC / DXF · 5D BOQ · GIS</span>
              <span>ISO 19650 · SHARJAH DTPS</span>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg-canvas)] bunyan-holo-grid text-[var(--text-primary)]">
      {showSplash && (
        <div
          onClick={() => setShowSplash(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[#F3F6FA]/96 dark:bg-[#090E1A]/96 backdrop-blur-md transition-opacity duration-300 cursor-pointer no-print"
          role="status"
          aria-label={lang === 'ar' ? 'شاشة الترحيب بالمنظمة' : 'Organization Splash Screen'}
        >
          <BunyanLogo size="2xl" iconOnly lang={lang} className="shadow-[var(--spatial-card-shadow)] rounded-3xl" />
          <div className="text-center space-y-1.5">
            <div className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              {lang === 'ar' ? 'المنظمة · التوأم الرقمي الهندسي' : 'ORGANIZATION · 3D DIGITAL TWIN'}
            </div>
            <div dir="ltr" className="text-[11px] font-mono uppercase tracking-[0.16em] text-[var(--accent-blue)]">
              5D BIM · OPENBIM IFC · GIS · ISO 19650
            </div>
          </div>
          <div className="w-44 h-1 rounded-full bg-[var(--bg-surface-subtle)] overflow-hidden border border-[var(--border-hairline)]">
            <div className="h-full w-3/4 bg-gradient-to-r from-[#2563EB] via-[#0284C7] to-[#B4863C] dark:from-[#38BDF8] dark:via-[#3B82F6] dark:to-[#D6A64F] rounded-full" />
          </div>
        </div>
      )}

      <Sidebar
        activeModule={activeModule}
        onSelectModule={setActiveModule}
        lang={lang}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        companyName={lang === 'ar' ? companyProfile.nameAr : companyProfile.nameEn}
        projectsCount={projects.length}
        alertsCount={workspaceAlerts.length}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          activeModule={activeModule}
          lang={lang}
          onToggleLang={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          projects={projects}
          activeProjectId={activeProject?.id || ''}
          onSelectProject={setActiveProjectId}
          currentRole={currentRole}
          firebaseUser={firebaseUser}
          userEmail={firebaseUser?.email}
          syncState={syncState}
          onSyncNow={() => {
            void handleSyncNow();
          }}
          onSignInGoogle={handleSignInGoogle}
          onSignOut={handleSignOut}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
          alertsCount={workspaceAlerts.length}
          onNavigateModule={setActiveModule}
          onOpenExport={() => setExportModalOpen(true)}
        />

        <main className="flex-1 p-4 lg:p-6 max-w-[1480px] w-full mx-auto">
          {!cloudAccessReady ? (
            renderFailClosedGate()
          ) : (
            <>
              {activeModule === 'dashboard' && activeProject && (
                <HolographicDashboard
                  projects={projects}
                  activeProject={activeProject}
                  company={companyProfile}
                  transactions={transactions}
                  lang={lang}
                  currentRole={currentRole}
                  syncState={syncState}
                  onNavigate={setActiveModule}
                  onSelectProject={setActiveProjectId}
                  onOpenNotifications={() => setNotificationsOpen(true)}
                  onOpenExport={() => setExportModalOpen(true)}
                />
              )}

              {activeModule === 'command' && activeProject && (
                <CommandCenter
                  projects={projects}
                  activeProject={activeProject}
                  company={companyProfile}
                  transactions={transactions}
                  lang={lang}
                  currentRole={currentRole}
                  userEmail={firebaseUser?.email}
                  syncState={syncState}
                  onSyncNow={() => {
                    void handleSyncNow();
                  }}
                  onNavigate={setActiveModule}
                  onSelectProject={setActiveProjectId}
                  onOpenSearch={() => setSearchOpen(true)}
                  onOpenNotifications={() => setNotificationsOpen(true)}
                />
              )}

              {activeModule === 'projects' && activeProject && (
                <Suspense fallback={<ModuleLoadingFallback lang={lang} />}>
                  <ProjectsModule
                    projects={projects}
                    activeProjectId={activeProject.id}
                    onSelectProject={setActiveProjectId}
                    onSaveProject={handleSaveProject}
                    onDeleteProject={handleDeleteProject}
                    lang={lang}
                    currentRole={currentRole}
                    backupData={backupData}
                    onImportBackup={handleImportBackup}
                    cloudUid={cloudUid}
                    onLogDocumentAction={(action, proj, rowCount, titleAr, titleEn) =>
                      handleRecordAuditLog({
                        reportNumber: `DOC-${proj.code}`,
                        reportTitleAr: titleAr,
                        reportTitleEn: titleEn,
                        definitionId: 'doc_vault_registry',
                        action,
                        actorName: actorDisplayName,
                        actorRole: currentRole,
                        templateId: 'official',
                        paperSize: reportsStorage.printSettings.paperSize,
                        orientation: reportsStorage.printSettings.orientation,
                        rowCount,
                      })
                    }
                  />
                </Suspense>
              )}

              {activeModule === 'financials' && activeProject && (
                <Suspense fallback={<ModuleLoadingFallback lang={lang} />}>
                  <FinancialSummaryModule
                    projects={projects}
                    activeProject={activeProject}
                    company={companyProfile}
                    lang={lang}
                    currentRole={currentRole}
                    onSelectProject={setActiveProjectId}
                    onSaveProject={handleFinancialProjectUpdate}
                  />
                </Suspense>
              )}

              {activeModule === 'documents' && activeProject && (
                <Suspense fallback={<ModuleLoadingFallback lang={lang} />}>
                  <DocumentsModule
                    projects={projects}
                    activeProject={activeProject}
                    company={companyProfile}
                    lang={lang}
                    currentRole={currentRole}
                    cloudUid={cloudUid}
                    onSelectProject={setActiveProjectId}
                    onSaveProject={handleEngineeringProjectUpdate}
                    onLogDocumentAction={(action, proj, rowCount, titleAr, titleEn) =>
                      handleRecordAuditLog({
                        reportNumber: `DOC-${proj.code}`,
                        reportTitleAr: titleAr,
                        reportTitleEn: titleEn,
                        definitionId: 'doc_vault_registry',
                        action,
                        actorName: actorDisplayName,
                        actorRole: currentRole,
                        templateId: 'official',
                        paperSize: reportsStorage.printSettings.paperSize,
                        orientation: reportsStorage.printSettings.orientation,
                        rowCount,
                      })
                    }
                  />
                </Suspense>
              )}

              {activeModule === 'reports' && activeProject && (
                <Suspense fallback={<ModuleLoadingFallback lang={lang} />}>
                  <ReportsCenterModule
                    projects={projects}
                    activeProject={activeProject}
                    transactions={transactions}
                    rateLibrary={rateLibrary}
                    company={companyProfile}
                    alerts={workspaceAlerts}
                    lang={lang}
                    currentRole={currentRole}
                    actorName={actorDisplayName}
                    storageState={reportsStorage}
                    onSaveStorage={handleSaveReportsStorage}
                    onRecordAuditLog={handleRecordAuditLog}
                  />
                </Suspense>
              )}

              {activeModule === 'studio' && activeProject && (
                <Suspense fallback={<ModuleLoadingFallback lang={lang} />}>
                  <BunyanBimTakeoffStudio
                    project={activeProject}
                    company={companyProfile}
                    rateLibrary={rateLibrary}
                    lang={lang}
                    cloudUid={cloudUid}
                    onUpdateProject={handleEngineeringProjectUpdate}
                  />
                </Suspense>
              )}

              {activeModule === 'bim' && activeProject && (
                <Suspense fallback={<ModuleLoadingFallback lang={lang} />}>
                  <BimModule
                    project={activeProject}
                    lang={lang}
                    onUpdateProject={handleEngineeringProjectUpdate}
                    onJumpToTakeoff={(measurementId) => {
                      setHighlightedMeasurementId(measurementId);
                      setActiveModule('takeoff');
                    }}
                  />
                </Suspense>
              )}

              {activeModule === 'takeoff' && activeProject && (
                <Suspense fallback={<ModuleLoadingFallback lang={lang} />}>
                  <TakeoffModule
                    project={activeProject}
                    company={companyProfile}
                    rateLibrary={rateLibrary}
                    lang={lang}
                    cloudUid={cloudUid}
                    highlightedMeasurementId={highlightedMeasurementId}
                    onUpdateProject={handleEngineeringProjectUpdate}
                    onUpdateRate={handleUpdateRate}
                    onAddRate={handleAddRate}
                  />
                </Suspense>
              )}

              {activeModule === 'gis' && activeProject && (
                <Suspense fallback={<ModuleLoadingFallback lang={lang} />}>
                  <GisPlotExplorer
                    project={activeProject}
                    projects={projects}
                    lang={lang}
                    canEdit={perms.canEditEngineering}
                    onUpdateProject={handleEngineeringProjectUpdate}
                    onSelectProject={setActiveProjectId}
                  />
                </Suspense>
              )}

              {activeModule === 'structural' && activeProject && (
                <Suspense fallback={<ModuleLoadingFallback lang={lang} />}>
                  <StructuralWorkspace
                    project={activeProject}
                    lang={lang}
                    currentRole={currentRole}
                    cloudUid={cloudUid}
                    actorName={actorDisplayName}
                  />
                </Suspense>
              )}

              {activeModule === 'government' && activeProject && (
                <Suspense fallback={<ModuleLoadingFallback lang={lang} />}>
                  <GovernmentPortal
                    transactions={transactions}
                    projects={projects}
                    activeProjectId={activeProject.id}
                    lang={lang}
                    currentRole={currentRole}
                    onSaveTransaction={handleSaveTransaction}
                    onDeleteTransaction={handleDeleteTransaction}
                  />
                </Suspense>
              )}

              {(activeModule === 'accounts' || activeModule === 'settings') && (
                <Suspense fallback={<ModuleLoadingFallback lang={lang} />}>
                  <SettingsAuthModule
                    lang={lang}
                    initialFocus={activeModule === 'accounts' ? 'accounts' : 'settings'}
                    currentRole={currentRole}
                    onChangeRole={setCurrentRole}
                    companyProfile={companyProfile}
                    onUpdateCompany={handleUpdateCompany}
                    biometricRegistered={biometricRegistered}
                    onToggleBiometric={setBiometricRegistered}
                    firebaseUser={firebaseUser}
                    firestoreConnected={firestoreConnected}
                    syncState={syncState}
                    onSignInGoogle={handleSignInGoogle}
                    onSignOut={handleSignOut}
                    onSyncSeedToCloud={handleSyncNow}
                    backupData={backupData}
                    onImportBackup={handleImportBackup}
                    cloudUid={cloudUid}
                    localWorkspace={{
                      projects,
                      companyProfile,
                      rateLibrary,
                      transactions,
                      reportsWorkspace: reportsStorage,
                    }}
                    onApplyPulledWorkspacePatch={(patch: Partial<WorkspaceSnapshotData>) => {
                      if (patch.projects) {
                        setProjects(patch.projects);
                        if (
                          patch.projects.length > 0 &&
                          !patch.projects.some((p) => p.id === activeProjectId)
                        ) {
                          setActiveProjectId(patch.projects[0].id);
                        }
                      }
                      if (patch.companyProfile) {
                        setCompanyProfile(patch.companyProfile);
                      }
                      if (patch.rateLibrary) {
                        setRateLibrary(patch.rateLibrary);
                      }
                      if (patch.transactions) {
                        setTransactions(patch.transactions);
                      }
                      if (patch.reportsWorkspace) {
                        setReportsStorage(patch.reportsWorkspace);
                      }
                    }}
                    onManifestAttached={handleAttachManifestProject}
                  />
                </Suspense>
              )}
            </>
          )}
        </main>
      </div>

      {searchOpen && cloudAccessReady && (
        <Suspense fallback={null}>
          <GlobalCommandModal
            isOpen={searchOpen}
            onClose={() => setSearchOpen(false)}
            lang={lang}
            projects={projects}
            transactions={transactions}
            onSelectProject={setActiveProjectId}
            onNavigate={setActiveModule}
          />
        </Suspense>
      )}

      {notificationsOpen && (
        <Suspense fallback={null}>
          <NotificationsDrawer
            isOpen={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
            alerts={workspaceAlerts}
            lang={lang}
            onNavigateAlert={(mod, projectId) => {
              if (projectId) setActiveProjectId(projectId);
              setActiveModule(mod);
            }}
          />
        </Suspense>
      )}

      {exportModalOpen && cloudAccessReady && activeProject && (
        <Suspense fallback={null}>
          <BunyanExportCenter
            isOpen={exportModalOpen}
            onClose={() => setExportModalOpen(false)}
            project={activeProject}
            company={companyProfile}
            lang={lang}
            onLogExport={(action, proj, rowCount) => {
              handleRecordAuditLog({
                reportNumber: `BOQ-${proj.code}`,
                reportTitleAr: `مقايسة 5D BOQ — ${proj.name}`,
                reportTitleEn: `5D BOQ Report — ${proj.nameEn}`,
                definitionId: 'boq_quick_export',
                action,
                actorName: actorDisplayName,
                actorRole: currentRole,
                templateId: 'official_boq',
                paperSize: reportsStorage.printSettings.paperSize,
                orientation: reportsStorage.printSettings.orientation,
                rowCount,
              });
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BunyanWorkspace />
      </ToastProvider>
    </ErrorBoundary>
  );
}
