import { pool } from '../db';
import { UserRole } from '../auth/permissions';
import { writeAuditLog } from './auditService';

export interface ApprovalRequest {
  id: string;
  entity_type: string;
  entity_id: string;
  payload: any;
  requested_by: string;
  approved_by: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requested_at: string;
  actioned_at: string | null;
  notes: string | null;
  requester_name?: string;
  requester_role?: string;
  approver_name?: string;
}

export class MakerCheckerError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 403) {
    super(message);
    this.name = 'MakerCheckerError';
    this.statusCode = statusCode;
  }
}

/**
 * Creates a new pending approval request under maker-checker control
 */
export async function createApprovalRequest(
  entityType: string,
  entityId: string,
  requestedBy: string,
  payload: any,
  notes?: string
): Promise<ApprovalRequest> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `INSERT INTO approvals (entity_type, entity_id, requested_by, payload, status, notes)
       VALUES ($1, $2, $3, $4, 'PENDING', $5)
       RETURNING id, entity_type, entity_id, requested_by, payload, status, requested_at, actioned_at, notes;`,
      [entityType, entityId, requestedBy, JSON.stringify(payload), notes || null]
    );

    const approval = res.rows[0];

    // Log to hash-chained audit log
    await writeAuditLog(requestedBy, 'APPROVAL_CREATED', entityType, entityId, {
      approvalId: approval.id,
      entityType,
      payload
    });

    return approval;
  } finally {
    client.release();
  }
}

/**
 * Approves a pending request with strict maker-checker validation
 */
export async function approveRequest(
  approvalId: string,
  approverId: string,
  approverRole: UserRole,
  notes?: string
): Promise<ApprovalRequest> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const appRes = await client.query(
      'SELECT id, entity_type, entity_id, requested_by, approved_by, status, payload, notes FROM approvals WHERE id = $1 FOR UPDATE',
      [approvalId]
    );

    if (appRes.rows.length === 0) {
      throw new MakerCheckerError('Approval request not found', 404);
    }

    const approval = appRes.rows[0];

    if (approval.status !== 'PENDING') {
      throw new MakerCheckerError(
        `Approval request is already finalized with status: ${approval.status}`,
        400
      );
    }

    // 1. Core Maker-Checker Rule: Requester can NEVER approve their own request!
    if (approval.requested_by === approverId) {
      await writeAuditLog(
        approverId,
        'MAKER_CHECKER_VIOLATION_ATTEMPT',
        approval.entity_type,
        approval.entity_id,
        {
          approvalId,
          reason: 'Requester attempted to approve own request'
        }
      );

      throw new MakerCheckerError(
        'Maker-checker violation: requester cannot approve their own request.',
        403
      );
    }

    // 2. Role-specific rule: Only Finance Manager can approve PO price changes or supplier bank changes
    if (approval.entity_type === 'PURCHASE_ORDER_PRICE_CHANGE') {
      if (approverRole !== 'Finance Manager') {
        await writeAuditLog(
          approverId,
          'ACCESS_DENIED',
          approval.entity_type,
          approval.entity_id,
          {
            approvalId,
            reason: 'Non-Finance Manager attempted to approve PO price change',
            approverRole
          }
        );

        throw new MakerCheckerError(
          'Forbidden: Only Finance Manager can approve purchase order price changes.',
          403
        );
      }

      // Execute price change upon authorized approval
      const payload = typeof approval.payload === 'string' ? JSON.parse(approval.payload) : approval.payload;
      const { po_id, new_unit_price } = payload;

      if (po_id && new_unit_price !== undefined) {
        // Update PO line item unit price and total price
        await client.query(
          `UPDATE po_lines 
           SET unit_price = $1, total_price = quantity * $1 
           WHERE po_id = $2`,
          [new_unit_price, po_id]
        );

        // Update purchase order total amount
        await client.query(
          `UPDATE purchase_orders 
           SET total_amount = (SELECT COALESCE(SUM(total_price), 0) FROM po_lines WHERE po_id = $1),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [po_id]
        );

        // Link po_change_history row to this approval
        await client.query(
          `UPDATE po_change_history 
           SET approval_id = $1 
           WHERE po_id = $2 AND approval_id = $1`,
          [approval.id, po_id]
        );
      }
    } else if (approval.entity_type === 'SUPPLIER_BANK_CHANGE') {
      if (approverRole !== 'Finance Manager') {
        await writeAuditLog(
          approverId,
          'ACCESS_DENIED',
          approval.entity_type,
          approval.entity_id,
          {
            approvalId,
            reason: 'Non-Finance Manager attempted to approve supplier bank change',
            approverRole
          }
        );

        throw new MakerCheckerError(
          'Forbidden: Only Finance Manager can approve supplier bank identifier changes.',
          403
        );
      }

      // Execute supplier bank update upon authorized approval
      const payload = typeof approval.payload === 'string' ? JSON.parse(approval.payload) : approval.payload;
      const { supplier_id, new_bank_identifier } = payload;

      if (supplier_id && new_bank_identifier) {
        await client.query(
          `UPDATE suppliers SET bank_identifier = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [new_bank_identifier, supplier_id]
        );
      }
    }

    // Update approval status to APPROVED
    const updatedRes = await client.query(
      `UPDATE approvals 
       SET status = 'APPROVED', approved_by = $1, actioned_at = CURRENT_TIMESTAMP, notes = COALESCE($2, notes)
       WHERE id = $3
       RETURNING id, entity_type, entity_id, requested_by, approved_by, status, requested_at, actioned_at, notes, payload;`,
      [approverId, notes || null, approvalId]
    );

    // Write to hash-chained audit log
    await writeAuditLog(
      approverId,
      'APPROVAL_GRANTED',
      approval.entity_type,
      approval.entity_id,
      {
        approvalId,
        approverRole,
        notes: notes || null
      }
    );

    await client.query('COMMIT');
    return updatedRes.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Rejects a pending request with strict maker-checker validation
 */
export async function rejectRequest(
  approvalId: string,
  approverId: string,
  approverRole: UserRole,
  reason: string
): Promise<ApprovalRequest> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const appRes = await client.query(
      'SELECT id, entity_type, entity_id, requested_by, status, payload FROM approvals WHERE id = $1 FOR UPDATE',
      [approvalId]
    );

    if (appRes.rows.length === 0) {
      throw new MakerCheckerError('Approval request not found', 404);
    }

    const approval = appRes.rows[0];

    if (approval.status !== 'PENDING') {
      throw new MakerCheckerError(
        `Approval request is already finalized with status: ${approval.status}`,
        400
      );
    }

    // Requester cannot reject/action their own request as checker
    if (approval.requested_by === approverId) {
      await writeAuditLog(
        approverId,
        'MAKER_CHECKER_VIOLATION_ATTEMPT',
        approval.entity_type,
        approval.entity_id,
        {
          approvalId,
          reason: 'Requester attempted to reject/action own request'
        }
      );

      throw new MakerCheckerError(
        'Maker-checker violation: requester cannot action their own request.',
        403
      );
    }

    // Update approval status to REJECTED
    const updatedRes = await client.query(
      `UPDATE approvals 
       SET status = 'REJECTED', approved_by = $1, actioned_at = CURRENT_TIMESTAMP, notes = $2
       WHERE id = $3
       RETURNING id, entity_type, entity_id, requested_by, approved_by, status, requested_at, actioned_at, notes, payload;`,
      [approverId, reason || 'Rejected by checker', approvalId]
    );

    // Write to hash-chained audit log
    await writeAuditLog(
      approverId,
      'APPROVAL_REJECTED',
      approval.entity_type,
      approval.entity_id,
      {
        approvalId,
        approverRole,
        reason: reason || 'Rejected'
      }
    );

    await client.query('COMMIT');
    return updatedRes.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * List approvals with user information and status filter
 */
export async function listApprovals(status?: string): Promise<ApprovalRequest[]> {
  const conditions: string[] = [];
  const values: any[] = [];

  if (status) {
    conditions.push(`a.status = $1`);
    values.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT 
      a.id,
      a.entity_type,
      a.entity_id,
      a.payload,
      a.requested_by,
      u_req.name AS requester_name,
      u_req.role AS requester_role,
      a.approved_by,
      u_app.name AS approver_name,
      a.status,
      a.requested_at,
      a.actioned_at,
      a.notes
    FROM approvals a
    LEFT JOIN users u_req ON a.requested_by = u_req.id
    LEFT JOIN users u_app ON a.approved_by = u_app.id
    ${whereClause}
    ORDER BY a.requested_at DESC
  `;

  const res = await pool.query(query, values);
  return res.rows;
}
