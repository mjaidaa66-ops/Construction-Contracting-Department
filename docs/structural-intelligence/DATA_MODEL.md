# Normalized Structural Data Model

Defined in `src/modules/structural/types/`:
- `StructuralProject` (`structuralProjects`)
- `StructuralModel` (`structuralModels`)
- `StructuralStory`, `StructuralGrid`, `StructuralNode`, `StructuralFrame`, `StructuralArea`, `StructuralLoadPattern`, `StructuralLoadCase`, `StructuralLoadCombination` (`structuralElements`)
- `StructuralMaterial` (`structuralMaterials`)
- `StructuralSection` (`structuralSections`)
- `StructuralAnalysisResult`, `StructuralDesignResult` (`structuralResults`)
- `StructuralImportJob` (`structuralImports`)
- `StructuralValidation` (`structuralValidations`)
- `StructuralModelRevision` (`structuralRevisions`)
- `StructuralReportDocument` (`structuralReports`)

## SI Normalization Contract
All coordinates, story elevations, story heights, and section dimensions are converted into meters (`m`); stresses (`E`, `fc`, `fy`) into `MPa`; and unit weights into `kN/m3`. Every normalized numeric property retains its companion `StructuralValueWithRaw` record (`rawValue`, `rawUnit`, `normalizedValue`, `normalizedUnit`, `conversionFactor`).
