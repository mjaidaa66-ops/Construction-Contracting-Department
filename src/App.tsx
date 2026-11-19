import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import confetti from 'canvas-confetti';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { CommandCenter } from './components/command/CommandCenter';
import { ProjectsModule } from './components/projects/ProjectsModule';
import { GovernmentPortal } from './components/government/GovernmentPortal';
import { SettingsAuthModule } from './components/settings/SettingsAuthModule';
import { Sidebar, type ActiveModule } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { GlobalCommandModal } from './components/layout/GlobalCommandModal';
import { NotificationsDrawer } from './components/layout/NotificationsDrawer';
import { BunyanExportCenter } from './components/export/BunyanExportCenter';
import { SkeletonBlock, ToastProvider, useToast } from './components/ui';
import { deriveWorkspaceAlerts } from './utils/workspaceAlerts';
import { getRolePermissions } from './utils/rbacPermissions';
import {
  DEFAULT_COMPANY_PROFILE,
  INITIAL_PROJECTS,
  INITIAL_RATE_LIBRARY,
  INITIAL_TRANSACTIONS,
} from './data/uaeSeedData';
import {
  auth,
  signInWithGooglePopup,
  signOutFirebase,
  testFirestoreConnection,
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
  cancelPendingProjectSync,
  flushPendingProjectSyncs,
  getCloudSyncState,
  loadCachedWorkspaceSnapshot,
  mergeRemoteProjectsWithLocal,
  saveCachedWorkspaceSnapshot,
  scheduleCompanyProfileSync,
  scheduleProjectSync,
  setAuthSyncStatus,
  setNetworkOnlineStatus,
  subscribeCloudSyncState,
  subscribeWorkspaceRealtime,
  syncNowAll,
  type CloudSyncState,
} from './services/cloudSyncService';
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

function ModuleLoadingFallback() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-24 w-full" />
      </div>
      <SkeletonBlock className="h-80 w-full" />
    </div>
  );
}

function BunyanWorkspace() {
  const [lang, setLang] = useState<Language>('ar');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [activeModule, setActiveModule] = useState<ActiveModule>('command');
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

  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [activeProjectId, setActiveProjectId] = useState<string>(INITIAL_PROJECTS[0].id);
  const [transactions, setTransactions] = useState<GovernmentTransaction[]>(INITIAL_TRANSACTIONS);
  const [rateLibrary, setRateLibrary] = useState<RateLibraryItem[]>(INITIAL_RATE_LIBRARY);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);

  const [currentRole, setCurrentRole] = useState<Role>('admin');
  const [biometricRegistered, setBiometricRegistered] = useState<boolean>(true);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firestoreConnected, setFirestoreConnected] = useState<boolean>(false);
  const [syncState, setSyncState] = useState<CloudSyncState>(() => getCloudSyncState());
  const [highlightedMeasurementId, setHighlightedMeasurementId] = useState<string | null>(null);
  const { pushToast } = useToast();
  const perms = useMemo(() => getRolePermissions(currentRole), [currentRole]);

  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const companyRef = useRef(companyProfile);
  companyRef.current = companyProfile;
  const ratesRef = useRef(rateLibrary);
  ratesRef.current = rateLibrary;
  const txRef = useRef(transactions);
  txRef.current = transactions;

  const cloudUid = firebaseUser?.emailVerified ? firebaseUser.uid : null;
  const cloudUidRef = useRef<string | null>(cloudUid);
  cloudUidRef.current = cloudUid;

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
      // Ignore storage quota errors
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

  // Subscribe to cloud sync badge state + hydrate IndexedDB offline cache + listen to browser online/offline
  useEffect(() => {
    const unsubSync = subscribeCloudSyncState(setSyncState);

    void loadCachedWorkspaceSnapshot().then((cached) => {
      if (!cached) return;
      if (cached.projects && cached.projects.length > 0) {
        setProjects(cached.projects);
      }
      if (cached.companyProfile) {
        setCompanyProfile(cached.companyProfile);
      }
      if (cached.rateLibrary && cached.rateLibrary.length > 0) {
        setRateLibrary(cached.rateLibrary);
      }
      if (cached.transactions && cached.transactions.length > 0) {
        setTransactions(cached.transactions);
      }
    });

    const handleOnline = () => {
      setNetworkOnlineStatus(true);
      const uid = cloudUidRef.current;
      if (uid) {
        void flushPendingProjectSyncs(uid, handleAttachManifestProject);
      }
    };
    const handleOffline = () => {
      setNetworkOnlineStatus(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubSync();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Startup Firestore connectivity probe + Auth listener
  useEffect(() => {
    testFirestoreConnection().then((ok) => setFirestoreConnected(ok));

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      const verified = Boolean(user && user.emailVerified);
      setAuthSyncStatus(verified);

      if (user && user.emailVerified) {
        try {
          await upsertUserProfile({
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'Bunyan Engineer',
            role: currentRole,
            companyName: companyRef.current.nameEn,
            licenseNumber: companyRef.current.licenseNumber,
            biometricRegistered,
          });
          await flushPendingProjectSyncs(user.uid, handleAttachManifestProject);
        } catch (err) {
          console.warn('User profile or pending sync skipped:', err);
        }
      }
    });

    return () => unsubAuth();
  }, []);

  // Live Firestore real-time onSnapshot listeners across projects, companyProfile, rateLibrary & transactions
  useEffect(() => {
    if (!cloudUid) return;

    const unsubRealtime = subscribeWorkspaceRealtime({
      ownerId: cloudUid,
      onRemoteProjects: (cloudProjects) => {
        setProjects((prev) => mergeRemoteProjectsWithLocal(prev, cloudProjects));
      },
      onRemoteCompanyProfile: (remoteCompany) => {
        setCompanyProfile(remoteCompany);
        void saveCachedWorkspaceSnapshot({ companyProfile: remoteCompany });
      },
      onRemoteRateLibrary: (cloudRates) => {
        setRateLibrary((prev) => {
          const byId = new Map(prev.map((r) => [r.id, r]));
          cloudRates.forEach((cr) => byId.set(cr.id, cr));
          const merged = Array.from(byId.values());
          void saveCachedWorkspaceSnapshot({ rateLibrary: merged });
          return merged;
        });
      },
      onRemoteTransactions: (cloudTxs) => {
        setTransactions(cloudTxs);
        void saveCachedWorkspaceSnapshot({ transactions: cloudTxs });
      },
    });

    return () => unsubRealtime();
  }, [cloudUid]);

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  const workspaceAlerts = useMemo(
    () => deriveWorkspaceAlerts({ projects, transactions, syncState, lang }),
    [projects, transactions, syncState, lang]
  );

  const handleSaveProject = (updated: Project) => {
    const stamped: Project = {
      ...updated,
      updatedAt: new Date().toISOString(),
    };
    const isNew = !projectsRef.current.some((p) => p.id === stamped.id);
    const nextProjects = isNew
      ? [stamped, ...projectsRef.current]
      : projectsRef.current.map((p) => (p.id === stamped.id ? stamped : p));

    setProjects(nextProjects);
    if (isNew) {
      setActiveProjectId(stamped.id);
      confetti({ particleCount: 55, spread: 60, origin: { y: 0.7 } });
    }

    // 1.5s Debounced Auto-Save to Firestore + immediate IndexedDB offline cache + chunked DocumentManifest sync
    scheduleProjectSync({
      project: stamped,
      allProjects: nextProjects,
      ownerId: cloudUid,
      onManifestAttached: handleAttachManifestProject,
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

  const handleDeleteProject = async (id: string) => {
    if (!perms.canDeleteProjects) {
      pushToast(
        lang === 'ar' ? 'حذف المشاريع متاح لدور المدير (Admin) فقط.' : 'Project deletion requires Admin role.',
        'error'
      );
      return;
    }
    const target = projectsRef.current.find((p) => p.id === id);
    const manifestIds = target
      ? [
          ...(target.documents || []).map((d) => d.manifestId).filter((x): x is string => Boolean(x)),
          ...(target.takeoffSheets || []).map((s) => s.pdfManifestId).filter((x): x is string => Boolean(x)),
        ]
      : [];

    cancelPendingProjectSync(id);
    const next = projectsRef.current.filter((p) => p.id !== id);
    setProjects(next);
    if (activeProjectId === id && next[0]) {
      setActiveProjectId(next[0].id);
    }
    await saveCachedWorkspaceSnapshot({ projects: next });
    if (cloudUid) {
      await deleteProjectFromCloud(id, manifestIds);
    }
  };

  const handleSaveTransaction = async (tx: GovernmentTransaction) => {
    if (!perms.canManageGovernment) {
      pushToast(
        lang === 'ar'
          ? 'إدارة المعاملات البلدية متاحة للمدير والمهندس فقط.'
          : 'Municipal clearances require Admin or Engineer role.',
        'error'
      );
      return;
    }
    const exists = transactions.some((item) => item.id === tx.id);
    const next = exists
      ? transactions.map((item) => (item.id === tx.id ? tx : item))
      : [tx, ...transactions];
    setTransactions(next);
    await saveCachedWorkspaceSnapshot({ transactions: next });
    if (cloudUid) {
      const parentProject = projectsRef.current.find((p) => p.id === tx.projectId);
      if (parentProject) {
        await ensureProjectExistsInCloud(parentProject, cloudUid);
      }
      await saveTransactionToCloud(tx, cloudUid);
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
    const next = transactions.filter((t) => t.id !== id);
    setTransactions(next);
    await saveCachedWorkspaceSnapshot({ transactions: next });
    if (cloudUid) {
      await deleteTransactionFromCloud(id);
    }
  };

  const handleUpdateRate = async (item: RateLibraryItem) => {
    if (!perms.canEditFinancials && !perms.canEditEngineering) return;
    const next = rateLibrary.map((r) => (r.id === item.id ? item : r));
    setRateLibrary(next);
    await saveCachedWorkspaceSnapshot({ rateLibrary: next });
    if (cloudUid) {
      await saveRateItemToCloud(item, cloudUid);
    }
  };

  const handleAddRate = async (item: RateLibraryItem) => {
    if (!perms.canEditFinancials && !perms.canEditEngineering) return;
    const next = [...rateLibrary, item];
    setRateLibrary(next);
    await saveCachedWorkspaceSnapshot({ rateLibrary: next });
    if (cloudUid) {
      await saveRateItemToCloud(item, cloudUid);
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
    setCompanyProfile(profile);
    scheduleCompanyProfileSync(profile, cloudUid);
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
        return;
      }
    }
    if (!targetUid) return;

    await syncNowAll({
      ownerId: targetUid,
      projects: projectsRef.current,
      companyProfile: companyRef.current,
      rateLibrary: ratesRef.current,
      transactions: txRef.current,
      onManifestAttached: handleAttachManifestProject,
    });
    confetti({ particleCount: 65, spread: 70, origin: { y: 0.65 } });
  };

  const backupData: BackupData = {
    version: '2026.1',
    exportedAt: new Date().toISOString(),
    companyProfile,
    projects,
    transactions,
    rateLibrary,
  };

  const handleImportBackup = (data: BackupData) => {
    if (!perms.canManageProjects) {
      pushToast(
        lang === 'ar'
          ? 'صلاحية الدور الحالي لا تسمح باستيراد النسخ الاحتياطية.'
          : 'Current role cannot restore backups.',
        'error'
      );
      return;
    }

    const nowIso = new Date().toISOString();
    const stampedProjects = data.projects.map((p) => ({
      ...p,
      updatedAt: nowIso,
    }));
    const nextTransactions =
      Array.isArray(data.transactions) && data.transactions.length > 0
        ? data.transactions
        : transactions;
    const nextRates =
      Array.isArray(data.rateLibrary) && data.rateLibrary.length > 0
        ? data.rateLibrary
        : rateLibrary;
    const nextCompany = data.companyProfile || companyProfile;

    setProjects(stampedProjects);
    setActiveProjectId(stampedProjects[0].id);
    setTransactions(nextTransactions);
    setRateLibrary(nextRates);
    if (data.companyProfile) {
      setCompanyProfile(nextCompany);
    }

    void saveCachedWorkspaceSnapshot({
      projects: stampedProjects,
      transactions: nextTransactions,
      rateLibrary: nextRates,
      companyProfile: nextCompany,
      pendingProjectIds: stampedProjects.map((p) => p.id),
    });

    if (cloudUid && syncState.isOnline) {
      void syncNowAll({
        ownerId: cloudUid,
        projects: stampedProjects,
        companyProfile: nextCompany,
        rateLibrary: nextRates,
        transactions: nextTransactions,
        onManifestAttached: handleAttachManifestProject,
      });
    } else {
      for (const proj of stampedProjects) {
        scheduleProjectSync({
          project: proj,
          allProjects: stampedProjects,
          ownerId: cloudUid,
          onManifestAttached: handleAttachManifestProject,
        });
      }
      if (data.companyProfile) {
        scheduleCompanyProfileSync(nextCompany, cloudUid);
      }
    }
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg-canvas)] text-[var(--text-primary)]">
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
          activeProjectId={activeProject.id}
          onSelectProject={setActiveProjectId}
          currentRole={currentRole}
          userEmail={firebaseUser?.email}
          syncState={syncState}
          onSyncNow={() => {
            void handleSyncNow();
          }}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
          alertsCount={workspaceAlerts.length}
          onNavigateModule={setActiveModule}
          onOpenExport={() => setExportModalOpen(true)}
        />

        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">
          {activeModule === 'command' && (
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

          {activeModule === 'projects' && (
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
            />
          )}

          {activeModule === 'financials' && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <FinancialSummaryModule
                projects={projects}
                activeProject={activeProject}
                company={companyProfile}
                lang={lang}
                currentRole={currentRole}
                onSelectProject={setActiveProjectId}
                onSaveProject={handleSaveProject}
              />
            </Suspense>
          )}

          {activeModule === 'documents' && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <DocumentsModule
                projects={projects}
                activeProject={activeProject}
                lang={lang}
                currentRole={currentRole}
                cloudUid={cloudUid}
                onSelectProject={setActiveProjectId}
                onSaveProject={handleEngineeringProjectUpdate}
              />
            </Suspense>
          )}

          {activeModule === 'studio' && (
            <Suspense fallback={<ModuleLoadingFallback />}>
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

          {activeModule === 'bim' && (
            <Suspense fallback={<ModuleLoadingFallback />}>
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

          {activeModule === 'takeoff' && (
            <Suspense fallback={<ModuleLoadingFallback />}>
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

          {activeModule === 'gis' && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <GisPlotExplorer
                project={activeProject}
                projects={projects}
                lang={lang}
                onUpdateProject={handleEngineeringProjectUpdate}
                onSelectProject={setActiveProjectId}
              />
            </Suspense>
          )}

          {activeModule === 'government' && (
            <GovernmentPortal
              transactions={transactions}
              projects={projects}
              activeProjectId={activeProject.id}
              lang={lang}
              currentRole={currentRole}
              onSaveTransaction={handleSaveTransaction}
              onDeleteTransaction={handleDeleteTransaction}
            />
          )}

          {activeModule === 'settings' && (
            <SettingsAuthModule
              lang={lang}
              currentRole={currentRole}
              onChangeRole={setCurrentRole}
              companyProfile={companyProfile}
              onUpdateCompany={handleUpdateCompany}
              biometricRegistered={biometricRegistered}
              onToggleBiometric={setBiometricRegistered}
              firebaseUser={firebaseUser}
              firestoreConnected={firestoreConnected}
              onSignInGoogle={async () => {
                await signInWithGooglePopup();
              }}
              onSignOut={signOutFirebase}
              onSyncSeedToCloud={handleSyncNow}
              backupData={backupData}
              onImportBackup={handleImportBackup}
            />
          )}
        </main>
      </div>

      <GlobalCommandModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        lang={lang}
        projects={projects}
        transactions={transactions}
        onSelectProject={setActiveProjectId}
        onNavigate={setActiveModule}
      />

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

      <BunyanExportCenter
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        project={activeProject}
        company={companyProfile}
        lang={lang}
      />
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
