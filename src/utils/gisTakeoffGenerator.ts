import type {
  BimElement,
  GisBoundaryPoint,
  GisPlotData,
  Project,
  TakeoffSheet,
} from '../types/bunyan';
import { generateSharjahVillaBimElements } from './bimModelGenerator';

export interface ProjectTelemetry {
  concreteM3: number;
  steelKg: number;
  steelTon: number;
  masonryM2: number;
  approvedBudgetAed: number;
  actualProgress: number;
  plannedProgress: number;
  source: 'takeoff' | 'bim';
}

/**
 * Ensures any GIS plot has >= 3 valid boundary coordinates in meters.
 * Falls back to a rectangular plot sized directly from plotAreaSqM when omitted.
 */
export function normalizeBoundaryPoints(gis: GisPlotData): GisBoundaryPoint[] {
  if (Array.isArray(gis.boundaryPoints) && gis.boundaryPoints.length >= 3) {
    return gis.boundaryPoints.map((p, idx) => ({
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      label: p.label || `P${idx + 1}`,
    }));
  }

  const area = gis.plotAreaSqM && gis.plotAreaSqM > 20 ? gis.plotAreaSqM : 900;
  const width = Number(Math.sqrt(area * 1.35).toFixed(2));
  const depth = Number((area / width).toFixed(2));

  return [
    { x: 0, y: 0, label: 'P1 (NW)' },
    { x: width, y: 0, label: 'P2 (NE)' },
    { x: width, y: depth, label: 'P3 (SE)' },
    { x: 0, y: depth, label: 'P4 (SW)' },
  ];
}

export interface NormalizedPlotGeometry {
  rawPoints: GisBoundaryPoint[];
  centeredPoints: Array<{ x: number; z: number; label: string }>;
  widthM: number;
  depthM: number;
  setbackBox: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    buildableWidthM: number;
    buildableDepthM: number;
  };
}

/**
 * Computes origin-centered 3D plot polygon & Sharjah Municipality inner setback bounds.
 */
export function computePlotGeometryCentered(gis: GisPlotData): NormalizedPlotGeometry {
  const rawPoints = normalizeBoundaryPoints(gis);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of rawPoints) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const widthM = Math.max(8, maxX - minX);
  const depthM = Math.max(8, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const centeredPoints = rawPoints.map((pt, idx) => ({
    x: Number((pt.x - cx).toFixed(3)),
    z: Number((pt.y - cy).toFixed(3)),
    label: pt.label || `P${idx + 1}`,
  }));

  const halfW = widthM / 2;
  const halfD = depthM / 2;

  const sLeft = Math.min(halfW - 2, Math.max(0, gis.setbacks?.sideLeft ?? 2));
  const sRight = Math.min(halfW - 2, Math.max(0, gis.setbacks?.sideRight ?? 2));
  const sRear = Math.min(halfD - 2, Math.max(0, gis.setbacks?.rear ?? 3));
  const sFront = Math.min(halfD - 2, Math.max(0, gis.setbacks?.front ?? 3));

  const sbMinX = -halfW + sLeft;
  const sbMaxX = halfW - sRight;
  const sbMinZ = -halfD + sRear;
  const sbMaxZ = halfD - sFront;

  return {
    rawPoints,
    centeredPoints,
    widthM,
    depthM,
    setbackBox: {
      minX: sbMinX,
      maxX: sbMaxX,
      minZ: sbMinZ,
      maxZ: sbMaxZ,
      buildableWidthM: Math.max(4, sbMaxX - sbMinX),
      buildableDepthM: Math.max(4, sbMaxZ - sbMinZ),
    },
  };
}

/**
 * Automatically builds a calibrated 2D PlanSwift TakeoffSheet derived from project.gisData.
 */
export function generateGisPlotTakeoffSheet(project: Project): TakeoffSheet {
  const gis = project.gisData;
  const points = normalizeBoundaryPoints(gis);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const plotW = Math.max(10, maxX - minX);
  const plotH = Math.max(10, maxY - minY);

  const svgWidth = 1000;
  const svgHeight = 700;
  const padX = 110;
  const padY = 95;
  const availW = svgWidth - padX * 2;
  const availH = svgHeight - padY * 2;
  const pixelsPerMeter = Number(Math.min(availW / plotW, availH / plotH).toFixed(2));

  const drawW = plotW * pixelsPerMeter;
  const drawH = plotH * pixelsPerMeter;
  const originX = (svgWidth - drawW) / 2;
  const originY = (svgHeight - drawH) / 2;

  const toPx = (pt: GisBoundaryPoint) => ({
    px: Number((originX + (pt.x - minX) * pixelsPerMeter).toFixed(1)),
    py: Number((originY + (pt.y - minY) * pixelsPerMeter).toFixed(1)),
    label: pt.label || '',
  });

  const mappedPts = points.map(toPx);
  const polyStr = mappedPts.map((p) => `${p.px},${p.py}`).join(' ');

  const sLeftPx = Math.min(drawW * 0.35, (gis.setbacks?.sideLeft ?? 2) * pixelsPerMeter);
  const sRightPx = Math.min(drawW * 0.35, (gis.setbacks?.sideRight ?? 2) * pixelsPerMeter);
  const sRearPx = Math.min(drawH * 0.35, (gis.setbacks?.rear ?? 3) * pixelsPerMeter);
  const sFrontPx = Math.min(drawH * 0.35, (gis.setbacks?.front ?? 3) * pixelsPerMeter);

  const envX = originX + sLeftPx;
  const envY = originY + sRearPx;
  const envW = Math.max(40, drawW - sLeftPx - sRightPx);
  const envH = Math.max(40, drawH - sRearPx - sFrontPx);

  const scaleBarMeters = 5;
  const scaleBarPx = Math.min(260, Math.max(60, scaleBarMeters * pixelsPerMeter));
  const safePlotTitle = `${gis.sectorName || 'Sharjah'} · PLOT ${gis.plotNumber || project.code}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const cornerLabelsSvg = mappedPts
    .map(
      (p, i) => `
      <circle cx="${p.px}" cy="${p.py}" r="4.5" fill="#D4AF37" stroke="#0B1120" stroke-width="1.5"/>
      <text x="${p.px + 8}" y="${p.py - 8}" fill="#D4AF37" font-size="10.5" font-family="monospace">${
        p.label || `P${i + 1}`
      }</text>`
    )
    .join('');

  const svgContent = `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="gisMinorGrid" width="${Math.max(10, pixelsPerMeter)}" height="${Math.max(
        10,
        pixelsPerMeter
      )}" patternUnits="userSpaceOnUse">
        <path d="M ${Math.max(10, pixelsPerMeter)} 0 L 0 0 0 ${Math.max(
          10,
          pixelsPerMeter
        )}" fill="none" stroke="rgba(56,189,248,0.12)" stroke-width="0.8"/>
      </pattern>
      <pattern id="gisMajorGrid" width="${Math.max(50, pixelsPerMeter * 5)}" height="${Math.max(
        50,
        pixelsPerMeter * 5
      )}" patternUnits="userSpaceOnUse">
        <path d="M ${Math.max(50, pixelsPerMeter * 5)} 0 L 0 0 0 ${Math.max(
          50,
          pixelsPerMeter * 5
        )}" fill="none" stroke="rgba(56,189,248,0.22)" stroke-width="1.1"/>
      </pattern>
    </defs>
    <rect width="${svgWidth}" height="${svgHeight}" fill="#0B1120"/>
    <rect width="${svgWidth}" height="${svgHeight}" fill="url(#gisMinorGrid)"/>
    <rect width="${svgWidth}" height="${svgHeight}" fill="url(#gisMajorGrid)"/>

    <!-- GIS Plot Boundary Polygon -->
    <polygon points="${polyStr}" fill="rgba(180,134,60,0.06)" stroke="#D4AF37" stroke-width="2.5"/>
    ${cornerLabelsSvg}

    <!-- Sharjah Municipality Setback Envelope -->
    <rect x="${envX.toFixed(1)}" y="${envY.toFixed(1)}" width="${envW.toFixed(1)}" height="${envH.toFixed(
      1
    )}" fill="rgba(56,189,248,0.08)" stroke="#38BDF8" stroke-width="1.8" stroke-dasharray="7 5"/>

    <!-- Structural Grid Lines inside Buildable Footprint -->
    <line x1="${(envX + envW * 0.5).toFixed(1)}" y1="${envY.toFixed(1)}" x2="${(
      envX +
      envW * 0.5
    ).toFixed(1)}" y2="${(envY + envH).toFixed(1)}" stroke="rgba(226,232,240,0.28)" stroke-dasharray="4 4"/>
    <line x1="${envX.toFixed(1)}" y1="${(envY + envH * 0.5).toFixed(1)}" x2="${(
      envX + envW
    ).toFixed(1)}" y2="${(envY + envH * 0.5).toFixed(1)}" stroke="rgba(226,232,240,0.28)" stroke-dasharray="4 4"/>

    <!-- Header & Setback Telemetry -->
    <text x="48" y="38" fill="#D4AF37" font-size="12" font-weight="700" font-family="monospace">GIS AUTO-SHEET · ${project.code} · ${safePlotTitle}</text>
    <text x="48" y="56" fill="#94A3B8" font-size="10.5" font-family="monospace">AREA: ${
      gis.plotAreaSqM
    } m² (${plotW.toFixed(1)}m × ${plotH.toFixed(1)}m) · SETBACKS F:${gis.setbacks.front}m R:${
      gis.setbacks.rear
    }m L:${gis.setbacks.sideLeft}m R:${gis.setbacks.sideRight}m</text>

    <text x="${(envX + envW / 2).toFixed(1)}" y="${(envY + envH / 2 - 6).toFixed(
      1
    )}" text-anchor="middle" fill="#F8FAFC" font-size="13" font-weight="700" font-family="monospace">ALLOWABLE BUILDABLE ENVELOPE</text>
    <text x="${(envX + envW / 2).toFixed(1)}" y="${(envY + envH / 2 + 14).toFixed(
      1
    )}" text-anchor="middle" fill="#38BDF8" font-size="11" font-family="monospace">${(
      envW / pixelsPerMeter
    ).toFixed(2)}m × ${(envH / pixelsPerMeter).toFixed(2)}m (CALIBRATED)</text>

    <!-- Calibrated Scale Reference Bar -->
    <line x1="48" y1="664" x2="${(48 + scaleBarPx).toFixed(1)}" y2="664" stroke="#38BDF8" stroke-width="3"/>
    <line x1="48" y1="658" x2="48" y2="670" stroke="#38BDF8" stroke-width="2"/>
    <line x1="${(48 + scaleBarPx).toFixed(1)}" y1="658" x2="${(48 + scaleBarPx).toFixed(
      1
    )}" y2="670" stroke="#38BDF8" stroke-width="2"/>
    <text x="48" y="652" fill="#38BDF8" font-size="10.5" font-family="monospace">${scaleBarMeters}.00 m (${scaleBarPx.toFixed(
      0
    )} px @ ${pixelsPerMeter} px/m)</text>
  </svg>`;

  return {
    id: `sheet-gis-${project.id}`,
    projectId: project.id,
    code: `GIS-${gis.plotNumber || '101'}`,
    title: `GIS Plot Site Plan (${plotW.toFixed(0)}m × ${plotH.toFixed(0)}m)`,
    titleAr: `مخطط الموقع العام المعاير GIS — قطعة ${gis.plotNumber}`,
    sheetType: 'blueprint_svg',
    pageNumber: 1,
    pixelsPerMeter,
    scaleLabel: `1:${Math.round((40 / Math.max(1, pixelsPerMeter)) * 100)} (GIS)`,
    calibrated: true,
    width: svgWidth,
    height: svgHeight,
    svgContent,
  };
}

/**
 * Generates parametric 5D BIM elements adapted to a project's GIS setback envelope & building type.
 */
export function generateProjectBimElements(project: Project): BimElement[] {
  if (project.id === 'proj-01' && project.code === 'BNY-2026-001') {
    return generateSharjahVillaBimElements();
  }

  const geom = computePlotGeometryCentered(project.gisData);
  const bW = Math.min(26, Math.max(8, geom.setbackBox.buildableWidthM * 0.72));
  const bD = Math.min(20, Math.max(6, geom.setbackBox.buildableDepthM * 0.72));
  const centerX = (geom.setbackBox.minX + geom.setbackBox.maxX) / 2;
  const centerZ = (geom.setbackBox.minZ + geom.setbackBox.maxZ) / 2;

  const isTower = project.projectType === 'commercial_tower';
  const isWarehouse = project.projectType === 'warehouse';
  const floors = isTower ? 4 : isWarehouse ? 1 : 2;
  const floorHeight = isWarehouse ? 6.0 : 3.4;

  const elements: BimElement[] = [];

  // 1. Substructure Pad / Foundation Raft
  const raftArea = Number((bW * bD).toFixed(2));
  const raftVol = Number((raftArea * 0.45).toFixed(2));
  elements.push({
    id: `bim-${project.id}-fnd`,
    guid: `FND_${project.code}`,
    name: `Reinforced Raft Foundation (${bW.toFixed(1)}x${bD.toFixed(1)}x0.45m)`,
    nameAr: `لبشة / قواعد خرسانية مسلحة (${bW.toFixed(1)}×${bD.toFixed(1)} م)`,
    discipline: 'structural',
    category: 'foundation',
    level: 'foundation',
    position: [centerX, 0.225, centerZ],
    dimensions: [bW + 0.6, 0.45, bD + 0.6],
    materialName: 'Sulfate Resistant Concrete C40 SRC',
    concreteGrade: 'C40 SRC',
    rebarSpec: 'T16 @ 150mm Top & Bot',
    grossAreaM2: raftArea,
    deductedOpeningAreaM2: 0,
    netAreaM2: raftArea,
    volumeM3: raftVol,
    boqCategory: 'concrete',
    unitRate: 395,
    estimatedCost: Number((raftVol * 395).toFixed(2)),
  });

  // 2. Structural Columns Grid (3x3)
  const colXs = [-bW * 0.42, 0, bW * 0.42];
  const colZs = [-bD * 0.42, 0, bD * 0.42];
  const levelKeys: Array<BimElement['level']> = ['ground', 'level1', 'level2', 'level3'];

  for (let f = 0; f < floors; f++) {
    const lvl = levelKeys[f] || 'level3';
    const baseY = 0.45 + f * floorHeight;

    colXs.forEach((dx, xi) => {
      colZs.forEach((dz, zi) => {
        const colVol = Number((0.45 * 0.45 * floorHeight).toFixed(2));
        elements.push({
          id: `bim-${project.id}-col-f${f}-${xi}-${zi}`,
          guid: `COL_${project.code}_F${f}_${xi}${zi}`,
          name: `RC Column C${xi + 1}${zi + 1} (${lvl})`,
          nameAr: `عمود خرساني C${xi + 1}${zi + 1} — ${lvl}`,
          discipline: 'structural',
          category: 'column',
          level: lvl,
          position: [centerX + dx, baseY + floorHeight / 2, centerZ + dz],
          dimensions: [0.45, floorHeight, 0.45],
          materialName: 'Ready-Mix Concrete C40',
          concreteGrade: 'C40',
          rebarSpec: '8T20 + T10 @ 150mm',
          grossAreaM2: Number((1.8 * floorHeight).toFixed(2)),
          deductedOpeningAreaM2: 0,
          netAreaM2: Number((1.8 * floorHeight).toFixed(2)),
          volumeM3: colVol,
          boqCategory: 'concrete',
          unitRate: 425,
          estimatedCost: Number((colVol * 425).toFixed(2)),
        });
      });
    });

    // Floor Slab
    const slabArea = Number((bW * bD).toFixed(2));
    const slabVol = Number((slabArea * 0.22).toFixed(2));
    elements.push({
      id: `bim-${project.id}-slab-${f}`,
      guid: `SLAB_${project.code}_L${f + 1}`,
      name: `Suspended RC Slab ${lvl} (220mm)`,
      nameAr: `بلاطة خرسانية مسلحة — ${lvl}`,
      discipline: 'structural',
      category: 'slab',
      level: lvl,
      position: [centerX, baseY + floorHeight, centerZ],
      dimensions: [bW, 0.22, bD],
      materialName: 'Concrete C40 + Microsilica',
      concreteGrade: 'C40',
      rebarSpec: 'T12 @ 150mm B/W',
      grossAreaM2: slabArea,
      deductedOpeningAreaM2: 0,
      netAreaM2: slabArea,
      volumeM3: slabVol,
      boqCategory: 'concrete',
      unitRate: 425,
      estimatedCost: Number((slabVol * 425).toFixed(2)),
    });

    // Perimeter Architectural Blockwork Walls (North/South + East/West)
    const wallSpecs: Array<{
      suffix: string;
      pos: [number, number, number];
      dim: [number, number, number];
      len: number;
    }> = [
      {
        suffix: 'N',
        pos: [centerX, baseY + floorHeight / 2, centerZ - bD / 2],
        dim: [bW, floorHeight - 0.22, 0.2],
        len: bW,
      },
      {
        suffix: 'S',
        pos: [centerX, baseY + floorHeight / 2, centerZ + bD / 2],
        dim: [bW, floorHeight - 0.22, 0.2],
        len: bW,
      },
      {
        suffix: 'W',
        pos: [centerX - bW / 2, baseY + floorHeight / 2, centerZ],
        dim: [0.2, floorHeight - 0.22, bD],
        len: bD,
      },
      {
        suffix: 'E',
        pos: [centerX + bW / 2, baseY + floorHeight / 2, centerZ],
        dim: [0.2, floorHeight - 0.22, bD],
        len: bD,
      },
    ];

    wallSpecs.forEach((ws) => {
      const grossWall = Number((ws.len * (floorHeight - 0.22)).toFixed(2));
      const voidArea = Number((grossWall * 0.16).toFixed(2));
      const netWall = Number((grossWall - voidArea).toFixed(2));
      elements.push({
        id: `bim-${project.id}-wall-${f}-${ws.suffix}`,
        guid: `WALL_${project.code}_F${f}_${ws.suffix}`,
        name: `External Thermal Block Wall ${ws.suffix} (${lvl})`,
        nameAr: `جدار طابوق حراري عازل ${ws.suffix} — ${lvl}`,
        discipline: 'architectural',
        category: 'wall',
        level: lvl,
        position: ws.pos,
        dimensions: ws.dim,
        materialName: 'Sharjah Green Spec Thermal Block 200mm',
        grossAreaM2: grossWall,
        deductedOpeningAreaM2: voidArea,
        netAreaM2: netWall,
        volumeM3: Number((netWall * 0.2).toFixed(2)),
        boqCategory: 'masonry',
        unitRate: 90,
        estimatedCost: Number((netWall * 90).toFixed(2)),
      });
    });

    // Glazed Facade Curtain / Window Ribbon on South Elevation
    elements.push({
      id: `bim-${project.id}-glass-${f}`,
      guid: `GLZ_${project.code}_F${f}`,
      name: `Double-Glazed Thermal Break Facade (${lvl})`,
      nameAr: `واجهة زجاجية عازلة للحرارة — ${lvl}`,
      discipline: 'architectural',
      category: 'glass',
      level: lvl,
      position: [centerX, baseY + floorHeight * 0.52, centerZ + bD / 2 + 0.12],
      dimensions: [bW * 0.45, floorHeight * 0.55, 0.08],
      materialName: 'Low-E 24mm Thermal Glazing',
      grossAreaM2: Number((bW * 0.45 * floorHeight * 0.55).toFixed(2)),
      deductedOpeningAreaM2: 0,
      netAreaM2: Number((bW * 0.45 * floorHeight * 0.55).toFixed(2)),
      volumeM3: 0.4,
      boqCategory: 'doors_windows',
      unitRate: 750,
      estimatedCost: Number((bW * 0.45 * floorHeight * 0.55 * 750).toFixed(2)),
    });
  }

  // 3. Roof HVAC / MEP Core
  const roofY = 0.45 + floors * floorHeight + 0.65;
  elements.push({
    id: `bim-${project.id}-mep-roof`,
    guid: `MEP_HVAC_${project.code}`,
    name: 'Central Chilled Water / VRF HVAC Package Unit',
    nameAr: 'وحدة التكييف المركزي والتهوية (السطح)',
    discipline: 'mep',
    category: 'mep_hvac',
    level: 'roof',
    position: [centerX, roofY, centerZ],
    dimensions: [Math.min(4.2, bW * 0.32), 1.1, Math.min(2.6, bD * 0.28)],
    materialName: 'Insulated GI Ducting + VRF Chiller',
    grossAreaM2: 10.9,
    deductedOpeningAreaM2: 0,
    netAreaM2: 10.9,
    volumeM3: 11.9,
    boqCategory: 'plumbing_hvac',
    unitRate: 95,
    estimatedCost: 18500,
  });

  return elements;
}

/**
 * Computes live HUD telemetry metrics (Concrete m³, Rebar kg/ton, Masonry m², Budget AED, Progress %).
 */
export function computeProjectTelemetry(project: Project): ProjectTelemetry {
  const meas = project.takeoffMeasurements || [];
  const bim = project.bimElements && project.bimElements.length > 0
    ? project.bimElements
    : generateProjectBimElements(project);

  const concreteFromTakeoff = meas
    .filter((m) => m.category === 'concrete')
    .reduce((sum, m) => sum + m.computedQuantity, 0);
  const concreteFromBim = bim
    .filter((b) => b.boqCategory === 'concrete')
    .reduce((sum, b) => sum + b.volumeM3, 0);

  const concreteM3 = Number(
    (concreteFromTakeoff > 0 ? concreteFromTakeoff : concreteFromBim).toFixed(1)
  );

  const steelFromTakeoff = meas
    .filter((m) => m.category === 'steel')
    .reduce(
      (sum, m) => sum + (m.unit === 'ton' ? m.computedQuantity * 1000 : m.computedQuantity),
      0
    );

  // Structural rebar ratio (~115 kg per m³ RC concrete) when rebar is not yet explicitly drawn
  const steelKg = Math.round(steelFromTakeoff > 0 ? steelFromTakeoff : concreteM3 * 115);
  const steelTon = Number((steelKg / 1000).toFixed(2));

  const masonryFromTakeoff = meas
    .filter((m) => m.category === 'masonry')
    .reduce((sum, m) => sum + m.computedQuantity, 0);
  const masonryFromBim = bim
    .filter((b) => b.boqCategory === 'masonry' || b.category === 'wall')
    .reduce((sum, b) => sum + b.netAreaM2, 0);

  const masonryM2 = Number(
    (masonryFromTakeoff > 0 ? masonryFromTakeoff : masonryFromBim).toFixed(1)
  );

  return {
    concreteM3,
    steelKg,
    steelTon,
    masonryM2,
    approvedBudgetAed: project.approvedBudget,
    actualProgress: project.actualProgress,
    plannedProgress: project.plannedProgress,
    source: meas.length > 0 ? 'takeoff' : 'bim',
  };
}
