import {
  collection,
  doc,
  getDocsFromServer,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import {
  assertVerifiedCloudPath,
  db,
  handleFirestoreError,
  OperationType,
  withExponentialBackoff,
} from './firebase';
import { normalizeFirestoreData, sanitizeFirestoreId } from './firestoreStorage';
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

function stripUndefined<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Atomically persists a confirmed structural revision bundle across all 10 hardened
 * Firestore collections inside a single runTransaction (idempotent by revisionId/sourceHash).
 */
export async function saveConfirmedStructuralRevisionToCloud(params: {
  ownerId: string;
  structuralProject: StructuralProject;
  dataset: NormalizedStructuralDataset;
  report: StructuralReportDocument;
}): Promise<{ idempotentHit: boolean }> {
  const { ownerId, structuralProject, dataset, report } = params;
  const safeOwnerId = sanitizeFirestoreId(ownerId);
  const projectId = sanitizeFirestoreId(structuralProject.id);
  const modelId = sanitizeFirestoreId(dataset.model.id);
  const revisionId = sanitizeFirestoreId(dataset.revision.id);
  const importId = sanitizeFirestoreId(dataset.importJob.id);
  const elementsDocId = sanitizeFirestoreId(`el_${revisionId}`);
  const materialsDocId = sanitizeFirestoreId(`mat_${revisionId}`);
  const sectionsDocId = sanitizeFirestoreId(`sec_${revisionId}`);
  const resultsDocId = sanitizeFirestoreId(`res_${revisionId}`);
  const validationId = sanitizeFirestoreId(dataset.validation.id);
  const reportId = sanitizeFirestoreId(report.id);

  assertVerifiedCloudPath(OperationType.WRITE, `structuralProjects/${projectId}`);

  try {
    return await withExponentialBackoff(async () => {
      return await runTransaction(db, async (tx) => {
        const projRef = doc(db, 'structuralProjects', projectId);
        const revRef = doc(db, 'structuralRevisions', revisionId);
        const existingProj = await tx.get(projRef);
        const existingRev = await tx.get(revRef);

        if (
          existingRev.exists() &&
          String(existingRev.data().sourceHash || '') === String(dataset.revision.sourceHash || '')
        ) {
          return { idempotentHit: true };
        }

        const effectiveOwnerId = existingProj.exists()
          ? (existingProj.data().ownerId as string)
          : safeOwnerId;

        // 1. structuralProjects
        tx.set(projRef, {
          ...stripUndefined(structuralProject),
          id: projectId,
          ownerId: effectiveOwnerId,
          bunyanProjectId: sanitizeFirestoreId(structuralProject.bunyanProjectId),
          code: String(structuralProject.code || 'STR-001').slice(0, 64),
          name: String(structuralProject.name || 'Structural Project').slice(0, 200),
          nameEn: String(structuralProject.nameEn || 'Structural Project').slice(0, 200),
          structuralSystem: String(structuralProject.structuralSystem || '').slice(0, 200),
          designCode: String(structuralProject.designCode || '').slice(0, 200),
          activeRevisionId: revisionId,
          createdAt: existingProj.exists() ? existingProj.data().createdAt : serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // 2. structuralModels
        tx.set(doc(db, 'structuralModels', modelId), {
          ...stripUndefined(dataset.model),
          id: modelId,
          ownerId: safeOwnerId,
          projectId,
          revisionId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // 3. structuralRevisions (Immutable revision snapshot)
        tx.set(revRef, {
          ...stripUndefined(dataset.revision),
          id: revisionId,
          ownerId: safeOwnerId,
          projectId,
          modelId,
          createdAt: serverTimestamp(),
        });

        // 4. structuralImports
        tx.set(doc(db, 'structuralImports', importId), {
          ...stripUndefined(dataset.importJob),
          id: importId,
          ownerId: safeOwnerId,
          projectId,
          revisionId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // 5. structuralElements
        tx.set(doc(db, 'structuralElements', elementsDocId), {
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

        // 6. structuralMaterials
        tx.set(doc(db, 'structuralMaterials', materialsDocId), {
          id: materialsDocId,
          ownerId: safeOwnerId,
          projectId,
          modelId,
          revisionId,
          items: stripUndefined(dataset.materials.slice(0, 100)),
          createdAt: serverTimestamp(),
        });

        // 7. structuralSections
        tx.set(doc(db, 'structuralSections', sectionsDocId), {
          id: sectionsDocId,
          ownerId: safeOwnerId,
          projectId,
          modelId,
          revisionId,
          items: stripUndefined(dataset.sections.slice(0, 200)),
          createdAt: serverTimestamp(),
        });

        // 8. structuralResults
        tx.set(doc(db, 'structuralResults', resultsDocId), {
          id: resultsDocId,
          ownerId: safeOwnerId,
          projectId,
          modelId,
          revisionId,
          analysisResults: stripUndefined(dataset.analysisResults.slice(0, 100)),
          designResults: stripUndefined(dataset.designResults.slice(0, 50)),
          createdAt: serverTimestamp(),
        });

        // 9. structuralValidations
        tx.set(doc(db, 'structuralValidations', validationId), {
          ...stripUndefined(dataset.validation),
          id: validationId,
          ownerId: safeOwnerId,
          projectId,
          revisionId,
          issues: stripUndefined((dataset.validation.issues || []).slice(0, 200)),
          createdAt: serverTimestamp(),
        });

        // 10. structuralReports
        tx.set(doc(db, 'structuralReports', reportId), {
          ...stripUndefined(report),
          id: reportId,
          ownerId: safeOwnerId,
          projectId,
          revisionId,
          markdownContent: String(report.markdownContent || '').slice(0, 50000),
          createdAt: serverTimestamp(),
        });

        return { idempotentHit: false };
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `structuralProjects/${projectId}`);
  }
}

export async function saveStructuralReportToCloud(params: {
  ownerId: string;
  projectId: string;
  revisionId: string;
  report: StructuralReportDocument;
}): Promise<void> {
  const safeOwnerId = sanitizeFirestoreId(params.ownerId);
  const safeProjectId = sanitizeFirestoreId(params.projectId);
  const safeRevisionId = sanitizeFirestoreId(params.revisionId);
  const reportId = sanitizeFirestoreId(params.report.id);
  const path = `structuralReports/${reportId}`;
  assertVerifiedCloudPath(OperationType.CREATE, path);

  try {
    await withExponentialBackoff(async () => {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'structuralReports', reportId);
        const existing = await tx.get(ref);
        if (existing.exists()) return;
        tx.set(ref, {
          ...stripUndefined(params.report),
          id: reportId,
          ownerId: safeOwnerId,
          projectId: safeProjectId,
          revisionId: safeRevisionId,
          markdownContent: String(params.report.markdownContent || '').slice(0, 50000),
          createdAt: serverTimestamp(),
        });
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function loadStructuralRevisionsFromCloud(
  ownerId: string
): Promise<StructuralModelRevision[]> {
  assertVerifiedCloudPath(OperationType.LIST, 'structuralRevisions');
  try {
    return await withExponentialBackoff(async () => {
      const q = query(
        collection(db, 'structuralRevisions'),
        where('ownerId', '==', sanitizeFirestoreId(ownerId))
      );
      const snap = await getDocsFromServer(q);
      return snap.docs.map((d) =>
        normalizeFirestoreData(d.data() as StructuralModelRevision)
      );
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'structuralRevisions');
  }
}

export async function loadStructuralValidationsFromCloud(
  ownerId: string
): Promise<StructuralValidation[]> {
  assertVerifiedCloudPath(OperationType.LIST, 'structuralValidations');
  try {
    return await withExponentialBackoff(async () => {
      const q = query(
        collection(db, 'structuralValidations'),
        where('ownerId', '==', sanitizeFirestoreId(ownerId))
      );
      const snap = await getDocsFromServer(q);
      return snap.docs.map((d) =>
        normalizeFirestoreData(d.data() as StructuralValidation)
      );
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'structuralValidations');
  }
}

export async function loadStructuralProjectBundleFromCloud(
  ownerId: string,
  structuralProjectId: string
): Promise<{
  revisions: StructuralModelRevision[];
  datasetsByRevision: Record<string, NormalizedStructuralDataset>;
  reports: StructuralReportDocument[];
  importJobs: StructuralImportJob[];
}> {
  const safeOwnerId = sanitizeFirestoreId(ownerId);
  const safeProjId = sanitizeFirestoreId(structuralProjectId);
  assertVerifiedCloudPath(OperationType.LIST, `structuralProjects/${safeProjId}`);

  const queryByOwnerAndProject = (colName: string) =>
    getDocsFromServer(
      query(
        collection(db, colName),
        where('ownerId', '==', safeOwnerId),
        where('projectId', '==', safeProjId)
      )
    );

  try {
    return await withExponentialBackoff(async () => {
      const [
        revsSnap,
        modelsSnap,
        elementsSnap,
        materialsSnap,
        sectionsSnap,
        resultsSnap,
        validationsSnap,
        reportsSnap,
        importsSnap,
      ] = await Promise.all([
        queryByOwnerAndProject('structuralRevisions'),
        queryByOwnerAndProject('structuralModels'),
        queryByOwnerAndProject('structuralElements'),
        queryByOwnerAndProject('structuralMaterials'),
        queryByOwnerAndProject('structuralSections'),
        queryByOwnerAndProject('structuralResults'),
        queryByOwnerAndProject('structuralValidations'),
        queryByOwnerAndProject('structuralReports'),
        queryByOwnerAndProject('structuralImports'),
      ]);

      const revisions = revsSnap.docs
        .map((d) => normalizeFirestoreData(d.data() as StructuralModelRevision))
        .sort((a, b) => (b.revisionNumber || 0) - (a.revisionNumber || 0));

      const reports = reportsSnap.docs.map((d) =>
        normalizeFirestoreData(d.data() as StructuralReportDocument)
      );
      const importJobs = importsSnap.docs.map((d) =>
        normalizeFirestoreData(d.data() as StructuralImportJob)
      );

      const modelsByRev = new Map<string, NormalizedStructuralDataset['model']>();
      modelsSnap.docs.forEach((d) => {
        const m = normalizeFirestoreData(
          d.data() as NormalizedStructuralDataset['model']
        );
        modelsByRev.set(m.revisionId, m);
      });

      const elementsByRev = new Map<string, Record<string, unknown>>();
      elementsSnap.docs.forEach((d) => {
        const e = normalizeFirestoreData(d.data() as Record<string, unknown>);
        if (typeof e.revisionId === 'string') elementsByRev.set(e.revisionId, e);
      });

      const materialsByRev = new Map<
        string,
        NormalizedStructuralDataset['materials']
      >();
      materialsSnap.docs.forEach((d) => {
        const m = normalizeFirestoreData(
          d.data() as {
            revisionId: string;
            items?: NormalizedStructuralDataset['materials'];
          }
        );
        if (m.revisionId)
          materialsByRev.set(m.revisionId, Array.isArray(m.items) ? m.items : []);
      });

      const sectionsByRev = new Map<
        string,
        NormalizedStructuralDataset['sections']
      >();
      sectionsSnap.docs.forEach((d) => {
        const s = normalizeFirestoreData(
          d.data() as {
            revisionId: string;
            items?: NormalizedStructuralDataset['sections'];
          }
        );
        if (s.revisionId)
          sectionsByRev.set(s.revisionId, Array.isArray(s.items) ? s.items : []);
      });

      const resultsByRev = new Map<
        string,
        {
          analysisResults: NormalizedStructuralDataset['analysisResults'];
          designResults: NormalizedStructuralDataset['designResults'];
        }
      >();
      resultsSnap.docs.forEach((d) => {
        const r = normalizeFirestoreData(
          d.data() as {
            revisionId: string;
            analysisResults?: NormalizedStructuralDataset['analysisResults'];
            designResults?: NormalizedStructuralDataset['designResults'];
          }
        );
        if (r.revisionId) {
          resultsByRev.set(r.revisionId, {
            analysisResults: Array.isArray(r.analysisResults)
              ? r.analysisResults
              : [],
            designResults: Array.isArray(r.designResults) ? r.designResults : [],
          });
        }
      });

      const validationsByRev = new Map<string, StructuralValidation>();
      validationsSnap.docs.forEach((d) => {
        const v = normalizeFirestoreData(d.data() as StructuralValidation);
        if (v.revisionId) validationsByRev.set(v.revisionId, v);
      });

      const jobsByRev = new Map<string, StructuralImportJob>();
      importJobs.forEach((j) => {
        if (j.revisionId) jobsByRev.set(j.revisionId, j);
      });

      const datasetsByRevision: Record<string, NormalizedStructuralDataset> = {};
      for (const rev of revisions) {
        const model = modelsByRev.get(rev.id);
        const validation = validationsByRev.get(rev.id);
        const importJob = jobsByRev.get(rev.id);
        if (!model || !validation || !importJob) continue;
        const el = elementsByRev.get(rev.id) || {};
        const res = resultsByRev.get(rev.id) || {
          analysisResults: [],
          designResults: [],
        };
        datasetsByRevision[rev.id] = {
          model,
          stories: Array.isArray(el.stories)
            ? (el.stories as NormalizedStructuralDataset['stories'])
            : [],
          grids: Array.isArray(el.grids)
            ? (el.grids as NormalizedStructuralDataset['grids'])
            : [],
          nodes: [],
          frames: Array.isArray(el.frames)
            ? (el.frames as NormalizedStructuralDataset['frames'])
            : [],
          areas: Array.isArray(el.areas)
            ? (el.areas as NormalizedStructuralDataset['areas'])
            : [],
          materials: materialsByRev.get(rev.id) || [],
          sections: sectionsByRev.get(rev.id) || [],
          loadPatterns: Array.isArray(el.loadPatterns)
            ? (el.loadPatterns as NormalizedStructuralDataset['loadPatterns'])
            : [],
          loadCases: Array.isArray(el.loadCases)
            ? (el.loadCases as NormalizedStructuralDataset['loadCases'])
            : [],
          loadCombinations: Array.isArray(el.loadCombinations)
            ? (el.loadCombinations as NormalizedStructuralDataset['loadCombinations'])
            : [],
          analysisResults: res.analysisResults,
          designResults: res.designResults,
          validation,
          revision: rev,
          importJob,
        };
      }

      return {
        revisions,
        datasetsByRevision,
        reports,
        importJobs,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `structuralProjects/${safeProjId}`);
  }
}
