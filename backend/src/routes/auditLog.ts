import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { getAuditLogs, verifyAuditChain } from '../services/auditService';

const router = Router();

/**
 * GET /api/audit-log/verify
 * Recomputes the cryptographic SHA-256 hash chain from genesis block to current head.
 * Restricted to Admin and Finance Manager.
 */
router.get(
  '/verify',
  authenticate,
  requireRole('Admin', 'Finance Manager'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await verifyAuditChain();
      if (result.valid) {
        res.status(200).json({
          status: 'ok',
          valid: true,
          totalEntries: result.totalEntries,
          message: `Audit log cryptographic hash chain is intact and untampered across all ${result.totalEntries} entries.`
        });
      } else {
        res.status(200).json({
          status: 'tampered',
          valid: false,
          totalEntries: result.totalEntries,
          brokenAtId: result.brokenAtId,
          error: result.error,
          expectedHash: result.expectedHash,
          actualHash: result.actualHash,
          message: `Cryptographic verification failed: Tampering detected at entry ${result.brokenAtId}.`
        });
      }
    } catch (err: any) {
      console.error('Error in GET /api/audit-log/verify:', err);
      res.status(500).json({
        status: 'error',
        statusCode: 500,
        message: 'Audit verification execution failed.'
      });
    }
  }
);

/**
 * GET /api/audit-log
 * Paginated and filtered retrieval of hash-chained audit log records.
 * Restricted to Admin and Finance Manager.
 */
router.get(
  '/',
  authenticate,
  requireRole('Admin', 'Finance Manager'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { action, entity, actorId, limit, offset } = req.query;

      const logs = await getAuditLogs({
        action: action as string | undefined,
        entity: entity as string | undefined,
        actorId: actorId as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined
      });

      res.status(200).json({
        status: 'ok',
        ...logs
      });
    } catch (err: any) {
      console.error('Error in GET /api/audit-log:', err);
      res.status(500).json({
        status: 'error',
        statusCode: 500,
        message: 'Failed to retrieve audit log records.'
      });
    }
  }
);

export default router;
