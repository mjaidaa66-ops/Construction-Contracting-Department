# Security & Hardening Specification (Phase 1)

## Backend & Agent Security Controls
- **Loopback SSRF Guard**: `validateAgentBaseUrl` restricts the Structural Agent base URL strictly to `127.0.0.1`, `localhost`, or `::1` unless `ALLOW_REMOTE_STRUCTURAL_AGENT=true`.
- **Shared-Secret Bearer Auth**: `Bunyan.EtabsAgent` uses constant-time comparison (`CryptographicOperations.FixedTimeEquals`) against `BUNYAN_AGENT_TOKEN` (`STRUCTURAL_AGENT_TOKEN` on Node). No hardcoded secret defaults exist.
- **Read-Only COM Guard**: `EtabsOapiClient` never calls `RunAnalysis`, `StartDesign`, or `File.Save`.
- **Zero Arbitrary Code Execution**: Uploaded JSON/CSV/XLSX tables are parsed in memory without shell commands (`exec`/`spawn`), macro execution, or DLL/EXE loading. CSV cells leading with `=`, `+`, `-`, `@` are neutralized.

## Role-Based Access Control (5 Roles)
- `administrator` — full inspection, agent connection, staging, confirmation, project setup, and reports.
- `structural_engineer` — full inspection, agent connection, staging, confirmation, project setup, and reports.
- `project_engineer` — inspect, connect agent, stage import preview, export reports (cannot confirm immutable revisions).
- `project_manager` — inspect, create structural project, export reports.
- `read_only_reviewer` — read-only model inspection and report export.

## Cloud Firestore Security Rules
All 10 structural collections enforce `isEmailVerified()`, strict `ownerId == request.auth.uid || isAdmin()`, `hasAll`/`hasOnly` field whitelists, `hasValidStructuralProjectParent(projectId)` orphan prevention, immutable revisions (`allow update: if false;`), and `request.time` timestamp validation. Verified with `@firebase/eslint-plugin-security-rules`.
