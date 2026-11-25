# CSI ETABS v20 Compatibility Specification

## Supported Target
- **Software**: Computers and Structures, Inc. (CSI) **ETABS v20** (`Major Version = 20`)
- **Official Interface**: CSI OAPI v1 COM Interop (`ETABSv1.dll` / `ETABSv1.cHelper` / `ETABSv1.cOAPI` / `ETABSv1.cSapModel`)
- **Runtime**: Windows 10/11 x64 with `.NET Framework 4.8`

## OAPI Interfaces Consumed (Read-Only)
- `Helper.GetObject("CSI.ETABS.API.ETABSObject")` — attach to active ETABS v20 session
- `Helper.CreateObject(ETABS.exe)` + `SapModel.File.OpenFile` — user-authorized `.EDB` open only
- `SapModel.GetVersion`, `SapModel.GetPresentUnits_2`, `SapModel.GetPresentCoordSystem`, `SapModel.GetModelIsLocked`
- `SapModel.Story.GetStories_2`
- `SapModel.GridSys.GetNameList` & `SapModel.GridSys.GetGridSys_2`
- `SapModel.PropMaterial.GetNameList`, `GetMaterial`, `GetMPIsotropic`, `GetWeightAndMass`, `GetOConcrete_1`, `GetORebar_1`
- `SapModel.PropFrame.GetNameList`, `GetTypeOAPI`, `GetRectangle`, `GetCircle`
- `SapModel.PropArea.GetNameList`, `GetSlab`, `GetWall`
- `SapModel.PointObj.GetNameList`, `GetCoordCartesian`, `GetLabelFromName`
- `SapModel.FrameObj.GetNameList`, `GetPoints`, `GetSection`, `GetDesignOrientation`, `GetMaterialOverwrite`
- `SapModel.AreaObj.GetNameList`, `GetPoints`, `GetProperty`, `GetDesignOrientation`, `GetOpening`
- `SapModel.LoadPatterns`, `SapModel.LoadCases`, `SapModel.Analyze.GetCaseStatus`, `SapModel.RespCombo`
- `SapModel.DatabaseTables.GetAvailableTables`

## Environment Limitations
In cloud/Linux containers lacking Windows x64 COM and CSI ETABS v20 (`ETABSv1.dll`), the live COM path accurately reports `AGENT_UNAVAILABLE` and engineers use the documented **Exported ETABS Database Tables (JSON/CSV/XLSX)** workflow.
