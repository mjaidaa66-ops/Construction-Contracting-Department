import type { EtabsAgentStatus, EtabsRawExtractPayload } from '../types/etabs.types.ts';
import type {
  ImportStepState,
  NormalizedStructuralDataset,
  StructuralImportPreview,
  StructuralReportDocument,
} from '../types/structural-results.types.ts';
import type {
  StructuralImportJob,
  StructuralModelRevision,
} from '../types/structural.types.ts';
import { normalizeEtabsExtractToDataset } from '../adapters/structuralData.adapter.ts';
import {
  computeDeterministicSourceHash,
  findDuplicateRevision,
  getNextRevisionNumber,
} from './structuralRevision.service.ts';
import { generateStructuralReport } from '../reports/structuralReport.service.ts';

export function createInitialElevenStepWorkflow(mode: 'ETABS_OAPI_LIVE' | 'ETABS_EXPORTED_TABLES'): ImportStepState[] {
  return [
    {
      stepNumber: 1,
      key: 'check_connection',
      titleAr: '1. التحقق من وكيل ويندوز وتثبيت ETABS v20',
      titleEn: '1. Verify Windows Agent & ETABS v20 Availability',
      status: mode === 'ETABS_EXPORTED_TABLES' ? 'SKIPPED' : 'PENDING',
    },
    {
      stepNumber: 2,
      key: 'check_model_version',
      titleAr: '2. فحص النموذج النشط وتوافق الإصدار',
      titleEn: '2. Check Active Model & Version Compatibility',
      status: 'PENDING',
    },
    {
      stepNumber: 3,
      key: 'read_metadata_units',
      titleAr: '3. قراءة البيانات الوصفية ووحدات القياس',
      titleEn: '3. Read Metadata & Unit System',
      status: 'PENDING',
    },
    {
      stepNumber: 4,
      key: 'extract_geometry',
      titleAr: '4. استخراج الطوابق والشبكات والمواد والمقاطع والعناصر',
      titleEn: '4. Extract Stories, Grids, Materials, Sections & Elements',
      status: 'PENDING',
    },
    {
      stepNumber: 5,
      key: 'extract_loads',
      titleAr: '5. استخراج حالات وأنماط وتراكيب الأحمال',
      titleEn: '5. Extract Load Patterns, Cases & Combinations',
      status: 'PENDING',
    },
    {
      stepNumber: 6,
      key: 'validate_completeness',
      titleAr: '6. فحص الاكتمال والترابط الهندسي',
      titleEn: '6. Execute Completeness & Consistency Checks',
      status: 'PENDING',
    },
    {
      stepNumber: 7,
      key: 'normalize_units',
      titleAr: '7. توحيد الوحدات إلى SI مع حفظ القيم الأصلية',
      titleEn: '7. Normalize Units to SI While Preserving Raw Values',
      status: 'PENDING',
    },
    {
      stepNumber: 8,
      key: 'import_preview',
      titleAr: '8. إنشاء معاينة الاستيراد الكاملة',
      titleEn: '8. Present Structured Import Preview',
      status: 'PENDING',
    },
    {
      stepNumber: 9,
      key: 'user_confirmation',
      titleAr: '9. انتظار تأكيد المهندس للحفظ',
      titleEn: '9. Await Engineer Confirmation Gate',
      status: 'PENDING',
    },
    {
      stepNumber: 10,
      key: 'save_revision',
      titleAr: '10. حفظ نسخة مراجعة غير قابلة للتعديل',
      titleEn: '10. Save Immutable Versioned Model Revision',
      status: 'PENDING',
    },
    {
      stepNumber: 11,
      key: 'generate_report',
      titleAr: '11. إصدار تقرير الاستيراد والتدقيق الهندسي',
      titleEn: '11. Generate Import Audit & Validation Report',
      status: 'PENDING',
    },
  ];
}

export function buildImportPreview(params: {
  ownerId: string;
  projectId: string;
  jobId?: string;
  createdByUid: string;
  createdByName: string;
  raw: EtabsRawExtractPayload;
  existingRevisions: StructuralModelRevision[];
  agentStatus?: EtabsAgentStatus;
  allowDuplicate?: boolean;
}): StructuralImportPreview {
  const {
    ownerId,
    projectId,
    createdByUid,
    createdByName,
    raw,
    existingRevisions,
    agentStatus,
    allowDuplicate = false,
  } = params;

  const jobId = params.jobId || `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const mode =
    raw.sourceApplication === 'CSI ETABS' ? 'ETABS_OAPI_LIVE' : 'ETABS_EXPORTED_TABLES';
  const steps = createInitialElevenStepWorkflow(mode);

  const sourceHash = computeDeterministicSourceHash(raw);
  const duplicate = findDuplicateRevision(existingRevisions, projectId, sourceHash);
  const revisionNumber = getNextRevisionNumber(existingRevisions, projectId);
  const revisionId = `rev_${projectId.replace(/[^a-zA-Z0-9_-]/g, '_')}_v${revisionNumber}_${Date.now()}`;

  // Mark steps 1-8 truthfully
  if (mode === 'ETABS_OAPI_LIVE') {
    steps[0].status = agentStatus?.agentReachable ? 'COMPLETED' : 'WARNING';
    steps[0].detail = agentStatus?.message || 'Live ETABS OAPI extraction payload.';
  } else {
    steps[0].status = 'SKIPPED';
    steps[0].detail = 'Exported ETABS Database Tables fallback workflow selected.';
  }

  steps[1].status = raw.sourceVersion.startsWith('20') ? 'COMPLETED' : 'WARNING';
  steps[1].detail = `${raw.sourceApplication} ${raw.sourceVersion} · ${raw.modelName}`;

  steps[2].status = 'COMPLETED';
  steps[2].detail = `Raw units: ${raw.forceUnit}-${raw.lengthUnit} -> SI (kN-m / MPa)`;

  steps[3].status = 'COMPLETED';
  steps[3].detail = `${raw.stories.length} stories, ${raw.frames.length} frames, ${raw.areas.length} areas, ${raw.materials.length} materials, ${raw.sections.length} sections`;

  steps[4].status = 'COMPLETED';
  steps[4].detail = `${raw.loadPatterns.length} patterns, ${raw.loadCases.length} cases, ${raw.loadCombos.length} combinations`;

  const dataset = normalizeEtabsExtractToDataset({
    ownerId,
    projectId,
    revisionId,
    revisionNumber,
    jobId,
    sourceHash,
    createdByUid,
    createdByName,
    raw,
  });

  steps[5].status =
    dataset.validation.status === 'FAILED'
      ? 'FAILED'
      : dataset.validation.status === 'PASSED_WITH_WARNINGS'
      ? 'WARNING'
      : 'COMPLETED';
  steps[5].detail = `${dataset.validation.errorCount} errors, ${dataset.validation.warningCount} warnings`;

  steps[6].status = 'COMPLETED';
  steps[6].detail = 'Raw ETABS values preserved alongside normalized SI units.';

  steps[7].status = duplicate && !allowDuplicate ? 'WARNING' : 'COMPLETED';
  steps[7].detail = duplicate
    ? `Matches existing Revision #${duplicate.revisionNumber} (${duplicate.id}).`
    : 'Preview generated and awaiting engineer confirmation.';

  steps[8].status = 'PENDING';
  steps[8].detail = 'Requires explicit engineer confirmation before creating immutable revision.';

  return {
    jobId,
    sourceHash,
    duplicateOfRevisionId: duplicate?.id,
    isDuplicateImport: Boolean(duplicate),
    steps,
    dataset,
  };
}

export function confirmImportPreview(params: {
  preview: StructuralImportPreview;
  confirmedByUser: boolean;
  allowDuplicateOverride?: boolean;
}): {
  confirmedJob: StructuralImportJob;
  dataset: NormalizedStructuralDataset;
  steps: ImportStepState[];
  report: StructuralReportDocument;
} {
  const { preview, confirmedByUser, allowDuplicateOverride = false } = params;
  if (!confirmedByUser) {
    throw new Error('Explicit user confirmation is required before persisting a structural revision.');
  }
  if (preview.isDuplicateImport && !allowDuplicateOverride) {
    throw new Error(
      `Duplicate import blocked: matches existing revision '${preview.duplicateOfRevisionId}'. Enable duplicate override to force a new snapshot.`
    );
  }
  if (preview.dataset.validation.status === 'FAILED') {
    throw new Error(
      `Cannot confirm structural import with ${preview.dataset.validation.errorCount} validation error(s). Resolve source issues first.`
    );
  }

  const nowIso = new Date().toISOString();
  const steps = preview.steps.map((s) => ({ ...s }));
  steps[8].status = 'COMPLETED';
  steps[8].detail = `Confirmed at ${nowIso}`;
  steps[9].status = 'COMPLETED';
  steps[9].detail = `Saved immutable revision #${preview.dataset.revision.revisionNumber}`;

  const confirmedJob: StructuralImportJob = {
    ...preview.dataset.importJob,
    status: 'CONFIRMED',
    currentStep: 11,
    completedAt: nowIso,
  };

  const dataset: NormalizedStructuralDataset = {
    ...preview.dataset,
    importJob: confirmedJob,
  };

  const report = generateStructuralReport({
    dataset,
    reportType: 'IMPORT_AUDIT',
  });

  steps[10].status = 'COMPLETED';
  steps[10].detail = `Report '${report.id}' generated.`;

  return {
    confirmedJob,
    dataset,
    steps,
    report,
  };
}
