# AL BUNYAN — Windows Engineering Agent (CSI ETABS v20 OAPI)

## Overview
`Bunyan.EtabsAgent` is a standalone Windows x64 `.NET Framework 4.8` engineering connector bridging local CSI ETABS v20 (`ETABSv1.dll`) with the AL BUNYAN backend over authenticated loopback HTTP (`127.0.0.1:45820`).

## Safety & Engineering Rules
- **Read-Only Default**: Attaches to running ETABS v20 instances via `ETABSv1.cHelper.GetObject("CSI.ETABS.API.ETABSObject")` and never auto-runs analysis or mutates `.EDB` files.
- **Explicit File Open Only**: `.EDB` files can only be opened when `AuthorizedByUser = true` and the path points to an existing `.edb` file.
- **Loopback & Token Auth**: Binds exclusively to `127.0.0.1` and requires `Authorization: Bearer <token>` matching `BUNYAN_AGENT_TOKEN` (`STRUCTURAL_AGENT_TOKEN` on the Node backend).

## Build on Windows (Visual Studio 2022 / MSBuild)
```powershell
set BUNYAN_AGENT_TOKEN=your-secure-random-token-at-least-16-chars
msbuild Bunyan.EtabsAgent.csproj /p:Configuration=Release /p:Platform=x64 /p:EtabsInstallDir="C:\Program Files\Computers and Structures\ETABS 20"
.\bin\x64\Release\net48\Bunyan.EtabsAgent.exe
```
