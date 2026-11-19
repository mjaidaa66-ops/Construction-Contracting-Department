import type {
  PdfPoint,
  TakeoffCategory,
  TakeoffCategoryBreakdown,
  TakeoffMeasurement,
  TakeoffProjectSummary,
  TakeoffTool,
} from '../types/bunyan';
import { CATEGORY_LABELS } from './i18n';

/**
 * Gauss's Shoelace Formula for polygon area in square meters.
 * Area = 0.5 * |sum(x_i * y_{i+1} - x_{i+1} * y_i)| / ppm^2
 */
export function computeShoelaceAreaM2(points: PdfPoint[], pointsPerMeter: number): number {
  if (points.length < 3 || pointsPerMeter <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  const areaInUnitsSq = 0.5 * Math.abs(sum);
  return areaInUnitsSq / (pointsPerMeter * pointsPerMeter);
}

/**
 * Euclidean sum along polyline vertices in meters.
 */
export function computePolylineLengthM(
  points: PdfPoint[],
  pointsPerMeter: number,
  closed = false
): number {
  if (points.length < 2 || pointsPerMeter <= 0) return 0;
  let totalDist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalDist += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  if (closed && points.length >= 3) {
    const first = points[0];
    const last = points[points.length - 1];
    totalDist += Math.hypot(first.x - last.x, first.y - last.y);
  }
  return totalDist / pointsPerMeter;
}

export function computeRectanglePoints(p1: PdfPoint, p2: PdfPoint): PdfPoint[] {
  return [
    { x: p1.x, y: p1.y },
    { x: p2.x, y: p1.y },
    { x: p2.x, y: p2.y },
    { x: p1.x, y: p2.y },
  ];
}

export function calculateTakeoffMeasurementValues(params: {
  tool: TakeoffTool;
  category: TakeoffCategory;
  points: PdfPoint[];
  pointsPerMeter: number;
  heightOrDepth?: number;
  multiplier?: number;
  unitRateAed: number;
}): {
  rawValue: number;
  computedQuantity: number;
  unit: 'm' | 'm2' | 'm3' | 'ton' | 'unit';
  totalCostAed: number;
} {
  const { tool, category, points, pointsPerMeter, heightOrDepth = 0, multiplier = 1, unitRateAed } = params;
  const mult = multiplier > 0 ? multiplier : 1;

  if (tool === 'count') {
    const qty = points.length * mult;
    return {
      rawValue: points.length,
      computedQuantity: Number(qty.toFixed(2)),
      unit: 'unit',
      totalCostAed: Number((qty * unitRateAed).toFixed(2)),
    };
  }

  if (tool === 'linear' || tool === 'polyline' || tool === 'perimeter') {
    const closed = tool === 'perimeter';
    const lengthM = computePolylineLengthM(points, pointsPerMeter, closed);
    const useWallArea = heightOrDepth > 0 && ['masonry', 'plastering', 'painting', 'waterproofing'].includes(category);
    if (useWallArea) {
      const areaM2 = lengthM * heightOrDepth * mult;
      return {
        rawValue: Number(lengthM.toFixed(3)),
        computedQuantity: Number(areaM2.toFixed(2)),
        unit: 'm2',
        totalCostAed: Number((areaM2 * unitRateAed).toFixed(2)),
      };
    }
    const qty = lengthM * mult;
    return {
      rawValue: Number(lengthM.toFixed(3)),
      computedQuantity: Number(qty.toFixed(2)),
      unit: 'm',
      totalCostAed: Number((qty * unitRateAed).toFixed(2)),
    };
  }

  // Polygon / Rectangle / Area / Volume / Deduction
  const polyPoints = points.length === 2 && tool === 'rectangle'
    ? computeRectanglePoints(points[0], points[1])
    : points;
  const areaM2 = computeShoelaceAreaM2(polyPoints, pointsPerMeter);

  if (tool === 'deduction') {
    const negQty = -Math.abs(areaM2 * mult);
    return {
      rawValue: Number(areaM2.toFixed(3)),
      computedQuantity: Number(negQty.toFixed(2)),
      unit: 'm2',
      totalCostAed: Number((negQty * unitRateAed).toFixed(2)),
    };
  }

  if (tool === 'volume' || category === 'excavation' || category === 'concrete') {
    const depth = heightOrDepth > 0 ? heightOrDepth : 0.25;
    const volM3 = areaM2 * depth * mult;
    return {
      rawValue: Number(areaM2.toFixed(3)),
      computedQuantity: Number(volM3.toFixed(2)),
      unit: 'm3',
      totalCostAed: Number((volM3 * unitRateAed).toFixed(2)),
    };
  }

  const qty = areaM2 * mult;
  return {
    rawValue: Number(areaM2.toFixed(3)),
    computedQuantity: Number(qty.toFixed(2)),
    unit: 'm2',
    totalCostAed: Number((qty * unitRateAed).toFixed(2)),
  };
}

export function computeTakeoffSummary(
  projectId: string,
  measurements: TakeoffMeasurement[],
  overheadPercent = 10,
  profitPercent = 12,
  vatPercent = 5
): TakeoffProjectSummary {
  const byCategory = new Map<TakeoffCategory, TakeoffCategoryBreakdown>();

  for (const m of measurements) {
    const existing = byCategory.get(m.category);
    if (existing) {
      existing.quantity = Number((existing.quantity + m.computedQuantity).toFixed(2));
      existing.costAed = Number((existing.costAed + m.totalCostAed).toFixed(2));
      existing.itemCount += 1;
    } else {
      byCategory.set(m.category, {
        category: m.category,
        quantity: Number(m.computedQuantity.toFixed(2)),
        unit: m.unit || CATEGORY_LABELS[m.category].defaultUnit,
        costAed: Number(m.totalCostAed.toFixed(2)),
        itemCount: 1,
      });
    }
  }

  const directCostAed = Number(
    measurements.reduce((acc, m) => acc + m.totalCostAed, 0).toFixed(2)
  );
  const overheadAed = Number((directCostAed * (overheadPercent / 100)).toFixed(2));
  const profitAed = Number((directCostAed * (profitPercent / 100)).toFixed(2));
  const subtotalBeforeVatAed = Number((directCostAed + overheadAed + profitAed).toFixed(2));
  const vatAed = Number((subtotalBeforeVatAed * (vatPercent / 100)).toFixed(2));
  const grandTotalAed = Number((subtotalBeforeVatAed + vatAed).toFixed(2));

  return {
    projectId,
    directCostAed,
    overheadPercent,
    overheadAed,
    profitPercent,
    profitAed,
    subtotalBeforeVatAed,
    vatPercent,
    vatAed,
    grandTotalAed,
    categoryBreakdown: Array.from(byCategory.values()),
  };
}
