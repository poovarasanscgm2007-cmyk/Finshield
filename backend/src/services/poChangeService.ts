import { pool } from '../db';

export interface PoChangeItem {
  id: string;
  po_id: string;
  field: string;
  old_value: string;
  new_value: string;
  changed_by: string;
  changed_by_name?: string;
  changed_at: Date | string;
  approval_id?: string | null;
  approval_status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'NOT_FOUND';
  is_unauthorized: boolean;
  warning?: string | null;
}

export interface PoChangeReport {
  po_id: string;
  po_number: string;
  has_unauthorized_changes: boolean;
  unauthorized_changes_count: number;
  total_changes_count: number;
  changes: PoChangeItem[];
}

/**
 * PO Change Monitoring Service:
 * Analyzes po_change_history and linked approvals.
 * Flags any modification without an APPROVED approval record as 'UNAUTHORIZED PO CHANGE'.
 */
export async function getPoChanges(poIdOrNumber: string): Promise<PoChangeReport> {
  // 1. Resolve PO
  const poRes = await pool.query(
    `SELECT po.*, s.name AS supplier_name 
     FROM purchase_orders po
     LEFT JOIN suppliers s ON po.supplier_id = s.id
     WHERE po.id = $1 OR po.po_number = $1`,
    [poIdOrNumber]
  );

  if (poRes.rows.length === 0) {
    throw new Error(`Purchase Order '${poIdOrNumber}' not found.`);
  }

  const po = poRes.rows[0];

  // 2. Fetch change history joined with approvals and users
  const historyRes = await pool.query(
    `SELECT 
       pch.id,
       pch.po_id,
       pch.field,
       pch.old_value,
       pch.new_value,
       pch.changed_by,
       u.name AS changed_by_name,
       pch.changed_at,
       pch.approval_id,
       a.status AS approval_status
     FROM po_change_history pch
     LEFT JOIN users u ON pch.changed_by = u.id
     LEFT JOIN approvals a ON pch.approval_id = a.id
     WHERE pch.po_id = $1
     ORDER BY pch.changed_at DESC`,
    [po.id]
  );

  const changes: PoChangeItem[] = [];
  let unauthorizedCount = 0;

  for (const row of historyRes.rows) {
    const isApproved = row.approval_status === 'APPROVED';
    const isUnauthorized = !isApproved;
    const approvalStatus: 'APPROVED' | 'PENDING' | 'REJECTED' | 'NOT_FOUND' =
      row.approval_id ? (row.approval_status || 'PENDING') : 'NOT_FOUND';

    if (isUnauthorized) {
      unauthorizedCount++;
    }

    const modifierName = row.changed_by_name || 'Unknown Employee';
    const warning = isUnauthorized
      ? `UNAUTHORIZED PO CHANGE: Modified ${row.field} from ${row.old_value} to ${row.new_value} by ${modifierName}. Approval: ${approvalStatus === 'NOT_FOUND' ? 'Not found' : approvalStatus}`
      : null;

    changes.push({
      id: row.id,
      po_id: row.po_id,
      field: row.field,
      old_value: row.old_value,
      new_value: row.new_value,
      changed_by: row.changed_by,
      changed_by_name: modifierName,
      changed_at: row.changed_at,
      approval_id: row.approval_id,
      approval_status: approvalStatus,
      is_unauthorized: isUnauthorized,
      warning
    });
  }

  return {
    po_id: po.id,
    po_number: po.po_number,
    has_unauthorized_changes: unauthorizedCount > 0,
    unauthorized_changes_count: unauthorizedCount,
    total_changes_count: changes.length,
    changes
  };
}
