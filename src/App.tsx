import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import confetti from 'canvas-confetti';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { CommandCenter } from './components/command/CommandCenter';
import { GisPlotExplorer } from './components/gis/GisPlotExplorer';
import { GovernmentPortal } from './components/government/GovernmentPortal';
import { BimModule } from './components/bim/BimModule';
import { ProjectsModule } from './components/projects/ProjectsModule';
import { BunyanBimTakeoffStudio } from './components/studio/BunyanBimTakeoffStudio';
import { TakeoffModule } from './components/takeoff/TakeoffModule';
import { SettingsAuthModule } from './components/settings/SettingsAuthModule';
import { Sidebar, type ActiveModule } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
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
  saveRateItemToCloud,
  saveTransactionToCloud,
  upsertUserProfile,
} from './services/firestoreStorage';
import {
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

function BunyanWorkspace() {
  const [lang, setLang] = useState<Language>('ar');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [activeModule, setActiveModule] = useState<ActiveModule>('command');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  const handleSaveProject = (updated: Project) => {
    const isNew = !projectsRef.current.some((p) => p.id === updated.id);
    const nextProjects = isNew
      ? [updated, ...projectsRef.current]
      : projectsRef.current.map((p) => (p.id === updated.id ? updated : p));

    setProjects(nextProjects);
    if (isNew) {
      setActiveProjectId(updated.id);
      confetti({ particleCount: 55, spread: 60, origin: { y: 0.7 } });
    }

    // 1.5s Debounced Auto-Save to Firestore + immediate IndexedDB offline cache + chunked DocumentManifest sync
    scheduleProjectSync({
      project: updated,
      allProjects: nextProjects,
      ownerId: cloudUid,
      onManifestAttached: handleAttachManifestProject,
    });
  };

  const handleDeleteProject = async (id: string) => {
    const next = projectsRef.current.filter((p) => p.id !== id);
    setProjects(next);
    if (activeProjectId === id && next[0]) {
      setActiveProjectId(next[0].id);
    }
    await saveCachedWorkspaceSnapshot({ projects: next });
    if (cloudUid) {
      await deleteProjectFromCloud(id);
    }
  };

  const handleSaveTransaction = async (tx: GovernmentTransaction) => {
    const exists = transactions.some((item) => item.id === tx.id);
    const next = exists
      ? transactions.map((item) => (item.id === tx.id ? tx : item))
      : [tx, ...transactions];
    setTransactions(next);
    await saveCachedWorkspaceSnapshot({ transactions: next });
    if (cloudUid) {
      await saveTransactionToCloud(tx, cloudUid);
    }
  };

  const handleDeleteTransaction = (id: string) => {
    const next = transactions.filter((t) => t.id !== id);
    setTransactions(next);
    void saveCachedWorkspaceSnapshot({ transactions: next });
  };

  const handleUpdateRate = async (item: RateLibraryItem) => {
    const next = rateLibrary.map((r) => (r.id === item.id ? item : r));
    setRateLibrary(next);
    await saveCachedWorkspaceSnapshot({ rateLibrary: next });
    if (cloudUid) {
      await saveRateItemToCloud(item, cloudUid);
    }
  };

  const handleAddRate = async (item: RateLibraryItem) => {
    const next = [...rateLibrary, item];
    setRateLibrary(next);
    await saveCachedWorkspaceSnapshot({ rateLibrary: next });
    if (cloudUid) {
      await saveRateItemToCloud(item, cloudUid);
    }
  };

  const handleUpdateCompany = (profile: CompanyProfile) => {
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
    if (data.projects.length > 0) {
      setProjects(data.projects);
      setActiveProjectId(data.projects[0].id);
      void saveCachedWorkspaceSnapshot({ projects: data.projects });
    }
    if (Array.isArray(data.transactions)) setTransactions(data.transactions);
    if (Array.isArray(data.rateLibrary)) setRateLibrary(data.rateLibrary);
    if (data.companyProfile) handleUpdateCompany(data.companyProfile);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#060D1A] text-slate-900 dark:text-slate-100">
      <Sidebar
        activeModule={activeModule}
        onSelectModule={setActiveModule}
        lang={lang}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        companyName={lang === 'ar' ? companyProfile.nameAr : companyProfile.nameEn}
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
          onNavigateSettings={() => setActiveModule('settings')}
        />

        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">
          {activeModule === 'command' && (
            <CommandCenter
              projects={projects}
              activeProject={activeProject}
              company={companyProfile}
              transactions={transactions}
              lang={lang}
              syncState={syncState}
              onSyncNow={() => {
                void handleSyncNow();
              }}
              onNavigate={setActiveModule}
              onSelectProject={setActiveProjectId}
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
              backupData={backupData}
              onImportBackup={handleImportBackup}
              cloudUid={cloudUid}
            />
          )}

          {activeModule === 'studio' && (
            <BunyanBimTakeoffStudio
              project={activeProject}
              company={companyProfile}
              rateLibrary={rateLibrary}
              lang={lang}
              cloudUid={cloudUid}
              onUpdateProject={handleSaveProject}
            />
          )}

          {activeModule === 'bim' && (
            <BimModule
              project={activeProject}
              lang={lang}
              onUpdateProject={handleSaveProject}
              onJumpToTakeoff={(measurementId) => {
                setHighlightedMeasurementId(measurementId);
                setActiveModule('takeoff');
              }}
            />
          )}

          {activeModule === 'takeoff' && (
            <TakeoffModule
              project={activeProject}
              company={companyProfile}
              rateLibrary={rateLibrary}
              lang={lang}
              cloudUid={cloudUid}
              highlightedMeasurementId={highlightedMeasurementId}
              onUpdateProject={handleSaveProject}
              onUpdateRate={handleUpdateRate}
              onAddRate={handleAddRate}
            />
          )}

          {activeModule === 'gis' && (
            <GisPlotExplorer
              project={activeProject}
              lang={lang}
              onUpdateProject={handleSaveProject}
            />
          )}

          {activeModule === 'government' && (
            <GovernmentPortal
              transactions={transactions}
              projects={projects}
              activeProjectId={activeProject.id}
              lang={lang}
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
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BunyanWorkspace />
    </ErrorBoundary>
  );
}
