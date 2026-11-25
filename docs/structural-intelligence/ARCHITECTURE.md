# AL BUNYAN — Structural Intelligence Suite (Phase 1 Architecture)

## System Topology
AL BUNYAN Structural Intelligence integrates CSI ETABS v20 models into the existing BUNYAN | 5D BIM platform through three strictly decoupled layers:

1. **Windows Engineering Agent (`windows-agent/Bunyan.EtabsAgent/`)**
   - Standalone x64 `.NET Framework 4.8` executable targeting CSI ETABS v20 COM Interop (`ETABSv1.dll`).
   - Binds exclusively to `127.0.0.1:45820` (`LocalHttpServer.cs`) with bearer-token authentication (`BUNYAN_AGENT_TOKEN`).
   - Enforces read-only mode by default (`EtabsOapiClient.cs`).

2. **AL BUNYAN Backend Structural Integration Layer (`server.ts` + `src/modules/structural/`)**
   - Express REST endpoints mounted at `/api/structural/*`.
   - `EtabsAgentAdapter`: Loopback SSRF-protected client forwarding authenticated requests to the Windows Agent.
   - `structuralData.adapter.ts`: Normalizes raw ETABS units/entities to SI (`kN-m`, `MPa`, `kN/m3`) while preserving original values.
   - `etabsTableParser.service.ts`: Documented fallback parser for exported ETABS `.json`, `.csv`, and `.xlsx` Database Tables.
   - `structuralValidation.service.ts`: Completeness, duplicate, connectivity, and reliability classification.
   - `etabsImport.service.ts`: 11-step controlled workflow with preview stage and mandatory confirmation gate.

3. **Cloud Firestore & AL BUNYAN React Workspace (`src/components/structural/` + `src/services/structuralFirestoreService.ts`)**
   - Persists confirmed immutable revisions across 10 owner-scoped collections governed by `firestore.rules`.
   - Adds the `STRUCTURAL INTELLIGENCE` navigation module inside `Sidebar.tsx` and `App.tsx` with full Arabic RTL/English LTR and Dark/Light support.
