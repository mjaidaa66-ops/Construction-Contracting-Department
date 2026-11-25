import type { Project } from '../../../types/bunyan.ts';
import type { StructuralProject } from '../types/structural.types.ts';

export function buildStructuralProjectFromBunyanProject(
  bunyanProject: Project,
  ownerId: string
): StructuralProject {
  const nowIso = new Date().toISOString();
  const safeId = `sp_${bunyanProject.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  return {
    id: safeId,
    ownerId,
    bunyanProjectId: bunyanProject.id,
    code: `${bunyanProject.code}-STR`,
    name: `النموذج الإنشائي · ${bunyanProject.name}`,
    nameEn: `Structural Twin · ${bunyanProject.nameEn}`,
    structuralSystem:
      bunyanProject.projectType === 'commercial_tower'
        ? 'Reinforced Concrete Shear Wall + Moment Frame'
        : 'Reinforced Concrete Frame & Slab System',
    designCode: 'ACI 318-19 / ASCE 7-16 / Sharjah Mun.',
    revisionCount: 0,
    reliabilitySummary: 'MISSING',
    createdAt: bunyanProject.createdAt || nowIso,
    updatedAt: nowIso,
  };
}
