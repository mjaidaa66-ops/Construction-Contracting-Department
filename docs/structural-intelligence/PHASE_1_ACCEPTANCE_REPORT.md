# Phase 1 Engineering Acceptance Report — AL BUNYAN Structural Intelligence Suite

## Scope Delivered
- **Windows Engineering Agent**: Standalone C# / `.NET Framework 4.8` connector (`windows-agent/Bunyan.EtabsAgent/`) referencing `ETABSv1.dll` with installation/COM v20 probing, read-only OAPI safeguards, authorized `.EDB` opening, cancellation, and authenticated `127.0.0.1:45820` HTTP REST API.
- **Backend Structural Services & Routes**: Modular architecture in `src/modules/structural/` mounted under `/api/structural/*` in `server.ts`.
- **Normalized Data Model & Provenance**: 17 domain entities, 5 reliability tiers (`SOURCE_VERIFIED`, `DERIVED`, `UNVERIFIED`, `MISSING`, `FAILED`), derived formula tracking, and SI unit normalization preserving raw values.
- **11-Step Workflow & Exported Tables Fallback**: Preview + confirmation gate + duplicate hash detection + `.json`/`.csv`/`.xlsx` ETABS Database Tables parser.
- **Firestore Integration**: Extended `firebase-blueprint.json`, `firestore.rules`, and `src/services/structuralFirestoreService.ts` across all 10 normalized structural collections; ESLint passed and rules deployed.
- **Frontend UI Integration**: Added `STRUCTURAL INTELLIGENCE` module cleanly into `Sidebar.tsx`, `TopHeader.tsx`, `GlobalCommandModal.tsx`, `i18n.ts`, and `App.tsx` with all 11 sub-views.

## Honest Runtime Boundary
- **Status**: `READY WITH LIMITATIONS`
- Live Windows `.NET Framework 4.8` compilation (`msbuild`) and live CSI ETABS v20 COM attachment (`ETABSv1.dll`) are marked **NOT RUN** in this Linux gVisor sandbox because Windows OS, .NET Framework 4.8 SDK, and a licensed CSI ETABS v20 installation are not present on the build host.
