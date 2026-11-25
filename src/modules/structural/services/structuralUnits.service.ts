import type { StructuralValueWithRaw } from '../types/structural.types.ts';

export type SupportedLengthUnit = 'm' | 'mm' | 'cm' | 'ft' | 'in';
export type SupportedForceUnit = 'kN' | 'N' | 'kgf' | 'tonf' | 'kip' | 'lb';

const LENGTH_TO_METERS: Record<SupportedLengthUnit, number> = {
  m: 1,
  mm: 0.001,
  cm: 0.01,
  ft: 0.3048,
  in: 0.0254,
};

const FORCE_TO_KN: Record<SupportedForceUnit, number> = {
  kN: 1,
  N: 0.001,
  kgf: 0.00980665,
  tonf: 9.80665,
  kip: 4.4482216152605,
  lb: 0.0044482216152605,
};

export function normalizeLengthUnitToken(unit: string): SupportedLengthUnit | null {
  const cleaned = String(unit || '').trim().toLowerCase();
  if (cleaned === 'm' || cleaned === 'meter' || cleaned === 'meters') return 'm';
  if (cleaned === 'mm' || cleaned === 'millimeter' || cleaned === 'millimeters') return 'mm';
  if (cleaned === 'cm' || cleaned === 'centimeter' || cleaned === 'centimeters') return 'cm';
  if (cleaned === 'ft' || cleaned === 'foot' || cleaned === 'feet') return 'ft';
  if (cleaned === 'in' || cleaned === 'inch' || cleaned === 'inches') return 'in';
  return null;
}

export function normalizeForceUnitToken(unit: string): SupportedForceUnit | null {
  const cleaned = String(unit || '').trim().toLowerCase();
  if (cleaned === 'kn' || cleaned === 'kilonewton') return 'kN';
  if (cleaned === 'n' || cleaned === 'newton') return 'N';
  if (cleaned === 'kgf') return 'kgf';
  if (cleaned === 'tonf' || cleaned === 'ton') return 'tonf';
  if (cleaned === 'kip' || cleaned === 'kips') return 'kip';
  if (cleaned === 'lb' || cleaned === 'lbf' || cleaned === 'lbs') return 'lb';
  return null;
}

export function convertLengthToMeters(rawValue: number, rawUnit: string): StructuralValueWithRaw {
  const safeRaw = Number.isFinite(rawValue) ? rawValue : 0;
  const parsed = normalizeLengthUnitToken(rawUnit);
  if (!parsed) {
    throw new Error(`Unsupported ETABS length unit '${rawUnit}'.`);
  }
  const factor = LENGTH_TO_METERS[parsed];
  return {
    rawValue: safeRaw,
    rawUnit: parsed,
    normalizedValue: Number((safeRaw * factor).toFixed(6)),
    normalizedUnit: 'm',
    conversionFactor: factor,
  };
}

export function convertStressToMPa(
  rawValue: number,
  forceUnitRaw: string,
  lengthUnitRaw: string
): StructuralValueWithRaw {
  const safeRaw = Number.isFinite(rawValue) ? rawValue : 0;
  const fUnit = normalizeForceUnitToken(forceUnitRaw);
  const lUnit = normalizeLengthUnitToken(lengthUnitRaw);
  if (!fUnit || !lUnit) {
    throw new Error(`Unsupported ETABS stress units '${forceUnitRaw}/${lengthUnitRaw}^2'.`);
  }

  // 1 kN / m^2 = 0.001 MPa
  const forceToKn = FORCE_TO_KN[fUnit];
  const lengthToM = LENGTH_TO_METERS[lUnit];
  const factorToMPa = (forceToKn / (lengthToM * lengthToM)) * 0.001;

  return {
    rawValue: safeRaw,
    rawUnit: `${fUnit}/${lUnit}^2`,
    normalizedValue: Number((safeRaw * factorToMPa).toFixed(6)),
    normalizedUnit: 'MPa',
    conversionFactor: factorToMPa,
  };
}

export function convertUnitWeightToKNPerM3(
  rawValue: number,
  forceUnitRaw: string,
  lengthUnitRaw: string
): StructuralValueWithRaw {
  const safeRaw = Number.isFinite(rawValue) ? rawValue : 0;
  const fUnit = normalizeForceUnitToken(forceUnitRaw);
  const lUnit = normalizeLengthUnitToken(lengthUnitRaw);
  if (!fUnit || !lUnit) {
    throw new Error(`Unsupported ETABS unit-weight units '${forceUnitRaw}/${lengthUnitRaw}^3'.`);
  }

  const forceToKn = FORCE_TO_KN[fUnit];
  const lengthToM = LENGTH_TO_METERS[lUnit];
  const factor = forceToKn / (lengthToM * lengthToM * lengthToM);

  return {
    rawValue: safeRaw,
    rawUnit: `${fUnit}/${lUnit}^3`,
    normalizedValue: Number((safeRaw * factor).toFixed(6)),
    normalizedUnit: 'kN/m3',
    conversionFactor: factor,
  };
}
