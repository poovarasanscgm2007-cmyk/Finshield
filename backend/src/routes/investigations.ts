import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pool } from '../db';
import {
  InvestigationStatus,
  updateInvestigationStatus,
  addInvestigationComment,
  attachInvestigationEvidence,
  reassignInvestigation,
  revalidateInvestigation,
  syncInvoiceInvestigations
} from '../services/investigationService';

const router = Router();

/**
 * GET /api/investigations
 * List investigations with optional filters for status, department, assignee, invoiceId.
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, department, assignee, invoiceId } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];
    let pCount = 1;

    if (status) {
      conditions.push(`status = $${pCount++}`);
      params.push(status);
    }
    if (department) {
      conditions.push(`department = $${pCount++}`);
      params.push(department);
    }
    if (assignee) {
      conditions.push(`assigned_to = $${pCount++}`);
      params.push(assignee);
    }
    if (invoiceId) {
      conditions.push(`invoice_id = $${pCount++}`);
      params.push(invoiceId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM investigations ${whereClause} ORDER BY created_at DESC`;

    const result = await pool.query(query, params);

    res.status(200).json({
      status: 'ok',
      count: result.rows.length,
      investigations: result.rows
    });
  } catch (err: any) {
    console.error('Error in GET /api/investigations:', err);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to list investigations' });
  }
});

/**
 * GET /api/investigations/:id
 * Retrieve investigation detail with evidence, comments, and audit timeline.
 */
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM investigations WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ status: 'error', message: `Investigation '${id}' not found.` });
      return;
    }

    const investigation = result.rows[0];

    // Optionally retrieve linked invoice details
    let invoice = null;
    if (investigation.invoice_id) {
      const invRes = await pool.query(`SELECT * FROM invoices WHERE id = $1`, [investigation.invoice_id]);
      if (invRes.rows.length > 0) invoice = invRes.rows[0];
    }

    res.status(200).json({
      status: 'ok',
      investigation,
      invoice
    });
  } catch (err: any) {
    console.error('Error in GET /api/investigations/:id:', err);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to get investigation' });
  }
});

/**
 * PUT /api/investigations/:id/status
 * Updates status (e.g. IN_PROGRESS, RESOLVED, REOPENED).
 * Enforces department RBAC. Triggers automatic revalidation when setting to RESOLVED.
 */
router.put('/:id/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, comment, resolution_notes } = req.body;

    if (!status) {
      res.status(400).json({ status: 'error', message: 'Missing required field: status' });
      return;
    }

    const result = await updateInvestigationStatus(
      id,
      status as InvestigationStatus,
      comment || '',
      {
        id: req.user!.id,
        name: req.user!.name,
        role: req.user!.role
      },
      resolution_notes
    );

    res.status(200).json({
      status: 'ok',
      message: `Investigation status updated to ${result.investigation.status}`,
      investigation: result.investigation,
      revalidation: result.revalidation
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/investigations/:id/comments
 * Adds comment to investigation thread
 */
router.post('/:id/comments', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      res.status(400).json({ status: 'error', message: 'Comment text cannot be empty.' });
      return;
    }

    const updated = await addInvestigationComment(id, comment, {
      id: req.user!.id,
      name: req.user!.name,
      role: req.user!.role
    });

    res.status(200).json({
      status: 'ok',
      message: 'Comment added successfully.',
      investigation: updated
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/investigations/:id/evidence
 * Attaches note or file link to investigation evidence
 */
router.post('/:id/evidence', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { note, file_url, metadata } = req.body;

    const updated = await attachInvestigationEvidence(
      id,
      { note, file_url, metadata },
      {
        id: req.user!.id,
        name: req.user!.name,
        role: req.user!.role
      }
    );

    res.status(200).json({
      status: 'ok',
      message: 'Evidence attached successfully.',
      investigation: updated
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * PUT /api/investigations/:id/assign
 * Finance Manager or Admin can reassign investigation
 */
router.put('/:id/assign', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;

    if (!assigned_to) {
      res.status(400).json({ status: 'error', message: 'Missing assigned_to user ID.' });
      return;
    }

    const updated = await reassignInvestigation(id, assigned_to, {
      id: req.user!.id,
      name: req.user!.name,
      role: req.user!.role
    });

    res.status(200).json({
      status: 'ok',
      message: 'Investigation reassigned successfully.',
      investigation: updated
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/investigations/:id/revalidate
 * Manually trigger revalidation evaluation on an investigation
 */
router.post('/:id/revalidate', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { resolution_notes } = req.body;

    const result = await revalidateInvestigation(
      id,
      {
        id: req.user!.id,
        name: req.user!.name,
        role: req.user!.role
      },
      resolution_notes
    );

    res.status(200).json({
      status: 'ok',
      message: `Revalidation executed: Status is now ${result.investigation.status}`,
      investigation: result.investigation,
      all_cleared: result.allCleared,
      invoice_status: result.invoiceStatus
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/investigations/sync/:invoiceId
 * Manually trigger investigation synchronization for an invoice
 */
router.post('/sync/:invoiceId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { invoiceId } = req.params;
    const investigations = await syncInvoiceInvestigations(invoiceId, req.user!.id);

    res.status(200).json({
      status: 'ok',
      count: investigations.length,
      investigations
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
