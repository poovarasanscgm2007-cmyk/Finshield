import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  listApprovals,
  MakerCheckerError
} from '../services/approvalService';

const router = Router();

/**
 * GET /api/approvals
 * Lists approvals filtered optionally by status (?status=PENDING)
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const approvals = await listApprovals(status);
    res.status(200).json({
      status: 'ok',
      count: approvals.length,
      approvals
    });
  } catch (err: any) {
    console.error('Error in GET /api/approvals:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Failed to retrieve approvals.'
    });
  }
});

/**
 * POST /api/approvals
 * Submits a new approval request
 */
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { entityType, entityId, payload, notes } = req.body;

  if (!entityType || !entityId) {
    res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: 'entityType and entityId are required.'
    });
    return;
  }

  try {
    const approval = await createApprovalRequest(
      entityType,
      entityId,
      req.user!.id,
      payload || {},
      notes
    );

    res.status(201).json({
      status: 'ok',
      message: 'Approval request created under maker-checker controls.',
      approval
    });
  } catch (err: any) {
    console.error('Error in POST /api/approvals:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Failed to create approval request.'
    });
  }
});

/**
 * POST /api/approvals/:id/approve
 * Approves a request enforcing maker-checker rules
 */
router.post('/:id/approve', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { notes } = req.body;

  try {
    const approval = await approveRequest(id, req.user!.id, req.user!.role, notes);
    res.status(200).json({
      status: 'ok',
      message: 'Approval granted successfully.',
      approval
    });
  } catch (err: any) {
    if (err instanceof MakerCheckerError) {
      res.status(err.statusCode).json({
        status: 'error',
        statusCode: err.statusCode,
        message: err.message
      });
      return;
    }
    console.error('Error in POST /api/approvals/:id/approve:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Failed to process approval.'
    });
  }
});

/**
 * POST /api/approvals/:id/decide
 * Decides (approves or rejects) a request enforcing maker-checker rules
 */
router.post('/:id/decide', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { decision, notes, comment, reason } = req.body;
  const decisionUpper = (decision || '').toUpperCase();

  try {
    if (decisionUpper === 'APPROVED' || decisionUpper === 'APPROVE') {
      const approval = await approveRequest(id, req.user!.id, req.user!.role, notes || comment);
      res.status(200).json({
        status: 'ok',
        message: 'Approval granted successfully.',
        approval
      });
    } else {
      const rejectReason = reason || comment || notes || 'Rejected by approver';
      const approval = await rejectRequest(id, req.user!.id, req.user!.role, rejectReason);
      res.status(200).json({
        status: 'ok',
        message: 'Approval request rejected.',
        approval
      });
    }
  } catch (err: any) {
    if (err instanceof MakerCheckerError) {
      res.status(err.statusCode).json({
        status: 'error',
        statusCode: err.statusCode,
        message: err.message
      });
      return;
    }
    console.error('Error in POST /api/approvals/:id/decide:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Failed to process decision.'
    });
  }
});

/**
 * POST /api/approvals/:id/reject
 * Rejects a request enforcing maker-checker rules
 */
router.post('/:id/reject', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: 'Rejection reason is required.'
    });
    return;
  }

  try {
    const approval = await rejectRequest(id, req.user!.id, req.user!.role, reason);
    res.status(200).json({
      status: 'ok',
      message: 'Approval request rejected.',
      approval
    });
  } catch (err: any) {
    if (err instanceof MakerCheckerError) {
      res.status(err.statusCode).json({
        status: 'error',
        statusCode: err.statusCode,
        message: err.message
      });
      return;
    }
    console.error('Error in POST /api/approvals/:id/reject:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Failed to process rejection.'
    });
  }
});

export default router;
