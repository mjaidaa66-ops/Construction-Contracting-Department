export type DataReliabilityStatus =
  | 'SOURCE_VERIFIED'
  | 'DERIVED'
  | 'UNVERIFIED'
  | 'MISSING'
  | 'FAILED';

export type StructuralRole =
  | 'structural_engineer'
  | 'project_engineer'
  | 'project_manager'
  | 'administrator'
  | 'read_only_reviewer';

export interface StructuralRolePermissions {
  structuralRole: StructuralRole;
  canInspectModels: boolean;
  canConnectEtabsAgent: boolean;
  canStageImport: boolean;
  canConfirmImportRevision: boolean;
  canCreateStructuralProject: boolean;
  canModifyPermissions: boolean;
  canExportReports: boolean;
}

export function resolveStructuralRole(
  workspaceRole: 'admin' | 'engineer' | 'accountant',
  override?: StructuralRole
): StructuralRole {
  if (override) return override;
  switch (workspaceRole) {
    case 'admin':
      return 'administrator';
    case 'engineer':
      return 'structural_engineer';
    case 'accountant':
      return 'read_only_reviewer';
  }
}

export function getStructuralRolePermissions(
  role: StructuralRole
): StructuralRolePermissions {
  switch (role) {
    case 'administrator':
      return {
        structuralRole: role,
        canInspectModels: true,
        canConnectEtabsAgent: true,
        canStageImport: true,
        canConfirmImportRevision: true,
        canCreateStructuralProject: true,
        canModifyPermissions: true,
        canExportReports: true,
      };
    case 'structural_engineer':
      return {
        structuralRole: role,
        canInspectModels: true,
        canConnectEtabsAgent: true,
        canStageImport: true,
        canConfirmImportRevision: true,
        canCreateStructuralProject: true,
        canModifyPermissions: false,
        canExportReports: true,
      };
    case 'project_engineer':
      return {
        structuralRole: role,
        canInspectModels: true,
        canConnectEtabsAgent: true,
        canStageImport: true,
        canConfirmImportRevision: false,
        canCreateStructuralProject: false,
        canModifyPermissions: false,
        canExportReports: true,
      };
    case 'project_manager':
      return {
        structuralRole: role,
        canInspectModels: true,
        canConnectEtabsAgent: false,
        canStageImport: false,
        canConfirmImportRevision: false,
        canCreateStructuralProject: true,
        canModifyPermissions: false,
        canExportReports: true,
      };
    case 'read_only_reviewer':
      return {
        structuralRole: role,
        canInspectModels: true,
        canConnectEtabsAgent: false,
        canStageImport: false,
        canConfirmImportRevision: false,
        canCreateStructuralProject: false,
        canModifyPermissions: false,
        canExportReports: true,
      };
  }
}

export interface StructuralProvenance {
  projectId: string;
  modelId: string;
  originalObjectId: string;
  sourceApplication: 'CSI ETABS' | 'ETABS Exported Tables';
  sourceVersion: string;
  sourceFileReference: string;
  importedAt: string;
  originalUnits: string;
  normalizedUnits: string;
  coordinateSystem: string;
  dataProvenance: 'ETABS_OAPI_LIVE' | 'ETABS_EXPORTED_TABLES';
  revisionId: string;
  validationStatus: 'VALID' | 'WARNING' | 'INVALID';
  reliability: DataReliabilityStatus;
}

export interface DerivedCalculationMeta {
  inputValueIds: string[];
  methodName: string;
  formulaDescription: string;
  outputUnit: string;
  computedAt: string;
  reliability: 'DERIVED';
}

export interface StructuralValueWithRaw {
  rawValue: number;
  rawUnit: string;
  normalizedValue: number;
  normalizedUnit: string;
  conversionFactor: number;
}

export interface StructuralProject {
  id: string;
  ownerId: string;
  bunyanProjectId: string;
  code: string;
  name: string;
  nameEn: string;
  structuralSystem: string;
  designCode: string;
  activeRevisionId?: string;
  revisionCount: number;
  reliabilitySummary: DataReliabilityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StructuralModel {
  id: string;
  ownerId: string;
  projectId: string;
  revisionId: string;
  name: string;
  sourceApplication: 'CSI ETABS' | 'ETABS Exported Tables';
  sourceVersion: string;
  sourceFileReference: string;
  originalUnits: string;
  normalizedUnits: string;
  coordinateSystem: string;
  modelLocked: boolean;
  storyCount: number;
  gridCount: number;
  nodeCount: number;
  frameCount: number;
  areaCount: number;
  materialCount: number;
  sectionCount: number;
  loadPatternCount: number;
  loadCaseCount: number;
  loadComboCount: number;
  provenance: StructuralProvenance;
  createdAt: string;
  updatedAt: string;
}

export interface StructuralStory {
  id: string;
  name: string;
  elevationM: number;
  heightM: number;
  rawElevation: StructuralValueWithRaw;
  rawHeight: StructuralValueWithRaw;
  isMasterStory: boolean;
  similarToStory: string;
  spliceAbove: boolean;
  spliceHeightM: number;
  derivedCumulativeHeight?: DerivedCalculationMeta;
  provenance: StructuralProvenance;
}

export interface StructuralGridLine {
  id: string;
  axis: 'X' | 'Y';
  coordinateM: number;
  rawCoordinate: StructuralValueWithRaw;
  visible: boolean;
}

export interface StructuralGrid {
  id: string;
  name: string;
  gridType: string;
  originXM: number;
  originYM: number;
  rotationDeg: number;
  xLines: StructuralGridLine[];
  yLines: StructuralGridLine[];
  provenance: StructuralProvenance;
}

export interface StructuralNode {
  id: string;
  name: string;
  label: string;
  story: string;
  xM: number;
  yM: number;
  zM: number;
  rawX: StructuralValueWithRaw;
  rawY: StructuralValueWithRaw;
  rawZ: StructuralValueWithRaw;
  provenance: StructuralProvenance;
}

export interface StructuralFrame {
  id: string;
  name: string;
  uniqueName: string;
  label: string;
  story: string;
  elementRole: 'COLUMN' | 'BEAM' | 'BRACE' | 'FRAME_OTHER';
  pointI: string;
  pointJ: string;
  sectionName: string;
  materialOverwrite: string;
  derivedLengthM?: number;
  derivedMeta?: DerivedCalculationMeta;
  provenance: StructuralProvenance;
}

export interface StructuralArea {
  id: string;
  name: string;
  uniqueName: string;
  label: string;
  story: string;
  elementRole: 'SLAB' | 'WALL' | 'OPENING' | 'AREA_OTHER';
  pointNames: string[];
  sectionName: string;
  isOpening: boolean;
  derivedPlanAreaM2?: number;
  derivedMeta?: DerivedCalculationMeta;
  provenance: StructuralProvenance;
}

export interface StructuralMaterial {
  id: string;
  name: string;
  materialType: string;
  modulusEMPa: number;
  rawModulusE: StructuralValueWithRaw;
  poissonRatio: number;
  thermalCoeff: number;
  unitWeightKNPerM3: number;
  rawUnitWeight: StructuralValueWithRaw;
  characteristicStrengthMPa: number;
  rawStrength: StructuralValueWithRaw;
  provenance: StructuralProvenance;
}

export interface StructuralSection {
  id: string;
  name: string;
  category: 'Frame' | 'Area';
  shapeOrType: string;
  materialName: string;
  depthOrThicknessM: number;
  widthM: number;
  rawDepthOrThickness: StructuralValueWithRaw;
  rawWidth: StructuralValueWithRaw;
  provenance: StructuralProvenance;
}

export interface StructuralLoadPattern {
  id: string;
  name: string;
  patternType: string;
  selfWeightMultiplier: number;
  provenance: StructuralProvenance;
}

export interface StructuralLoadCase {
  id: string;
  name: string;
  caseType: string;
  analysisStatus: 'NotRun' | 'CouldNotStart' | 'NotFinished' | 'Finished' | 'Unknown';
  provenance: StructuralProvenance;
}

export interface StructuralLoadCombination {
  id: string;
  name: string;
  comboType: string;
  items: Array<{ caseOrComboName: string; scaleFactor: number }>;
  provenance: StructuralProvenance;
}

export type ImportJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PREVIEW_READY'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'FAILED';

export interface StructuralImportJob {
  id: string;
  ownerId: string;
  projectId: string;
  revisionId: string;
  sourceMode: 'ETABS_OAPI_LIVE' | 'ETABS_EXPORTED_TABLES';
  sourceFileReference: string;
  sourceHash: string;
  status: ImportJobStatus;
  currentStep: number;
  totalSteps: number;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  retryCount: number;
  reliabilitySummary: DataReliabilityStatus;
}

export interface StructuralValidationIssue {
  id: string;
  code: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  entityType: string;
  entityId: string;
  messageAr: string;
  messageEn: string;
  field?: string;
}

export interface StructuralValidation {
  id: string;
  ownerId: string;
  projectId: string;
  revisionId: string;
  status: 'PASSED' | 'PASSED_WITH_WARNINGS' | 'FAILED';
  reliability: DataReliabilityStatus;
  checkedAt: string;
  errorCount: number;
  warningCount: number;
  issues: StructuralValidationIssue[];
}

export interface StructuralModelRevision {
  id: string;
  ownerId: string;
  projectId: string;
  modelId: string;
  revisionNumber: number;
  label: string;
  sourceHash: string;
  immutable: true;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  summary: {
    stories: number;
    grids: number;
    nodes: number;
    frames: number;
    areas: number;
    materials: number;
    sections: number;
    loadPatterns: number;
    loadCases: number;
    loadCombinations: number;
  };
  reliability: DataReliabilityStatus;
}
