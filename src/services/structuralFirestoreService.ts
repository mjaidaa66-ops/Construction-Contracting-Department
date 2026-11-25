import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { sanitizeFirestoreId } from './firestoreStorage';
import type {
  NormalizedStructuralDataset,
  StructuralReportDocument,
} from '../modules/structural/types/structural-results.types';
import type {
  StructuralImportJob,
  StructuralModelRevision,
  StructuralProject,
  StructuralValidation,
} from '../modules/structural/types/structural.types';

const LOCAL_STRUCTURAL_CACHE_PREFIX = 'bunyan_structural_phase1_cache_';

export interface LocalStructuralWorkspaceState {
  projects: StructuralProject[];
  revisions: StructuralModelRevision[];
  datasetsByRevision: Record<string, NormalizedStructuralDataset>;
  reports: StructuralReportDocument[];
  importJobs: StructuralImportJob[];
}

export function loadLocalStructuralWorkspace(ownerKey: string | null): LocalStructuralWorkspaceState {
  const empty: LocalStructuralWorkspaceState = {
    projects: [],
    revisions: [],
    datasetsByRevision: {},
    reports: [],
    importJobs: [],
  };
  try {
    const raw = localStorage.getItem(`${LOCAL_STRUCTURAL_CACHE_PREFIX}${ownerKey || 'guest'}`);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<LocalStructuralWorkspaceState>;
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      revisions: Array.isArray(parsed.revisions) ? parsed.revisions : [],
      datasetsByRevision:
        parsed.datasetsByRevision && typeof parsed.datasetsByRevision === 'object'
          ? parsed.datasetsByRevision
          : {},
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      importJobs: Array.isArray(parsed.importJobs) ? parsed.importJobs : [],
    };
  } catch {
    return empty;
  }
}

export function saveLocalStructuralWorkspace(
  state: LocalStructuralWorkspaceState,
  ownerKey: string | null
): void {
  try {
    localStorage.setItem(
      `${LOCAL_STRUCTURAL_CACHE_PREFIX}${ownerKey || 'guest'}`,
      JSON.stringify(state)
    );
  } catch {
    // Ignore browser quota limitations safely
  }
}

function stripUndefined<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Persists a confirmed structural revision bundle across the 10 hardened
 * Firestore collections with strict ownerId scoping and server timestamps.
 */
export async function saveConfirmedStructuralRevisionToCloud(params: {
  ownerId: string;
  structuralProject: StructuralProject;
  dataset: NormalizedStructuralDataset;
  report: StructuralReportDocument;
}): Promise<void> {
  const { ownerId, structuralProject, dataset, report } = params;
  const safeOwnerId = sanitizeFirestoreId(ownerId);
  const projectId = sanitizeFirestoreId(structuralProject.id);
  const modelId = sanitizeFirestoreId(dataset.model.id);
  const revisionId = sanitizeFirestoreId(dataset.revision.id);
  const importId = sanitizeFirestoreId(dataset.importJob.id);

  // 1. structuralProjects
  try {
    await setDoc(doc(db, 'structuralProjects', projectId), {
      ...stripUndefined(structuralProject),
      id: projectId,
      ownerId: safeOwnerId,
      activeRevisionId: revisionId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `structuralProjects/${projectId}`);
  }

  // 2. structuralModels
  try {
    await setDoc(doc(db, 'structuralModels', modelId), {
      ...stripUndefined(dataset.model),
      id: modelId,
      ownerId: safeOwnerId,
      projectId,
      revisionId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `structuralModels/${modelId}`);
  }

  // 3. structuralRevisions (Immutable revision snapshot)
  try {
    await setDoc(doc(db, 'structuralRevisions', revisionId), {
      ...stripUndefined(dataset.revision),
      id: revisionId,
      ownerId: safeOwnerId,
      projectId,
      modelId,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `structuralRevisions/${revisionId}`);
  }

  // 4. structuralImports
  try {
    await setDoc(doc(db, 'structuralImports', importId), {
      ...stripUndefined(dataset.importJob),
      id: importId,
      ownerId: safeOwnerId,
      projectId,
      revisionId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `structuralImports/${importId}`);
  }

  // 5. structuralElements (bundled structural geometry & loads packet per revision to stay well under Firestore size limits)
  const elementsDocId = sanitizeFirestoreId(`el_${revisionId}`);
  try {
    await setDoc(doc(db, 'structuralElements', elementsDocId), {
      id: elementsDocId,
      ownerId: safeOwnerId,
      projectId,
      modelId,
      revisionId,
      stories: stripUndefined(dataset.stories.slice(0, 150)),
      grids: stripUndefined(dataset.grids.slice(0, 25)),
      nodesCount: dataset.nodes.length,
      frames: stripUndefined(dataset.frames.slice(0, 400)),
      areas: stripUndefined(dataset.areas.slice(0, 250)),
      loadPatterns: stripUndefined(dataset.loadPatterns.slice(0, 60)),
      loadCases: stripUndefined(dataset.loadCases.slice(0, 80)),
      loadCombinations: stripUndefined(dataset.loadCombinations.slice(0, 120)),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `structuralElements/${elementsDocId}`);
  }

  // 6. structuralMaterials
  const materialsDocId = sanitizeFirestoreId(`mat_${revisionId}`);
  try {
    await setDoc(doc(db, 'structuralMaterials', materialsDocId), {
      id: materialsDocId,
      ownerId: safeOwnerId,
      projectId,
      modelId,
      revisionId,
      items: stripUndefined(dataset.materials.slice(0, 100)),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `structuralMaterials/${materialsDocId}`);
  }

  // 7. structuralSections
  const sectionsDocId = sanitizeFirestoreId(`sec_${revisionId}`);
  try {
    await setDoc(doc(db, 'structuralSections', sectionsDocId), {
      id: sectionsDocId,
      ownerId: safeOwnerId,
      projectId,
      modelId,
      revisionId,
      items: stripUndefined(dataset.sections.slice(0, 200)),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `structuralSections/${sectionsDocId}`);
  }

  // 8. structuralResults
  const resultsDocId = sanitizeFirestoreId(`res_${revisionId}`);
  try {
    await setDoc(doc(db, 'structuralResults', resultsDocId), {
      id: resultsDocId,
      ownerId: safeOwnerId,
      projectId,
      modelId,
      revisionId,
      analysisResults: stripUndefined(dataset.analysisResults.slice(0, 100)),
      designResults: stripUndefined(dataset.designResults.slice(0, 50)),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `structuralResults/${resultsDocId}`);
  }

  // 9. structuralValidations
  const validationId = sanitizeFirestoreId(dataset.validation.id);
  try {
    await setDoc(doc(db, 'structuralValidations', validationId), {
      ...stripUndefined(dataset.validation),
      id: validationId,
      ownerId: safeOwnerId,
      projectId,
      revisionId,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `structuralValidations/${validationId}`);
  }

  // 10. structuralReports
  const reportId = sanitizeFirestoreId(report.id);
  try {
    await setDoc(doc(db, 'structuralReports', reportId), {
      ...stripUndefined(report),
      id: reportId,
      ownerId: safeOwnerId,
      projectId,
      revisionId,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `structuralReports/${reportId}`);
  }
}

export async function loadStructuralRevisionsFromCloud(
  ownerId: string
): Promise<StructuralModelRevision[]> {
  try {
    const q = query(
      collection(db, 'structuralRevisions'),
      where('ownerId', '==', sanitizeFirestoreId(ownerId))
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as StructuralModelRevision);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'structuralRevisions');
  }
}

export async function loadStructuralValidationsFromCloud(
  ownerId: string
): Promise<StructuralValidation[]> {
  try {
    const q = query(
      collection(db, 'structuralValidations'),
      where('ownerId', '==', sanitizeFirestoreId(ownerId))
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as StructuralValidation);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'structuralValidations');
  }
}
