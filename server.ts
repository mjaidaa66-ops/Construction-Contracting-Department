import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { runSharjahMunicipalityAudit } from './server/services/sharjahComplianceAudit.ts';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    next();
  });

  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  const ALLOWED_PROJECT_TYPES = new Set([
    'villa',
    'commercial_tower',
    'residential_complex',
    'warehouse',
    'infrastructure',
    'institutional',
  ]);

  const AUDIT_WINDOW_MS = 60_000;
  const AUDIT_MAX_REQUESTS = 20;
  const auditRateBuckets = new Map<string, number[]>();

  app.post('/api/audit/sharjah', async (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (auditRateBuckets.get(clientIp) || []).filter(
      (ts) => now - ts < AUDIT_WINDOW_MS
    );
    if (recent.length >= AUDIT_MAX_REQUESTS) {
      res.status(429).json({
        error: 'Rate limit exceeded for compliance audits. Please retry in a minute.',
      });
      return;
    }
    recent.push(now);
    auditRateBuckets.set(clientIp, recent);

    try {
      const body = req.body && typeof req.body === 'object' ? req.body : null;
      const { projectType, gisData, bimElements, takeoffMeasurements, preferredLang } = body || {};

      if (
        typeof projectType !== 'string' ||
        !ALLOWED_PROJECT_TYPES.has(projectType) ||
        !gisData ||
        typeof gisData !== 'object' ||
        Array.isArray(gisData) ||
        !Array.isArray(bimElements)
      ) {
        res.status(400).json({
          error: 'Invalid or missing audit payload fields: projectType, gisData, or bimElements.',
        });
        return;
      }

      if (bimElements.length > 500) {
        res.status(400).json({
          error: 'bimElements exceeds maximum allowed limit of 500 elements.',
        });
        return;
      }

      const safeMeasurements = Array.isArray(takeoffMeasurements)
        ? takeoffMeasurements.slice(0, 500)
        : [];

      const report = await runSharjahMunicipalityAudit({
        projectType: projectType as
          | 'villa'
          | 'commercial_tower'
          | 'residential_complex'
          | 'warehouse'
          | 'infrastructure'
          | 'institutional',
        gisData,
        bimElements,
        takeoffMeasurements: safeMeasurements,
        preferredLang: preferredLang === 'en' ? 'en' : 'ar',
      });

      res.json(report);
    } catch (err) {
      console.error('[Sharjah Audit Error]', err);
      const isMissingConfig =
        err instanceof Error && err.message.includes('GEMINI_API_KEY is not configured');
      res.status(isMissingConfig ? 503 : 500).json({
        error: isMissingConfig
          ? 'Compliance audit service is not configured on this server.'
          : 'Unable to complete Sharjah compliance audit at this time.',
      });
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
