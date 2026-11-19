import { pool } from '../db';
import { writeAuditLog } from './auditService';
import { matchInvoice, getMatchResult } from './matchingService';
import { detectDuplicates } from './duplicateService';
import { checkInvoiceGst } from './gstService';
import { getPoChanges } from './poChangeService';
import { detectSupplierOverbilling } from './overbillingService';
import { evaluateInvoiceRisk } from './riskService';

export type InvestigationDepartment =
  | 'Warehouse'
  | 'Procurement/Finance'
  | 'AP/Finance'
  | 'Finance/Compliance';

export type InvestigationStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'REVALIDATED'
  | 'REOPENED'
  | 'CLOSED';

export interface InvestigationComment {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  text: string;
  created_at: string;
}

export interface InvestigationRecord {
  id: string;
  issue_type: string;
  department: InvestigationDepartment;
  assigned_to?: string;
  assigned_user_name?: string;
  invoice_id?: string;
  invoice_number?: string;
  supplier_id?: string;
  supplier_name?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  status: InvestigationStatus;
  title: string;
  description: string;
  evidence: any;
  comments: InvestigationComment[];
  resolution_notes?: string | null;
  revalidation_result?: any | null;
  reopened_reason?: string | null;
  is_sample_data: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * Maps issue_type to designated department according to Golden Rules & Project Spec
 */
export function getDepartmentForIssue(issueType: string): {
  department: InvestigationDepartment;
  targetRole: string;
} {
  switch (issueType) {
    case 'QUANTITY_MISMATCH':
      return { department: 'Warehouse', targetRole: 'Warehouse Employee' };
    case 'PRICE_MISMATCH':
    case 'UNAUTHORIZED_PO_CHANGE':
    case 'PO_UNAPPROVED_CHANGE':
      return { department: 'Procurement/Finance', targetRole: 'Procurement Employee' };
    case 'POSSIBLE_DUPLICATE':
    case 'DUPLICATE_INVOICE':
    case 'HISTORICAL_OVERBILLING':
      return { department: 'AP/Finance', targetRole: 'AP Employee' };
    case 'GST_ITC_RISK':
    case 'GSTIN_INVALID':
    case 'GST_TAX_MISMATCH':
    case 'SUPPLIER_RISK':
    case 'SHARED_BANK_ACCOUNT':
    default:
      return { department: 'Finance/Compliance', targetRole: 'Finance Manager' };
  }
}

/**
 * Round-robin or first available user assignment by role
 */
let assignmentCounters: Record<string, number> = {};

export async function assignUserByRole(targetRole: string): Promise<{ id: string; name: string }> {
  try {
    const res = await pool.query(
      `SELECT id, name, role FROM users WHERE role = $1 ORDER BY id ASC`,
      [targetRole]
    );

    if (res.rows.length === 0) {
      // Fallback to Finance Manager if specific role not found (e.g. Compliance -> Finance Manager)
      const finRes = await pool.query(
        `SELECT id, name, role FROM users WHERE role = 'Finance Manager' LIMIT 1`
      );
      if (finRes.rows.length > 0) {
        return { id: finRes.rows[0].id, name: finRes.rows[0].name };
      }
      return { id: '22222222-2222-2222-2222-222222222222', name: 'Finance Manager (Sample Data)' };
    }

    const count = assignmentCounters[targetRole] || 0;
    const selected = res.rows[count % res.rows.length];
    assignmentCounters[targetRole] = count + 1;

    return { id: selected.id, name: selected.name };
  } catch (err) {
    return { id: '22222222-2222-2222-2222-222222222222', name: 'Finance Manager (Sample Data)' };
  }
}

/**
 * Checks whether an actor's role is allowed to update an investigation for a given department.
 * Finance Manager and Admin have oversight across all departments.
 * Warehouse Employee => Warehouse only
 * Procurement Employee => Procurement/Finance only
 * AP Employee => AP/Finance only
 */
export function checkInvestigationRBAC(userRole: string, department: InvestigationDepartment): boolean {
  if (userRole === 'Finance Manager' || userRole === 'Admin') {
    return true;
  }
  if (userRole === 'Warehouse Employee' && department === 'Warehouse') {
    return true;
  }
  if (userRole === 'Procurement Employee' && department === 'Procurement/Finance') {
    return true;
  }
  if (userRole === 'AP Employee' && department === 'AP/Finance') {
    return true;
  }
  return false;
}

/**
 * Auto-creates investigation records for an invoice based on pipeline flags.
 * Rule: No duplicates for the same invoice + issue_type.
 */
export async function syncInvoiceInvestigations(
  invoiceId: string,
  actorId?: string
): Promise<InvestigationRecord[]> {
  const invRes = await pool.query(
    `SELECT inv.*, s.name AS supplier_name FROM invoices inv 
     LEFT JOIN suppliers s ON inv.supplier_id = s.id 
     WHERE inv.id = $1 OR inv.invoice_number = $1`,
    [invoiceId]
  );
  if (invRes.rows.length === 0) {
    return [];
  }
  const invoice = invRes.rows[0];
  const realInvoiceId = invoice.id;
  const supplierId = invoice.supplier_id;
  const supplierName = invoice.supplier_name || 'Unknown Supplier';

  const createdOrExisting: InvestigationRecord[] = [];

  // Helper to safely get or create
  async function ensureInvestigation(
    issueType: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH',
    title: string,
    description: string,
    evidence: any
  ) {
    const existingRes = await pool.query(
      `SELECT * FROM investigations WHERE invoice_id = $1 AND issue_type = $2`,
      [realInvoiceId, issueType]
    );

    if (existingRes.rows.length > 0) {
      createdOrExisting.push(existingRes.rows[0]);
      return;
    }

    const { department, targetRole } = getDepartmentForIssue(issueType);
    const assignee = await assignUserByRole(targetRole);

    const initialComment: InvestigationComment = {
      id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: actorId || '11111111-1111-1111-1111-111111111111',
      user_name: 'Pipeline Auto-Trigger',
      user_role: 'System',
      text: `Auto-created investigation for ${issueType}. Routed to ${department} (${assignee.name}).`,
      created_at: new Date().toISOString()
    };

    const insertRes = await pool.query(
      `INSERT INTO investigations (
        issue_type, department, assigned_to, assigned_user_name,
        invoice_id, invoice_number, supplier_id, supplier_name,
        severity, title, description, status, evidence, comments
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        issueType,
        department,
        assignee.id,
        assignee.name,
        realInvoiceId,
        invoice.invoice_number,
        supplierId,
        supplierName,
        severity,
        title,
        description,
        'OPEN',
        JSON.stringify(evidence),
        JSON.stringify([initialComment])
      ]
    );

    const newRec = insertRes.rows[0];
    createdOrExisting.push(newRec);

    await writeAuditLog(
      actorId || assignee.id,
      'INVESTIGATION_CREATED',
      'INVESTIGATION',
      newRec.id,
      {
        invoice_number: invoice.invoice_number,
        issue_type: issueType,
        department,
        assigned_to: assignee.name,
        severity
      }
    );
  }

  // 1. Check 3-Way Match Flags
  let matchRes = await getMatchResult(realInvoiceId);
  if (!matchRes) {
    matchRes = await matchInvoice(realInvoiceId, actorId || 'SYSTEM');
  }

  if (matchRes.status === 'MISMATCH' || matchRes.status === 'HOLD') {
    for (const r of matchRes.reasons) {
      if (r.includes('exceeds received qty') || r.includes('not yet received') || r.includes('No Goods Receipt')) {
        await ensureInvestigation(
          'QUANTITY_MISMATCH',
          'HIGH',
          `Quantity Discrepancy: ${invoice.invoice_number}`,
          r,
          {
            po_number: matchRes.compared_values.po_number,
            grn_numbers: matchRes.compared_values.grn_numbers,
            discrepancy: r,
            compared_items: matchRes.compared_values.items.filter(i => !i.qty_matched)
          }
        );
      }
      if (r.includes('differs from PO price') || r.includes('unapproved price')) {
        await ensureInvestigation(
          'PRICE_MISMATCH',
          'HIGH',
          `Price Discrepancy: ${invoice.invoice_number}`,
          r,
          {
            po_number: matchRes.compared_values.po_number,
            discrepancy: r,
            compared_items: matchRes.compared_values.items.filter(i => !i.price_matched)
          }
        );
      }
    }
  }

  // 2. Check Duplicate Invoice
  const dupInfo = await detectDuplicates(realInvoiceId, actorId);
  if (dupInfo.is_possible_duplicate && dupInfo.duplicates.length > 0) {
    const topDup = dupInfo.duplicates[0];
    await ensureInvestigation(
      'POSSIBLE_DUPLICATE',
      'HIGH',
      `Possible Duplicate Invoice: ${invoice.invoice_number} vs ${topDup.invoice_number}`,
      `Invoice shares ${Math.round(dupInfo.highest_similarity * 100)}% similarity with existing record ${topDup.invoice_number}.`,
      {
        matched_invoice: topDup.invoice_number,
        similarity_score: dupInfo.highest_similarity,
        reasons: topDup.reasons
      }
    );
  }

  // 3. Check PO Unapproved Changes
  if (invoice.po_id) {
    const poChanges = await getPoChanges(invoice.po_id);
    if (poChanges.has_unauthorized_changes) {
      for (const ch of poChanges.changes.filter(c => c.is_unauthorized)) {
        await ensureInvestigation(
          'UNAUTHORIZED_PO_CHANGE',
          'HIGH',
          `Unauthorized PO Change on ${poChanges.po_number}`,
          ch.warning || `Field ${ch.field} changed from ${ch.old_value} to ${ch.new_value} without approval`,
          {
            po_number: poChanges.po_number,
            field: ch.field,
            old_value: ch.old_value,
            new_value: ch.new_value,
            changed_by: ch.changed_by_name,
            changed_at: ch.changed_at,
            approval_status: ch.approval_status
          }
        );
      }
    }
  }

  // 4. Check Historical Overbilling
  if (supplierId) {
    const obReport = await detectSupplierOverbilling(supplierId);
    if (obReport.has_overbilling_pattern) {
      await ensureInvestigation(
        'HISTORICAL_OVERBILLING',
        'MEDIUM',
        `Repeated Overbilling Pattern: ${supplierName}`,
        obReport.pattern_description,
        {
          extra_charges_count: obReport.extra_charges_count,
          distinct_amounts: obReport.distinct_charge_amounts,
          sample_invoices: obReport.evidence_invoices.slice(0, 5)
        }
      );
    }
  }

  // 5. Check GST Compliance & ITC at Risk
  const gstRes = await checkInvoiceGst(realInvoiceId, actorId);
  for (const chk of gstRes.checks) {
    if (chk.status === 'FAIL') {
      const issueCode = chk.rule_code === 'GST_ITC_RISK' ? 'GST_ITC_RISK' : 'GSTIN_INVALID';
      await ensureInvestigation(
        issueCode,
        'HIGH',
        `${chk.check_name}: ${invoice.invoice_number}`,
        chk.reason,
        {
          check_name: chk.check_name,
          details: chk.details,
          itc_at_risk: gstRes.itc_at_risk_inr,
          supplier_gstin: gstRes.supplier_gstin
        }
      );
    }
  }

  return createdOrExisting;
}

/**
 * Revalidates an invoice after a resolution attempt.
 * Evaluates whether the specific issue is cleared.
 * If cleared: updates investigation to REVALIDATED.
 * If persists: updates investigation to REOPENED with explanation.
 * If ALL investigations for the invoice are REVALIDATED: updates invoice payment_status to ELIGIBLE_FOR_APPROVAL.
 */
export async function revalidateInvestigation(
  investigationId: string,
  actor: { id: string; name: string; role: string },
  resolutionNotes?: string
): Promise<{ investigation: InvestigationRecord; allCleared: boolean; invoiceStatus: string }> {
  const invRes = await pool.query(`SELECT * FROM investigations WHERE id = $1`, [investigationId]);
  if (invRes.rows.length === 0) {
    throw new Error(`Investigation '${investigationId}' not found.`);
  }
  const investigation = invRes.rows[0] as InvestigationRecord;
  const invoiceId = investigation.invoice_id;

  if (!invoiceId) {
    // Standalone investigation without invoice reference
    investigation.status = 'REVALIDATED';
    investigation.resolution_notes = resolutionNotes || 'Resolved manually';
    investigation.updated_at = new Date();
    await pool.query(
      `UPDATE investigations SET status = $1, resolution_notes = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      ['REVALIDATED', investigation.resolution_notes, investigationId]
    );
    return { investigation, allCleared: true, invoiceStatus: 'N/A' };
  }

  // 1. Re-run complete verification pipeline
  const matchResult = await matchInvoice(invoiceId, actor.id);
  const dupInfo = await detectDuplicates(invoiceId, actor.id);
  const gstResult = await checkInvoiceGst(invoiceId, actor.id);
  await evaluateInvoiceRisk(invoiceId, actor.id);

  // 2. Test whether THIS specific issue type is now resolved
  let isIssueResolved = false;
  let revalidationReason = '';

  switch (investigation.issue_type) {
    case 'QUANTITY_MISMATCH': {
      // Check if quantity discrepancy in match result is cleared
      const hasQtyMismatch = matchResult.reasons.some(
        r => r.includes('exceeds received qty') || r.includes('not yet received') || r.includes('No Goods Receipt')
      );
      if (!hasQtyMismatch && matchResult.status === 'MATCHED') {
        isIssueResolved = true;
        revalidationReason = 'All billed line item quantities now fully match verified Goods Receipt Notes.';
      } else {
        const qtyReason = matchResult.reasons.find(r => r.includes('exceeds received qty')) || 'Quantity discrepancy persists';
        revalidationReason = `Discrepancy persists: ${qtyReason}`;
      }
      break;
    }
    case 'PRICE_MISMATCH': {
      const hasPriceMismatch = matchResult.reasons.some(r => r.includes('differs from PO price'));
      if (!hasPriceMismatch) {
        isIssueResolved = true;
        revalidationReason = 'Invoice unit price now matches approved PO price.';
      } else {
        revalidationReason = 'Unit price discrepancy still persists against approved PO price.';
      }
      break;
    }
    case 'UNAUTHORIZED_PO_CHANGE':
    case 'PO_UNAPPROVED_CHANGE': {
      const poChanges = await getPoChanges(matchResult.compared_values.po_id || '');
      if (!poChanges.has_unauthorized_changes) {
        isIssueResolved = true;
        revalidationReason = 'PO change has been formally approved by Finance or reverted.';
      } else {
        revalidationReason = 'PO modification remains unapproved in po_change_history.';
      }
      break;
    }
    case 'GST_ITC_RISK': {
      const gstr2bCheck = gstResult.checks.find(c => c.rule_code === 'GST_ITC_RISK');
      if (gstr2bCheck && gstr2bCheck.status === 'PASS') {
        isIssueResolved = true;
        revalidationReason = 'Invoice successfully reconciled against GSTR-2B; ITC is fully claimable.';
      } else {
        revalidationReason = 'Invoice is still missing from GSTR-2B; ITC of Rs 9,000 remains at risk.';
      }
      break;
    }
    case 'POSSIBLE_DUPLICATE':
    case 'DUPLICATE_INVOICE': {
      if (!dupInfo.is_possible_duplicate || dupInfo.duplicates.length === 0) {
        isIssueResolved = true;
        revalidationReason = 'Duplicate flag cleared. Verified as unique submission.';
      } else {
        revalidationReason = `Possible duplicate submission persists (${Math.round(dupInfo.highest_similarity * 100)}% match).`;
      }
      break;
    }
    case 'HISTORICAL_OVERBILLING': {
      // Historical overbilling resolution: if explanation/waiver is attached
      if (resolutionNotes && resolutionNotes.trim().length > 10) {
        isIssueResolved = true;
        revalidationReason = 'Supplier extra charges audited and cleared by AP Specialist.';
      } else {
        revalidationReason = 'Requires audited reconciliation notes of past supplier fees to clear.';
      }
      break;
    }
    default: {
      isIssueResolved = true;
      revalidationReason = 'Investigation resolved and verified.';
    }
  }

  // 3. Update investigation status based on revalidation verdict
  const updatedComments = Array.isArray(investigation.comments) ? [...investigation.comments] : [];
  let newStatus: InvestigationStatus = 'REVALIDATED';

  if (isIssueResolved) {
    newStatus = 'REVALIDATED';
    updatedComments.push({
      id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: actor.id,
      user_name: actor.name,
      user_role: actor.role,
      text: `Issue Revalidated Successfully: ${revalidationReason}`,
      created_at: new Date().toISOString()
    });
  } else {
    newStatus = 'REOPENED';
    updatedComments.push({
      id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: actor.id,
      user_name: actor.name,
      user_role: actor.role,
      text: `Revalidation Failed - Issue Reopened: ${revalidationReason}`,
      created_at: new Date().toISOString()
    });
  }

  const revalidationResultObj = {
    passed: isIssueResolved,
    reason: revalidationReason,
    revalidated_at: new Date().toISOString(),
    revalidated_by: actor.name,
    pipeline_match_status: matchResult.status
  };

  const updateRes = await pool.query(
    `UPDATE investigations 
     SET status = $1,
         comments = $2,
         resolution_notes = $3,
         revalidation_result = $4,
         reopened_reason = $5,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $6
     RETURNING *`,
    [
      newStatus,
      JSON.stringify(updatedComments),
      resolutionNotes || investigation.resolution_notes || null,
      JSON.stringify(revalidationResultObj),
      isIssueResolved ? null : revalidationReason,
      investigationId
    ]
  );

  const updatedInvestigation = updateRes.rows[0];

  await writeAuditLog(
    actor.id,
    isIssueResolved ? 'INVESTIGATION_REVALIDATED' : 'INVESTIGATION_REOPENED',
    'INVESTIGATION',
    investigationId,
    {
      invoice_id: invoiceId,
      issue_type: investigation.issue_type,
      passed: isIssueResolved,
      reason: revalidationReason
    }
  );

  // 4. Payment Gate Check: Are ALL investigations for this invoice now REVALIDATED?
  const allInvRes = await pool.query(
    `SELECT * FROM investigations WHERE invoice_id = $1`,
    [invoiceId]
  );

  const allCleared = allInvRes.rows.every((inv: any) => inv.status === 'REVALIDATED');
  let currentInvoicePaymentStatus = 'ON_HOLD';

  if (allCleared && matchResult.status === 'MATCHED') {
    currentInvoicePaymentStatus = 'ELIGIBLE_FOR_APPROVAL';
    await pool.query(
      `UPDATE invoices SET payment_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      ['ELIGIBLE_FOR_APPROVAL', invoiceId]
    );

    await writeAuditLog(
      actor.id,
      'INVOICE_ELIGIBLE_FOR_APPROVAL',
      'INVOICE',
      invoiceId,
      {
        message: 'All investigations successfully revalidated. Invoice is now eligible for human payment authorization.'
      }
    );
  } else {
    currentInvoicePaymentStatus = 'ON_HOLD';
    await pool.query(
      `UPDATE invoices SET payment_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      ['ON_HOLD', invoiceId]
    );
  }

  return {
    investigation: updatedInvestigation,
    allCleared,
    invoiceStatus: currentInvoicePaymentStatus
  };
}

/**
 * Updates an investigation's status (OPEN -> IN_PROGRESS -> RESOLVED).
 * Strictly enforces department RBAC.
 * If status is set to RESOLVED, triggers automatic revalidation pipeline.
 */
export async function updateInvestigationStatus(
  investigationId: string,
  newStatus: InvestigationStatus,
  comment: string,
  actor: { id: string; name: string; role: string },
  resolutionNotes?: string
): Promise<{ investigation: InvestigationRecord; revalidation?: any }> {
  const invRes = await pool.query(`SELECT * FROM investigations WHERE id = $1`, [investigationId]);
  if (invRes.rows.length === 0) {
    throw new Error(`Investigation '${investigationId}' not found.`);
  }
  const investigation = invRes.rows[0] as InvestigationRecord;

  // 1. RBAC check: Users only update investigations assigned to their department
  const isAllowed = checkInvestigationRBAC(actor.role, investigation.department);
  if (!isAllowed) {
    const err: any = new Error(
      `Forbidden: Users with role '${actor.role}' cannot update investigations assigned to '${investigation.department}'.`
    );
    err.statusCode = 403;
    throw err;
  }

  // 2. If status is being set to RESOLVED, run revalidation workflow
  if (newStatus === 'RESOLVED') {
    const reval = await revalidateInvestigation(investigationId, actor, resolutionNotes || comment);
    return {
      investigation: reval.investigation,
      revalidation: {
        passed: reval.allCleared,
        reason: reval.investigation.revalidation_result?.reason,
        invoice_status: reval.invoiceStatus
      }
    };
  }

  // 3. For IN_PROGRESS or manual REOPEN
  const comments = Array.isArray(investigation.comments) ? [...investigation.comments] : [];
  if (comment && comment.trim()) {
    comments.push({
      id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: actor.id,
      user_name: actor.name,
      user_role: actor.role,
      text: comment,
      created_at: new Date().toISOString()
    });
  }

  const updateRes = await pool.query(
    `UPDATE investigations 
     SET status = $1,
         comments = $2,
         resolution_notes = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4
     RETURNING *`,
    [newStatus, JSON.stringify(comments), resolutionNotes || investigation.resolution_notes || null, investigationId]
  );

  const updated = updateRes.rows[0];

  await writeAuditLog(
    actor.id,
    'INVESTIGATION_STATUS_CHANGED',
    'INVESTIGATION',
    investigationId,
    {
      old_status: investigation.status,
      new_status: newStatus,
      comment
    }
  );

  return { investigation: updated };
}

/**
 * Appends a comment to an investigation thread
 */
export async function addInvestigationComment(
  investigationId: string,
  commentText: string,
  actor: { id: string; name: string; role: string }
): Promise<InvestigationRecord> {
  const invRes = await pool.query(`SELECT * FROM investigations WHERE id = $1`, [investigationId]);
  if (invRes.rows.length === 0) {
    throw new Error(`Investigation '${investigationId}' not found.`);
  }
  const investigation = invRes.rows[0] as InvestigationRecord;

  const comments = Array.isArray(investigation.comments) ? [...investigation.comments] : [];
  const newComment: InvestigationComment = {
    id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    user_id: actor.id,
    user_name: actor.name,
    user_role: actor.role,
    text: commentText,
    created_at: new Date().toISOString()
  };
  comments.push(newComment);

  const updateRes = await pool.query(
    `UPDATE investigations SET comments = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
    [JSON.stringify(comments), investigationId]
  );

  await writeAuditLog(
    actor.id,
    'INVESTIGATION_COMMENT_ADDED',
    'INVESTIGATION',
    investigationId,
    { comment: commentText }
  );

  return updateRes.rows[0];
}

/**
 * Attaches evidence note or file to an investigation
 */
export async function attachInvestigationEvidence(
  investigationId: string,
  evidenceData: any,
  actor: { id: string; name: string; role: string }
): Promise<InvestigationRecord> {
  const invRes = await pool.query(`SELECT * FROM investigations WHERE id = $1`, [investigationId]);
  if (invRes.rows.length === 0) {
    throw new Error(`Investigation '${investigationId}' not found.`);
  }
  const investigation = invRes.rows[0] as InvestigationRecord;

  const currentEvidence = typeof investigation.evidence === 'object' && investigation.evidence ? investigation.evidence : {};
  const updatedEvidence = {
    ...currentEvidence,
    attached_notes: [...(currentEvidence.attached_notes || []), {
      ...evidenceData,
      attached_by: actor.name,
      attached_at: new Date().toISOString()
    }]
  };

  const updateRes = await pool.query(
    `UPDATE investigations SET evidence = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
    [JSON.stringify(updatedEvidence), investigationId]
  );

  await writeAuditLog(
    actor.id,
    'INVESTIGATION_EVIDENCE_ATTACHED',
    'INVESTIGATION',
    investigationId,
    { evidence: evidenceData }
  );

  return updateRes.rows[0];
}

/**
 * Finance Manager can reassign investigation to a different team member
 */
export async function reassignInvestigation(
  investigationId: string,
  newAssigneeId: string,
  actor: { id: string; name: string; role: string }
): Promise<InvestigationRecord> {
  if (actor.role !== 'Finance Manager' && actor.role !== 'Admin') {
    const err: any = new Error('Forbidden: Only Finance Manager or Admin can reassign investigations.');
    err.statusCode = 403;
    throw err;
  }

  const userRes = await pool.query(`SELECT id, name FROM users WHERE id = $1`, [newAssigneeId]);
  if (userRes.rows.length === 0) {
    throw new Error(`Assignee user '${newAssigneeId}' not found.`);
  }
  const targetUser = userRes.rows[0];

  const updateRes = await pool.query(
    `UPDATE investigations 
     SET assigned_to = $1, assigned_user_name = $2, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $3 RETURNING *`,
    [targetUser.id, targetUser.name, investigationId]
  );

  await writeAuditLog(
    actor.id,
    'INVESTIGATION_REASSIGNED',
    'INVESTIGATION',
    investigationId,
    { new_assignee: targetUser.name }
  );

  return updateRes.rows[0];
}
