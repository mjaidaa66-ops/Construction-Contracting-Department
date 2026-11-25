import type { EtabsRawExtractPayload } from '../types/etabs.types';
import type { StructuralModelRevision } from '../types/structural.types';

export function computeDeterministicSourceHash(raw: EtabsRawExtractPayload): string {
  const canonical = JSON.stringify({
    app: raw.sourceApplication,
    version: raw.sourceVersion,
    modelName: raw.modelName,
    forceUnit: raw.forceUnit,
    lengthUnit: raw.lengthUnit,
    stories: (raw.stories || []).map((s) => `${s.name}:${s.elevation}:${s.height}`),
    materials: (raw.materials || []).map((m) => `${m.name}:${m.modulusE}:${m.fcOrFy}`),
    sections: (raw.sections || []).map((s) => `${s.name}:${s.depthOrThickness}:${s.width}`),
    framesCount: (raw.frames || []).length,
    areasCount: (raw.areas || []).length,
    pointsCount: (raw.points || []).length,
    patterns: (raw.loadPatterns || []).map((p) => `${p.name}:${p.patternType}`),
    combos: (raw.loadCombos || []).map((c) => `${c.name}:${c.items.length}`),
  });

  // Deterministic FNV-1a 64-bit equivalent hex digest usable cleanly in both Node & Browser
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    const ch = canonical.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x01000193);
  }
  return `sha_fnv_${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export function findDuplicateRevision(
  revisions: StructuralModelRevision[],
  projectId: string,
  sourceHash: string
): StructuralModelRevision | undefined {
  return revisions.find(
    (rev) => rev.projectId === projectId && rev.sourceHash === sourceHash
  );
}

export function getNextRevisionNumber(
  revisions: StructuralModelRevision[],
  projectId: string
): number {
  const projectRevs = revisions.filter((r) => r.projectId === projectId);
  if (projectRevs.length === 0) return 1;
  return Math.max(...projectRevs.map((r) => r.revisionNumber)) + 1;
}

export function appendImmutableRevision(
  existingRevisions: StructuralModelRevision[],
  newRevision: StructuralModelRevision
): StructuralModelRevision[] {
  if (existingRevisions.some((r) => r.id === newRevision.id)) {
    throw new Error(`Revision '${newRevision.id}' is immutable and already exists.`);
  }
  return [newRevision, ...existingRevisions];
}
