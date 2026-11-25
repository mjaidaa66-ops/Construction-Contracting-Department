import type { EtabsRawExtractPayload } from '../types/etabs.types';
import {
  getStructuralRolePermissions,
  type StructuralRole,
} from '../types/structural.types';

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export function isValidStructuralId(value: unknown): value is string {
  return typeof value === 'string' && VALID_ID_REGEX.test(value);
}

export function sanitizeStructuralId(raw: string): string {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
  return cleaned || `st_${Date.now()}`;
}

export function validateRawExtractPayload(body: unknown): {
  valid: boolean;
  error?: string;
  payload?: EtabsRawExtractPayload;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Payload must be a JSON object.' };
  }
  const obj = body as Partial<EtabsRawExtractPayload>;
  if (!obj.modelName || typeof obj.modelName !== 'string') {
    return { valid: false, error: 'Missing required string field: modelName.' };
  }
  if (!obj.forceUnit || typeof obj.forceUnit !== 'string') {
    return { valid: false, error: 'Missing required string field: forceUnit.' };
  }
  if (!obj.lengthUnit || typeof obj.lengthUnit !== 'string') {
    return { valid: false, error: 'Missing required string field: lengthUnit.' };
  }
  if (!Array.isArray(obj.stories)) {
    return { valid: false, error: 'Missing required array field: stories.' };
  }

  return {
    valid: true,
    payload: {
      sourceApplication:
        obj.sourceApplication === 'CSI ETABS' ? 'CSI ETABS' : 'ETABS Exported Tables',
      sourceVersion: String(obj.sourceVersion || '20.0.0'),
      modelFilePath: String(obj.modelFilePath || obj.modelName),
      modelName: obj.modelName,
      forceUnit: obj.forceUnit,
      lengthUnit: obj.lengthUnit,
      coordinateSystem: String(obj.coordinateSystem || 'Global'),
      modelLocked: Boolean(obj.modelLocked),
      readOnlyVerified: obj.readOnlyVerified !== false,
      extractedAtUtc: obj.extractedAtUtc || new Date().toISOString(),
      stories: obj.stories,
      grids: Array.isArray(obj.grids) ? obj.grids : [],
      points: Array.isArray(obj.points) ? obj.points : [],
      frames: Array.isArray(obj.frames) ? obj.frames : [],
      areas: Array.isArray(obj.areas) ? obj.areas : [],
      materials: Array.isArray(obj.materials) ? obj.materials : [],
      sections: Array.isArray(obj.sections) ? obj.sections : [],
      loadPatterns: Array.isArray(obj.loadPatterns) ? obj.loadPatterns : [],
      loadCases: Array.isArray(obj.loadCases) ? obj.loadCases : [],
      loadCombos: Array.isArray(obj.loadCombos) ? obj.loadCombos : [],
      availableTables: Array.isArray(obj.availableTables) ? obj.availableTables : [],
      warnings: Array.isArray(obj.warnings) ? obj.warnings : [],
    },
  };
}

const VALID_ROLES = new Set<StructuralRole>([
  'structural_engineer',
  'project_engineer',
  'project_manager',
  'administrator',
  'read_only_reviewer',
]);

export function parseStructuralRoleHeader(rawRole: unknown): StructuralRole | null {
  if (typeof rawRole !== 'string') return null;
  const cleaned = rawRole.trim().toLowerCase() as StructuralRole;
  return VALID_ROLES.has(cleaned) ? cleaned : null;
}

export function assertStructuralPermission(
  role: StructuralRole,
  permission: keyof ReturnType<typeof getStructuralRolePermissions>
): { allowed: boolean; error?: string } {
  const perms = getStructuralRolePermissions(role);
  if (!perms[permission]) {
    return {
      allowed: false,
      error: `Role '${role}' is not authorized to perform action '${String(permission)}'.`,
    };
  }
  return { allowed: true };
}
