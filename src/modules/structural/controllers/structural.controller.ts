import type { Request, Response } from 'express';
import { EtabsAgentAdapter } from '../adapters/etabs.adapter.ts';
import type { StructuralRepository } from '../repositories/structural.repository.ts';
import {
  buildImportPreview,
  confirmImportPreview,
} from '../services/etabsImport.service.ts';
import type { StructuralProject, StructuralRole } from '../types/structural.types.ts';
import {
  assertStructuralPermission,
  isValidStructuralId,
  parseStructuralRoleHeader,
  validateRawExtractPayload,
} from '../validators/structural.validators.ts';

export class StructuralController {
  private readonly adapter: EtabsAgentAdapter;
  private readonly repo: StructuralRepository;

  constructor(adapter: EtabsAgentAdapter, repo: StructuralRepository) {
    this.adapter = adapter;
    this.repo = repo;
  }

  private resolveRequestActor(req: Request): {
    uid: string;
    name: string;
    role: StructuralRole;
  } | null {
    const uidHeader = req.header('x-bunyan-uid') || '';
    const roleHeader = req.header('x-bunyan-structural-role') || '';
    const role = parseStructuralRoleHeader(roleHeader);
    if (!uidHeader || !isValidStructuralId(uidHeader) || !role) {
      return null;
    }
    return {
      uid: uidHeader,
      name: req.header('x-bunyan-user-name') || uidHeader,
      role,
    };
  }

  health = (_req: Request, res: Response) => {
    res.json({
      ok: true,
      module: 'structural-intelligence-phase-1',
      readOnlyDefault: true,
      timestamp: new Date().toISOString(),
    });
  };

  getAgentStatus = async (req: Request, res: Response) => {
    const actor = this.resolveRequestActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Valid x-bunyan-uid and x-bunyan-structural-role headers required.' });
      return;
    }
    const perm = assertStructuralPermission(actor.role, 'canInspectModels');
    if (!perm.allowed) {
      res.status(403).json({ error: perm.error });
      return;
    }
    const status = await this.adapter.getStatus();
    res.json(status);
  };

  openAuthorizedModel = async (req: Request, res: Response) => {
    const actor = this.resolveRequestActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication headers missing.' });
      return;
    }
    const perm = assertStructuralPermission(actor.role, 'canConnectEtabsAgent');
    if (!perm.allowed) {
      res.status(403).json({ error: perm.error });
      return;
    }

    const body = req.body as { modelFilePath?: unknown; authorizedByUser?: unknown } | undefined;
    if (
      !body ||
      typeof body.modelFilePath !== 'string' ||
      body.modelFilePath.trim().length < 5 ||
      body.authorizedByUser !== true
    ) {
      res.status(400).json({
        error: 'Valid modelFilePath (.edb) and explicit authorizedByUser=true are required.',
      });
      return;
    }

    try {
      const status = await this.adapter.openAuthorizedModel({
        modelFilePath: body.modelFilePath.trim(),
        authorizedByUser: true,
      });
      res.json(status);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to open .EDB via Windows Agent.',
      });
    }
  };

  extractFromAgentAndPreview = async (req: Request, res: Response) => {
    const actor = this.resolveRequestActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication headers missing.' });
      return;
    }
    const perm = assertStructuralPermission(actor.role, 'canStageImport');
    if (!perm.allowed) {
      res.status(403).json({ error: perm.error });
      return;
    }

    const body = req.body as { projectId?: unknown; bunyanProjectId?: unknown; allowDuplicate?: unknown } | undefined;
    if (!body || !isValidStructuralId(body.projectId)) {
      res.status(400).json({ error: 'Valid projectId is required.' });
      return;
    }

    const projectId = body.projectId;
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const abortController = new AbortController();

    this.repo.saveJobRecord({
      job: {
        id: jobId,
        ownerId: actor.uid,
        projectId,
        revisionId: 'pending',
        sourceMode: 'ETABS_OAPI_LIVE',
        sourceFileReference: 'active_etabs_v20',
        sourceHash: '',
        status: 'RUNNING',
        currentStep: 1,
        totalSteps: 11,
        startedAt: new Date().toISOString(),
        retryCount: 0,
        reliabilitySummary: 'UNVERIFIED',
      },
      abortController,
    });

    try {
      const agentStatus = await this.adapter.getStatus(abortController.signal);
      if (!agentStatus.agentReachable || !agentStatus.etabsV20Compatible || !agentStatus.activeInstanceRunning) {
        this.repo.saveJobRecord({
          job: {
            id: jobId,
            ownerId: actor.uid,
            projectId,
            revisionId: 'none',
            sourceMode: 'ETABS_OAPI_LIVE',
            sourceFileReference: agentStatus.activeModelPath || 'unavailable',
            sourceHash: '',
            status: 'FAILED',
            currentStep: 1,
            totalSteps: 11,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            errorMessage: agentStatus.message,
            retryCount: 0,
            reliabilitySummary: 'FAILED',
          },
        });
        res.status(503).json({
          error: agentStatus.message,
          connectionState: agentStatus.connectionState,
          jobId,
        });
        return;
      }

      const rawExtract = await this.adapter.extractActiveModel({
        jobId,
        projectId,
        signal: abortController.signal,
      });

      const existingRevisions = this.repo.listRevisions(projectId);
      const preview = buildImportPreview({
        ownerId: actor.uid,
        projectId,
        jobId,
        createdByUid: actor.uid,
        createdByName: actor.name,
        raw: rawExtract,
        existingRevisions,
        agentStatus,
        allowDuplicate: Boolean(body.allowDuplicate),
      });

      this.repo.saveJobRecord({
        job: preview.dataset.importJob,
        preview,
        abortController,
      });

      res.json(preview);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed.';
      this.repo.saveJobRecord({
        job: {
          id: jobId,
          ownerId: actor.uid,
          projectId,
          revisionId: 'none',
          sourceMode: 'ETABS_OAPI_LIVE',
          sourceFileReference: 'active_etabs_v20',
          sourceHash: '',
          status: abortController.signal.aborted ? 'CANCELLED' : 'FAILED',
          currentStep: 4,
          totalSteps: 11,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          errorMessage: message,
          retryCount: 0,
          reliabilitySummary: 'FAILED',
        },
      });
      res.status(abortController.signal.aborted ? 499 : 502).json({ error: message, jobId });
    }
  };

  stagePreviewFromPayload = (req: Request, res: Response) => {
    const actor = this.resolveRequestActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication headers missing.' });
      return;
    }
    const perm = assertStructuralPermission(actor.role, 'canStageImport');
    if (!perm.allowed) {
      res.status(403).json({ error: perm.error });
      return;
    }

    const body = req.body as {
      projectId?: unknown;
      rawExtract?: unknown;
      allowDuplicate?: unknown;
    } | undefined;
    if (!body || !isValidStructuralId(body.projectId)) {
      res.status(400).json({ error: 'Valid projectId is required.' });
      return;
    }

    const validated = validateRawExtractPayload(body.rawExtract);
    if (!validated.valid || !validated.payload) {
      res.status(400).json({ error: validated.error || 'Invalid ETABS table payload.' });
      return;
    }

    const preview = buildImportPreview({
      ownerId: actor.uid,
      projectId: body.projectId,
      createdByUid: actor.uid,
      createdByName: actor.name,
      raw: validated.payload,
      existingRevisions: this.repo.listRevisions(body.projectId),
      allowDuplicate: Boolean(body.allowDuplicate),
    });

    this.repo.saveJobRecord({
      job: preview.dataset.importJob,
      preview,
    });

    res.json(preview);
  };

  confirmPreview = (req: Request, res: Response) => {
    const actor = this.resolveRequestActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication headers missing.' });
      return;
    }
    const perm = assertStructuralPermission(actor.role, 'canConfirmImportRevision');
    if (!perm.allowed) {
      res.status(403).json({ error: perm.error });
      return;
    }

    const body = req.body as {
      jobId?: unknown;
      confirmedByUser?: unknown;
      allowDuplicateOverride?: unknown;
      projectMeta?: Partial<StructuralProject>;
    } | undefined;

    if (!body || !isValidStructuralId(body.jobId) || body.confirmedByUser !== true) {
      res.status(400).json({ error: 'Valid jobId and confirmedByUser=true are required.' });
      return;
    }

    const jobRecord = this.repo.getJobRecord(body.jobId);
    if (!jobRecord || !jobRecord.preview) {
      res.status(404).json({ error: 'Staged import preview not found for this jobId.' });
      return;
    }

    if (jobRecord.job.ownerId !== actor.uid && actor.role !== 'administrator') {
      res.status(403).json({ error: 'Cannot confirm an import job owned by another engineer.' });
      return;
    }

    try {
      const confirmed = confirmImportPreview({
        preview: jobRecord.preview,
        confirmedByUser: true,
        allowDuplicateOverride: Boolean(body.allowDuplicateOverride),
      });

      const existingProject = this.repo.getProject(jobRecord.job.projectId);
      const projectRecord: StructuralProject = existingProject || {
        id: jobRecord.job.projectId,
        ownerId: actor.uid,
        bunyanProjectId: body.projectMeta?.bunyanProjectId || jobRecord.job.projectId,
        code: body.projectMeta?.code || 'STR-001',
        name: body.projectMeta?.name || confirmed.dataset.model.name,
        nameEn: body.projectMeta?.nameEn || confirmed.dataset.model.name,
        structuralSystem: body.projectMeta?.structuralSystem || 'RC Frame & Shear Wall',
        designCode: body.projectMeta?.designCode || 'ACI 318-19 / ASCE 7-16',
        revisionCount: 0,
        reliabilitySummary: confirmed.dataset.validation.reliability,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.repo.saveConfirmedDataset({
        project: projectRecord,
        dataset: confirmed.dataset,
        report: confirmed.report,
      });

      this.repo.saveJobRecord({
        ...jobRecord,
        job: confirmed.confirmedJob,
      });

      res.json(confirmed);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Confirmation failed.' });
    }
  };

  cancelJob = async (req: Request, res: Response) => {
    const actor = this.resolveRequestActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication headers missing.' });
      return;
    }
    const jobId = req.params.jobId;
    if (!isValidStructuralId(jobId)) {
      res.status(400).json({ error: 'Invalid jobId.' });
      return;
    }
    const existing = this.repo.getJobRecord(jobId);
    if (!existing) {
      res.status(404).json({ error: 'Import job not found.' });
      return;
    }
    if (existing.job.ownerId !== actor.uid && actor.role !== 'administrator') {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    await this.adapter.cancelJob(jobId);
    const updated = this.repo.cancelJob(jobId);
    res.json({ cancelled: true, job: updated });
  };

  listRevisions = (req: Request, res: Response) => {
    const actor = this.resolveRequestActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication headers missing.' });
      return;
    }
    const projectId = req.params.projectId;
    if (!isValidStructuralId(projectId)) {
      res.status(400).json({ error: 'Invalid projectId.' });
      return;
    }
    const revs = this.repo.listRevisions(projectId).filter(
      (r) => r.ownerId === actor.uid || actor.role === 'administrator'
    );
    res.json({ revisions: revs });
  };
}
