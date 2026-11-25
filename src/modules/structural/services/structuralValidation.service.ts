import type {
  DataReliabilityStatus,
  StructuralArea,
  StructuralFrame,
  StructuralGrid,
  StructuralLoadCase,
  StructuralLoadCombination,
  StructuralLoadPattern,
  StructuralMaterial,
  StructuralModel,
  StructuralNode,
  StructuralSection,
  StructuralStory,
  StructuralValidation,
  StructuralValidationIssue,
} from '../types/structural.types.ts';

export interface ValidationInputDataset {
  ownerId: string;
  projectId: string;
  revisionId: string;
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
}

export function validateStructuralDataset(input: ValidationInputDataset): StructuralValidation {
  const issues: StructuralValidationIssue[] = [];
  const pushIssue = (issue: Omit<StructuralValidationIssue, 'id'>) => {
    issues.push({
      ...issue,
      id: `val-${issues.length + 1}-${issue.code}`,
    });
  };

  if (!input.model.sourceVersion || !input.model.sourceVersion.trim().startsWith('20')) {
    pushIssue({
      code: 'ETABS_VERSION_WARNING',
      severity: 'WARNING',
      entityType: 'StructuralModel',
      entityId: input.model.id,
      field: 'sourceVersion',
      messageAr: `إصدار ETABS المصدر (${input.model.sourceVersion || 'غير محدد'}) يختلف عن CSI ETABS v20 الموصى به.`,
      messageEn: `Source ETABS version (${input.model.sourceVersion || 'unknown'}) differs from validated CSI ETABS v20 baseline.`,
    });
  }

  if (input.stories.length === 0) {
    pushIssue({
      code: 'MISSING_STORIES',
      severity: 'ERROR',
      entityType: 'StructuralStory',
      entityId: input.model.id,
      messageAr: 'النموذج لا يحتوي على أي طوابق معرفة (Stories).',
      messageEn: 'Structural model contains zero defined stories.',
    });
  }

  // Story duplicate & height check
  const storyNames = new Set<string>();
  for (const story of input.stories) {
    if (storyNames.has(story.name)) {
      pushIssue({
        code: 'DUPLICATE_STORY_NAME',
        severity: 'ERROR',
        entityType: 'StructuralStory',
        entityId: story.id,
        field: 'name',
        messageAr: `تكرار اسم الطابق "${story.name}".`,
        messageEn: `Duplicate story name '${story.name}'.`,
      });
    }
    storyNames.add(story.name);
    if (story.heightM < 0 || !Number.isFinite(story.elevationM)) {
      pushIssue({
        code: 'INVALID_STORY_GEOMETRY',
        severity: 'ERROR',
        entityType: 'StructuralStory',
        entityId: story.id,
        messageAr: `قيم ارتفاع أو منسوب غير صالحة للطابق "${story.name}".`,
        messageEn: `Invalid height or elevation for story '${story.name}'.`,
      });
    }
  }

  const nodeNames = new Set(input.nodes.map((n) => n.name));
  const sectionNames = new Set(input.sections.map((s) => s.name));
  const materialNames = new Set(input.materials.map((m) => m.name));
  const patternNames = new Set(input.loadPatterns.map((p) => p.name));
  const caseAndComboNames = new Set([
    ...input.loadCases.map((c) => c.name),
    ...input.loadCombinations.map((c) => c.name),
  ]);

  if (input.materials.length === 0 && (input.frames.length > 0 || input.areas.length > 0)) {
    pushIssue({
      code: 'MISSING_MATERIALS',
      severity: 'WARNING',
      entityType: 'StructuralMaterial',
      entityId: input.model.id,
      messageAr: 'تم استيراد عناصر إنشائية بدون جدول خصائص المواد الكامل.',
      messageEn: 'Structural elements were imported without complete material property definitions.',
    });
  }

  // Material checks
  for (const mat of input.materials) {
    if (mat.modulusEMPa <= 0 || mat.unitWeightKNPerM3 < 0) {
      pushIssue({
        code: 'INVALID_MATERIAL_MODULUS',
        severity: 'WARNING',
        entityType: 'StructuralMaterial',
        entityId: mat.id,
        field: 'modulusEMPa',
        messageAr: `معامل مرونة أو وزن نوعي غير مكتمل للمادة "${mat.name}".`,
        messageEn: `Material '${mat.name}' has non-positive elastic modulus or invalid unit weight.`,
      });
    }
  }

  // Section -> Material cross-check
  for (const sec of input.sections) {
    if (sec.materialName && materialNames.size > 0 && !materialNames.has(sec.materialName)) {
      pushIssue({
        code: 'UNRESOLVED_SECTION_MATERIAL',
        severity: 'WARNING',
        entityType: 'StructuralSection',
        entityId: sec.id,
        field: 'materialName',
        messageAr: `المقطع "${sec.name}" يشير إلى مادة غير موجودة "${sec.materialName}".`,
        messageEn: `Section '${sec.name}' references missing material '${sec.materialName}'.`,
      });
    }
    if (sec.depthOrThicknessM <= 0) {
      pushIssue({
        code: 'ZERO_SECTION_DIMENSION',
        severity: 'WARNING',
        entityType: 'StructuralSection',
        entityId: sec.id,
        messageAr: `سماكة أو عمق المقطع "${sec.name}" يساوي صفراً.`,
        messageEn: `Section '${sec.name}' has zero depth/thickness.`,
      });
    }
  }

  // Frame checks
  const seenFrameIds = new Set<string>();
  for (const frame of input.frames) {
    if (seenFrameIds.has(frame.uniqueName || frame.name)) {
      pushIssue({
        code: 'DUPLICATE_FRAME_ID',
        severity: 'ERROR',
        entityType: 'StructuralFrame',
        entityId: frame.id,
        messageAr: `تضارب معرف العنصر الإنشائي الإطاري "${frame.name}".`,
        messageEn: `Duplicate frame identifier '${frame.name}'.`,
      });
    }
    seenFrameIds.add(frame.uniqueName || frame.name);

    if (!frame.pointI || !frame.pointJ || frame.pointI === frame.pointJ) {
      pushIssue({
        code: 'DEGENERATE_FRAME_CONNECTIVITY',
        severity: 'ERROR',
        entityType: 'StructuralFrame',
        entityId: frame.id,
        messageAr: `العنصر الإطاري "${frame.name}" يفتقر إلى نقطتي اتصال مختلفتين.`,
        messageEn: `Frame '${frame.name}' has invalid or degenerate endpoint joints.`,
      });
    } else if (nodeNames.size > 0 && (!nodeNames.has(frame.pointI) || !nodeNames.has(frame.pointJ))) {
      pushIssue({
        code: 'ORPHAN_FRAME_NODE_REF',
        severity: 'WARNING',
        entityType: 'StructuralFrame',
        entityId: frame.id,
        messageAr: `العنصر "${frame.name}" يشير إلى نقاط غير مدرجة في جدول النقاط.`,
        messageEn: `Frame '${frame.name}' references nodes absent from extracted point table.`,
      });
    }

    if (sectionNames.size > 0 && frame.sectionName && !sectionNames.has(frame.sectionName)) {
      pushIssue({
        code: 'MISSING_FRAME_SECTION_REF',
        severity: 'WARNING',
        entityType: 'StructuralFrame',
        entityId: frame.id,
        messageAr: `العنصر "${frame.name}" يشير إلى مقطع غير معرف "${frame.sectionName}".`,
        messageEn: `Frame '${frame.name}' references undefined section '${frame.sectionName}'.`,
      });
    }
  }

  // Area checks
  for (const area of input.areas) {
    if (area.pointNames.length < 3) {
      pushIssue({
        code: 'INVALID_AREA_CONNECTIVITY',
        severity: 'ERROR',
        entityType: 'StructuralArea',
        entityId: area.id,
        messageAr: `العنصر المساحي "${area.name}" يحتوي على أقل من 3 نقاط.`,
        messageEn: `Area element '${area.name}' has fewer than 3 boundary points.`,
      });
    }
  }

  // Load combination references
  for (const combo of input.loadCombinations) {
    if (combo.items.length === 0) {
      pushIssue({
        code: 'EMPTY_LOAD_COMBINATION',
        severity: 'WARNING',
        entityType: 'StructuralLoadCombination',
        entityId: combo.id,
        messageAr: `تراكب الأحمال "${combo.name}" لا يحتوي على حالات أحمال.`,
        messageEn: `Load combination '${combo.name}' contains no case entries.`,
      });
    }
    for (const item of combo.items) {
      if (
        caseAndComboNames.size > 0 &&
        !caseAndComboNames.has(item.caseOrComboName) &&
        !patternNames.has(item.caseOrComboName)
      ) {
        pushIssue({
          code: 'UNRESOLVED_COMBO_CASE',
          severity: 'WARNING',
          entityType: 'StructuralLoadCombination',
          entityId: combo.id,
          messageAr: `تراكب الأحمال "${combo.name}" يشير إلى حالة غير موجودة "${item.caseOrComboName}".`,
          messageEn: `Load combination '${combo.name}' references unknown load case '${item.caseOrComboName}'.`,
        });
      }
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'ERROR').length;
  const warningCount = issues.filter((i) => i.severity === 'WARNING').length;

  let status: StructuralValidation['status'] = 'PASSED';
  let reliability: DataReliabilityStatus =
    input.model.provenance.dataProvenance === 'ETABS_OAPI_LIVE'
      ? 'SOURCE_VERIFIED'
      : 'UNVERIFIED';

  if (errorCount > 0) {
    status = 'FAILED';
    reliability = 'FAILED';
  } else if (warningCount > 0) {
    status = 'PASSED_WITH_WARNINGS';
    reliability =
      input.model.provenance.dataProvenance === 'ETABS_OAPI_LIVE'
        ? 'SOURCE_VERIFIED'
        : 'UNVERIFIED';
  }

  return {
    id: `val-${input.revisionId}`,
    ownerId: input.ownerId,
    projectId: input.projectId,
    revisionId: input.revisionId,
    status,
    reliability,
    checkedAt: new Date().toISOString(),
    errorCount,
    warningCount,
    issues,
  };
}
