import type {
  DataReliabilityStatus,
  StructuralArea,
  StructuralFrame,
  StructuralGrid,
  StructuralImportJob,
  StructuralLoadCase,
  StructuralLoadCombination,
  StructuralLoadPattern,
  StructuralMaterial,
  StructuralModel,
  StructuralModelRevision,
  StructuralNode,
  StructuralProvenance,
  StructuralSection,
  StructuralStory,
  StructuralValidation,
} from './structural.types';

export interface StructuralAnalysisResult {
  id: string;
  ownerId: string;
  projectId: string;
  modelId: string;
  revisionId: string;
  resultCategory: 'MODAL' | 'STORY_DRIFT' | 'BASE_SHEAR' | 'ELEMENT_FORCES' | 'CASE_STATUS';
  status: 'AVAILABLE_FROM_SOURCE' | 'NOT_RUN_PHASE_2_PENDING';
  caseName: string;
  summaryMetrics: Record<string, number | string>;
  provenance: StructuralProvenance;
}

export interface StructuralDesignResult {
  id: string;
  ownerId: string;
  projectId: string;
  modelId: string;
  revisionId: string;
  designCode: string;
  status: 'AVAILABLE_FROM_SOURCE' | 'NOT_RUN_PHASE_2_PENDING';
  memberCountChecked: number;
  notes: string;
  provenance: StructuralProvenance;
}

export interface ImportStepState {
  stepNumber: number;
  key: string;
  titleAr: string;
  titleEn: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'WARNING' | 'FAILED' | 'SKIPPED';
  detail?: string;
}

export interface NormalizedStructuralDataset {
  model: StructuralModel;
  stories: StructuralStory[];
  grids: StructuralGrid[];
  nodes: StructuralNode[];
  frames: StructuralFrame[];
  areas: StructuralArea[];
  materials: StructuralMaterial[];
  sections: StructuralSection[];
  loadPatterns: StructuralLoadPattern[];
  loadCases: StructuralLoadCase[];
  loadCombinations: StructuralLoadCombination[];
  analysisResults: StructuralAnalysisResult[];
  designResults: StructuralDesignResult[];
  validation: StructuralValidation;
  revision: StructuralModelRevision;
  importJob: StructuralImportJob;
}

export interface StructuralImportPreview {
  jobId: string;
  sourceHash: string;
  duplicateOfRevisionId?: string;
  isDuplicateImport: boolean;
  steps: ImportStepState[];
  dataset: NormalizedStructuralDataset;
}

export interface StructuralReportDocument {
  id: string;
  ownerId: string;
  projectId: string;
  revisionId: string;
  reportType: 'IMPORT_AUDIT' | 'VALIDATION_SUMMARY' | 'MODEL_INVENTORY';
  titleAr: string;
  titleEn: string;
  generatedAt: string;
  reliability: DataReliabilityStatus;
  markdownContent: string;
  metrics: {
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
    validationErrors: number;
    validationWarnings: number;
  };
}
