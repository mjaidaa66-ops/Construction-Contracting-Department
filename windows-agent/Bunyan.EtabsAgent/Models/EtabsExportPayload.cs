using System;
using System.Collections.Generic;

namespace Bunyan.EtabsAgent.Models
{
    public sealed class EtabsAgentStatus
    {
        public string AgentVersion { get; set; } = "1.0.0";
        public string Platform { get; set; } = "win-x64-net48";
        public bool ReadOnlyMode { get; set; } = true;
        public bool EtabsInstalled { get; set; }
        public bool EtabsV20Compatible { get; set; }
        public string InstalledVersion { get; set; } = string.Empty;
        public string InstallPath { get; set; } = string.Empty;
        public string OapiDllPath { get; set; } = string.Empty;
        public bool ActiveInstanceRunning { get; set; }
        public string ActiveModelPath { get; set; } = string.Empty;
        public string ActiveModelName { get; set; } = string.Empty;
        public bool ModelLocked { get; set; }
        public string ConnectionState { get; set; } = "DISCONNECTED";
        public string Message { get; set; } = string.Empty;
        public DateTime CheckedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public sealed class EtabsOpenModelRequest
    {
        public string ModelFilePath { get; set; } = string.Empty;
        public bool AuthorizedByUser { get; set; }
    }

    public sealed class EtabsExtractRequest
    {
        public string JobId { get; set; } = string.Empty;
        public string ProjectId { get; set; } = string.Empty;
        public bool IncludeDatabaseTableCatalog { get; set; } = true;
        public bool AttachOnly { get; set; } = true;
    }

    public sealed class EtabsStoryDto
    {
        public string Name { get; set; } = string.Empty;
        public double Elevation { get; set; }
        public double Height { get; set; }
        public bool IsMasterStory { get; set; }
        public string SimilarToStory { get; set; } = string.Empty;
        public bool SpliceAbove { get; set; }
        public double SpliceHeight { get; set; }
    }

    public sealed class EtabsGridDto
    {
        public string Name { get; set; } = string.Empty;
        public string GridType { get; set; } = "Cartesian";
        public double OriginX { get; set; }
        public double OriginY { get; set; }
        public double RotationDeg { get; set; }
        public List<EtabsGridLineDto> XLines { get; set; } = new();
        public List<EtabsGridLineDto> YLines { get; set; } = new();
    }

    public sealed class EtabsGridLineDto
    {
        public string Id { get; set; } = string.Empty;
        public double Coordinate { get; set; }
        public bool Visible { get; set; }
    }

    public sealed class EtabsPointDto
    {
        public string Name { get; set; } = string.Empty;
        public double X { get; set; }
        public double Y { get; set; }
        public double Z { get; set; }
        public string Label { get; set; } = string.Empty;
        public string Story { get; set; } = string.Empty;
    }

    public sealed class EtabsFrameDto
    {
        public string Name { get; set; } = string.Empty;
        public string UniqueName { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;
        public string Story { get; set; } = string.Empty;
        public string PointI { get; set; } = string.Empty;
        public string PointJ { get; set; } = string.Empty;
        public string SectionName { get; set; } = string.Empty;
        public string DesignOrientation { get; set; } = "Unknown";
        public string MaterialOverwrite { get; set; } = string.Empty;
    }

    public sealed class EtabsAreaDto
    {
        public string Name { get; set; } = string.Empty;
        public string UniqueName { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;
        public string Story { get; set; } = string.Empty;
        public List<string> PointNames { get; set; } = new();
        public string SectionName { get; set; } = string.Empty;
        public string DesignOrientation { get; set; } = "Unknown";
        public bool IsOpening { get; set; }
    }

    public sealed class EtabsMaterialDto
    {
        public string Name { get; set; } = string.Empty;
        public string MaterialType { get; set; } = string.Empty;
        public double ModulusE { get; set; }
        public double PoissonU { get; set; }
        public double ThermalCoeffA { get; set; }
        public double UnitWeight { get; set; }
        public double FcOrFy { get; set; }
    }

    public sealed class EtabsSectionDto
    {
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty; // Frame | Area
        public string ShapeOrType { get; set; } = string.Empty;
        public string MaterialName { get; set; } = string.Empty;
        public double DepthOrThickness { get; set; }
        public double Width { get; set; }
    }

    public sealed class EtabsLoadPatternDto
    {
        public string Name { get; set; } = string.Empty;
        public string PatternType { get; set; } = string.Empty;
        public double SelfWeightMultiplier { get; set; }
    }

    public sealed class EtabsLoadCaseDto
    {
        public string Name { get; set; } = string.Empty;
        public string CaseType { get; set; } = string.Empty;
        public string AnalysisStatus { get; set; } = "NotRun";
    }

    public sealed class EtabsLoadComboDto
    {
        public string Name { get; set; } = string.Empty;
        public string ComboType { get; set; } = string.Empty;
        public List<EtabsComboItemDto> Items { get; set; } = new();
    }

    public sealed class EtabsComboItemDto
    {
        public string CaseOrComboName { get; set; } = string.Empty;
        public double ScaleFactor { get; set; }
    }

    public sealed class EtabsTableStatusDto
    {
        public string TableKey { get; set; } = string.Empty;
        public string TableName { get; set; } = string.Empty;
        public bool IsAvailable { get; set; }
    }

    public sealed class EtabsExtractResponse
    {
        public string JobId { get; set; } = string.Empty;
        public string SourceApplication { get; set; } = "CSI ETABS";
        public string SourceVersion { get; set; } = string.Empty;
        public string ModelFilePath { get; set; } = string.Empty;
        public string ModelName { get; set; } = string.Empty;
        public string ForceUnit { get; set; } = string.Empty;
        public string LengthUnit { get; set; } = string.Empty;
        public string TemperatureUnit { get; set; } = string.Empty;
        public string UnitsLabel { get; set; } = string.Empty;
        public string CoordinateSystem { get; set; } = "Global";
        public bool ModelLocked { get; set; }
        public bool ReadOnlyVerified { get; set; } = true;
        public string ExtractedAtUtc { get; set; } = DateTime.UtcNow.ToString("O");
        public List<EtabsStoryDto> Stories { get; set; } = new();
        public List<EtabsGridDto> Grids { get; set; } = new();
        public List<EtabsPointDto> Points { get; set; } = new();
        public List<EtabsFrameDto> Frames { get; set; } = new();
        public List<EtabsAreaDto> Areas { get; set; } = new();
        public List<EtabsMaterialDto> Materials { get; set; } = new();
        public List<EtabsSectionDto> Sections { get; set; } = new();
        public List<EtabsLoadPatternDto> LoadPatterns { get; set; } = new();
        public List<EtabsLoadCaseDto> LoadCases { get; set; } = new();
        public List<EtabsLoadComboDto> LoadCombos { get; set; } = new();
        public List<EtabsTableStatusDto> AvailableTables { get; set; } = new();
        public List<string> Warnings { get; set; } = new();
    }
}
