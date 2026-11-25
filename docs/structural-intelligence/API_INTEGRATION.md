# Structural Intelligence API Integration

## Backend Endpoints (`/api/structural/*`)
All endpoints (except `/health`) require valid `x-bunyan-uid` and `x-bunyan-structural-role` headers enforced against the 5-role RBAC matrix.

- `GET /api/structural/health` — Backend module liveness check.
- `GET /api/structural/agent/status` — Probes the Windows Engineering Agent (`/v1/etabs/status`) for ETABS v20 installation, COM session, and loaded `.EDB`.
- `POST /api/structural/agent/open-model` — Requires `canConnectEtabsAgent` role and `{ modelFilePath, authorizedByUser: true }`.
- `POST /api/structural/agent/extract-preview` — Requires `canStageImport` role. Extracts active ETABS v20 model into an 11-step `StructuralImportPreview`.
- `POST /api/structural/import/preview` — Stages preview from parsed ETABS Database Table exports (JSON/CSV/XLSX).
- `POST /api/structural/import/confirm` — Requires `canConfirmImportRevision` (`administrator` or `structural_engineer`) and `confirmedByUser: true`. Saves immutable revision snapshot + audit report.
- `POST /api/structural/jobs/:jobId/cancel` — Cancels in-progress extraction on backend and Windows Agent.
- `GET /api/structural/projects/:projectId/revisions` — Lists immutable revisions scoped to owner.

## Windows Agent Endpoints (`http://127.0.0.1:45820`)
Requires `Authorization: Bearer <BUNYAN_AGENT_TOKEN>` or `X-Bunyan-Agent-Token`:
- `GET /health`
- `GET /v1/etabs/status`
- `POST /v1/etabs/open-model`
- `POST /v1/etabs/extract`
- `POST /v1/etabs/cancel?jobId=...`
