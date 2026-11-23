import { Router, Request, Response } from 'express';
import { checkPgHealth } from '../db';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const isPg = await checkPgHealth();

  // This endpoint is a liveness check for Render: keep HTTP 200 while the
  // process is running, but report database readiness truthfully.
  res.status(200).json({
    status: isPg ? 'ok' : 'degraded',
    service: 'FINSHIELD AI Backend',
    version: '1.0.0',
    phase: 'Phase 3 - Invoice Extraction & Verification',
    timestamp: new Date().toISOString(),
    database: isPg ? 'connected (PostgreSQL)' : 'unavailable (PostgreSQL connection failed)',
    environment: process.env.NODE_ENV || 'development'
  });
});

export default router;
