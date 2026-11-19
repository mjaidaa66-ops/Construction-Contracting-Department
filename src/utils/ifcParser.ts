import type {
  BimCategory,
  BimDiscipline,
  BimElement,
  BimLevel,
  DrawingAnalysisReport,
  TakeoffCategory,
} from '../types/bunyan';

export interface ParsedIfcResult {
  elements: BimElement[];
  report: DrawingAnalysisReport;
}

const IFC_ENTITY_MAP: Record<
  string,
  {
    category: BimCategory;
    discipline: BimDiscipline;
    boq: TakeoffCategory;
    rate: number;
    labelAr: string;
    defaultDims: [number, number, number];
  }
> = {
  IFCWALL: {
    category: 'wall',
    discipline: 'architectural',
    boq: 'masonry',
    rate: 90,
    labelAr: 'جدار من ملف IFC',
    defaultDims: [4.2, 3.2, 0.2],
  },
  IFCWALLSTANDARDCASE: {
    category: 'wall',
    discipline: 'architectural',
    boq: 'masonry',
    rate: 90,
    labelAr: 'جدار قياسي IFC',
    defaultDims: [4.2, 3.2, 0.2],
  },
  IFCCURTAINWALL: {
    category: 'glass',
    discipline: 'architectural',
    boq: 'doors_windows',
    rate: 750,
    labelAr: 'واجهة زجاجية IFC',
    defaultDims: [4.0, 3.2, 0.12],
  },
  IFCCOLUMN: {
    category: 'column',
    discipline: 'structural',
    boq: 'concrete',
    rate: 425,
    labelAr: 'عمود خرساني IFC',
    defaultDims: [0.4, 3.4, 0.4],
  },
  IFCBEAM: {
    category: 'beam',
    discipline: 'structural',
    boq: 'concrete',
    rate: 425,
    labelAr: 'جسر خرساني IFC',
    defaultDims: [4.5, 0.45, 0.25],
  },
  IFCSLAB: {
    category: 'slab',
    discipline: 'structural',
    boq: 'concrete',
    rate: 425,
    labelAr: 'بلاطة سقف IFC',
    defaultDims: [8.0, 0.22, 6.0],
  },
  IFCFOOTING: {
    category: 'foundation',
    discipline: 'structural',
    boq: 'concrete',
    rate: 395,
    labelAr: 'قاعدة خرسانية IFC',
    defaultDims: [2.0, 0.5, 2.0],
  },
  IFCPILE: {
    category: 'foundation',
    discipline: 'structural',
    boq: 'concrete',
    rate: 395,
    labelAr: 'ركيزة خرسانية IFC',
    defaultDims: [0.6, 6.0, 0.6],
  },
  IFCWINDOW: {
    category: 'glass',
    discipline: 'architectural',
    boq: 'doors_windows',
    rate: 750,
    labelAr: 'نافذة زجاجية IFC',
    defaultDims: [1.8, 1.5, 0.12],
  },
  IFCDOOR: {
    category: 'door_window',
    discipline: 'architectural',
    boq: 'doors_windows',
    rate: 1280,
    labelAr: 'باب معماري IFC',
    defaultDims: [1.1, 2.2, 0.12],
  },
  IFCSTAIR: {
    category: 'stair',
    discipline: 'architectural',
    boq: 'concrete',
    rate: 425,
    labelAr: 'درج خرساني IFC',
    defaultDims: [2.6, 3.2, 1.4],
  },
  IFCDUCTSEGMENT: {
    category: 'mep_hvac',
    discipline: 'mep',
    boq: 'plumbing_hvac',
    rate: 95,
    labelAr: 'مجرى هواء HVAC',
    defaultDims: [4.0, 0.35, 0.5],
  },
  IFCPIPESEGMENT: {
    category: 'mep_plumbing',
    discipline: 'mep',
    boq: 'plumbing_hvac',
    rate: 70,
    labelAr: 'ماسورة سباكة MEP',
    defaultDims: [3.0, 0.2, 0.2],
  },
  IFCCABLESEGMENT: {
    category: 'mep_electrical',
    discipline: 'mep',
    boq: 'electrical',
    rate: 130,
    labelAr: 'مسار كابلات كهربائية MEP',
    defaultDims: [3.0, 0.15, 0.25],
  },
};

interface StepEntity {
  id: string;
  type: string;
  rawArgs: string;
  args: string[];
}

function stripStepComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function splitStepArgs(argStr: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;

  for (let i = 0; i < argStr.length; i++) {
    const ch = argStr[i];
    if (ch === "'") {
      if (inString && argStr[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      inString = !inString;
      current += ch;
      continue;
    }
    if (!inString) {
      if (ch === '(') depth++;
      else if (ch === ')' && depth > 0) depth--;
      else if (ch === ',' && depth === 0) {
        result.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim().length > 0 || result.length > 0) {
    result.push(current.trim());
  }
  return result;
}

function unquoteStep(token?: string): string {
  if (!token || token === '$') return '';
  const t = token.trim();
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

function parseRefId(token?: string): string | null {
  if (!token) return null;
  const m = /^#(\d+)$/.exec(token.trim());
  return m ? m[1] : null;
}

function parseRefList(token?: string): string[] {
  if (!token) return [];
  const matches = token.matchAll(/#(\d+)/g);
  return Array.from(matches, (m) => m[1]);
}

function parseNumericTuple(token?: string): number[] {
  if (!token) return [];
  const inner = token.trim().replace(/^\(/, '').replace(/\)$/, '');
  return inner
    .split(',')
    .map((s) => Number.parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n));
}

function mapElevationToLevel(elevM: number, storeyName: string): BimLevel {
  const lower = storeyName.toLowerCase();
  if (/fnd|foot|base|sub/.test(lower) || elevM < -0.3) return 'foundation';
  if (/roof|rf|terrace/.test(lower)) return 'roof';
  if (/l3|third|3rd|level\s*3/.test(lower) || elevM >= 9.5) return 'level3';
  if (/l2|second|2nd|level\s*2/.test(lower) || elevM >= 6.0) return 'level2';
  if (/l1|first|1st|level\s*1/.test(lower) || elevM >= 2.5) return 'level1';
  return 'ground';
}

/**
 * Parses an ISO-10303-21 (.ifc) STEP text file (including multi-line statements),
 * resolving SI/Imperial length units, IFCBUILDINGSTOREY elevations, IFCLOCALPLACEMENT coordinates,
 * IFCEXTRUDEDAREASOLID profile dimensions, and IFCELEMENTQUANTITY sets.
 * Never fabricates a synthetic villa model when extraction yields 0 entities.
 */
export function parseIfcFile(content: string, fileName: string): ParsedIfcResult {
  const nowIso = new Date().toISOString();
  const clean = stripStepComments(content || '');

  // Split by STEP semicolon outside single quotes
  const statements: string[] = [];
  let buf = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "'") {
      if (inQuotes && clean[i + 1] === "'") {
        buf += "''";
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      buf += ch;
      continue;
    }
    if (ch === ';' && !inQuotes) {
      const trimmed = buf.trim();
      if (trimmed) statements.push(trimmed);
      buf = '';
      continue;
    }
    buf += ch;
  }

  const entities = new Map<string, StepEntity>();
  const stmtRegex = /^#(\d+)\s*=\s*(IFC[A-Z0-9_]+)\s*\(([\s\S]*)\)$/i;

  for (const stmt of statements) {
    const m = stmtRegex.exec(stmt.replace(/\s+/g, ' '));
    if (!m) continue;
    const id = m[1];
    const type = m[2].toUpperCase();
    const rawArgs = m[3];
    entities.set(id, {
      id,
      type,
      rawArgs,
      args: splitStepArgs(rawArgs),
    });
  }

  // 1. Resolve Length Unit Scale to meters
  let lengthScaleToMeters = 1.0;
  let detectedUnitName = 'METRE';
  let unitDetected = false;

  for (const ent of entities.values()) {
    if (ent.type === 'IFCSIUNIT' && ent.args.some((a) => a.toUpperCase().includes('.LENGTHUNIT.'))) {
      const prefixToken = ent.args.find((a) => /\.(MILLI|CENTI|DECI|KILO)\./i.test(a));
      if (prefixToken) {
        const up = prefixToken.toUpperCase();
        if (up.includes('MILLI')) {
          lengthScaleToMeters = 0.001;
          detectedUnitName = 'MILLIMETRE';
        } else if (up.includes('CENTI')) {
          lengthScaleToMeters = 0.01;
          detectedUnitName = 'CENTIMETRE';
        } else if (up.includes('DECI')) {
          lengthScaleToMeters = 0.1;
          detectedUnitName = 'DECIMETRE';
        } else if (up.includes('KILO')) {
          lengthScaleToMeters = 1000;
          detectedUnitName = 'KILOMETRE';
        }
      } else {
        lengthScaleToMeters = 1.0;
        detectedUnitName = 'METRE';
      }
      unitDetected = true;
      break;
    }
    if (ent.type === 'IFCCONVERSIONBASEDUNIT' && ent.args.some((a) => a.toUpperCase().includes('.LENGTHUNIT.'))) {
      const name = unquoteStep(ent.args[2]).toUpperCase();
      if (name.includes('FOOT') || name.includes('FEET')) {
        lengthScaleToMeters = 0.3048;
        detectedUnitName = 'FOOT';
        unitDetected = true;
      } else if (name.includes('INCH')) {
        lengthScaleToMeters = 0.0254;
        detectedUnitName = 'INCH';
        unitDetected = true;
      }
    }
  }

  // 2. Resolve Building Storeys & Containment Map
  const storeyInfo = new Map<string, { name: string; elevationM: number; level: BimLevel }>();
  for (const ent of entities.values()) {
    if (ent.type === 'IFCBUILDINGSTOREY') {
      const name = unquoteStep(ent.args[2]) || unquoteStep(ent.args[7]) || `Storey #${ent.id}`;
      const elevRaw = Number.parseFloat(ent.args[9] || '0');
      const elevationM = Number.isFinite(elevRaw) ? elevRaw * lengthScaleToMeters : 0;
      storeyInfo.set(ent.id, {
        name,
        elevationM,
        level: mapElevationToLevel(elevationM, name),
      });
    }
  }

  const elementToStorey = new Map<string, string>();
  for (const ent of entities.values()) {
    if (ent.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
      const relatedIds = parseRefList(ent.args[4]);
      const storeyId = parseRefId(ent.args[5]);
      if (storeyId) {
        for (const relId of relatedIds) {
          elementToStorey.set(relId, storeyId);
        }
      }
    }
  }

  // 3. Resolve IFCLOCALPLACEMENT chains (Position X, Y, Z in meters & Y-axis yaw)
  const resolvePlacement = (
    placementId: string | null,
    depth = 0
  ): { x: number; y: number; z: number; yawRad: number } | null => {
    if (!placementId || depth > 12) return null;
    const lp = entities.get(placementId);
    if (!lp || lp.type !== 'IFCLOCALPLACEMENT') return null;

    const parent = resolvePlacement(parseRefId(lp.args[0]), depth + 1) || { x: 0, y: 0, z: 0, yawRad: 0 };
    const axisId = parseRefId(lp.args[1]);
    const axis = axisId ? entities.get(axisId) : undefined;
    if (!axis || axis.type !== 'IFCAXIS2PLACEMENT3D') return parent;

    const ptId = parseRefId(axis.args[0]);
    const pt = ptId ? entities.get(ptId) : undefined;
    const coords = pt && pt.type === 'IFCCARTESIANPOINT' ? parseNumericTuple(pt.args[0]) : [0, 0, 0];
    const lx = (coords[0] || 0) * lengthScaleToMeters;
    const ly = (coords[1] || 0) * lengthScaleToMeters;
    const lz = (coords[2] || 0) * lengthScaleToMeters;

    let localYaw = 0;
    const refDirId = parseRefId(axis.args[2]);
    const refDir = refDirId ? entities.get(refDirId) : undefined;
    if (refDir && refDir.type === 'IFCDIRECTION') {
      const dir = parseNumericTuple(refDir.args[0]);
      if (dir.length >= 2) {
        localYaw = Math.atan2(dir[1], dir[0]);
      }
    }

    const cosP = Math.cos(parent.yawRad);
    const sinP = Math.sin(parent.yawRad);
    return {
      x: parent.x + lx * cosP - ly * sinP,
      y: parent.y + lx * sinP + ly * cosP,
      z: parent.z + lz,
      yawRad: parent.yawRad + localYaw,
    };
  };

  // 4. Resolve Extruded Solid Profile Dimensions from ProductDefinitionShape
  const resolveShapeDimensions = (shapeId: string | null): [number, number, number] | null => {
    if (!shapeId) return null;
    const shape = entities.get(shapeId);
    if (!shape) return null;

    const repIds = parseRefList(shape.args[2]);
    for (const repId of repIds) {
      const rep = entities.get(repId);
      if (!rep) continue;
      const itemIds = parseRefList(rep.args[3]);
      for (const itemId of itemIds) {
        const item = entities.get(itemId);
        if (!item) continue;
        if (item.type === 'IFCEXTRUDEDAREASOLID') {
          const depthRaw = Number.parseFloat(item.args[3] || '0');
          const depthM = Number.isFinite(depthRaw) && depthRaw > 0 ? depthRaw * lengthScaleToMeters : 0;
          const profId = parseRefId(item.args[0]);
          const prof = profId ? entities.get(profId) : undefined;
          if (!prof) continue;

          if (prof.type === 'IFCRECTANGLEPROFILEDEF' || prof.type === 'IFCRECTANGLEHOLLOWPROFILEDEF') {
            const xDim = Number.parseFloat(prof.args[3] || '0') * lengthScaleToMeters;
            const yDim = Number.parseFloat(prof.args[4] || '0') * lengthScaleToMeters;
            if (xDim > 0 && yDim > 0 && depthM > 0) {
              // In IFC, profile X/Y is extruded along Z (vertical height for columns/walls, or length)
              return [
                Number(xDim.toFixed(3)),
                Number(depthM.toFixed(3)),
                Number(yDim.toFixed(3)),
              ];
            }
          } else if (prof.type === 'IFCCIRCLEPROFILEDEF') {
            const rad = Number.parseFloat(prof.args[3] || '0') * lengthScaleToMeters;
            if (rad > 0 && depthM > 0) {
              const d = Number((rad * 2).toFixed(3));
              return [d, Number(depthM.toFixed(3)), d];
            }
          } else if (prof.type === 'IFCARBITRARYCLOSEDPROFILEDEF') {
            const curveId = parseRefId(prof.args[2]);
            const curve = curveId ? entities.get(curveId) : undefined;
            if (curve && curve.type === 'IFCPOLYLINE') {
              const ptIds = parseRefList(curve.args[0]);
              let minX = Infinity;
              let maxX = -Infinity;
              let minY = Infinity;
              let maxY = -Infinity;
              for (const pid of ptIds) {
                const pEnt = entities.get(pid);
                if (!pEnt) continue;
                const c = parseNumericTuple(pEnt.args[0]);
                if (c.length >= 2) {
                  minX = Math.min(minX, c[0] * lengthScaleToMeters);
                  maxX = Math.max(maxX, c[0] * lengthScaleToMeters);
                  minY = Math.min(minY, c[1] * lengthScaleToMeters);
                  maxY = Math.max(maxY, c[1] * lengthScaleToMeters);
                }
              }
              const sx = maxX - minX;
              const sz = maxY - minY;
              if (sx > 0 && sz > 0 && depthM > 0) {
                return [Number(sx.toFixed(3)), Number(depthM.toFixed(3)), Number(sz.toFixed(3))];
              }
            }
          }
        }
      }
    }
    return null;
  };

  // 5. Resolve IFCRELDEFINESBYPROPERTIES -> IFCELEMENTQUANTITY (Length, Area, Volume)
  const quantityMap = new Map<string, { length?: number; area?: number; volume?: number }>();
  for (const ent of entities.values()) {
    if (ent.type === 'IFCRELDEFINESBYPROPERTIES') {
      const targetIds = parseRefList(ent.args[4]);
      const propSetId = parseRefId(ent.args[5]);
      const propSet = propSetId ? entities.get(propSetId) : undefined;
      if (!propSet || propSet.type !== 'IFCELEMENTQUANTITY') continue;
      const qIds = parseRefList(propSet.args[5]);
      const parsedQ: { length?: number; area?: number; volume?: number } = {};
      for (const qid of qIds) {
        const qEnt = entities.get(qid);
        if (!qEnt) continue;
        const val = Number.parseFloat(qEnt.args[3] || '0');
        if (!Number.isFinite(val) || val <= 0) continue;
        if (qEnt.type === 'IFCQUANTITYLENGTH') parsedQ.length = val * lengthScaleToMeters;
        else if (qEnt.type === 'IFCQUANTITYAREA') parsedQ.area = val;
        else if (qEnt.type === 'IFCQUANTITYVOLUME') parsedQ.volume = val;
      }
      for (const tid of targetIds) {
        quantityMap.set(tid, { ...quantityMap.get(tid), ...parsedQ });
      }
    }
  }

  // 6. Build Genuine BIM Elements (Zero Villa Fallback!)
  const rawRecords: Array<{
    ent: StepEntity;
    mapping: (typeof IFC_ENTITY_MAP)[string];
    guid: string;
    name: string;
    level: BimLevel;
    ifcPos: { x: number; y: number; z: number; yawRad: number } | null;
    dims: [number, number, number];
    hasTrueGeometry: boolean;
    qOverride?: { length?: number; area?: number; volume?: number };
  }> = [];

  const seenGuids = new Set<string>();

  for (const ent of entities.values()) {
    const mapping = IFC_ENTITY_MAP[ent.type];
    if (!mapping) continue;

    const guid = unquoteStep(ent.args[0]) || `IFC-${ent.id}`;
    if (seenGuids.has(guid)) continue;
    seenGuids.add(guid);

    const name = unquoteStep(ent.args[2]) || unquoteStep(ent.args[7]) || `${ent.type} #${ent.id}`;
    const placementId = parseRefId(ent.args[5]);
    const shapeId = parseRefId(ent.args[6]);

    const ifcPos = resolvePlacement(placementId);
    const extractedDims = resolveShapeDimensions(shapeId);
    const qOverride = quantityMap.get(ent.id);

    const dims: [number, number, number] = extractedDims || [
      qOverride?.length && qOverride.length > 0 ? Number(qOverride.length.toFixed(3)) : mapping.defaultDims[0],
      mapping.defaultDims[1],
      mapping.defaultDims[2],
    ];

    const storeyId = elementToStorey.get(ent.id);
    const stInfo = storeyId ? storeyInfo.get(storeyId) : undefined;
    const zElev = stInfo?.elevationM ?? (ifcPos ? ifcPos.z : 0);
    const level: BimLevel = stInfo?.level || mapElevationToLevel(zElev, name);

    rawRecords.push({
      ent,
      mapping,
      guid,
      name,
      level,
      ifcPos,
      dims,
      hasTrueGeometry: Boolean(ifcPos || extractedDims || qOverride),
      qOverride,
    });
  }

  if (rawRecords.length === 0) {
    return {
      elements: [],
      report: {
        id: `rep-${Date.now()}`,
        fileName,
        sourceType: 'ifc',
        verificationStatus: 'missing_data',
        badge: 'EXTRACTION FAILED',
        confidenceScore: 0,
        elementCount: 0,
        warnings: [
          'No valid IFC building elements (Walls, Columns, Beams, Slabs, Footings, Doors, Windows, MEP segments) detected in STEP payload. No synthetic model fabricated.',
        ],
        calibration: {
          isCalibrated: false,
          referenceLengthM: 0,
          measuredUnits: 0,
          scaleFactor: 1.0,
        },
        analyzedAt: nowIso,
        boqUnlocked: false,
      },
    };
  }

  // Center imported model X/Z around world origin while preserving relative coordinates
  const placedRecords = rawRecords.filter((r) => r.ifcPos !== null);
  let cx = 0;
  let cy = 0;
  let minZ = Infinity;
  if (placedRecords.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const r of placedRecords) {
      if (!r.ifcPos) continue;
      minX = Math.min(minX, r.ifcPos.x);
      maxX = Math.max(maxX, r.ifcPos.x);
      minY = Math.min(minY, r.ifcPos.y);
      maxY = Math.max(maxY, r.ifcPos.y);
      minZ = Math.min(minZ, r.ifcPos.z);
    }
    cx = (minX + maxX) / 2;
    cy = (minY + maxY) / 2;
    if (!Number.isFinite(minZ)) minZ = 0;
  } else {
    minZ = 0;
  }

  let trueGeomCount = 0;
  const extracted: BimElement[] = rawRecords.map((rec, index) => {
    if (rec.hasTrueGeometry) trueGeomCount++;
    const { mapping, guid, name, level, ifcPos, dims, qOverride } = rec;
    const isSlab = mapping.category === 'slab' || mapping.category === 'foundation';

    // Convert IFC (X right, Y depth, Z up) -> Three.js (X right, Y up, Z forward = -IFC_Y)
    let pos: [number, number, number];
    let rotation: [number, number, number] | undefined;

    if (ifcPos) {
      const worldY = ifcPos.z - minZ + dims[1] / 2;
      pos = [
        Number((ifcPos.x - cx).toFixed(3)),
        Number(worldY.toFixed(3)),
        Number((-(ifcPos.y - cy)).toFixed(3)),
      ];
      if (Math.abs(ifcPos.yawRad) > 0.001) {
        rotation = [0, Number((-ifcPos.yawRad).toFixed(4)), 0];
      }
    } else {
      // Deterministic stacked bay layout ONLY for non-geometric STEP entries
      const col = index % 6;
      const row = Math.floor(index / 6);
      const storeyY =
        level === 'foundation'
          ? dims[1] / 2
          : level === 'ground'
          ? 0.5 + dims[1] / 2
          : level === 'level1'
          ? 3.9 + dims[1] / 2
          : level === 'level2'
          ? 7.3 + dims[1] / 2
          : 10.7 + dims[1] / 2;
      pos = [
        Number(((col - 2.5) * 4.2).toFixed(3)),
        Number(storeyY.toFixed(3)),
        Number((((row % 4) - 1.5) * 4.2).toFixed(3)),
      ];
    }

    const computedVol = qOverride?.volume ?? dims[0] * dims[1] * dims[2];
    const computedGrossArea = qOverride?.area ?? (isSlab ? dims[0] * dims[2] : dims[0] * dims[1]);
    const netArea = Number(computedGrossArea.toFixed(2));
    const volumeM3 = Number(computedVol.toFixed(3));
    const qtyForCost = mapping.boq === 'concrete' ? volumeM3 : netArea;

    return {
      id: `ifc-${rec.ent.id}-${index}`,
      guid,
      name,
      nameAr: `${mapping.labelAr} (${name})`,
      discipline: mapping.discipline,
      category: mapping.category,
      level,
      position: pos,
      dimensions: dims,
      rotation,
      materialName: `${rec.ent.type} (${detectedUnitName})`,
      concreteGrade: mapping.discipline === 'structural' ? 'C40' : undefined,
      grossAreaM2: Number(computedGrossArea.toFixed(2)),
      deductedOpeningAreaM2: 0,
      netAreaM2: netArea,
      volumeM3,
      boqCategory: mapping.boq,
      unitRate: mapping.rate,
      estimatedCost: Number((qtyForCost * mapping.rate).toFixed(2)),
    };
  });

  const geometryRatio = trueGeomCount / extracted.length;
  const warnings: string[] = [];
  if (!unitDetected) {
    warnings.push('IFCSIUNIT length unit not explicit in STEP header; assumed METRE (1.0). Confirm reference span.');
  }
  if (geometryRatio < 0.5) {
    warnings.push(
      `Only ${trueGeomCount}/${extracted.length} IFC entities carried IFCLOCALPLACEMENT/IFCEXTRUDEDAREASOLID geometry; remaining elements use nominal category sizing until calibrated.`
    );
  }

  const fullyVerified = unitDetected && geometryRatio >= 0.5;
  const report: DrawingAnalysisReport = {
    id: `rep-${Date.now()}`,
    fileName,
    sourceType: 'ifc',
    verificationStatus: fullyVerified ? 'verified' : 'needs_review',
    badge: fullyVerified ? 'BIM VERIFIED' : 'PARTIALLY EXTRACTED',
    confidenceScore: fullyVerified ? 96 : Math.round(55 + geometryRatio * 35),
    elementCount: extracted.length,
    warnings,
    calibration: {
      isCalibrated: fullyVerified,
      referenceLengthM: 10.0,
      measuredUnits: Number((10.0 / lengthScaleToMeters).toFixed(2)),
      scaleFactor: 1.0,
      lockedAt: fullyVerified ? nowIso : undefined,
    },
    analyzedAt: nowIso,
    boqUnlocked: fullyVerified,
  };

  return { elements: extracted, report };
}
