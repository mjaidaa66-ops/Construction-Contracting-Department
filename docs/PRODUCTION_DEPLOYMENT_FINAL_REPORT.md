# AL BUNYAN | 5D BIM — Production Deployment Repair & Verification Report

- **Date (UTC)**: 2026-11-25
- **Project**: `AL BUNYAN | 5D BIM` (`gifted-force-fxctm`)
- **Firestore Database ID**: `ai-studio-a758e3b4-81b5-47a3-a9ca-2d6487629b67`
- **Acceptance Verdict**: **READY WITH LIMITATIONS**
- **Pre-Repair Backup Archive**: `backups/cloud-run-repair-baseline-20261125.tar.gz`

---

## 1. Root Cause Analysis (السبب الجذري للمشكلة)

1. **Primary Cloud Run Startup Crash (`ERR_MODULE_NOT_FOUND` under Node.js 22 Native ESM)**:
   - Cloud Run starts the application with `npm start` -> `node server.ts` on Node.js `v22.23.4` (`v22.23.5` locally), using Node 22's native ESM loader and TypeScript type stripping **without** `tsx`.
   - `server.ts` imports `./src/modules/structural/routes/structural.routes.ts`, whose internal relative TypeScript imports omitted `.ts` file extensions (for example `../adapters/etabs.adapter`).
   - While Vite (`vite build`), `tsc --noEmit`, and `tsx` resolve extensionless TypeScript imports automatically, Node 22 native ESM rejects them at startup:
     `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/workspace/src/modules/structural/adapters/etabs.adapter' imported from /workspace/src/modules/structural/routes/structural.routes.ts` -> container exited with code `1`.

2. **Secondary Docker Runner Packaging Defect (`/Dockerfile`)**:
   - Inspecting `/Dockerfile` revealed that the production `runner` stage only copied `./dist`, `./server.ts`, and `./server`.
   - It omitted `./src/modules/structural` and `./src/types`, which are imported by `server.ts` at runtime. Any Cloud Run deployment built via `Dockerfile` (such as `.github/workflows/deploy.yml` running `gcloud run deploy --source .`) would crash on startup even after adding `.ts` extensions.

3. **Production HTTP / Error Resilience Gaps (`/server.ts`)**:
   - Requests to unknown `/api/*` endpoints fell through to the SPA wildcard route (`index.html`), and malformed JSON payloads returned Express's default HTML stack-trace page instead of structured JSON.

---

## 2. Modified Files (الملفات التي تم تعديلها)

### Cloud Run, Docker, Environment & Server Entry
- `Dockerfile` — Added `COPY --from=builder /app/src/modules/structural ./src/modules/structural` and `COPY --from=builder /app/src/types ./src/types` to the production `runner` stage.
- `server.ts` — Added `/api/*` JSON 404 handler, Express 4-argument JSON error middleware (returns clean `400` JSON for malformed JSON and `500` JSON for unexpected errors without leaking stack traces), `process.on('unhandledRejection', ...)` safety guard, and fatal startup error handler. Preserved `PORT` env var usage (`Number(process.env.PORT) || 3000`) and `0.0.0.0` host binding.
- `.env.example` — Documented `PORT` (`8080` for Cloud Run) and `NODE_ENV` (`production`) alongside `GEMINI_API_KEY`, `APP_URL`, `STRUCTURAL_AGENT_URL`, `STRUCTURAL_AGENT_TOKEN`, and `ALLOW_REMOTE_STRUCTURAL_AGENT` (zero secrets stored).
- `server/services/sharjahComplianceAudit.ts` — Added explicit `.ts` extension on relative type import (`../../src/types/bunyan.ts`).

### Backend & Structural Module Imports (Node.js 22 Native ESM Compatibility)
Explicit `.ts` extensions verified/applied on all relative imports (both runtime and type-only imports) across:
- `src/modules/structural/routes/structural.routes.ts`
- `src/modules/structural/controllers/structural.controller.ts`
- `src/modules/structural/validators/structural.validators.ts`
- `src/modules/structural/services/etabsImport.service.ts`
- `src/modules/structural/adapters/structuralData.adapter.ts`
- `src/modules/structural/adapters/etabs.adapter.ts`
- `src/modules/structural/services/structuralValidation.service.ts`
- `src/modules/structural/services/structuralRevision.service.ts`
- `src/modules/structural/services/etabsTableParser.service.ts`
- `src/modules/structural/services/structuralProject.service.ts`
- `src/modules/structural/services/structuralUnits.service.ts`
- `src/modules/structural/reports/structuralReport.service.ts`
- `src/modules/structural/repositories/structural.repository.ts`
- `src/modules/structural/types/structural-results.types.ts`

### Security Policy Verification
- `src/modules/structural/adapters/etabs.adapter.ts` loopback SSRF protection (`LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])`, `ALLOW_REMOTE_STRUCTURAL_AGENT` defaulting to `false`) was **preserved unchanged**.
- No Firebase secrets, API keys, or ETABS Agent tokens are hardcoded or exposed in client bundles or repository files.

---

## 3. Verification & Test Results (نتائج الاختبارات الفعلية)

| Check / Command | Scope | Result | Details |
| :--- | :--- | :--- | :--- |
| Extensionless import & Node 22 TS syntax audit | `server.ts`, `server/`, `src/modules/structural/` | **PASS** | `ALL_RELATIVE_IMPORTS_HAVE_EXTENSIONS`; zero `enum` / `namespace` / parameter-property syntax in Node-executed TS files. |
| `npm run build` (`compile_applet`) | Vite production frontend bundle | **PASS** | Succeeded (`dist/` compiled cleanly). |
| `npm run lint` (`lint_applet`) | `tsc --noEmit` | **PASS** | Zero TypeScript errors across frontend + backend. |
| `npx eslint firestore.rules` | Firestore security rules | **PASS** | `ESLINT_FIRESTORE_RULES_OK` (0 errors). |
| `npm test` | `tsx --test tests/*.test.ts` (11 suites) | **PASS** | `47` tests total: **`46` passed**, **`0` failed**, **`1` skipped** (Test Q: Live ETABS v20 COM Integration explicitly skipped on Linux). |
| Production Node 22 startup (`NODE_ENV=production PORT=3099 node server.ts`) | Cloud Run start command (`node server.ts`) | **PASS** | Bound cleanly to `http://0.0.0.0:3099`. |
| `GET /api/health` (Production Mode) | Cloud Run liveness probe | **PASS** | `HTTP 200` — `{"ok":true}`. |
| `GET /api/structural/health` (Production Mode) | Structural API readiness probe | **PASS** | `HTTP 200` — `{"ok":true,"module":"structural-intelligence-phase-1","readOnlyDefault":true,...}`. |
| `GET /` (Production Mode) | Built SPA static serving (`dist/index.html`) | **PASS** | `HTTP 200`, `Content-Type: text/html; charset=UTF-8`. |
| `GET /api/structural/agent/status` (Production Mode) | External Windows ETABS Agent failure resilience | **PASS** | `HTTP 200` — gracefully returns `connectionState: "AGENT_UNAVAILABLE"` without crashing Express. |
| `GET /api/unknown` (Production Mode) | Unknown API route handling | **PASS** | `HTTP 404` — `{"error":"API endpoint not found."}`. |
| `POST /api/audit/sharjah` with malformed JSON `{bad` | Express JSON error middleware | **PASS** | `HTTP 400` — `{"error":"Invalid JSON request payload."}`; subsequent `/api/health` returned `200 {"ok":true}`. |
| `POST /api/audit/sharjah` with `GEMINI_API_KEY=""` | Missing external API secret handling | **PASS** | `HTTP 503` — `{"error":"Compliance audit service is not configured on this server."}` without crashing server. |
| Simulated `Dockerfile` runner layout (`NODE_ENV=production PORT=3098 node server.ts`) | Exact files copied in `Dockerfile` Stage 2 (`dist`, `server.ts`, `server`, `src/modules/structural`, `src/types`) | **PASS** | `HTTP 200` on `/api/structural/health`, bound to `http://0.0.0.0:3098`. |
| Managed Dev Server Restart (`restart_dev_server`) | `http://127.0.0.1:3000` | **PASS** | `/api/health` (`200`), `/api/structural/health` (`200`), `/api/unknown` (`404` JSON), malformed JSON (`400` JSON). |

---

## 4. Actual Cloud Run Deployment Status (حالة Cloud Run الفعلية)

- **Deployment Executed from Sandbox?**: **No** (not possible from inside this runtime).
- **Reason**:
  - `gcloud` CLI and `docker` daemon are not installed in this container (`which gcloud docker` returned none).
  - `firebase projects:list` (`firebase-tools@15.36.0`) failed with `Error: Failed to list Firebase projects` because no interactive Google Cloud / Firebase deployment credentials are mounted in the sandbox.
- **Revision Number & Live Cloud Run Logs**: Not available until triggered from AI Studio Deploy or CI/CD (`.github/workflows/deploy.yml`). No new live Cloud Run revision was created by this environment.

### Required Commands to Deploy & Verify Live Cloud Run Revision

Option A — **Via Google AI Studio**:
1. Click **Deploy / Redeploy** in Google AI Studio so Cloud Run rebuilds using the updated `server.ts`, `Dockerfile`, and `src/modules/structural/*.ts`.
2. Verify `/api/health` and `/api/structural/health` return HTTP `200` on the deployed Cloud Run service URL.

Option B — **Via GitHub Actions / `gcloud` CLI**:
```bash
npm run lint
npm test
npm run build
gcloud run deploy bunyan-core-system \
  --source . \
  --project gifted-force-fxctm \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "NODE_ENV=production,GEMINI_API_KEY=<YOUR_SECRET>"
```
Then inspect the newly created Cloud Run revision and logs:
```bash
gcloud run revisions list --service bunyan-core-system --project gifted-force-fxctm --region us-central1
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=bunyan-core-system" --project gifted-force-fxctm --limit 50
```

---

## 5. Unverified / Out-of-Scope Items (الوظائف التي لم يتم التحقق منها)

1. **Live Cloud Run Deployment & Revision Health Check**: Could not be executed from the sandbox due to missing `gcloud` CLI, `docker`, and GCP deployment credentials.
2. **CSI ETABS v20 Live COM OAPI & `.EDB` Model Extraction**: Explicitly untested (`SKIP NOT RUN`) in this Linux environment; requires Windows x64 + licensed CSI ETABS v20 + `ETABSv1.dll` running `windows-agent/Bunyan.EtabsAgent`.
3. **Live Gemini Compliance Audit (`POST /api/audit/sharjah`)**: Graceful `503` handling when unconfigured was verified; live model response depends on runtime `GEMINI_API_KEY` secret in Cloud Run.

---

## 6. Platform Preservation Verification (حالة الحفاظ على الوحدات السابقة)

Verified via source inspection (`src/App.tsx`, `src/components/layout/Sidebar.tsx`, `src/services/firebase.ts`), TypeScript compilation (`npm run build` + `tsc --noEmit`), and the 11-suite test runner (`46/46` active tests passing):
- **Executive Dashboard & Command Center** (`dashboard`, `command`): Preserved intact.
- **Projects Portfolio** (`projects`): Preserved intact; zero seeded demo leakage verified.
- **BIM 3D / 5D & Studio** (`bim`, `studio`): Preserved intact.
- **CAD / DXF, PDF Takeoff & GIS** (`takeoff`, `gis`): Preserved intact (verified by Group 1–5 & E2E integration tests).
- **Financial Summary** (`financials`): Preserved intact.
- **Documents & Project Files Engine** (`documents`): Preserved intact (7/7 tests passing).
- **Government Portal (Sharjah Municipality Compliance)** (`government`, `/api/audit/sharjah`): Preserved intact.
- **Reports & Printing Center** (`reports`): Preserved intact (6/6 tests passing).
- **Structural Intelligence Phase 1** (`structural`, `/api/structural/*`): Preserved intact (6/6 active tests + 1 Windows COM skip).
- **Authentication, RBAC, Navigation, RTL/LTR & Existing Data Workflows** (`accounts`, `settings`, Google Sign-In popup, `document.documentElement.dir`, Firestore offline persistence): Preserved intact with zero UI/visual changes.

---

## 7. Final Status Classification

**READY WITH LIMITATIONS**

- All code, TypeScript, Vite production build, Firestore security rules lint, unit/integration tests, Node.js 22 native ESM production server startup (`0.0.0.0:$PORT`), Docker runner layout simulation, and API error-handling checks passed.
- Actual live Cloud Run deployment (`Revision` creation and live Cloud Run log inspection) awaits deployment from AI Studio / authenticated `gcloud`, and CSI ETABS v20 Windows COM integration remains untested until executed on Windows x64 with licensed ETABS v20.
