# AL BUNYAN | 5D BIM — Cloud Sync & Production Verification Report

- **Date (UTC)**: 2026-11-25
- **Firebase Project ID**: `gifted-force-fxctm`
- **Firestore Database ID**: `ai-studio-a758e3b4-81b5-47a3-a9ca-2d6487629b67`
- **Pre-Repair Backup**: `backups/cloud-sync-repair-20261125.tar.gz`

---

## 1. Fixes Applied (الإصلاحات التي تم تنفيذها)

### A. Cloud Data Sync & Cross-Device Hydration Fixes
1. **Structural Revision #2+ `createdAt` Overwrite Fix (`src/services/structuralFirestoreService.ts`)**:
   - **Problem**: `saveConfirmedStructuralRevisionToCloud()` unconditionally wrote `createdAt: serverTimestamp()` on `structuralProjects/{projectId}`. On Revision #2+, `setDoc` triggers Firestore `update`, violating `firestore.rules` (`incoming().createdAt == existing().createdAt`) and failing with `PERMISSION_DENIED`.
   - **Fix**: Added `getDoc` pre-check on `structuralProjects/{projectId}` to preserve `existing.data().createdAt` and `existing.data().ownerId` on updates, plus defensive string/array truncation (`markdownContent.slice(0, 50000)`, `issues.slice(0, 200)`, `code.slice(0, 64)`, `name.slice(0, 200)`).
2. **Cross-Device Structural Intelligence Sync (`src/services/structuralFirestoreService.ts` + `src/components/structural/StructuralWorkspace.tsx`)**:
   - **Problem**: Confirmed ETABS/table structural revisions were saved to the 10 Firestore collections, but `StructuralWorkspace` only hydrated from `localStorage` on load and never pulled confirmed revisions/datasets/reports from Firestore on another device.
   - **Fix**: Implemented `loadStructuralProjectBundleFromCloud(ownerId, structuralProjectId)` querying all 9 structural artifact collections scoped by `ownerId` and `projectId`, and wired automatic cloud hydration + local cache merge into `StructuralWorkspace` whenever `cloudUid` is authenticated. Also wrapped `saveConfirmedStructuralRevisionToCloud` in `try/catch` so local immutable revisions are never lost if a cloud write fails.
3. **IndexedDB `bunyan_offline_cache` Store Collision Fix (`src/services/cloudSyncService.ts` + `src/services/reportStorageService.ts`)**:
   - **Problem**: Both services opened `bunyan_offline_cache` at `DB_VERSION = 1` with different `objectStoreNames` (`workspace` + `sheet_binaries` vs `workspace_snapshot` + `binary_files`). Whichever opened first locked out the other's offline store.
   - **Fix**: Upgraded both to `DB_VERSION = 2` and ensured `onupgradeneeded` creates all 4 object stores (`workspace`, `sheet_binaries`, `workspace_snapshot`, `binary_files`) consistently.
4. **Bulk `syncNowAll` Deduplication & Terminal-Locked Record Guard (`src/services/cloudSyncService.ts` + `src/services/firestoreStorage.ts`)**:
   - **Problem**:
     - `syncNowAll` flushed pending projects and then re-committed the stale `projects` list a second time (risking redundant uploads and stale `pdfManifestId` references).
     - `INITIAL_PROJECTS` includes `3` projects with `status: 'completed'` and `INITIAL_TRANSACTIONS` includes `2` transactions with `status: 'approved'`. Under `firestore.rules`, non-admin users cannot overwrite terminal `completed` projects or `approved` transactions, causing `syncNowAll` to fail with `PERMISSION_DENIED` on repeat syncs.
   - **Fix**:
     - Updated `syncNowAll` to commit each project once while preserving newly attached `manifestId` references in both React state and offline IndexedDB cache.
     - Added unchanged terminal-state checks in `saveProjectToCloud` and `saveTransactionToCloud` so already-`completed` projects / `approved` transactions that have no newer local edits are not redundantly overwritten.
     - Guarded `upsertUserProfile` (`email.length >= 3`) and `gisData` (`|| {}`) against schema rejections.
5. **Unhandled Cloud Promise Guard in Workspace Actions (`src/App.tsx`)**:
   - Wrapped direct Firestore mutations (`handleDeleteProject`, `handleSaveTransaction`, `handleDeleteTransaction`, `handleUpdateRate`, `handleAddRate`) in `try/catch` with user toast notifications instead of leaving unhandled rejections if offline or denied.

---

## 2. Verification & Results (نتائج التحقق الفعلية)

| Check / Verification | Result | Verified Evidence |
| :--- | :--- | :--- |
| `fax.DeployRules` RPC (Firestore Rules Deployment) | **PASS** | `RPC action fax.DeployRules succeeded: {}` on database `ai-studio-a758e3b4-81b5-47a3-a9ca-2d6487629b67`. |
| `npx eslint firestore.rules` | **PASS** | `ESLINT_FIRESTORE_RULES_OK` (0 errors across all 17 collections). |
| Live Cloud Firestore Endpoint & Rules Probe | **PASS** | `GET https://firestore.googleapis.com/v1/projects/gifted-force-fxctm/databases/ai-studio-a758e3b4-81b5-47a3-a9ca-2d6487629b67/documents/projects/proj-01` -> `HTTP 403 PERMISSION_DENIED` (confirms live cloud DB online & Zero-Trust auth rules active). |
| `npm test` (12 suites, 51 tests — incl. new `tests/cloudSyncIntegrity.test.ts`) | **PASS** | **50 passed**, **0 failed**, **1 skipped** (Test Q: Windows x64 CSI ETABS v20 COM OAPI). |
| `npm run build` (`compile_applet`) | **PASS** | Vite production bundle built cleanly. |
| `npm run lint` (`lint_applet` / `tsc --noEmit`) | **PASS** | Zero TypeScript errors. |
| Production Mode Node 22 (`NODE_ENV=production node server.ts`) | **PASS** | `/api/health` (`200`), `/api/structural/health` (`200`), SPA `/` (`200`). |

---

## 3. What Could Not Be Executed Directly Here (الأجزاء التي لم تُختبر فعلياً من هنا)

1. **Interactive Google Sign-In & Authenticated Live Browser Write/Read Cycle**:
   - Real Firestore writes (`setDoc` / `onSnapshot` across two browser tabs/devices) require an interactive Google Sign-In popup (`signInWithPopup`) with your Google account (`mjaidaa66@gmail.com` or another verified user), which cannot be performed non-interactively from inside the headless CLI sandbox.
   - **How to Verify in Browser (30 seconds)**:
     1. Open the app preview / deployed URL and click **تسجيل الدخول بحساب Google** (or **مزامنة الآن** in the top header).
     2. Confirm the status badge turns green (**متصل ومتزامن سحابياً / Cloud Synced**).
     3. Create or edit a project / structural revision, open the app in a second tab or incognito window signed into the same Google account, and confirm the update appears automatically via `onSnapshot` / structural hydration.
2. **Live Cloud Run Redeployment**:
   - Because `gcloud` and GCP deployment credentials are not mounted inside this sandbox, triggering a new Cloud Run Revision must still be run via **AI Studio Deploy/Redeploy** or your CI/CD workflow (`.github/workflows/deploy.yml`).
3. **Windows x64 CSI ETABS v20 COM OAPI**:
   - Explicitly skipped (`NOT RUN`) on Linux; requires Windows x64 + licensed CSI ETABS v20 + `Bunyan.EtabsAgent`.
