# Data Provenance & Reliability Classification System

## Reliability Tiers
Every imported or computed structural entity carries one of five explicit classifications:
1. `SOURCE_VERIFIED` — Directly extracted from CSI ETABS v20 via `ETABSv1.dll` COM OAPI and verified against all structural validation error rules.
2. `DERIVED` — Computed transparently inside AL BUNYAN from source geometry (e.g., 3D Euclidean frame length `Euclidean3DLength`, 2D Shoelace slab plan area `ShoelacePlanArea2D`, cumulative story height `CumulativeStoryHeightSum`), storing input IDs, method name, mathematical formula, output unit, and timestamp.
3. `UNVERIFIED` — Imported from user-supplied Exported ETABS Tables (`.json`, `.csv`, `.xlsx`) without live COM OAPI session verification.
4. `MISSING` — Not present in the source extract or pending Phase 2 extraction.
5. `FAILED` — Failed structural completeness/consistency validation (e.g., degenerate frame connectivity or missing stories).

## Mandatory Provenance Fields
Each record attaches: `projectId`, `modelId`, `originalObjectId`, `sourceApplication`, `sourceVersion`, `sourceFileReference`, `importedAt`, `originalUnits`, `normalizedUnits`, `coordinateSystem`, `dataProvenance`, `revisionId`, `validationStatus`, and `reliability`.
