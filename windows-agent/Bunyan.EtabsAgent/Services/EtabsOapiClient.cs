using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using Bunyan.EtabsAgent.Models;
using ETABSv1;

namespace Bunyan.EtabsAgent.Services
{
    public sealed class EtabsOapiClient
    {
        private readonly string? _configuredExePath;
        private readonly bool _readOnlyMode;

        public EtabsOapiClient(string? configuredExePath, bool readOnlyMode = true)
        {
            _configuredExePath = configuredExePath;
            _readOnlyMode = readOnlyMode;
        }

        public EtabsAgentStatus GetStatus()
        {
            var install = EtabsV20Detector.Detect(_configuredExePath);
            var status = new EtabsAgentStatus
            {
                ReadOnlyMode = _readOnlyMode,
                EtabsInstalled = install.Installed,
                EtabsV20Compatible = install.V20Compatible,
                InstalledVersion = install.VersionString,
                InstallPath = install.ExecutablePath,
                OapiDllPath = install.OapiDllPath,
                CheckedAtUtc = DateTime.UtcNow
            };

            if (!install.Installed)
            {
                status.ConnectionState = "ETABS_NOT_INSTALLED";
                status.Message = install.DetectionNotes;
                return status;
            }

            try
            {
                cOAPI? etabsObject = TryAttachActiveInstance();
                if (etabsObject == null)
                {
                    status.ActiveInstanceRunning = false;
                    status.ConnectionState = "NO_ACTIVE_INSTANCE";
                    status.Message = "ETABS v20 is installed, but no running ETABS instance was found.";
                    return status;
                }

                cSapModel sapModel = etabsObject.SapModel;
                string ver = string.Empty;
                double numVer = 0;
                sapModel.GetVersion(ref ver, ref numVer);
                string modelFile = sapModel.GetModelFilename(true) ?? string.Empty;
                string modelShort = sapModel.GetModelFilename(false) ?? string.Empty;

                status.ActiveInstanceRunning = true;
                status.InstalledVersion = string.IsNullOrWhiteSpace(ver) ? status.InstalledVersion : ver;
                status.EtabsV20Compatible = Math.Floor(numVer) == 20 || ver.StartsWith("20", StringComparison.Ordinal);
                status.ActiveModelPath = modelFile;
                status.ActiveModelName = string.IsNullOrWhiteSpace(modelShort) ? Path.GetFileName(modelFile) : modelShort;
                status.ModelLocked = sapModel.GetModelIsLocked();
                status.ConnectionState = status.EtabsV20Compatible
                    ? (string.IsNullOrWhiteSpace(modelFile) ? "CONNECTED_NO_MODEL" : "CONNECTED_MODEL_READY")
                    : "UNSUPPORTED_ETABS_VERSION";
                status.Message = string.IsNullOrWhiteSpace(modelFile)
                    ? "Attached to ETABS v20, but no .EDB model is currently open."
                    : $"Attached read-only to ETABS v20 active model '{status.ActiveModelName}'.";

                return status;
            }
            catch (COMException comEx)
            {
                status.ConnectionState = "COM_CONNECTION_ERROR";
                status.Message = $"COM OAPI attachment error (0x{comEx.HResult:X8}): {comEx.Message}";
                return status;
            }
            catch (Exception ex)
            {
                status.ConnectionState = "AGENT_ERROR";
                status.Message = ex.Message;
                return status;
            }
        }

        public EtabsAgentStatus OpenAuthorizedModel(EtabsOpenModelRequest request)
        {
            if (!request.AuthorizedByUser)
            {
                throw new InvalidOperationException("Opening an .EDB model requires explicit user authorization.");
            }

            if (string.IsNullOrWhiteSpace(request.ModelFilePath))
            {
                throw new ArgumentException("ModelFilePath is required.");
            }

            string fullPath = Path.GetFullPath(request.ModelFilePath);
            string ext = Path.GetExtension(fullPath);
            if (!string.Equals(ext, ".edb", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Only .EDB ETABS model files are permitted.");
            }

            if (!File.Exists(fullPath))
            {
                throw new FileNotFoundException("Requested ETABS model file does not exist.", fullPath);
            }

            var install = EtabsV20Detector.Detect(_configuredExePath);
            if (!install.V20Compatible || string.IsNullOrWhiteSpace(install.ExecutablePath))
            {
                throw new InvalidOperationException("Compatible CSI ETABS v20 executable is not installed on this machine.");
            }

            cOAPI? etabsObject = TryAttachActiveInstance();
            if (etabsObject == null)
            {
                cHelper helper = new Helper();
                etabsObject = helper.CreateObject(install.ExecutablePath);
                int startRet = etabsObject.ApplicationStart();
                if (startRet != 0)
                {
                    throw new InvalidOperationException($"ETABS ApplicationStart returned error code {startRet}.");
                }
            }

            cSapModel sapModel = etabsObject.SapModel;
            int openRet = sapModel.File.OpenFile(fullPath);
            if (openRet != 0)
            {
                throw new InvalidOperationException($"ETABS File.OpenFile returned error code {openRet}.");
            }

            return GetStatus();
        }

        public EtabsExtractResponse ExtractActiveModel(EtabsExtractRequest request, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();

            cOAPI? etabsObject = TryAttachActiveInstance();
            if (etabsObject == null)
            {
                throw new InvalidOperationException("No active CSI ETABS v20 instance is running. Open ETABS v20 first.");
            }

            cSapModel sapModel = etabsObject.SapModel;
            string ver = string.Empty;
            double numVer = 0;
            sapModel.GetVersion(ref ver, ref numVer);
            if (Math.Floor(numVer) != 20 && !ver.StartsWith("20", StringComparison.Ordinal))
            {
                throw new InvalidOperationException($"Unsupported ETABS version '{ver}'. Phase 1 requires CSI ETABS v20.");
            }

            string modelPath = sapModel.GetModelFilename(true) ?? string.Empty;
            if (string.IsNullOrWhiteSpace(modelPath))
            {
                throw new InvalidOperationException("ETABS v20 is running, but no .EDB model is currently loaded.");
            }

            eForce forceUnit = eForce.kN;
            eLength lengthUnit = eLength.m;
            eTemperature tempUnit = eTemperature.C;
            sapModel.GetPresentUnits_2(ref forceUnit, ref lengthUnit, ref tempUnit);

            var payload = new EtabsExtractResponse
            {
                JobId = string.IsNullOrWhiteSpace(request.JobId) ? Guid.NewGuid().ToString("N") : request.JobId,
                SourceApplication = "CSI ETABS",
                SourceVersion = string.IsNullOrWhiteSpace(ver) ? numVer.ToString("0.00") : ver,
                ModelFilePath = modelPath,
                ModelName = Path.GetFileNameWithoutExtension(modelPath),
                ForceUnit = forceUnit.ToString(),
                LengthUnit = lengthUnit.ToString(),
                TemperatureUnit = tempUnit.ToString(),
                UnitsLabel = $"{forceUnit}-{lengthUnit}",
                CoordinateSystem = sapModel.GetPresentCoordSystem() ?? "Global",
                ModelLocked = sapModel.GetModelIsLocked(),
                ReadOnlyVerified = _readOnlyMode,
                ExtractedAtUtc = DateTime.UtcNow.ToString("O")
            };

            cancellationToken.ThrowIfCancellationRequested();
            ExtractStories(sapModel, payload);

            cancellationToken.ThrowIfCancellationRequested();
            ExtractGrids(sapModel, payload);

            cancellationToken.ThrowIfCancellationRequested();
            ExtractMaterials(sapModel, payload);

            cancellationToken.ThrowIfCancellationRequested();
            ExtractSections(sapModel, payload);

            cancellationToken.ThrowIfCancellationRequested();
            ExtractPoints(sapModel, payload);

            cancellationToken.ThrowIfCancellationRequested();
            ExtractFrames(sapModel, payload);

            cancellationToken.ThrowIfCancellationRequested();
            ExtractAreas(sapModel, payload);

            cancellationToken.ThrowIfCancellationRequested();
            ExtractLoads(sapModel, payload);

            if (request.IncludeDatabaseTableCatalog)
            {
                cancellationToken.ThrowIfCancellationRequested();
                ExtractAvailableTables(sapModel, payload);
            }

            return payload;
        }

        private static cOAPI? TryAttachActiveInstance()
        {
            cHelper helper = new Helper();
            return helper.GetObject("CSI.ETABS.API.ETABSObject");
        }

        private static void ExtractStories(cSapModel sapModel, EtabsExtractResponse payload)
        {
            double baseElev = 0;
            int numStories = 0;
            string[] storyNames = Array.Empty<string>();
            double[] storyElevations = Array.Empty<double>();
            double[] storyHeights = Array.Empty<double>();
            bool[] isMaster = Array.Empty<bool>();
            string[] similarTo = Array.Empty<string>();
            bool[] spliceAbove = Array.Empty<bool>();
            double[] spliceHeight = Array.Empty<double>();
            int[] color = Array.Empty<int>();

            int ret = sapModel.Story.GetStories_2(
                ref baseElev,
                ref numStories,
                ref storyNames,
                ref storyElevations,
                ref storyHeights,
                ref isMaster,
                ref similarTo,
                ref spliceAbove,
                ref spliceHeight,
                ref color
            );

            if (ret != 0 || storyNames == null)
            {
                payload.Warnings.Add($"Story.GetStories_2 returned code {ret}.");
                return;
            }

            for (int i = 0; i < numStories && i < storyNames.Length; i++)
            {
                payload.Stories.Add(new EtabsStoryDto
                {
                    Name = storyNames[i],
                    Elevation = i < storyElevations.Length ? storyElevations[i] : 0,
                    Height = i < storyHeights.Length ? storyHeights[i] : 0,
                    IsMasterStory = i < isMaster.Length && isMaster[i],
                    SimilarToStory = i < similarTo.Length ? similarTo[i] ?? string.Empty : string.Empty,
                    SpliceAbove = i < spliceAbove.Length && spliceAbove[i],
                    SpliceHeight = i < spliceHeight.Length ? spliceHeight[i] : 0
                });
            }
        }

        private static void ExtractGrids(cSapModel sapModel, EtabsExtractResponse payload)
        {
            int count = 0;
            string[] gridNames = Array.Empty<string>();
            int ret = sapModel.GridSys.GetNameList(ref count, ref gridNames);
            if (ret != 0 || gridNames == null)
            {
                return;
            }

            foreach (var name in gridNames)
            {
                double x0 = 0, y0 = 0, rz = 0;
                string gridType = "Cartesian";
                int numX = 0, numY = 0;
                string[] gridLineX = Array.Empty<string>(), gridLineY = Array.Empty<string>();
                double[] ordX = Array.Empty<double>(), ordY = Array.Empty<double>();
                bool[] visX = Array.Empty<bool>(), visY = Array.Empty<bool>();
                string[] bubbleX = Array.Empty<string>(), bubbleY = Array.Empty<string>();

                int gRet = sapModel.GridSys.GetGridSys_2(
                    name,
                    ref x0, ref y0, ref rz,
                    ref gridType,
                    ref numX, ref numY,
                    ref gridLineX, ref gridLineY,
                    ref ordX, ref ordY,
                    ref visX, ref visY,
                    ref bubbleX, ref bubbleY
                );

                if (gRet != 0) continue;

                var gridDto = new EtabsGridDto
                {
                    Name = name,
                    GridType = gridType ?? "Cartesian",
                    OriginX = x0,
                    OriginY = y0,
                    RotationDeg = rz
                };

                for (int i = 0; i < numX && i < gridLineX.Length; i++)
                {
                    gridDto.XLines.Add(new EtabsGridLineDto
                    {
                        Id = gridLineX[i],
                        Coordinate = i < ordX.Length ? ordX[i] : 0,
                        Visible = i < visX.Length && visX[i]
                    });
                }

                for (int i = 0; i < numY && i < gridLineY.Length; i++)
                {
                    gridDto.YLines.Add(new EtabsGridLineDto
                    {
                        Id = gridLineY[i],
                        Coordinate = i < ordY.Length ? ordY[i] : 0,
                        Visible = i < visY.Length && visY[i]
                    });
                }

                payload.Grids.Add(gridDto);
            }
        }

        private static void ExtractMaterials(cSapModel sapModel, EtabsExtractResponse payload)
        {
            int count = 0;
            string[] names = Array.Empty<string>();
            int ret = sapModel.PropMaterial.GetNameList(ref count, ref names);
            if (ret != 0 || names == null) return;

            foreach (var name in names)
            {
                eMatType matType = eMatType.Concrete;
                int color = 0;
                string notes = string.Empty, guid = string.Empty;
                sapModel.PropMaterial.GetMaterial(name, ref matType, ref color, ref notes, ref guid);

                double e = 0, u = 0, a = 0, g = 0;
                sapModel.PropMaterial.GetMPIsotropic(name, ref e, ref u, ref a, ref g);

                double w = 0, m = 0;
                sapModel.PropMaterial.GetWeightAndMass(name, ref w, ref m);

                double strength = 0;
                if (matType == eMatType.Concrete)
                {
                    bool isLw = false;
                    double fcs = 0;
                    int sst = 0, hys = 0;
                    double eps1 = 0, eps2 = 0, finalSlope = 0, fa = 0, fb = 0;
                    sapModel.PropMaterial.GetOConcrete_1(name, ref strength, ref isLw, ref fcs, ref sst, ref hys, ref eps1, ref eps2, ref finalSlope, ref fa, ref fb);
                }
                else if (matType == eMatType.Rebar)
                {
                    double fu = 0, eFy = 0, eFu = 0;
                    int sst = 0, hys = 0;
                    double sh = 0, su = 0, finalSlope = 0;
                    bool useCal = false;
                    sapModel.PropMaterial.GetORebar_1(name, ref strength, ref fu, ref eFy, ref eFu, ref sst, ref hys, ref sh, ref su, ref finalSlope, ref useCal);
                }

                payload.Materials.Add(new EtabsMaterialDto
                {
                    Name = name,
                    MaterialType = matType.ToString(),
                    ModulusE = e,
                    PoissonU = u,
                    ThermalCoeffA = a,
                    UnitWeight = w,
                    FcOrFy = strength
                });
            }
        }

        private static void ExtractSections(cSapModel sapModel, EtabsExtractResponse payload)
        {
            int fCount = 0;
            string[] fNames = Array.Empty<string>();
            if (sapModel.PropFrame.GetNameList(ref fCount, ref fNames) == 0 && fNames != null)
            {
                foreach (var name in fNames)
                {
                    eFramePropType propType = eFramePropType.Rectangular;
                    sapModel.PropFrame.GetTypeOAPI(name, ref propType);

                    string fileName = string.Empty, matProp = string.Empty, notes = string.Empty, guid = string.Empty;
                    double t3 = 0, t2 = 0;
                    int color = 0;

                    if (propType == eFramePropType.Rectangular)
                    {
                        sapModel.PropFrame.GetRectangle(name, ref fileName, ref matProp, ref t3, ref t2, ref color, ref notes, ref guid);
                    }
                    else if (propType == eFramePropType.Circle)
                    {
                        sapModel.PropFrame.GetCircle(name, ref fileName, ref matProp, ref t3, ref color, ref notes, ref guid);
                        t2 = t3;
                    }

                    payload.Sections.Add(new EtabsSectionDto
                    {
                        Name = name,
                        Category = "Frame",
                        ShapeOrType = propType.ToString(),
                        MaterialName = matProp,
                        DepthOrThickness = t3,
                        Width = t2
                    });
                }
            }

            int aCount = 0;
            string[] aNames = Array.Empty<string>();
            if (sapModel.PropArea.GetNameList(ref aCount, ref aNames) == 0 && aNames != null)
            {
                foreach (var name in aNames)
                {
                    eSlabType slabType = eSlabType.Slab;
                    eShellType shellType = eShellType.ShellThin;
                    string matProp = string.Empty, notes = string.Empty, guid = string.Empty;
                    double thickness = 0;
                    int color = 0;
                    if (sapModel.PropArea.GetSlab(name, ref slabType, ref shellType, ref matProp, ref thickness, ref color, ref notes, ref guid) == 0)
                    {
                        payload.Sections.Add(new EtabsSectionDto
                        {
                            Name = name,
                            Category = "Area",
                            ShapeOrType = slabType.ToString(),
                            MaterialName = matProp,
                            DepthOrThickness = thickness,
                            Width = 0
                        });
                    }
                    else
                    {
                        eWallPropType wallType = eWallPropType.Specified;
                        if (sapModel.PropArea.GetWall(name, ref wallType, ref shellType, ref matProp, ref thickness, ref color, ref notes, ref guid) == 0)
                        {
                            payload.Sections.Add(new EtabsSectionDto
                            {
                                Name = name,
                                Category = "Area",
                                ShapeOrType = $"Wall:{wallType}",
                                MaterialName = matProp,
                                DepthOrThickness = thickness,
                                Width = 0
                            });
                        }
                    }
                }
            }
        }

        private static void ExtractPoints(cSapModel sapModel, EtabsExtractResponse payload)
        {
            int count = 0;
            string[] names = Array.Empty<string>();
            if (sapModel.PointObj.GetNameList(ref count, ref names) != 0 || names == null) return;

            foreach (var name in names)
            {
                double x = 0, y = 0, z = 0;
                sapModel.PointObj.GetCoordCartesian(name, ref x, ref y, ref z);
                string label = string.Empty, story = string.Empty;
                sapModel.PointObj.GetLabelFromName(name, ref label, ref story);

                payload.Points.Add(new EtabsPointDto
                {
                    Name = name,
                    X = x,
                    Y = y,
                    Z = z,
                    Label = label ?? string.Empty,
                    Story = story ?? string.Empty
                });
            }
        }

        private static void ExtractFrames(cSapModel sapModel, EtabsExtractResponse payload)
        {
            int count = 0;
            string[] names = Array.Empty<string>();
            if (sapModel.FrameObj.GetNameList(ref count, ref names) != 0 || names == null) return;

            foreach (var name in names)
            {
                string p1 = string.Empty, p2 = string.Empty;
                sapModel.FrameObj.GetPoints(name, ref p1, ref p2);

                string propName = string.Empty, sAuto = string.Empty;
                sapModel.FrameObj.GetSection(name, ref propName, ref sAuto);

                string label = string.Empty, story = string.Empty;
                sapModel.FrameObj.GetLabelFromName(name, ref label, ref story);

                eFrameDesignOrientation orient = eFrameDesignOrientation.Null;
                sapModel.FrameObj.GetDesignOrientation(name, ref orient);

                string matOver = string.Empty;
                sapModel.FrameObj.GetMaterialOverwrite(name, ref matOver);

                payload.Frames.Add(new EtabsFrameDto
                {
                    Name = name,
                    UniqueName = name,
                    Label = label ?? string.Empty,
                    Story = story ?? string.Empty,
                    PointI = p1 ?? string.Empty,
                    PointJ = p2 ?? string.Empty,
                    SectionName = propName ?? string.Empty,
                    DesignOrientation = orient.ToString(),
                    MaterialOverwrite = matOver ?? string.Empty
                });
            }
        }

        private static void ExtractAreas(cSapModel sapModel, EtabsExtractResponse payload)
        {
            int count = 0;
            string[] names = Array.Empty<string>();
            if (sapModel.AreaObj.GetNameList(ref count, ref names) != 0 || names == null) return;

            foreach (var name in names)
            {
                int nPts = 0;
                string[] pts = Array.Empty<string>();
                sapModel.AreaObj.GetPoints(name, ref nPts, ref pts);

                string propName = string.Empty;
                sapModel.AreaObj.GetProperty(name, ref propName);

                string label = string.Empty, story = string.Empty;
                sapModel.AreaObj.GetLabelFromName(name, ref label, ref story);

                eAreaDesignOrientation orient = eAreaDesignOrientation.Null;
                sapModel.AreaObj.GetDesignOrientation(name, ref orient);

                bool isOpening = false;
                sapModel.AreaObj.GetOpening(name, ref isOpening);

                payload.Areas.Add(new EtabsAreaDto
                {
                    Name = name,
                    UniqueName = name,
                    Label = label ?? string.Empty,
                    Story = story ?? string.Empty,
                    PointNames = pts != null ? new List<string>(pts) : new List<string>(),
                    SectionName = propName ?? string.Empty,
                    DesignOrientation = orient.ToString(),
                    IsOpening = isOpening
                });
            }
        }

        private static void ExtractLoads(cSapModel sapModel, EtabsExtractResponse payload)
        {
            int pCount = 0;
            string[] pNames = Array.Empty<string>();
            if (sapModel.LoadPatterns.GetNameList(ref pCount, ref pNames) == 0 && pNames != null)
            {
                foreach (var name in pNames)
                {
                    eLoadPatternType pType = eLoadPatternType.Dead;
                    sapModel.LoadPatterns.GetLoadType(name, ref pType);
                    double sw = 0;
                    sapModel.LoadPatterns.GetSelfWTMultiplier(name, ref sw);
                    payload.LoadPatterns.Add(new EtabsLoadPatternDto
                    {
                        Name = name,
                        PatternType = pType.ToString(),
                        SelfWeightMultiplier = sw
                    });
                }
            }

            int statusCount = 0;
            string[] statusCaseNames = Array.Empty<string>();
            int[] statuses = Array.Empty<int>();
            var statusMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (sapModel.Analyze.GetCaseStatus(ref statusCount, ref statusCaseNames, ref statuses) == 0 && statusCaseNames != null)
            {
                for (int i = 0; i < statusCount && i < statusCaseNames.Length; i++)
                {
                    int code = i < statuses.Length ? statuses[i] : 1;
                    statusMap[statusCaseNames[i]] = code switch
                    {
                        1 => "NotRun",
                        2 => "CouldNotStart",
                        3 => "NotFinished",
                        4 => "Finished",
                        _ => "Unknown"
                    };
                }
            }

            int cCount = 0;
            string[] cNames = Array.Empty<string>();
            if (sapModel.LoadCases.GetNameList(ref cCount, ref cNames) == 0 && cNames != null)
            {
                foreach (var name in cNames)
                {
                    eLoadCaseType cType = eLoadCaseType.LinearStatic;
                    int subType = 0;
                    eLoadPatternType designType = eLoadPatternType.Dead;
                    int designTypeOption = 0;
                    int auto = 0;
                    sapModel.LoadCases.GetTypeOAPI_1(name, ref cType, ref subType, ref designType, ref designTypeOption, ref auto);

                    payload.LoadCases.Add(new EtabsLoadCaseDto
                    {
                        Name = name,
                        CaseType = cType.ToString(),
                        AnalysisStatus = statusMap.TryGetValue(name, out var st) ? st : "NotRun"
                    });
                }
            }

            int rCount = 0;
            string[] rNames = Array.Empty<string>();
            if (sapModel.RespCombo.GetNameList(ref rCount, ref rNames) == 0 && rNames != null)
            {
                foreach (var name in rNames)
                {
                    int comboType = 0;
                    sapModel.RespCombo.GetTypeOAPI(name, ref comboType);
                    int nItems = 0;
                    eCNameType[] cNameTypes = Array.Empty<eCNameType>();
                    string[] itemNames = Array.Empty<string>();
                    double[] sf = Array.Empty<double>();
                    sapModel.RespCombo.GetCaseList(name, ref nItems, ref cNameTypes, ref itemNames, ref sf);

                    var combo = new EtabsLoadComboDto
                    {
                        Name = name,
                        ComboType = comboType.ToString()
                    };
                    for (int i = 0; i < nItems && i < itemNames.Length; i++)
                    {
                        combo.Items.Add(new EtabsComboItemDto
                        {
                            CaseOrComboName = itemNames[i],
                            ScaleFactor = i < sf.Length ? sf[i] : 1.0
                        });
                    }
                    payload.LoadCombos.Add(combo);
                }
            }
        }

        private static void ExtractAvailableTables(cSapModel sapModel, EtabsExtractResponse payload)
        {
            int nTables = 0;
            string[] tableKey = Array.Empty<string>();
            string[] tableName = Array.Empty<string>();
            int[] importType = Array.Empty<int>();
            bool[] isEmpty = Array.Empty<bool>();

            int ret = sapModel.DatabaseTables.GetAvailableTables(
                ref nTables,
                ref tableKey,
                ref tableName,
                ref importType,
                ref isEmpty
            );
            if (ret != 0 || tableKey == null) return;

            for (int i = 0; i < nTables && i < tableKey.Length; i++)
            {
                payload.AvailableTables.Add(new EtabsTableStatusDto
                {
                    TableKey = tableKey[i],
                    TableName = i < tableName.Length ? tableName[i] : tableKey[i],
                    IsAvailable = i < isEmpty.Length ? !isEmpty[i] : true
                });
            }
        }
    }
}
