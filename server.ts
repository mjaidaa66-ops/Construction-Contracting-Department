import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { runSharjahMunicipalityAudit } from './server/services/sharjahComplianceAudit.ts';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/audit/sharjah', async (req, res) => {
    try {
      const { projectType, gisData, bimElements, takeoffMeasurements, preferredLang } = req.body || {};

      if (!projectType || !gisData || !Array.isArray(bimElements)) {
        res.status(400).json({
          error: 'Missing required audit payload fields: projectType, gisData, or bimElements.',
        });
        return;
      }

      const report = await runSharjahMunicipalityAudit({
        projectType,
        gisData,
        bimElements,
        takeoffMeasurements: Array.isArray(takeoffMeasurements) ? takeoffMeasurements : [],
        preferredLang: preferredLang === 'en' ? 'en' : 'ar',
      });

      res.json(report);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unexpected server error during Sharjah audit.';
      console.error('[Sharjah Audit Error]', err);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build assets not found. Run npm run build.');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Bunyan Core server running on http://0.0.0.0:${port}`);
  });
}

startServer();
