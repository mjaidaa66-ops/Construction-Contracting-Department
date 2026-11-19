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
  steelEstimated?: boolean;
  concreteEstimated?: boolean;
}

export interface Utm40NCoordinates {
  eastingM: number;
  northingM: number;
  zone: 40;
  hemisphere: 'N';
  epsg: 'EPSG:32640';
  convergenceDeg: number;
}

export type GisCoordinateStatus = 'verified' | 'outside_uae' | 'missing';
export type GisBoundarySource = 'surveyed_polygon' | 'estimated_from_area' | 'missing';

export interface GisEdgeSurvey {
  index: number;
  fromLabel: string;
  toLabel: string;
  lengthM: number;
  azimuthDeg: number;
  bearingCardinal: string;
}

export interface GisSurveyAnalysis {
  coordinateStatus: GisCoordinateStatus;
  latitude: number | null;
  longitude: number | null;
  utm40N: Utm40NCoordinates | null;
  boundarySource: GisBoundarySource;
  surveyedAreaM2: number;
  declaredAreaM2: number;
  perimeterM: number;
  edges: GisEdgeSurvey[];
  setbackPolygon: Array<{ x: number; y: number }>;
  buildableAreaM2: number;
  coveragePct: number;
  reliability: 'verified_survey' | 'partial_estimate' | 'unverified';
}

// ============================================================================
// WGS84 <-> UAE UTM Zone 40N (EPSG:32640, Central Meridian 57°E)
// ============================================================================

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const WGS84_EP2 = WGS84_E2 / (1 - WGS84_E2);
const UTM_K0 = 0.9996;
const UTM_40_CM_RAD = (57 * Math.PI) / 180;
const UTM_FALSE_EASTING = 500000.0;

export function wgs84ToUtm40N(latitudeDeg: number, longitudeDeg: number): Utm40NCoordinates | null {
  if (!Number.isFinite(latitudeDeg) || !Number.isFinite(longitudeDeg)) return null;
  if (latitudeDeg === 0 && longitudeDeg === 0) return null;
  if (Math.abs(latitudeDeg) > 84 || Math.abs(longitudeDeg) > 180) return null;

  const lat = (latitudeDeg * Math.PI) / 180;
  const lon = (longitudeDeg * Math.PI) / 180;

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tanLat = Math.tan(lat);

  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const T = tanLat * tanLat;
  const C = WGS84_EP2 * cosLat * cosLat;
  const A = cosLat * (lon - UTM_40_CM_RAD);

  const e2 = WGS84_E2;
  const e4 = e2 * e2;
  const e6 = e4 * e2;

  const M =
    WGS84_A *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * lat -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * lat) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * lat) -
      ((35 * e6) / 3072) * Math.sin(6 * lat));

  const eastingM =
    UTM_FALSE_EASTING +
    UTM_K0 *
      N *
      (A +
        ((1 - T + C) * Math.pow(A, 3)) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * WGS84_EP2) * Math.pow(A, 5)) / 120);

  const falseNorthing = latitudeDeg < 0 ? 10000000.0 : 0.0;
  const northingM =
    falseNorthing +
    UTM_K0 *
      (M +
        N *
          tanLat *
          ((A * A) / 2 +
            ((5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4)) / 24 +
            ((61 - 58 * T + T * T + 600 * C - 330 * WGS84_EP2) * Math.pow(A, 6)) / 720));

  const convergenceRad = Math.atan(Math.tan(lon - UTM_40_CM_RAD) * sinLat);

  return {
    eastingM: Number(eastingM.toFixed(3)),
    northingM: Number(northingM.toFixed(3)),
    zone: 40,
    hemisphere: 'N',
    epsg: 'EPSG:32640',
    convergenceDeg: Number(((convergenceRad * 180) / Math.PI).toFixed(4)),
  };
}

export function utm40NToWgs84(
  eastingM: number,
  northingM: number,
  northernHemisphere = true
): { latitude: number; longitude: number } | null {
  if (!Number.isFinite(eastingM) || !Number.isFinite(northingM)) return null;

  const x = eastingM - UTM_FALSE_EASTING;
  const y = northernHemisphere ? northingM : northingM - 10000000.0;

  const e2 = WGS84_E2;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const M = y / UTM_K0;
  const mu = M / (WGS84_A * (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));

  const phi1Rad =
    mu +
    ((3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32) * Math.sin(4 * mu) +
    ((151 * Math.pow(e1, 3)) / 96) * Math.sin(6 * mu) +
    ((1097 * Math.pow(e1, 4)) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1Rad);
  const cosPhi1 = Math.cos(phi1Rad);
  const tanPhi1 = Math.tan(phi1Rad);

  const N1 = WGS84_A / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = WGS84_EP2 * cosPhi1 * cosPhi1;
  const R1 = (WGS84_A * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * UTM_K0);

  const latRad =
    phi1Rad -
    ((N1 * tanPhi1) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * WGS84_EP2) * Math.pow(D, 4)) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * WGS84_EP2 - 3 * C1 * C1) *
          Math.pow(D, 6)) /
          720);

  const lonRad =
    UTM_40_CM_RAD +
    (D -
      ((1 + 2 * T1 + C1) * Math.pow(D, 3)) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * WGS84_EP2 + 24 * T1 * T1) * Math.pow(D, 5)) /
        120) /
      cosPhi1;

  return {
    latitude: Number(((latRad * 180) / Math.PI).toFixed(7)),
    longitude: Number(((lonRad * 180) / Math.PI).toFixed(7)),
  };
}

export function evaluateGisCoordinates(gis: GisPlotData): {
  status: GisCoordinateStatus;
  latitude: number | null;
  longitude: number | null;
  utm40N: Utm40NCoordinates | null;
} {
  const lat = gis.latitude;
  const lng = gis.longitude;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    (lat === 0 && lng === 0)
  ) {
    return { status: 'missing', latitude: null, longitude: null, utm40N: null };
  }

  const utm40N = wgs84ToUtm40N(lat, lng);
  const inUae = lat >= 22.4 && lat <= 26.6 && lng >= 51.4 && lng <= 56.6;
  return {
    status: inUae ? 'verified' : 'outside_uae',
    latitude: lat,
    longitude: lng,
    utm40N,
  };
}

// ============================================================================
// Surveyed Polygon Geometry & True Inward Edge-Offset Setbacks
// ============================================================================

export function computeSignedPolygonArea(points: Array<{ x: number; y: number }>): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return 0.5 * sum;
}

export function computePolygonAreaM2(points: Array<{ x: number; y: number }>): number {
  return Math.abs(computeSignedPolygonArea(points));
}

function azimuthToCardinal(azDeg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((azDeg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

export function computePolygonEdgeSurveys(points: GisBoundaryPoint[]): GisEdgeSurvey[] {
  if (points.length < 2) return [];
  const edges: GisEdgeSurvey[] = [];
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthM = Number(Math.hypot(dx, dy).toFixed(2));
    // Screen/survey coordinates where +x = East, -y = North (so North azimuth = atan2(dx, -dy))
    const rawAz = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const azimuthDeg = Number((((rawAz % 360) + 360) % 360).toFixed(1));
    edges.push({
      index: i + 1,
      fromLabel: p1.label || `P${i + 1}`,
      toLabel: p2.label || `P${((i + 1) % points.length) + 1}`,
      lengthM,
      azimuthDeg,
      bearingCardinal: azimuthToCardinal(azimuthDeg),
    });
  }
  return edges;
}

/**
 * Computes true polygonal inward-offset setbacks for arbitrary convex or skewed plots.
 * Supports distinct front/rear/left/right setback distances classified by each edge's outward normal.
 */
export function computeInsetPolygonSetback(
  points: Array<{ x: number; y: number }>,
  setbacks: GisPlotData['setbacks'],
  frontSide: 'north' | 'south' = 'south'
): Array<{ x: number; y: number }> {
  if (points.length < 3) return [];
  const signedArea = computeSignedPolygonArea(points);
  if (Math.abs(signedArea) < 1e-4) return [];

  // If signedArea > 0 in Cartesian coordinates: (+x right, +y down) means clockwise visually,
  // but algebraically tangent=(dx, dy) has inward normal = (-dy, dx) / len when signedArea > 0.
  const sign = signedArea >= 0 ? 1 : -1;

  const sFront = Math.max(0, setbacks?.front ?? 3);
  const sRear = Math.max(0, setbacks?.rear ?? 3);
  const sLeft = Math.max(0, setbacks?.sideLeft ?? 2);
  const sRight = Math.max(0, setbacks?.sideRight ?? 2);

  interface OffsetLine {
    px: number;
    py: number;
    tx: number;
    ty: number;
  }

  const lines: OffsetLine[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;

    const tx = dx / len;
    const ty = dy / len;
    const inX = -sign * ty;
    const inY = sign * tx;
    const outX = -inX;
    const outY = -inY;

    let dist = sLeft;
    if (Math.abs(outX) >= Math.abs(outY)) {
      dist = outX >= 0 ? sRight : sLeft;
    } else if (frontSide === 'north') {
      dist = outY < 0 ? sFront : sRear;
    } else {
      dist = outY > 0 ? sFront : sRear;
    }

    lines.push({
      px: a.x + inX * dist,
      py: a.y + inY * dist,
      tx,
      ty,
    });
  }

  if (lines.length < 3) return [];

  const inset: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const l1 = lines[(i - 1 + lines.length) % lines.length];
    const l2 = lines[i];
    const det = l1.tx * l2.ty - l1.ty * l2.tx;
    if (Math.abs(det) < 1e-5) {
      inset.push({
        x: Number(l2.px.toFixed(3)),
        y: Number(l2.py.toFixed(3)),
      });
    } else {
      const rx = l2.px - l1.px;
      const ry = l2.py - l1.py;
      const t = (rx * l2.ty - ry * l2.tx) / det;
      inset.push({
        x: Number((l1.px + t * l1.tx).toFixed(3)),
        y: Number((l1.py + t * l1.ty).toFixed(3)),
      });
    }
  }

  // Ensure inset polygon orientation hasn't inverted (over-setback collapse)
  const insetSignedArea = computeSignedPolygonArea(inset);
  if (insetSignedArea * signedArea <= 0) {
    return [];
  }

  return inset;
}

export function evaluateBoundarySource(gis: GisPlotData): GisBoundarySource {
  if (Array.isArray(gis.boundaryPoints) && gis.boundaryPoints.length >= 3) {
    return 'surveyed_polygon';
  }
  if (typeof gis.plotAreaSqM === 'number' && Number.isFinite(gis.plotAreaSqM) && gis.plotAreaSqM > 20) {
    return 'estimated_from_area';
  }
  return 'missing';
}

/**
 * Ensures any GIS plot has >= 3 valid boundary coordinates in meters when surveyed or area-backed.
 * Falls back to a rectangular plot sized directly from plotAreaSqM when boundaryPoints omitted.
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

export function analyzeGisPlot(
  gis: GisPlotData,
  frontSide: 'north' | 'south' = 'south'
): GisSurveyAnalysis {
  const coord = evaluateGisCoordinates(gis);
  const boundarySource = evaluateBoundarySource(gis);
  const pts = normalizeBoundaryPoints(gis);
  const surveyedAreaM2 = Number(computePolygonAreaM2(pts).toFixed(2));
  const edges = computePolygonEdgeSurveys(pts);
  const perimeterM = Number(edges.reduce((acc, e) => acc + e.lengthM, 0).toFixed(2));

  const setbackPolygon = computeInsetPolygonSetback(pts, gis.setbacks, frontSide);
  const buildableAreaM2 = Number(computePolygonAreaM2(setbackPolygon).toFixed(2));
  const declaredAreaM2 = Number((gis.plotAreaSqM || surveyedAreaM2 || 0).toFixed(2));
  const denom = surveyedAreaM2 > 0 ? surveyedAreaM2 : declaredAreaM2 > 0 ? declaredAreaM2 : 1;
  const coveragePct = Number(Math.min(100, (buildableAreaM2 / denom) * 100).toFixed(1));

  let reliability: GisSurveyAnalysis['reliability'] = 'unverified';
  if (coord.status === 'verified' && boundarySource === 'surveyed_polygon') {
    reliability = 'verified_survey';
  } else if (coord.status !== 'missing' || boundarySource !== 'missing') {
    reliability = 'partial_estimate';
  }

  return {
    coordinateStatus: coord.status,
    latitude: coord.latitude,
    longitude: coord.longitude,
    utm40N: coord.utm40N,
    boundarySource,
    surveyedAreaM2,
    declaredAreaM2,
    perimeterM,
    edges,
    setbackPolygon,
    buildableAreaM2,
    coveragePct,
    reliability,
  };
}

export interface NormalizedPlotGeometry {
  rawPoints: GisBoundaryPoint[];
  centeredPoints: Array<{ x: number; z: number; label: string }>;
  setbackCenteredPoints: Array<{ x: number; z: number }>;
  buildableAreaM2: number;
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
 * Computes origin-centered 3D plot polygon & true polygonal inward-offset setback envelope.
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

  const insetPoly = computeInsetPolygonSetback(rawPoints, gis.setbacks, 'south');
  const setbackCenteredPoints = insetPoly.map((p) => ({
    x: Number((p.x - cx).toFixed(3)),
    z: Number((p.y - cy).toFixed(3)),
  }));

  const buildableAreaM2 = Number(computePolygonAreaM2(insetPoly).toFixed(2));

  let sbMinX: number;
  let sbMaxX: number;
  let sbMinZ: number;
  let sbMaxZ: number;

  if (setbackCenteredPoints.length >= 3) {
    sbMinX = Math.min(...setbackCenteredPoints.map((p) => p.x));
    sbMaxX = Math.max(...setbackCenteredPoints.map((p) => p.x));
    sbMinZ = Math.min(...setbackCenteredPoints.map((p) => p.z));
    sbMaxZ = Math.max(...setbackCenteredPoints.map((p) => p.z));
  } else {
    const halfW = widthM / 2;
    const halfD = depthM / 2;
    const sLeft = Math.min(halfW - 2, Math.max(0, gis.setbacks?.sideLeft ?? 2));
    const sRight = Math.min(halfW - 2, Math.max(0, gis.setbacks?.sideRight ?? 2));
    const sRear = Math.min(halfD - 2, Math.max(0, gis.setbacks?.rear ?? 3));
    const sFront = Math.min(halfD - 2, Math.max(0, gis.setbacks?.front ?? 3));
    sbMinX = -halfW + sLeft;
    sbMaxX = halfW - sRight;
    sbMinZ = -halfD + sRear;
    sbMaxZ = halfD - sFront;
  }

  return {
    rawPoints,
    centeredPoints,
    setbackCenteredPoints,
    buildableAreaM2,
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

  const toPx = (pt: { x: number; y: number; label?: string }) => ({
    px: Number((originX + (pt.x - minX) * pixelsPerMeter).toFixed(1)),
    py: Number((originY + (pt.y - minY) * pixelsPerMeter).toFixed(1)),
    label: pt.label || '',
  });

  const mappedPts = points.map(toPx);
  const polyStr = mappedPts.map((p) => `${p.px},${p.py}`).join(' ');

  const insetPoly = computeInsetPolygonSetback(points, gis.setbacks, 'south');
  const mappedInsetPts = insetPoly.map((p) => toPx(p));
  const insetPolyStr = mappedInsetPts.map((p) => `${p.px},${p.py}`).join(' ');
  const buildableAreaM2 = computePolygonAreaM2(insetPoly);

  const envMinX = mappedInsetPts.length >= 3 ? Math.min(...mappedInsetPts.map((p) => p.px)) : originX + 30;
  const envMaxX = mappedInsetPts.length >= 3 ? Math.max(...mappedInsetPts.map((p) => p.px)) : originX + drawW - 30;
  const envMinY = mappedInsetPts.length >= 3 ? Math.min(...mappedInsetPts.map((p) => p.py)) : originY + 30;
  const envMaxY = mappedInsetPts.length >= 3 ? Math.max(...mappedInsetPts.map((p) => p.py)) : originY + drawH - 30;
  const envCenterX = (envMinX + envMaxX) / 2;
  const envCenterY = (envMinY + envMaxY) / 2;

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

    <!-- Sharjah Municipality True Polygonal Setback Envelope -->
    ${
      mappedInsetPts.length >= 3
        ? `<polygon points="${insetPolyStr}" fill="rgba(56,189,248,0.08)" stroke="#38BDF8" stroke-width="1.8" stroke-dasharray="7 5"/>`
        : ''
    }

    <!-- Structural Grid Lines inside Buildable Footprint -->
    <line x1="${envCenterX.toFixed(1)}" y1="${envMinY.toFixed(1)}" x2="${envCenterX.toFixed(
      1
    )}" y2="${envMaxY.toFixed(1)}" stroke="rgba(226,232,240,0.28)" stroke-dasharray="4 4"/>
    <line x1="${envMinX.toFixed(1)}" y1="${envCenterY.toFixed(1)}" x2="${envMaxX.toFixed(
      1
    )}" y2="${envCenterY.toFixed(1)}" stroke="rgba(226,232,240,0.28)" stroke-dasharray="4 4"/>

    <!-- Header & Setback Telemetry -->
    <text x="48" y="38" fill="#D4AF37" font-size="12" font-weight="700" font-family="monospace">GIS AUTO-SHEET · ${project.code} · ${safePlotTitle}</text>
    <text x="48" y="56" fill="#94A3B8" font-size="10.5" font-family="monospace">AREA: ${
      gis.plotAreaSqM
    } m² (${plotW.toFixed(1)}m × ${plotH.toFixed(1)}m) · SETBACKS F:${gis.setbacks.front}m R:${
      gis.setbacks.rear
    }m L:${gis.setbacks.sideLeft}m R:${gis.setbacks.sideRight}m</text>

    <text x="${envCenterX.toFixed(1)}" y="${(envCenterY - 6).toFixed(
      1
    )}" text-anchor="middle" fill="#F8FAFC" font-size="13" font-weight="700" font-family="monospace">ALLOWABLE BUILDABLE ENVELOPE</text>
    <text x="${envCenterX.toFixed(1)}" y="${(envCenterY + 14).toFixed(
      1
    )}" text-anchor="middle" fill="#38BDF8" font-size="11" font-family="monospace">${buildableAreaM2.toFixed(
      1
    )} m² BUILDABLE (CALIBRATED)</text>

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
  const bim = project.bimElements !== undefined
    ? project.bimElements
    : generateProjectBimElements(project);

  const concreteFromTakeoff = meas
    .filter((m) => m.category === 'concrete')
    .reduce((sum, m) => sum + m.computedQuantity, 0);
  const concreteFromBim = bim
    .filter((b) => b.boqCategory === 'concrete')
    .reduce((sum, b) => sum + b.volumeM3, 0);

  const concreteEstimated = concreteFromTakeoff <= 0;
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
  const steelEstimated = steelFromTakeoff <= 0;
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
    steelEstimated,
    concreteEstimated,
  };
}
