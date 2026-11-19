import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
import { pool } from '../db';
import { writeAuditLog } from '../services/auditService';

const router = Router();

/**
 * GET /api/grns
 * List all Goods Receipt Notes
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { po_id } = req.query;
    let query = 'SELECT * FROM grns';
    const params: any[] = [];
    if (po_id) {
      query += ' WHERE po_id = $1';
      params.push(po_id);
    }
    query += ' ORDER BY received_date DESC';

    const result = await pool.query(query, params);

    // Fetch lines for each GRN
    const grnsWithLines = await Promise.all(
      result.rows.map(async (grn: any) => {
        const linesRes = await pool.query('SELECT * FROM grn_lines WHERE grn_id = $1', [grn.id]);
        return {
          ...grn,
          lines: linesRes.rows
        };
      })
    );

    res.status(200).json({
      status: 'ok',
      count: grnsWithLines.length,
      grns: grnsWithLines
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/grns
 * Warehouse Employee only (or Admin): Creates or adds a supplementary / corrected Goods Receipt Note
 */
router.post(
  '/',
  authenticate,
  requireRole('Warehouse Employee', 'Admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { po_id, grn_number, received_date, items } = req.body;

      if (!po_id || !grn_number || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({
          status: 'error',
          message: 'Missing required fields: po_id, grn_number, and items array.'
        });
        return;
      }

      // Check PO exists
      const poRes = await pool.query('SELECT id, po_number FROM purchase_orders WHERE id = $1', [po_id]);
      if (poRes.rows.length === 0) {
        res.status(404).json({ status: 'error', message: `Purchase Order '${po_id}' not found.` });
        return;
      }

      const po = poRes.rows[0];

      // Insert GRN
      const grnRes = await pool.query(
        `INSERT INTO grns (grn_number, po_id, received_date, received_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [grn_number, po.id, received_date || new Date().toISOString().split('T')[0], req.user!.id]
      );

      const grn = grnRes.rows[0];
      const insertedLines = [];

      for (const item of items) {
        const lineRes = await pool.query(
          `INSERT INTO grn_lines (grn_id, item_name, quantity_received)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [grn.id, item.item_name, item.quantity_received]
        );
        insertedLines.push(lineRes.rows[0]);
      }

      await writeAuditLog(
        req.user!.id,
        'GRN_CREATED',
        'GRN',
        grn.id,
        {
          grn_number,
          po_number: po.po_number,
          lines: items
        }
      );

      res.status(201).json({
        status: 'ok',
        message: 'Goods Receipt Note recorded successfully.',
        grn: {
          ...grn,
          lines: insertedLines
        }
      });
    } catch (err: any) {
      console.error('Error creating GRN:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  }
);

export default router;
