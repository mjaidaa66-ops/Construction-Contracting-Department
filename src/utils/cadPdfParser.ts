import type {
  BimCategory,
  BimDiscipline,
  BimElement,
  BimLevel,
  DrawingAnalysisReport,
  DrawingSourceType,
  TakeoffCategory,
} from '../types/bunyan';

export interface ParsedCadPdfResult {
  elements: BimElement[];
  report: DrawingAnalysisReport;
  dxfSummary?: DxfParseSummary;
}

export interface DxfEntitySegment {
  type: 'LINE' | 'LWPOLYLINE' | 'POLYLINE' | 'CIRCLE' | 'ARC' | 'INSERT';
  layer: string;
  points: Array<{ x: number; y: number; z: number }>;
  closed?: boolean;
  radius?: number;
  blockName?: string;
}

export interface DxfParseSummary {
  insUnitsCode: number;
  unitLabel: string;
  unitToMeters: number;
  unitSource: 'header' | 'inferred';
  entityCount: number;
  layers: string[];
  boundsMeters: { minX: number; maxX: number; minY: number; maxY: number; widthM: number; heightM: number };
  entities: DxfEntitySegment[];
  svgContent: string;
}

export interface PdfVectorStats {
  pageCount: number;
  segmentsCount: number;
  widthPts: number;
  heightPts: number;
  detectedScaleRatio?: number;
  textSample?: string;
  extractedWallSegments?: Array<{ x1: number; y1: number; x2: number; y2: number; layer?: string }>;
}

const DXF_INSUNITS_TO_METERS: Record<number, { factor: number; label: string }> = {
  0: { factor: 1.0, label: 'unitless (assumed meters)' },
  1: { factor: 0.0254, label: 'inches' },
  2: { factor: 0.3048, label: 'feet' },
  4: { factor: 0.001, label: 'millimeters' },
  5: { factor: 0.01, label: 'centimeters' },
  6: { factor: 1.0, label: 'meters' },
  7: { factor: 1000.0, label: 'kilometers' },
  14: { factor: 0.1, label: 'decimeters' },
};

function classifyLayer(
  layerName: string,
  entityType: DxfEntitySegment['type'],
  blockName?: string
): {
  discipline: BimDiscipline;
  category: BimCategory;
  boqCategory: TakeoffCategory;
  unitRate: number;
  level: BimLevel;
  defaultHeight: number;
  defaultThickness: number;
  labelAr: string;
} {
  const key = `${layerName} ${blockName || ''}`.toUpperCase();

  let level: BimLevel = 'ground';
  if (/FND|FOOT|BASE|SUB/.test(key)) level = 'foundation';
  else if (/L1|FIRST|1ST|F1|FL1/.test(key)) level = 'level1';
  else if (/L2|SECOND|2ND|F2|FL2/.test(key)) level = 'level2';
  else if (/L3|THIRD|3RD|F3|FL3/.test(key)) level = 'level3';
  else if (/ROOF|RF|TOP/.test(key)) level = 'roof';

  if (/FND|FOOT|RAFT|PILE/.test(key)) {
    return {
      discipline: 'structural',
      category: 'foundation',
      boqCategory: 'concrete',
      unitRate: 395,
      level: 'foundation',
      defaultHeight: 0.5,
      defaultThickness: 1.4,
      labelAr: 'أساس من مخطط DXF',
    };
  }
  if (/COL|COLUMN|PILLAR/.test(key) || (entityType === 'INSERT' && /^C[-_]?\d/i.test(blockName || ''))) {
    return {
      discipline: 'structural',
      category: 'column',
      boqCategory: 'concrete',
      unitRate: 425,
      level,
      defaultHeight: 3.4,
      defaultThickness: 0.4,
      labelAr: 'عمود خرساني من DXF',
    };
  }
  if (/BEAM|GIRDER|TB|TIE/.test(key)) {
    return {
      discipline: 'structural',
      category: 'beam',
      boqCategory: 'concrete',
      unitRate: 425,
      level,
      defaultHeight: 0.45,
      defaultThickness: 0.25,
      labelAr: 'جسر خرساني من DXF',
    };
  }
  if (/SLAB|FLOOR|DECK|ROOF/.test(key)) {
    return {
      discipline: 'structural',
      category: 'slab',
      boqCategory: 'concrete',
      unitRate: 425,
      level,
      defaultHeight: 0.22,
      defaultThickness: 0.22,
      labelAr: 'بلاطة من DXF',
    };
  }
  if (/HVAC|DUCT|AC|CHILL/.test(key)) {
    return {
      discipline: 'mep',
      category: 'mep_hvac',
      boqCategory: 'plumbing_hvac',
      unitRate: 95,
      level,
      defaultHeight: 0.35,
      defaultThickness: 0.45,
      labelAr: 'مجرى تكييف من DXF',
    };
  }
  if (/PLUMB|PIPE|WET|DRAIN|SAN|WATER/.test(key)) {
    return {
      discipline: 'mep',
      category: 'mep_plumbing',
      boqCategory: 'plumbing_hvac',
      unitRate: 70,
      level,
      defaultHeight: 0.2,
      defaultThickness: 0.2,
      labelAr: 'ماسورة سباكة من DXF',
    };
  }
  if (/ELEC|POWER|LIGHT|SMDB|DB/.test(key)) {
    return {
      discipline: 'mep',
      category: 'mep_electrical',
      boqCategory: 'electrical',
      unitRate: 130,
      level,
      defaultHeight: 1.2,
      defaultThickness: 0.35,
      labelAr: 'تمديد كهربائي من DXF',
    };
  }
  if (/GLAZ|GLASS|WIN|CURTAIN/.test(key)) {
    return {
      discipline: 'architectural',
      category: 'glass',
      boqCategory: 'doors_windows',
      unitRate: 750,
      level,
      defaultHeight: 2.2,
      defaultThickness: 0.08,
      labelAr: 'واجهة زجاجية من DXF',
    };
  }
  if (/DOOR|DR[-_]|GATE/.test(key)) {
    return {
      discipline: 'architectural',
      category: 'door_window',
      boqCategory: 'doors_windows',
      unitRate: 1280,
      level,
      defaultHeight: 2.2,
      defaultThickness: 0.12,
      labelAr: 'باب معماري من DXF',
    };
  }
  if (/STAIR|STEP/.test(key)) {
    return {
      discipline: 'architectural',
      category: 'stair',
      boqCategory: 'concrete',
      unitRate: 425,
      level,
      defaultHeight: 3.2,
      defaultThickness: 1.2,
      labelAr: 'درج من DXF',
    };
  }
  if (/SITE|PLOT|BOUND|GRID/.test(key)) {
    return {
      discipline: 'site',
      category: 'site_grid',
      boqCategory: 'excavation',
      unitRate: 32,
      level: 'foundation',
      defaultHeight: 0.1,
      defaultThickness: 0.2,
      labelAr: 'حدود موقع من DXF',
    };
  }

  return {
    discipline: 'architectural',
    category: 'wall',
    boqCategory: 'masonry',
    unitRate: 90,
    level,
    defaultHeight: 3.2,
    defaultThickness: 0.2,
    labelAr: 'جدار معماري من DXF',
  };
}

function levelBaseElevation(level: BimLevel): number {
  switch (level) {
    case 'foundation':
      return 0;
    case 'ground':
      return 0.5;
    case 'level1':
      return 3.9;
    case 'level2':
      return 7.3;
    case 'level3':
      return 10.7;
    case 'roof':
      return 14.1;
    default:
      return 0.5;
  }
}

/**
 * Genuine ASCII DXF group-code pair parser.
 * Extracts $INSUNITS, layers, LINE, LWPOLYLINE, POLYLINE/VERTEX, CIRCLE, ARC, INSERT
 * and converts them into geometrically accurate metric coordinates & BIM elements.
 */
export function parseDxfContent(contentText: string): {
  summary: DxfParseSummary;
  elements: BimElement[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const rawLines = contentText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Parse group code / value pairs
  const pairs: Array<{ code: number; value: string }> = [];
  for (let i = 0; i + 1 < rawLines.length; i += 2) {
    const code = Number.parseInt(rawLines[i].trim(), 10);
    if (!Number.isFinite(code)) continue;
    const value = rawLines[i + 1].trim();
    pairs.push({ code, value });
  }

  let section = '';
  let currentHeaderVar = '';
  let insUnitsCode = -1;

  const rawEntities: DxfEntitySegment[] = [];
  let inEntities = false;
  let activeEntity: DxfEntitySegment | null = null;
  let pendingPolyline: DxfEntitySegment | null = null;
  let activeVertex: { x: number; y: number; z: number } | null = null;
  let pendingPoint: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  let hasSecondPoint = false;
  let secondPoint: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  let startAngle = 0;
  let endAngle = 360;
  let inLwVertex = false;

  const flushActiveEntity = () => {
    if (!activeEntity) return;
    if (activeEntity.type === 'LWPOLYLINE' && inLwVertex) {
      activeEntity.points.push({ ...pendingPoint });
      inLwVertex = false;
    }
    if (activeEntity.type === 'LINE' && hasSecondPoint) {
      activeEntity.points = [{ ...pendingPoint }, { ...secondPoint }];
    } else if (activeEntity.type === 'CIRCLE' || activeEntity.type === 'INSERT') {
      if (activeEntity.points.length === 0) {
        activeEntity.points.push({ ...pendingPoint });
      }
    } else if (activeEntity.type === 'ARC') {
      const r = activeEntity.radius || 0;
      if (r > 0) {
        const a1 = (startAngle * Math.PI) / 180;
        let a2 = (endAngle * Math.PI) / 180;
        if (a2 <= a1) a2 += Math.PI * 2;
        const steps = 12;
        const pts: Array<{ x: number; y: number; z: number }> = [];
        for (let s = 0; s <= steps; s++) {
          const t = a1 + ((a2 - a1) * s) / steps;
          pts.push({
            x: pendingPoint.x + r * Math.cos(t),
            y: pendingPoint.y + r * Math.sin(t),
            z: pendingPoint.z,
          });
        }
        activeEntity.points = pts;
      }
    }
    if (activeEntity.points.length > 0) {
      rawEntities.push(activeEntity);
    }
    activeEntity = null;
    hasSecondPoint = false;
    pendingPoint = { x: 0, y: 0, z: 0 };
    secondPoint = { x: 0, y: 0, z: 0 };
    startAngle = 0;
    endAngle = 360;
    inLwVertex = false;
  };

  for (let i = 0; i < pairs.length; i++) {
    const { code, value } = pairs[i];

    if (code === 0 && value === 'SECTION') {
      const next = pairs[i + 1];
      if (next && next.code === 2) {
        section = next.value.toUpperCase();
        inEntities = section === 'ENTITIES';
        i++;
      }
      continue;
    }

    if (code === 0 && value === 'ENDSEC') {
      flushActiveEntity();
      if (pendingPolyline && pendingPolyline.points.length > 0) {
        rawEntities.push(pendingPolyline);
      }
      pendingPolyline = null;
      inEntities = false;
      section = '';
      continue;
    }

    if (section === 'HEADER') {
      if (code === 9) {
        currentHeaderVar = value.toUpperCase();
      } else if (currentHeaderVar === '$INSUNITS' && code === 70) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) insUnitsCode = parsed;
      }
      continue;
    }

    if (!inEntities) continue;

    if (code === 0) {
      const entUpper = value.toUpperCase();
      if (pendingPolyline) {
        if (entUpper === 'VERTEX') {
          if (activeVertex) pendingPolyline.points.push(activeVertex);
          activeVertex = { x: 0, y: 0, z: 0 };
          continue;
        }
        if (entUpper === 'SEQEND') {
          if (activeVertex) pendingPolyline.points.push(activeVertex);
          activeVertex = null;
          if (pendingPolyline.points.length > 0) rawEntities.push(pendingPolyline);
          pendingPolyline = null;
          continue;
        }
      }

      flushActiveEntity();

      if (entUpper === 'POLYLINE') {
        pendingPolyline = { type: 'POLYLINE', layer: '0', points: [], closed: false };
      } else if (
        entUpper === 'LINE' ||
        entUpper === 'LWPOLYLINE' ||
        entUpper === 'CIRCLE' ||
        entUpper === 'ARC' ||
        entUpper === 'INSERT'
      ) {
        activeEntity = {
          type: entUpper,
          layer: '0',
          points: [],
          closed: false,
        };
      }
      continue;
    }

    if (pendingPolyline) {
      if (activeVertex) {
        const num = Number.parseFloat(value);
        if (code === 10 && Number.isFinite(num)) activeVertex.x = num;
        else if (code === 20 && Number.isFinite(num)) activeVertex.y = num;
        else if (code === 30 && Number.isFinite(num)) activeVertex.z = num;
      } else {
        if (code === 8) pendingPolyline.layer = value || '0';
        else if (code === 70) pendingPolyline.closed = (Number.parseInt(value, 10) & 1) === 1;
      }
      continue;
    }

    if (!activeEntity) continue;

    if (code === 8) {
      activeEntity.layer = value || '0';
    } else if (code === 2 && activeEntity.type === 'INSERT') {
      activeEntity.blockName = value;
    } else if (code === 70 && activeEntity.type === 'LWPOLYLINE') {
      activeEntity.closed = (Number.parseInt(value, 10) & 1) === 1;
    } else {
      const num = Number.parseFloat(value);
      if (!Number.isFinite(num)) continue;

      if (activeEntity.type === 'LWPOLYLINE') {
        if (code === 10) {
          if (inLwVertex) activeEntity.points.push({ ...pendingPoint });
          pendingPoint = { x: num, y: 0, z: pendingPoint.z };
          inLwVertex = true;
        } else if (code === 20) {
          pendingPoint.y = num;
        } else if (code === 38) {
          pendingPoint.z = num;
        }
      } else {
        if (code === 10) pendingPoint.x = num;
        else if (code === 20) pendingPoint.y = num;
        else if (code === 30) pendingPoint.z = num;
        else if (code === 11) {
          secondPoint.x = num;
          hasSecondPoint = true;
        } else if (code === 21) {
          secondPoint.y = num;
          hasSecondPoint = true;
        } else if (code === 31) {
          secondPoint.z = num;
        } else if (code === 40) {
          activeEntity.radius = num;
        } else if (code === 50) {
          startAngle = num;
        } else if (code === 51) {
          endAngle = num;
        }
      }
    }
  }

  // Flush any trailing active entity at EOF
  flushActiveEntity();

  // Compute raw bounds to infer units if $INSUNITS omitted or unitless (0)
  let rawMinX = Infinity;
  let rawMaxX = -Infinity;
  let rawMinY = Infinity;
  let rawMaxY = -Infinity;
  for (const ent of rawEntities) {
    for (const pt of ent.points) {
      if (pt.x < rawMinX) rawMinX = pt.x;
      if (pt.x > rawMaxX) rawMaxX = pt.x;
      if (pt.y < rawMinY) rawMinY = pt.y;
      if (pt.y > rawMaxY) rawMaxY = pt.y;
    }
  }

  let unitToMeters = 1.0;
  let unitLabel = 'meters';
  let unitSource: 'header' | 'inferred' = 'header';

  if (insUnitsCode > 0 && DXF_INSUNITS_TO_METERS[insUnitsCode]) {
    unitToMeters = DXF_INSUNITS_TO_METERS[insUnitsCode].factor;
    unitLabel = DXF_INSUNITS_TO_METERS[insUnitsCode].label;
    unitSource = 'header';
  } else {
    unitSource = 'inferred';
    const rawSpan = Math.max(
      Number.isFinite(rawMaxX - rawMinX) ? rawMaxX - rawMinX : 0,
      Number.isFinite(rawMaxY - rawMinY) ? rawMaxY - rawMinY : 0
    );
    if (rawSpan > 500) {
      unitToMeters = 0.001;
      unitLabel = 'millimeters (inferred from drawing span)';
      warnings.push('DXF header omits valid $INSUNITS; inferred millimeters from coordinate span (>500). Confirm reference span in Audit.');
    } else {
      unitToMeters = 1.0;
      unitLabel = 'meters (assumed)';
      warnings.push('DXF header specifies unitless/missing $INSUNITS; assumed 1 DXF unit = 1 meter. Verify scale in Calibration Audit.');
    }
  }

  const layers = Array.from(new Set(rawEntities.map((e) => e.layer)));
  const minX = Number.isFinite(rawMinX) ? rawMinX * unitToMeters : 0;
  const maxX = Number.isFinite(rawMaxX) ? rawMaxX * unitToMeters : 0;
  const minY = Number.isFinite(rawMinY) ? rawMinY * unitToMeters : 0;
  const maxY = Number.isFinite(rawMaxY) ? rawMaxY * unitToMeters : 0;
  const widthM = Math.max(0, maxX - minX);
  const heightM = Math.max(0, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const elements: BimElement[] = [];
  let segCounter = 0;

  for (let ei = 0; ei < rawEntities.length; ei++) {
    const ent = rawEntities[ei];
    const cls = classifyLayer(ent.layer, ent.type, ent.blockName);
    const baseY = levelBaseElevation(cls.level);

    if (ent.type === 'CIRCLE') {
      const center = ent.points[0];
      const rM = Math.max(0.15, (ent.radius || 0.25) * unitToMeters);
      const diam = Number((rM * 2).toFixed(3));
      const area = Number((Math.PI * rM * rM).toFixed(3));
      const vol = Number((area * cls.defaultHeight).toFixed(3));
      const px = Number((center.x * unitToMeters - centerX).toFixed(3));
      const pz = Number((-(center.y * unitToMeters - centerY)).toFixed(3));
      elements.push({
        id: `dxf-el-${segCounter++}`,
        guid: `DXF_${ent.layer}_C_${ei}`,
        name: `${ent.layer} Circular ${cls.category} (D=${diam}m)`,
        nameAr: `${cls.labelAr} — طبقة ${ent.layer}`,
        discipline: cls.discipline,
        category: cls.category,
        level: cls.level,
        position: [px, baseY + cls.defaultHeight / 2, pz],
        dimensions: [diam, cls.defaultHeight, diam],
        materialName: `DXF Layer ${ent.layer} (${unitLabel})`,
        concreteGrade: cls.discipline === 'structural' ? 'C40' : undefined,
        grossAreaM2: Number((Math.PI * diam * cls.defaultHeight).toFixed(2)),
        deductedOpeningAreaM2: 0,
        netAreaM2: Number((Math.PI * diam * cls.defaultHeight).toFixed(2)),
        volumeM3: vol,
        boqCategory: cls.boqCategory,
        unitRate: cls.unitRate,
        estimatedCost: Number(((cls.boqCategory === 'concrete' ? vol : area) * cls.unitRate).toFixed(2)),
      });
      continue;
    }

    if (ent.type === 'INSERT') {
      const center = ent.points[0];
      const px = Number((center.x * unitToMeters - centerX).toFixed(3));
      const pz = Number((-(center.y * unitToMeters - centerY)).toFixed(3));
      const w = cls.category === 'door_window' ? 1.2 : 0.45;
      const d = cls.defaultThickness;
      const h = cls.defaultHeight;
      const area = Number((w * h).toFixed(2));
      const vol = Number((w * h * d).toFixed(3));
      elements.push({
        id: `dxf-el-${segCounter++}`,
        guid: `DXF_${ent.layer}_BLK_${ei}`,
        name: `Block ${ent.blockName || ent.layer}`,
        nameAr: `${cls.labelAr} (${ent.blockName || ent.layer})`,
        discipline: cls.discipline,
        category: cls.category,
        level: cls.level,
        position: [px, baseY + h / 2, pz],
        dimensions: [w, h, d],
        materialName: `DXF Block ${ent.blockName || ent.layer}`,
        concreteGrade: cls.discipline === 'structural' ? 'C40' : undefined,
        grossAreaM2: area,
        deductedOpeningAreaM2: 0,
        netAreaM2: area,
        volumeM3: vol,
        boqCategory: cls.boqCategory,
        unitRate: cls.unitRate,
        estimatedCost: Number(((cls.boqCategory === 'doors_windows' ? 1 : cls.boqCategory === 'concrete' ? vol : area) * cls.unitRate).toFixed(2)),
      });
      continue;
    }

    // Closed slab / foundation polygon detection
    const pts = ent.points;
    if (
      (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') &&
      ent.closed &&
      pts.length >= 3 &&
      (cls.category === 'slab' || cls.category === 'foundation' || cls.category === 'site_grid')
    ) {
      let sMinX = Infinity;
      let sMaxX = -Infinity;
      let sMinY = Infinity;
      let sMaxY = -Infinity;
      let shoelace = 0;
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k];
        const b = pts[(k + 1) % pts.length];
        const ax = a.x * unitToMeters;
        const ay = a.y * unitToMeters;
        const bx = b.x * unitToMeters;
        const by = b.y * unitToMeters;
        shoelace += ax * by - bx * ay;
        if (ax < sMinX) sMinX = ax;
        if (ax > sMaxX) sMaxX = ax;
        if (ay < sMinY) sMinY = ay;
        if (ay > sMaxY) sMaxY = ay;
      }
      const areaM2 = Number((0.5 * Math.abs(shoelace)).toFixed(2));
      const sx = Math.max(0.2, Number((sMaxX - sMinX).toFixed(3)));
      const sz = Math.max(0.2, Number((sMaxY - sMinY).toFixed(3)));
      const h = cls.defaultHeight;
      const vol = Number((areaM2 * h).toFixed(3));
      const px = Number(((sMinX + sMaxX) / 2 - centerX).toFixed(3));
      const pz = Number((-((sMinY + sMaxY) / 2 - centerY)).toFixed(3));
      elements.push({
        id: `dxf-el-${segCounter++}`,
        guid: `DXF_${ent.layer}_SLAB_${ei}`,
        name: `${ent.layer} Closed Boundary (${sx.toFixed(1)}×${sz.toFixed(1)}m)`,
        nameAr: `${cls.labelAr} (${sx.toFixed(1)}×${sz.toFixed(1)} م)`,
        discipline: cls.discipline,
        category: cls.category,
        level: cls.level,
        position: [px, baseY + h / 2, pz],
        dimensions: [sx, h, sz],
        materialName: `DXF Layer ${ent.layer} (${unitLabel})`,
        concreteGrade: cls.discipline === 'structural' ? 'C40' : undefined,
        grossAreaM2: areaM2,
        deductedOpeningAreaM2: 0,
        netAreaM2: areaM2,
        volumeM3: vol,
        boqCategory: cls.boqCategory,
        unitRate: cls.unitRate,
        estimatedCost: Number(((cls.boqCategory === 'concrete' ? vol : areaM2) * cls.unitRate).toFixed(2)),
      });
      continue;
    }

    // Segments along LINE / LWPOLYLINE / POLYLINE / ARC
    const segCount = ent.closed && pts.length >= 3 ? pts.length : pts.length - 1;
    for (let s = 0; s < segCount; s++) {
      const p1 = pts[s];
      const p2 = pts[(s + 1) % pts.length];
      const x1 = p1.x * unitToMeters - centerX;
      const z1 = -(p1.y * unitToMeters - centerY);
      const x2 = p2.x * unitToMeters - centerX;
      const z2 = -(p2.y * unitToMeters - centerY);
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;

      const rotY = -Math.atan2(dz, dx);
      const h = cls.defaultHeight;
      const t = cls.defaultThickness;
      const area = Number((len * h).toFixed(2));
      const vol = Number((len * h * t).toFixed(3));
      elements.push({
        id: `dxf-el-${segCounter++}`,
        guid: `DXF_${ent.layer}_S${ei}_${s}`,
        name: `${ent.layer} ${cls.category} (${len.toFixed(2)}m)`,
        nameAr: `${cls.labelAr} (${len.toFixed(2)} م)`,
        discipline: cls.discipline,
        category: cls.category,
        level: cls.level,
        position: [Number(((x1 + x2) / 2).toFixed(3)), baseY + h / 2, Number(((z1 + z2) / 2).toFixed(3))],
        dimensions: [Number(len.toFixed(3)), h, t],
        rotation: [0, Number(rotY.toFixed(4)), 0],
        materialName: `DXF Layer ${ent.layer} (${unitLabel})`,
        concreteGrade: cls.discipline === 'structural' ? 'C40' : undefined,
        grossAreaM2: area,
        deductedOpeningAreaM2: 0,
        netAreaM2: area,
        volumeM3: vol,
        boqCategory: cls.boqCategory,
        unitRate: cls.unitRate,
        estimatedCost: Number(((cls.boqCategory === 'concrete' ? vol : area) * cls.unitRate).toFixed(2)),
      });
      if (elements.length >= 450) break;
    }
    if (elements.length >= 450) {
      warnings.push('Large DXF file clipped at 450 3D segment meshes for viewport stability.');
      break;
    }
  }

  // Generate clean scaled 2D vector SVG backdrop preserving metric scale
  const svgW = 1200;
  const svgH = 850;
  const pad = 80;
  const safeSpanW = Math.max(1, widthM);
  const safeSpanH = Math.max(1, heightM);
  const pxPerM = Number(Math.min((svgW - pad * 2) / safeSpanW, (svgH - pad * 2) / safeSpanH).toFixed(3));
  const ox = (svgW - widthM * pxPerM) / 2;
  const oy = (svgH - heightM * pxPerM) / 2;

  const toSvgX = (xm: number) => Number((ox + (xm - minX) * pxPerM).toFixed(1));
  const toSvgY = (ym: number) => Number((svgH - (oy + (ym - minY) * pxPerM)).toFixed(1));

  const svgShapes: string[] = [];
  for (const ent of rawEntities.slice(0, 1200)) {
    const cls = classifyLayer(ent.layer, ent.type, ent.blockName);
    const stroke =
      cls.discipline === 'structural'
        ? '#F59E0B'
        : cls.discipline === 'mep'
        ? '#38BDF8'
        : cls.discipline === 'site'
        ? '#94A3B8'
        : '#E2E8F0';
    if (ent.type === 'CIRCLE') {
      const c = ent.points[0];
      const rPx = Math.max(2, (ent.radius || 0.25) * unitToMeters * pxPerM);
      svgShapes.push(
        `<circle cx="${toSvgX(c.x * unitToMeters)}" cy="${toSvgY(c.y * unitToMeters)}" r="${rPx.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="1.4"/>`
      );
    } else if (ent.points.length >= 2) {
      const ptsStr = ent.points
        .map((p) => `${toSvgX(p.x * unitToMeters)},${toSvgY(p.y * unitToMeters)}`)
        .join(' ');
      svgShapes.push(
        ent.closed
          ? `<polygon points="${ptsStr}" fill="none" stroke="${stroke}" stroke-width="1.4"/>`
          : `<polyline points="${ptsStr}" fill="none" stroke="${stroke}" stroke-width="1.4"/>`
      );
    }
  }

  const svgContent = `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${svgW}" height="${svgH}" fill="#0B1120"/>
    <text x="36" y="34" fill="#D4AF37" font-size="13" font-weight="700" font-family="monospace">CAD DXF VECTOR SHEET · ${rawEntities.length} ENTITIES · ${widthM.toFixed(2)}m × ${heightM.toFixed(2)}m (${pxPerM} px/m)</text>
    ${svgShapes.join('\n')}
  </svg>`;

  return {
    summary: {
      insUnitsCode,
      unitLabel,
      unitToMeters,
      unitSource,
      entityCount: rawEntities.length,
      layers,
      boundsMeters: { minX, maxX, minY, maxY, widthM, heightM },
      entities: rawEntities,
      svgContent,
    },
    elements,
    warnings,
  };
}

/**
 * Analyzes uploaded CAD (.dxf/.dwg), vector PDF, or raster blueprint files.
 * Strictly enforces SOURCE DRAWING = BIM MODEL:
 * - ASCII DXF is genuinely parsed and scaled to meters.
 * - Binary DWG / Raster Images / Unparsed PDFs NEVER fabricate synthetic villa geometry.
 */
export function parseCadOrPdfDrawing(
  fileName: string,
  contentText?: string,
  pdfStats?: PdfVectorStats
): ParsedCadPdfResult {
  const lower = fileName.toLowerCase();
  let sourceType: DrawingSourceType = 'vector_pdf';
  if (lower.endsWith('.dxf')) sourceType = 'dxf';
  else if (lower.endsWith('.dwg')) sourceType = 'dwg';
  else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) {
    sourceType = 'raster_image';
  }

  const nowIso = new Date().toISOString();

  if (sourceType === 'dxf') {
    if (!contentText || contentText.trim().length === 0) {
      return {
        elements: [],
        report: {
          id: `rep-${Date.now()}`,
          fileName,
          sourceType: 'dxf',
          verificationStatus: 'missing_data',
          badge: 'EXTRACTION FAILED',
          confidenceScore: 0,
          elementCount: 0,
          warnings: ['Empty DXF payload provided. Cannot extract CAD entities.'],
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

    // Binary DXF guard ("AutoCAD Binary DXF")
    if (contentText.startsWith('AutoCAD Binary DXF')) {
      return {
        elements: [],
        report: {
          id: `rep-${Date.now()}`,
          fileName,
          sourceType: 'dxf',
          verificationStatus: 'missing_data',
          badge: 'EXTRACTION FAILED',
          confidenceScore: 0,
          elementCount: 0,
          warnings: ['Binary DXF format is not supported directly. Export as ASCII DXF (R2000-2018) from AutoCAD.'],
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

    const parsed = parseDxfContent(contentText);
    const hasElements = parsed.elements.length > 0;
    const isHeaderCalibrated = parsed.summary.unitSource === 'header' && parsed.summary.insUnitsCode > 0;
    const refSpan = Math.max(1, Number(parsed.summary.boundsMeters.widthM.toFixed(2)));

    if (!hasElements) {
      return {
        elements: [],
        dxfSummary: parsed.summary,
        report: {
          id: `rep-${Date.now()}`,
          fileName,
          sourceType: 'dxf',
          verificationStatus: 'missing_data',
          badge: 'EXTRACTION FAILED',
          confidenceScore: 0,
          elementCount: 0,
          warnings: [
            'No supported vector entities (LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, INSERT) found in DXF ENTITIES section.',
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

    const warnings = [...parsed.warnings];
    if (isHeaderCalibrated) {
      warnings.push(
        `DXF $INSUNITS=${parsed.summary.insUnitsCode} (${parsed.summary.unitLabel}) extracted ${parsed.elements.length} 3D elements (${parsed.summary.boundsMeters.widthM.toFixed(2)}m × ${parsed.summary.boundsMeters.heightM.toFixed(2)}m). Verify storey heights before final BOQ sign-off.`
      );
    }

    return {
      elements: parsed.elements,
      dxfSummary: parsed.summary,
      report: {
        id: `rep-${Date.now()}`,
        fileName,
        sourceType: 'dxf',
        verificationStatus: isHeaderCalibrated ? 'verified' : 'needs_review',
        badge: isHeaderCalibrated ? 'BIM VERIFIED' : 'CALIBRATION REQUIRED',
        confidenceScore: isHeaderCalibrated ? 91 : 68,
        elementCount: parsed.elements.length,
        warnings,
        calibration: {
          isCalibrated: isHeaderCalibrated,
          referenceLengthM: refSpan,
          measuredUnits: Number((refSpan / parsed.summary.unitToMeters).toFixed(2)),
          scaleFactor: 1.0,
          lockedAt: isHeaderCalibrated ? nowIso : undefined,
        },
        analyzedAt: nowIso,
        boqUnlocked: isHeaderCalibrated,
      },
    };
  }

  if (sourceType === 'dwg') {
    return {
      elements: [],
      report: {
        id: `rep-${Date.now()}`,
        fileName,
        sourceType: 'dwg',
        verificationStatus: 'missing_data',
        badge: 'EXTRACTION FAILED',
        confidenceScore: 0,
        elementCount: 0,
        warnings: [
          'Binary .DWG is a proprietary Autodesk format requiring server-side ODA/Teigha conversion. Export as ASCII .DXF or .IFC to extract genuine 3D BIM geometry (no synthetic fallback model is generated).',
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

  if (sourceType === 'raster_image') {
    return {
      elements: [],
      report: {
        id: `rep-${Date.now()}`,
        fileName,
        sourceType: 'raster_image',
        verificationStatus: 'missing_data',
        badge: 'CALIBRATION REQUIRED',
        confidenceScore: 0,
        elementCount: 0,
        warnings: [
          'Raster image lacks 3D BIM geometry and embedded scale metadata. Upload into 2D PlanSwift Takeoff, calibrate two known points, and trace measurements manually.',
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

  // vector_pdf
  if (pdfStats && pdfStats.extractedWallSegments && pdfStats.extractedWallSegments.length > 0) {
    const scaleRatio = pdfStats.detectedScaleRatio || 100;
    // 72 DPI pt -> m: pts * 0.0254 / 72 * scaleRatio
    const ptToM = (0.0254 / 72) * scaleRatio;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const seg of pdfStats.extractedWallSegments) {
      minX = Math.min(minX, seg.x1 * ptToM, seg.x2 * ptToM);
      maxX = Math.max(maxX, seg.x1 * ptToM, seg.x2 * ptToM);
      minY = Math.min(minY, seg.y1 * ptToM, seg.y2 * ptToM);
      maxY = Math.max(maxY, seg.y1 * ptToM, seg.y2 * ptToM);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const elements: BimElement[] = pdfStats.extractedWallSegments
      .slice(0, 300)
      .map((seg, idx) => {
        const x1 = seg.x1 * ptToM - cx;
        const z1 = -(seg.y1 * ptToM - cy);
        const x2 = seg.x2 * ptToM - cx;
        const z2 = -(seg.y2 * ptToM - cy);
        const len = Math.max(0.2, Math.hypot(x2 - x1, z2 - z1));
        const rotY = -Math.atan2(z2 - z1, x2 - x1);
        const h = 3.2;
        const t = 0.2;
        const area = Number((len * h).toFixed(2));
        return {
          id: `pdf-vec-${idx}`,
          guid: `PDF_VEC_${idx}`,
          name: `Vector PDF Wall Segment #${idx + 1} (${len.toFixed(2)}m)`,
          nameAr: `جدار من PDF متجهي (${len.toFixed(2)} م)`,
          discipline: 'architectural',
          category: 'wall',
          level: 'ground',
          position: [Number(((x1 + x2) / 2).toFixed(3)), 2.1, Number(((z1 + z2) / 2).toFixed(3))],
          dimensions: [Number(len.toFixed(3)), h, t],
          rotation: [0, Number(rotY.toFixed(4)), 0],
          materialName: `Vector PDF Extract (1:${scaleRatio})`,
          grossAreaM2: area,
          deductedOpeningAreaM2: 0,
          netAreaM2: area,
          volumeM3: Number((area * t).toFixed(3)),
          boqCategory: 'masonry',
          unitRate: 90,
          estimatedCost: Number((area * 90).toFixed(2)),
        };
      });

    const isCalibrated = Boolean(pdfStats.detectedScaleRatio);
    return {
      elements,
      report: {
        id: `rep-${Date.now()}`,
        fileName,
        sourceType: 'vector_pdf',
        verificationStatus: isCalibrated ? 'estimated' : 'needs_review',
        badge: isCalibrated ? 'PARTIALLY EXTRACTED' : 'CALIBRATION REQUIRED',
        confidenceScore: isCalibrated ? 78 : 55,
        elementCount: elements.length,
        warnings: [
          `Extracted ${elements.length} vector path segments from PDF at ${isCalibrated ? `detected 1:${scaleRatio}` : 'nominal 1:100'} scale. Confirm 2-point calibration before unlocking final BOQ.`,
        ],
        calibration: {
          isCalibrated: false,
          referenceLengthM: 5.0,
          measuredUnits: 5.0 * (72 / 0.0254 / scaleRatio),
          scaleFactor: 1.0,
        },
        analyzedAt: nowIso,
        boqUnlocked: false,
      },
    };
  }

  return {
    elements: [],
    report: {
      id: `rep-${Date.now()}`,
      fileName,
      sourceType: 'vector_pdf',
      verificationStatus: 'missing_data',
      badge: 'CALIBRATION REQUIRED',
      confidenceScore: 0,
      elementCount: 0,
      warnings: [
        '2D PDF sheet requires loading in PlanSwift 2D Takeoff for scale calibration & quantity tracing; no synthetic 3D BIM model is fabricated from an unparsed PDF.',
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
