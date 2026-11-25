import type {
  StructuralImportJob,
  StructuralModelRevision,
  StructuralProject,
  StructuralValidation,
} from '../types/structural.types';
import type {
  NormalizedStructuralDataset,
  StructuralImportPreview,
  StructuralReportDocument,
} from '../types/structural-results.types';

export interface StagedImportJobRecord {
  job: StructuralImportJob;
  preview?: StructuralImportPreview;
  abortController?: AbortController;
}

export class StructuralRepository {
  private readonly projects = new Map<string, StructuralProject>();
  private readonly revisions = new Map<string, StructuralModelRevision[]>();
  private readonly datasetsByRevision = new Map<string, NormalizedStructuralDataset>();
  private readonly validations = new Map<string, StructuralValidation>();
  private readonly reports = new Map<string, StructuralReportDocument[]>();
  private readonly jobs = new Map<string, StagedImportJobRecord>();

  upsertProject(project: StructuralProject): StructuralProject {
    this.projects.set(project.id, project);
    return project;
  }

  getProject(projectId: string): StructuralProject | undefined {
    return this.projects.get(projectId);
  }

  listProjectsByOwner(ownerId: string): StructuralProject[] {
    return Array.from(this.projects.values()).filter((p) => p.ownerId === ownerId);
  }

  listRevisions(projectId: string): StructuralModelRevision[] {
    return [...(this.revisions.get(projectId) || [])];
  }

  saveConfirmedDataset(params: {
    project: StructuralProject;
    dataset: NormalizedStructuralDataset;
    report: StructuralReportDocument;
  }): void {
    const { project, dataset, report } = params;
    const existingRevs = this.revisions.get(project.id) || [];
    if (existingRevs.some((r) => r.id === dataset.revision.id)) {
      throw new Error(`Immutable revision '${dataset.revision.id}' already exists.`);
    }

    const updatedRevs = [dataset.revision, ...existingRevs];
    this.revisions.set(project.id, updatedRevs);
    this.datasetsByRevision.set(dataset.revision.id, dataset);
    this.validations.set(dataset.validation.id, dataset.validation);

    const existingReports = this.reports.get(project.id) || [];
    this.reports.set(project.id, [report, ...existingReports]);

    this.projects.set(project.id, {
      ...project,
      activeRevisionId: dataset.revision.id,
      revisionCount: updatedRevs.length,
      reliabilitySummary: dataset.validation.reliability,
      updatedAt: new Date().toISOString(),
    });
  }

  getDatasetByRevision(revisionId: string): NormalizedStructuralDataset | undefined {
    return this.datasetsByRevision.get(revisionId);
  }

  listReports(projectId: string): StructuralReportDocument[] {
    return [...(this.reports.get(projectId) || [])];
  }

  saveJobRecord(record: StagedImportJobRecord): void {
    this.jobs.set(record.job.id, record);
  }

  getJobRecord(jobId: string): StagedImportJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  listJobs(projectId?: string): StructuralImportJob[] {
    const all = Array.from(this.jobs.values()).map((r) => r.job);
    return projectId ? all.filter((j) => j.projectId === projectId) : all;
  }

  cancelJob(jobId: string): StructuralImportJob | undefined {
    const existing = this.jobs.get(jobId);
    if (!existing) return undefined;
    existing.abortController?.abort();
    const cancelledJob: StructuralImportJob = {
      ...existing.job,
      status: 'CANCELLED',
      completedAt: new Date().toISOString(),
      errorMessage: 'Import job cancelled by engineer.',
    };
    this.jobs.set(jobId, {
      ...existing,
      job: cancelledJob,
    });
    return cancelledJob;
  }
}

export const defaultStructuralRepository = new StructuralRepository();
