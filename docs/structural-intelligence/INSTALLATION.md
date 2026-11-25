# Installation & Setup Guide

## 1. AL BUNYAN Web & Node.js Platform
1. Install Node.js 20+ dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables in `.env` (refer to `.env.example`):
   ```env
   STRUCTURAL_AGENT_URL="http://127.0.0.1:45820"
   STRUCTURAL_AGENT_TOKEN="<matching-random-token-min-16-chars>"
   ALLOW_REMOTE_STRUCTURAL_AGENT="false"
   ```
3. Run development or production server:
   ```bash
   npm run dev
   ```

## 2. Windows Engineering Agent (`Bunyan.EtabsAgent`)
On the Windows 10/11 x64 engineering workstation with **CSI ETABS v20** installed:
1. Open Developer Command Prompt for Visual Studio 2022 (`x64`).
2. Build targeting `.NET Framework 4.8` and ETABS v20's `ETABSv1.dll`:
   ```powershell
   msbuild windows-agent\Bunyan.EtabsAgent\Bunyan.EtabsAgent.csproj /p:Configuration=Release /p:Platform=x64 /p:EtabsInstallDir="C:\Program Files\Computers and Structures\ETABS 20"
   ```
3. Set matching token and start the agent:
   ```powershell
   set BUNYAN_AGENT_TOKEN=<matching-random-token-min-16-chars>
   .\windows-agent\Bunyan.EtabsAgent\bin\x64\Release\net48\Bunyan.EtabsAgent.exe
   ```
4. Open an `.EDB` project in CSI ETABS v20, then open AL BUNYAN -> **Structural Intelligence** -> **ETABS Connection Center**.
