import { Router, Request, Response } from 'express';
import { checkPgHealth } from '../db';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const isPg = await checkPgHealth();
  const dbStatus = isPg ? 'connected (PostgreSQL)' : 'connected (In-Memory Prototype Vault)';

  res.status(200).json({
    status: 'ok',
    service: 'FINSHIELD AI Backend',
    version: '1.0.0',
    phase: 'Phase 3 - Invoice Extraction & Verification',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    environment: process.env.NODE_ENV || 'development'
  });
});

export default router;
