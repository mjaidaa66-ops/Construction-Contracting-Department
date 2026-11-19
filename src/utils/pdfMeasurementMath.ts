import type { PdfBoxOrigin, PdfPoint } from '../types/bunyan';

/**
 * 72 DPI PDF user-space points per real-world meter at 1:100 architectural scale:
 * 72 pt/in / 0.0254 m/in / 100 = 28.34645669 pt/m
 */
export const DEFAULT_POINTS_PER_METER = 28.3465;

export interface PdfScalePreset {
  label: string;
  ratio: number;
  pointsPerMeter: number;
}

export const PDF_SCALE_PRESETS: PdfScalePreset[] = [
  { label: '1:20', ratio: 20, pointsPerMeter: 141.7323 },
  { label: '1:50', ratio: 50, pointsPerMeter: 56.6929 },
  { label: '1:100', ratio: 100, pointsPerMeter: 28.3465 },
  { label: '1:200', ratio: 200, pointsPerMeter: 14.1732 },
  { label: '1:500', ratio: 500, pointsPerMeter: 5.6693 },
];

/**
 * Converts a native unrotated PDF point (origin bottom-left, Y up, relative to MediaBox/CropBox)
 * into a rotated page-space point (origin top-left, Y down) matching standard canvas coordinates.
 */
export function nativePdfPointToRotated(point: PdfPoint, box: PdfBoxOrigin): PdfPoint {
  const unit = box.userUnit || 1;
  const relX = (point.x - box.x) * unit;
  const relY = (point.y - box.y) * unit;
  const w = box.width * unit;
  const h = box.height * unit;
  const rot = ((box.rotation || 0) % 360 + 360) % 360;

  switch (rot) {
    case 90:
      return { x: relY, y: relX };
    case 180:
      return { x: w - relX, y: relY };
    case 270:
      return { x: h - relY, y: w - relX };
    case 0:
    default:
      return { x: relX, y: h - relY };
  }
}

/**
 * Inverse transform: converts rotated top-left page-space coordinates back to
 * immutable native 72-DPI PDF points (Y up).
 */
export function rotatedPointToNativePdf(point: PdfPoint, box: PdfBoxOrigin): PdfPoint {
  const unit = box.userUnit || 1;
  const w = box.width * unit;
  const h = box.height * unit;
  const rot = ((box.rotation || 0) % 360 + 360) % 360;

  let relX = point.x;
  let relY = h - point.y;

  switch (rot) {
    case 90:
      relX = point.y;
      relY = point.x;
      break;
    case 180:
      relX = w - point.x;
      relY = point.y;
      break;
    case 270:
      relX = w - point.y;
      relY = h - point.x;
      break;
    case 0:
    default:
      relX = point.x;
      relY = h - point.y;
      break;
  }

  return {
    x: box.x + relX / unit,
    y: box.y + relY / unit,
  };
}

/**
 * Projects an immutable 72-DPI PDF point to rendered canvas viewport pixels,
 * supporting MediaBox/CropBox origin, userUnit, zoom scale, and dynamic viewport rotation.
 */
export function pdfPointToViewportWithMediaBox(
  point: PdfPoint,
  box: PdfBoxOrigin,
  zoomScale: number,
  viewportRotation: 0 | 90 | 180 | 270 = 0
): PdfPoint {
  const rotatedBox: PdfBoxOrigin = {
    ...box,
    rotation: (((box.rotation || 0) + viewportRotation) % 360) as 0 | 90 | 180 | 270,
  };
  const pagePt = nativePdfPointToRotated(point, rotatedBox);
  return {
    x: pagePt.x * zoomScale,
    y: pagePt.y * zoomScale,
  };
}

/**
 * Inverse projects a rendered canvas viewport pixel back to an immutable 72-DPI PDF point.
 */
export function viewportPointToPdfWithMediaBox(
  viewportPoint: PdfPoint,
  box: PdfBoxOrigin,
  zoomScale: number,
  viewportRotation: 0 | 90 | 180 | 270 = 0
): PdfPoint {
  const safeZoom = zoomScale || 1;
  const rotatedBox: PdfBoxOrigin = {
    ...box,
    rotation: (((box.rotation || 0) + viewportRotation) % 360) as 0 | 90 | 180 | 270,
  };
  return rotatedPointToNativePdf(
    {
      x: viewportPoint.x / safeZoom,
      y: viewportPoint.y / safeZoom,
    },
    rotatedBox
  );
}

export function distanceInPdfPoints(p1: PdfPoint, p2: PdfPoint): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

export function calibratePointsPerMeter(
  p1: PdfPoint,
  p2: PdfPoint,
  knownMeters: number
): number {
  const dist = distanceInPdfPoints(p1, p2);
  if (!Number.isFinite(knownMeters) || knownMeters <= 0 || dist <= 0) {
    return DEFAULT_POINTS_PER_METER;
  }
  return dist / knownMeters;
}
