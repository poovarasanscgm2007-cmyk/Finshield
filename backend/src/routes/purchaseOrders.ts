import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { createApprovalRequest } from '../services/approvalService';
import { writeAuditLog } from '../services/auditService';
import { getPoChanges } from '../services/poChangeService';

const router = Router();

/**
 * GET /api/purchase-orders
 * List purchase orders with supplier information
 */
router.get('/', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT 
        po.id,
        po.po_number,
        po.order_date,
        po.total_amount,
        po.status,
        po.created_at,
        s.name AS supplier_name,
        s.gstin AS supplier_gstin,
        u.name AS created_by_name
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN users u ON po.created_by = u.id
      ORDER BY po.order_date DESC, po.po_number DESC
    `);

    res.status(200).json({
      status: 'ok',
      count: result.rows.length,
      purchaseOrders: result.rows
    });
  } catch (err: any) {
    console.error('Error in GET /api/purchase-orders:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Failed to fetch purchase orders.'
    });
  }
});

/**
 * GET /api/purchase-orders/:id
 * Retrieve PO details, line items, and modification history
 */
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const poRes = await pool.query(
      `SELECT po.*, s.name as supplier_name, s.gstin as supplier_gstin, u.name as created_by_name
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN users u ON po.created_by = u.id
       WHERE po.id = $1 OR po.po_number = $1`,
      [id]
    );

    if (poRes.rows.length === 0) {
      res.status(404).json({
        status: 'error',
        statusCode: 404,
        message: 'Purchase order not found.'
      });
      return;
    }

    const po = poRes.rows[0];

    const linesRes = await pool.query(
      'SELECT * FROM po_lines WHERE po_id = $1',
      [po.id]
    );

    const historyRes = await pool.query(
      `SELECT pch.*, u.name as changed_by_name, a.status as approval_status
       FROM po_change_history pch
       LEFT JOIN users u ON pch.changed_by = u.id
       LEFT JOIN approvals a ON pch.approval_id = a.id
       WHERE pch.po_id = $1
       ORDER BY pch.changed_at DESC`,
      [po.id]
    );

    res.status(200).json({
      status: 'ok',
      purchaseOrder: {
        ...po,
        lines: linesRes.rows,
        changeHistory: historyRes.rows
      }
    });
  } catch (err: any) {
    console.error('Error in GET /api/purchase-orders/:id:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Failed to fetch purchase order details.'
    });
  }
});

/**
 * GET /api/purchase-orders/:id/changes
 * PO Change Monitoring: Returns all changes and flags unauthorized modifications
 */
router.get('/:id/changes', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const report = await getPoChanges(id);
    res.status(200).json({
      status: 'ok',
      ...report
    });
  } catch (err: any) {
    console.error('Error fetching PO changes:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: `Failed to fetch PO changes: ${err.message || 'Execution error'}`
    });
  }
});

/**
 * PUT /api/purchase-orders/:id/price
 * Proposes a price change. Enforces Maker-Checker:
 * Creates an approval request and a po_change_history row with pending approval.
 * Does NOT modify po_lines or purchase_orders directly!
 */
router.put(
  '/:id/price',
  authenticate,
  requireRole('Procurement Employee', 'Admin'),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { newUnitPrice, reason } = req.body;

    if (newUnitPrice === undefined || isNaN(Number(newUnitPrice)) || Number(newUnitPrice) <= 0) {
      res.status(400).json({
        status: 'error',
        statusCode: 400,
        message: 'A valid numeric newUnitPrice greater than 0 is required.'
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Fetch PO and its primary line
      const poRes = await client.query(
        `SELECT po.id, po.po_number, po.total_amount, pol.unit_price, pol.item_name
         FROM purchase_orders po
         JOIN po_lines pol ON po.id = pol.po_id
         WHERE po.id = $1 OR po.po_number = $1
         LIMIT 1
         FOR UPDATE`,
        [id]
      );

      if (poRes.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({
          status: 'error',
          statusCode: 404,
          message: 'Purchase order or line item not found.'
        });
        return;
      }

      const po = poRes.rows[0];
      const oldUnitPrice = po.unit_price;

      // 2. Create approval request under maker-checker controls
      const approvalPayload = {
        po_id: po.id,
        po_number: po.po_number,
        item_name: po.item_name,
        old_unit_price: Number(oldUnitPrice),
        new_unit_price: Number(newUnitPrice),
        reason: reason || 'Vendor cost renegotiation'
      };

      const appRes = await client.query(
        `INSERT INTO approvals (entity_type, entity_id, requested_by, payload, status, notes)
         VALUES ($1, $2, $3, $4, 'PENDING', $5)
         RETURNING id, entity_type, entity_id, requested_by, payload, status, requested_at;`,
        [
          'PURCHASE_ORDER_PRICE_CHANGE',
          po.id,
          req.user!.id,
          JSON.stringify(approvalPayload),
          reason || 'PO price modification proposed'
        ]
      );

      const approval = appRes.rows[0];

      // 3. Create po_change_history record linked to the pending approval
      const historyRes = await client.query(
        `INSERT INTO po_change_history (po_id, changed_by, field, old_value, new_value, approval_id)
         VALUES ($1, $2, 'unit_price', $3, $4, $5)
         RETURNING id, po_id, changed_by, field, old_value, new_value, approval_id, changed_at;`,
        [
          po.id,
          req.user!.id,
          String(oldUnitPrice),
          String(newUnitPrice),
          approval.id
        ]
      );

      const poChange = historyRes.rows[0];

      // 4. Log to hash-chained audit log
      await writeAuditLog(
        req.user!.id,
        'PO_CHANGE_REQUESTED',
        'PURCHASE_ORDER',
        po.id,
        {
          po_number: po.po_number,
          old_unit_price: Number(oldUnitPrice),
          new_unit_price: Number(newUnitPrice),
          approval_id: approval.id,
          requested_by: req.user!.id
        }
      );

      await client.query('COMMIT');

      res.status(202).json({
        status: 'ok',
        message: 'PO price modification submitted for Finance Manager maker-checker approval. Price will NOT change until approved.',
        approval,
        poChangeHistory: poChange
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error in PUT /api/purchase-orders/:id/price:', err);
      res.status(500).json({
        status: 'error',
        statusCode: 500,
        message: 'Failed to submit price change request.'
      });
    } finally {
      client.release();
    }
  }
);

export default router;
