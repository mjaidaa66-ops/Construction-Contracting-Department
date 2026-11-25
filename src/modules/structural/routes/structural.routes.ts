import { Router } from 'express';
import { EtabsAgentAdapter } from '../adapters/etabs.adapter';
import { StructuralController } from '../controllers/structural.controller';
import {
  defaultStructuralRepository,
  type StructuralRepository,
} from '../repositories/structural.repository';

export function createStructuralRouter(options?: {
  adapter?: EtabsAgentAdapter;
  repository?: StructuralRepository;
}): Router {
  const router = Router();
  const adapter = options?.adapter || new EtabsAgentAdapter();
  const repository = options?.repository || defaultStructuralRepository;
  const controller = new StructuralController(adapter, repository);

  router.get('/health', controller.health);
  router.get('/agent/status', controller.getAgentStatus);
  router.post('/agent/open-model', controller.openAuthorizedModel);
  router.post('/agent/extract-preview', controller.extractFromAgentAndPreview);
  router.post('/import/preview', controller.stagePreviewFromPayload);
  router.post('/import/confirm', controller.confirmPreview);
  router.post('/jobs/:jobId/cancel', controller.cancelJob);
  router.get('/projects/:projectId/revisions', controller.listRevisions);

  return router;
}
