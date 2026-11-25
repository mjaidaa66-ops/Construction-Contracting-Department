import type { EtabsRawExtractPayload } from '../types/etabs.types.ts';
import type {
  DataReliabilityStatus,
  DerivedCalculationMeta,
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
} from '../types/structural.types.ts';
import type {
  NormalizedStructuralDataset,
  StructuralAnalysisResult,
  StructuralDesignResult,
} from '../types/structural-results.types.ts';
import {
  convertLengthToMeters,
  convertStressToMPa,
  convertUnitWeightToKNPerM3,
} from '../services/structuralUnits.service.ts';
import { validateStructuralDataset } from '../services/structuralValidation.service.ts';

function sanitizeIdPart(raw: string): string {
  return String(raw || 'item')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);
}

function classifyFrameRole(orientation?: string): StructuralFrame['elementRole'] {
  const norm = String(orientation || '').toLowerCase();
  if (norm.includes('col')) return 'COLUMN';
  if (norm.includes('beam')) return 'BEAM';
  if (norm.includes('brace')) return 'BRACE';
  return 'FRAME_OTHER';
}

function classifyAreaRole(orientation?: string, isOpening?: boolean): StructuralArea['elementRole'] {
  if (isOpening) return 'OPENING';
  const norm = String(orientation || '').toLowerCase();
  if (norm.includes('wall')) return 'WALL';
  if (norm.includes('floor') || norm.includes('slab')) return 'SLAB';
  return 'AREA_OTHER';
}

export function normalizeEtabsExtractToDataset(params: {
  ownerId: string;
  projectId: string;
  revisionId: string;
  revisionNumber: number;
  jobId: string;
  sourceHash: string;
  createdByUid: string;
  createdByName: string;
  raw: EtabsRawExtractPayload;
}): NormalizedStructuralDataset {
  const {
    ownerId,
    projectId,
    revisionId,
    revisionNumber,
    jobId,
    sourceHash,
    createdByUid,
    createdByName,
    raw,
  } = params;

  const nowIso = new Date().toISOString();
  const modelId = `mdl_${sanitizeIdPart(projectId)}_${revisionNumber}`;
  const provenanceType =
    raw.sourceApplication === 'CSI ETABS' ? 'ETABS_OAPI_LIVE' : 'ETABS_EXPORTED_TABLES';
  const initialReliability: DataReliabilityStatus =
    provenanceType === 'ETABS_OAPI_LIVE' ? 'SOURCE_VERIFIED' : 'UNVERIFIED';

  const makeProvenance = (
    originalObjectId: string,
    overrideUnits?: { raw: string; norm: string }
  ): StructuralProvenance => ({
    projectId,
    modelId,
    originalObjectId,
    sourceApplication: raw.sourceApplication,
    sourceVersion: raw.sourceVersion || 'Unknown',
    sourceFileReference: raw.modelFilePath || raw.modelName || 'Unknown',
    importedAt: nowIso,
    originalUnits: overrideUnits?.raw || `${raw.forceUnit}-${raw.lengthUnit}`,
    normalizedUnits: overrideUnits?.norm || 'kN-m',
    coordinateSystem: raw.coordinateSystem || 'Global',
    dataProvenance: provenanceType,
    revisionId,
    validationStatus: 'VALID',
    reliability: initialReliability,
  });

  const forceUnit = raw.forceUnit || 'kN';
  const lengthUnit = raw.lengthUnit || 'm';

  let runningHeight = 0;
  const stories: StructuralStory[] = (raw.stories || []).map((s, idx) => {
    const rawElev = convertLengthToMeters(s.elevation, lengthUnit);
    const rawH = convertLengthToMeters(s.height, lengthUnit);
    runningHeight += rawH.normalizedValue;
    const derivedCumulativeHeight: DerivedCalculationMeta = {
      inputValueIds: [`story:${s.name}:heightM`],
      methodName: 'CumulativeStoryHeightSum',
      formulaDescription: 'sum_{k=0..i}(story_k.heightM)',
      outputUnit: 'm',
      computedAt: nowIso,
      reliability: 'DERIVED',
    };
    return {
      id: `st_${idx}_${sanitizeIdPart(s.name)}`,
      name: s.name,
      elevationM: rawElev.normalizedValue,
      heightM: rawH.normalizedValue,
      rawElevation: rawElev,
      rawHeight: rawH,
      isMasterStory: Boolean(s.isMasterStory),
      similarToStory: s.similarToStory || '',
      spliceAbove: Boolean(s.spliceAbove),
      spliceHeightM: convertLengthToMeters(s.spliceHeight || 0, lengthUnit).normalizedValue,
      derivedCumulativeHeight,
      provenance: makeProvenance(s.name, { raw: lengthUnit, norm: 'm' }),
    };
  });

  const grids: StructuralGrid[] = (raw.grids || []).map((g, idx) => ({
    id: `gr_${idx}_${sanitizeIdPart(g.name)}`,
    name: g.name,
    gridType: g.gridType || 'Cartesian',
    originXM: convertLengthToMeters(g.originX || 0, lengthUnit).normalizedValue,
    originYM: convertLengthToMeters(g.originY || 0, lengthUnit).normalizedValue,
    rotationDeg: Number.isFinite(g.rotationDeg) ? Number(g.rotationDeg) : 0,
    xLines: (g.xLines || []).map((line) => {
      const c = convertLengthToMeters(line.coordinate, lengthUnit);
      return {
        id: line.id,
        axis: 'X' as const,
        coordinateM: c.normalizedValue,
        rawCoordinate: c,
        visible: line.visible !== false,
      };
    }),
    yLines: (g.yLines || []).map((line) => {
      const c = convertLengthToMeters(line.coordinate, lengthUnit);
      return {
        id: line.id,
        axis: 'Y' as const,
        coordinateM: c.normalizedValue,
        rawCoordinate: c,
        visible: line.visible !== false,
      };
    }),
    provenance: makeProvenance(g.name, { raw: lengthUnit, norm: 'm' }),
  }));

  const nodes: StructuralNode[] = (raw.points || []).map((p, idx) => {
    const x = convertLengthToMeters(p.x, lengthUnit);
    const y = convertLengthToMeters(p.y, lengthUnit);
    const z = convertLengthToMeters(p.z, lengthUnit);
    return {
      id: `pt_${idx}_${sanitizeIdPart(p.name)}`,
      name: p.name,
      label: p.label || p.name,
      story: p.story || '',
      xM: x.normalizedValue,
      yM: y.normalizedValue,
      zM: z.normalizedValue,
      rawX: x,
      rawY: y,
      rawZ: z,
      provenance: makeProvenance(p.name, { raw: lengthUnit, norm: 'm' }),
    };
  });

  const nodeByName = new Map(nodes.map((n) => [n.name, n]));

  const frames: StructuralFrame[] = (raw.frames || []).map((f, idx) => {
    const p1 = nodeByName.get(f.pointI);
    const p2 = nodeByName.get(f.pointJ);
    let derivedLengthM: number | undefined;
    let derivedMeta: DerivedCalculationMeta | undefined;
    if (p1 && p2) {
      const dx = p2.xM - p1.xM;
      const dy = p2.yM - p1.yM;
      const dz = p2.zM - p1.zM;
      derivedLengthM = Number(Math.sqrt(dx * dx + dy * dy + dz * dz).toFixed(4));
      derivedMeta = {
        inputValueIds: [p1.id, p2.id],
        methodName: 'Euclidean3DLength',
        formulaDescription: 'sqrt((xJ-xI)^2 + (yJ-yI)^2 + (zJ-zI)^2)',
        outputUnit: 'm',
        computedAt: nowIso,
        reliability: 'DERIVED',
      };
    }

    return {
      id: `fr_${idx}_${sanitizeIdPart(f.uniqueName || f.name)}`,
      name: f.name,
      uniqueName: f.uniqueName || f.name,
      label: f.label || f.name,
      story: f.story || '',
      elementRole: classifyFrameRole(f.designOrientation),
      pointI: f.pointI,
      pointJ: f.pointJ,
      sectionName: f.sectionName,
      materialOverwrite: f.materialOverwrite || '',
      derivedLengthM,
      derivedMeta,
      provenance: makeProvenance(f.uniqueName || f.name),
    };
  });

  const areas: StructuralArea[] = (raw.areas || []).map((a, idx) => {
    const pts = (a.pointNames || [])
      .map((ptName) => nodeByName.get(ptName))
      .filter((pt): pt is StructuralNode => Boolean(pt));

    let derivedPlanAreaM2: number | undefined;
    let derivedMeta: DerivedCalculationMeta | undefined;
    if (pts.length >= 3) {
      let sum = 0;
      for (let i = 0; i < pts.length; i++) {
        const curr = pts[i];
        const next = pts[(i + 1) % pts.length];
        sum += curr.xM * next.yM - next.xM * curr.yM;
      }
      derivedPlanAreaM2 = Number((Math.abs(sum) * 0.5).toFixed(4));
      derivedMeta = {
        inputValueIds: pts.map((p) => p.id),
        methodName: 'ShoelacePlanArea2D',
        formulaDescription: '0.5 * |sum(x_i * y_{i+1} - x_{i+1} * y_i)|',
        outputUnit: 'm2',
        computedAt: nowIso,
        reliability: 'DERIVED',
      };
    }

    return {
      id: `ar_${idx}_${sanitizeIdPart(a.uniqueName || a.name)}`,
      name: a.name,
      uniqueName: a.uniqueName || a.name,
      label: a.label || a.name,
      story: a.story || '',
      elementRole: classifyAreaRole(a.designOrientation, a.isOpening),
      pointNames: a.pointNames || [],
      sectionName: a.sectionName,
      isOpening: Boolean(a.isOpening),
      derivedPlanAreaM2,
      derivedMeta,
      provenance: makeProvenance(a.uniqueName || a.name),
    };
  });

  const materials: StructuralMaterial[] = (raw.materials || []).map((m, idx) => {
    const modE = convertStressToMPa(m.modulusE, forceUnit, lengthUnit);
    const uw = convertUnitWeightToKNPerM3(m.unitWeight || 0, forceUnit, lengthUnit);
    const strength = convertStressToMPa(m.fcOrFy || 0, forceUnit, lengthUnit);
    return {
      id: `mat_${idx}_${sanitizeIdPart(m.name)}`,
      name: m.name,
      materialType: m.materialType || 'Concrete',
      modulusEMPa: modE.normalizedValue,
      rawModulusE: modE,
      poissonRatio: Number.isFinite(m.poissonU) ? Number(m.poissonU) : 0.2,
      thermalCoeff: Number.isFinite(m.thermalCoeffA) ? Number(m.thermalCoeffA) : 0,
      unitWeightKNPerM3: uw.normalizedValue,
      rawUnitWeight: uw,
      characteristicStrengthMPa: strength.normalizedValue,
      rawStrength: strength,
      provenance: makeProvenance(m.name, { raw: `${forceUnit}/${lengthUnit}^2`, norm: 'MPa' }),
    };
  });

  const sections: StructuralSection[] = (raw.sections || []).map((s, idx) => {
    const depth = convertLengthToMeters(s.depthOrThickness, lengthUnit);
    const width = convertLengthToMeters(s.width || 0, lengthUnit);
    return {
      id: `sec_${idx}_${sanitizeIdPart(s.name)}`,
      name: s.name,
      category: s.category,
      shapeOrType: s.shapeOrType || 'Rectangular',
      materialName: s.materialName || '',
      depthOrThicknessM: depth.normalizedValue,
      widthM: width.normalizedValue,
      rawDepthOrThickness: depth,
      rawWidth: width,
      provenance: makeProvenance(s.name, { raw: lengthUnit, norm: 'm' }),
    };
  });

  const loadPatterns: StructuralLoadPattern[] = (raw.loadPatterns || []).map((lp, idx) => ({
    id: `lp_${idx}_${sanitizeIdPart(lp.name)}`,
    name: lp.name,
    patternType: lp.patternType || 'Dead',
    selfWeightMultiplier: Number.isFinite(lp.selfWeightMultiplier) ? lp.selfWeightMultiplier : 0,
    provenance: makeProvenance(lp.name),
  }));

  const loadCases: StructuralLoadCase[] = (raw.loadCases || []).map((lc, idx) => ({
    id: `lc_${idx}_${sanitizeIdPart(lc.name)}`,
    name: lc.name,
    caseType: lc.caseType || 'LinearStatic',
    analysisStatus: (lc.analysisStatus as StructuralLoadCase['analysisStatus']) || 'NotRun',
    provenance: makeProvenance(lc.name),
  }));

  const loadCombinations: StructuralLoadCombination[] = (raw.loadCombos || []).map((cmb, idx) => ({
    id: `cmb_${idx}_${sanitizeIdPart(cmb.name)}`,
    name: cmb.name,
    comboType: cmb.comboType || 'Linear Add',
    items: (cmb.items || []).map((i) => ({
      caseOrComboName: i.caseOrComboName,
      scaleFactor: Number.isFinite(i.scaleFactor) ? i.scaleFactor : 1,
    })),
    provenance: makeProvenance(cmb.name),
  }));

  const model: StructuralModel = {
    id: modelId,
    ownerId,
    projectId,
    revisionId,
    name: raw.modelName || 'ETABS Model',
    sourceApplication: raw.sourceApplication,
    sourceVersion: raw.sourceVersion || 'Unknown',
    sourceFileReference: raw.modelFilePath || raw.modelName || 'Unknown',
    originalUnits: `${forceUnit}-${lengthUnit}`,
    normalizedUnits: 'kN-m',
    coordinateSystem: raw.coordinateSystem || 'Global',
    modelLocked: Boolean(raw.modelLocked),
    storyCount: stories.length,
    gridCount: grids.length,
    nodeCount: nodes.length,
    frameCount: frames.length,
    areaCount: areas.length,
    materialCount: materials.length,
    sectionCount: sections.length,
    loadPatternCount: loadPatterns.length,
    loadCaseCount: loadCases.length,
    loadComboCount: loadCombinations.length,
    provenance: makeProvenance(raw.modelName || modelId),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const validation = validateStructuralDataset({
    ownerId,
    projectId,
    revisionId,
    model,
    stories,
    grids,
    nodes,
    frames,
    areas,
    materials,
    sections,
    loadPatterns,
    loadCases,
    loadCombinations,
  });

  // Propagate validation outcome back to model provenance honestly
  model.provenance.reliability = validation.reliability;
  model.provenance.validationStatus =
    validation.status === 'FAILED'
      ? 'INVALID'
      : validation.status === 'PASSED_WITH_WARNINGS'
      ? 'WARNING'
      : 'VALID';

  const analysisResults: StructuralAnalysisResult[] = loadCases.map((lc, idx) => ({
    id: `ar_${idx}_${sanitizeIdPart(lc.name)}`,
    ownerId,
    projectId,
    modelId,
    revisionId,
    resultCategory: 'CASE_STATUS',
    status: lc.analysisStatus === 'Finished' ? 'AVAILABLE_FROM_SOURCE' : 'NOT_RUN_PHASE_2_PENDING',
    caseName: lc.name,
    summaryMetrics: {
      analysisStatus: lc.analysisStatus,
      caseType: lc.caseType,
      note: 'Detailed Phase 2 response extraction executes in Phase 2.',
    },
    provenance: makeProvenance(lc.name),
  }));

  const designResults: StructuralDesignResult[] = [
    {
      id: `des_${sanitizeIdPart(revisionId)}`,
      ownerId,
      projectId,
      modelId,
      revisionId,
      designCode: 'ACI 318-19 / Phase 2 Pending',
      status: 'NOT_RUN_PHASE_2_PENDING',
      memberCountChecked: 0,
      notes: 'Phase 1 extracts structural geometry, materials, sections, and load definitions only; automated design post-processing is scheduled for Phase 2.',
      provenance: makeProvenance(modelId),
    },
  ];

  const revision: StructuralModelRevision = {
    id: revisionId,
    ownerId,
    projectId,
    modelId,
    revisionNumber,
    label: `Rev ${revisionNumber} · ${raw.modelName || 'ETABS'}`,
    sourceHash,
    immutable: true,
    createdByUid,
    createdByName,
    createdAt: nowIso,
    summary: {
      stories: stories.length,
      grids: grids.length,
      nodes: nodes.length,
      frames: frames.length,
      areas: areas.length,
      materials: materials.length,
      sections: sections.length,
      loadPatterns: loadPatterns.length,
      loadCases: loadCases.length,
      loadCombinations: loadCombinations.length,
    },
    reliability: validation.reliability,
  };

  const importJob: StructuralImportJob = {
    id: jobId,
    ownerId,
    projectId,
    revisionId,
    sourceMode: provenanceType,
    sourceFileReference: raw.modelFilePath || raw.modelName || 'Unknown',
    sourceHash,
    status: 'PREVIEW_READY',
    currentStep: 8,
    totalSteps: 11,
    startedAt: nowIso,
    retryCount: 0,
    reliabilitySummary: validation.reliability,
  };

  return {
    model,
    stories,
    grids,
    nodes,
    frames,
    areas,
    materials,
    sections,
    loadPatterns,
    loadCases,
    loadCombinations,
    analysisResults,
    designResults,
    validation,
    revision,
    importJob,
  };
}
