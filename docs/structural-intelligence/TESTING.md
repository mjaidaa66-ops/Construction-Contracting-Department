# Testing & Verification Guide

## Automated Test Suites
Run all unit, integration, contract, and security tests:
```bash
npm test
npm run lint
npm run build
npx eslint firestore.rules
```

## Covered Test Scenarios (`tests/structuralIntelligence.test.ts` & `tests/firestoreRulesContract.test.ts`)
- **A**: Schema validation & payload rejection for malformed ETABS payloads.
- **B–C**: Authentic connection unavailability diagnostics and SSRF non-loopback rejection.
- **D**: Exact SI unit conversions (`mm`, `cm`, `ft`, `in`, `N/mm^2`, `kN/m^3`) preserving raw values.
- **E–H**: Story, grid, material, section, derived frame length (`Euclidean3DLength`), derived slab area (`ShoelacePlanArea2D`), and mandatory provenance tracking.
- **I–N**: 11-step workflow, duplicate hash blocking, explicit user confirmation gate, immutable revisions, job cancellation, and exported `.csv` / `.xlsx` fallback parsing with formula injection neutralization.
- **O–P**: 5-role RBAC enforcement on backend `StructuralController` (HTTP 403 rejection).
- **Firestore Contract**: All 10 structural collections + 7 core collections + 12 Dirty Dozen adversarial checks.
- **Q (Live CSI ETABS v20 COM OAPI)**: Explicitly marked `NOT RUN` when executed outside Windows x64 + CSI ETABS v20 (`ETABSv1.dll`).
