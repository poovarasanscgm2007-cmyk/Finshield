import { pool } from '../db';
import { writeAuditLog } from './auditService';

export interface ComparedLineItem {
  item_name: string;
  po_qty: number;
  po_unit_price: number;
  po_approved_price: number;
  grn_qty: number;
  invoice_qty: number;
  invoice_unit_price: number;
  qty_diff: number;
  price_diff: number;
  qty_matched: boolean;
  price_matched: boolean;
  tax_matched: boolean;
  discrepancies: string[];
}

export interface ComparedValues {
  po_id?: string;
  po_number?: string;
  grn_numbers: string[];
  items: ComparedLineItem[];
  po_total?: number;
  po_approved_total?: number;
  invoice_total: number;
  tolerances: {
    qty_tolerance_percent: number;
    price_tolerance_percent: number;
  };
  unapproved_po_change_detected?: boolean;
}

export interface MatchResult {
  id?: string;
  invoice_id: string;
  status: 'MATCHED' | 'MISMATCH' | 'HOLD';
  reasons: string[];
  compared_values: ComparedValues;
  created_at?: Date;
}

/**
 * Retrieves configurable tolerance thresholds from risk_rules_config
 */
async function getTolerances(): Promise<{ qtyTolerance: number; priceTolerance: number }> {
  let qtyTolerance = 0.02; // default 2%
  let priceTolerance = 0.02; // default 2%

  try {
    const res = await pool.query(
      `SELECT rule_code, threshold FROM risk_rules_config WHERE rule_code IN ('QTY_MISMATCH', 'PRICE_MISMATCH') AND is_active = TRUE`
    );
    for (const row of res.rows) {
      const val = parseFloat(row.threshold);
      if (!isNaN(val)) {
        if (row.rule_code === 'QTY_MISMATCH') {
          qtyTolerance = val / 100;
        } else if (row.rule_code === 'PRICE_MISMATCH') {
          priceTolerance = val / 100;
        }
      }
    }
  } catch (err) {
    console.warn('Could not read tolerance from risk_rules_config, using default 2%:', err);
  }

  return { qtyTolerance, priceTolerance };
}

/**
 * Determines the currently approved price for a PO, accounting for any unapproved modifications
 */
async function getApprovedPoPrices(poId: string, poLines: any[]): Promise<{
  approvedPrices: Map<string, number>;
  unapprovedChangeDetected: boolean;
}> {
  const approvedPrices = new Map<string, number>();
  let unapprovedChangeDetected = false;

  // Initialize with line item prices from PO
  for (const line of poLines) {
    approvedPrices.set(line.item_name, parseFloat(line.unit_price) || 0);
  }

  try {
    // Check PO change history for unapproved modifications
    const historyRes = await pool.query(
      `SELECT pch.*, a.status AS approval_status
       FROM po_change_history pch
       LEFT JOIN approvals a ON pch.approval_id = a.id
       WHERE pch.po_id = $1
       ORDER BY pch.changed_at DESC`,
      [poId]
    );

    for (const change of historyRes.rows) {
      if (change.field === 'unit_price') {
        // If change has no approval_id or approval status is not APPROVED, revert to old_value
        const isApproved = change.approval_status === 'APPROVED';
        if (!isApproved) {
          unapprovedChangeDetected = true;
          const revertedPrice = parseFloat(change.old_value);
          if (!isNaN(revertedPrice)) {
            // Apply reverted price to all lines (or matching line)
            for (const line of poLines) {
              approvedPrices.set(line.item_name, revertedPrice);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to query po_change_history for approved price:', err);
  }

  return { approvedPrices, unapprovedChangeDetected };
}

/**
 * 3-Way Matching Engine:
 * Compares Invoice against PO (approved price) and GRNs (summing multiple/partial deliveries).
 * Any MISMATCH sets the invoice to ON_HOLD.
 */
export async function matchInvoice(invoiceId: string, actorId: string): Promise<MatchResult> {
  // 1. Fetch Invoice
  const invRes = await pool.query(
    `SELECT inv.*, s.name AS supplier_name 
     FROM invoices inv 
     LEFT JOIN suppliers s ON inv.supplier_id = s.id 
     WHERE inv.id = $1 OR inv.invoice_number = $1`,
    [invoiceId]
  );

  if (invRes.rows.length === 0) {
    throw new Error(`Invoice '${invoiceId}' not found.`);
  }

  const invoice = invRes.rows[0];
  const realInvoiceId = invoice.id;

  // 2. Fetch Invoice Lines
  const invLinesRes = await pool.query(
    `SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY id ASC`,
    [realInvoiceId]
  );
  const invoiceLines = invLinesRes.rows;

  const reasons: string[] = [];
  let status: 'MATCHED' | 'MISMATCH' | 'HOLD' = 'MATCHED';

  // Check if invoice has PO reference
  if (!invoice.po_id) {
    reasons.push('Invoice has no associated Purchase Order (PO)');
    status = 'HOLD';

    const holdResult: MatchResult = {
      invoice_id: realInvoiceId,
      status,
      reasons,
      compared_values: {
        grn_numbers: [],
        items: [],
        invoice_total: parseFloat(invoice.total) || 0,
        tolerances: { qty_tolerance_percent: 2.0, price_tolerance_percent: 2.0 }
      }
    };

    await saveMatchResultAndAudit(realInvoiceId, holdResult, actorId);
    return holdResult;
  }

  // 3. Fetch PO and PO Lines
  const poRes = await pool.query(
    `SELECT * FROM purchase_orders WHERE id = $1`,
    [invoice.po_id]
  );
  if (poRes.rows.length === 0) {
    throw new Error(`Associated Purchase Order '${invoice.po_id}' not found.`);
  }
  const po = poRes.rows[0];

  const poLinesRes = await pool.query(
    `SELECT * FROM po_lines WHERE po_id = $1 ORDER BY id ASC`,
    [po.id]
  );
  const poLines = poLinesRes.rows;

  // 4. Determine Approved PO Price (reverting unapproved modifications)
  const { approvedPrices, unapprovedChangeDetected } = await getApprovedPoPrices(po.id, poLines);

  // 5. Fetch all GRNs for this PO and sum received quantities across deliveries
  const grnRes = await pool.query(
    `SELECT * FROM grns WHERE po_id = $1 ORDER BY received_date ASC`,
    [po.id]
  );
  const grns = grnRes.rows;
  const grnNumbers = grns.map((g: any) => g.grn_number);

  // Map of item_name -> total received quantity across all GRNs
  const grnReceivedTotals = new Map<string, number>();
  if (grns.length > 0) {
    const grnIds = grns.map((g: any) => g.id);
    for (const gid of grnIds) {
      const lines = await pool.query(
        `SELECT * FROM grn_lines WHERE grn_id = $1`,
        [gid]
      );
      for (const line of lines.rows) {
        const itemKey = line.item_name.trim().toLowerCase();
        const existing = grnReceivedTotals.get(itemKey) || 0;
        grnReceivedTotals.set(itemKey, existing + parseFloat(line.quantity_received));
      }
    }
  }

  // 6. Configurable Tolerances
  const { qtyTolerance, priceTolerance } = await getTolerances();

  // 7. Item-by-item comparison
  const comparedItems: ComparedLineItem[] = [];

  if (invoiceLines.length === 0) {
    // If no line items extracted, perform header-level check
    const poTotal = parseFloat(po.total_amount) || 0;
    const invTotal = parseFloat(invoice.total) || 0;
    const diff = Math.abs(invTotal - poTotal);
    if (diff / Math.max(poTotal, 1) > priceTolerance) {
      reasons.push(`Invoice total Rs ${invTotal} differs from PO total Rs ${poTotal}`);
      status = 'MISMATCH';
    }
  } else {
    for (const invLine of invoiceLines) {
      const invItemName = invLine.item_name || 'Unspecified Item';
      const invQty = parseFloat(invLine.quantity) || 0;
      const invUnitPrice = parseFloat(invLine.unit_price) || 0;
      const invTaxRate = parseFloat(invLine.tax_rate) || 18.00;

      // Find matching PO line
      const poLine = poLines.find((p: any) =>
        p.item_name.toLowerCase().includes(invItemName.toLowerCase()) ||
        invItemName.toLowerCase().includes(p.item_name.toLowerCase())
      ) || poLines[0]; // fallback to first line if single-line order

      const poQty = poLine ? parseFloat(poLine.quantity) || 0 : 0;
      const poListedPrice = poLine ? parseFloat(poLine.unit_price) || 0 : 0;
      const poApprovedPrice = poLine && approvedPrices.has(poLine.item_name)
        ? approvedPrices.get(poLine.item_name)!
        : poListedPrice;
      const poTaxRate = poLine ? parseFloat(poLine.tax_rate) || 18.00 : 18.00;

      // Find received quantity for this item
      const grnReceivedQty = poLine && grnReceivedTotals.has(poLine.item_name.trim().toLowerCase())
        ? grnReceivedTotals.get(poLine.item_name.trim().toLowerCase())!
        : (grns.length > 0 && grnReceivedTotals.size > 0 ? Array.from(grnReceivedTotals.values())[0] : 0);

      const itemDiscrepancies: string[] = [];

      // Check Quantity:
      // If no delivery received at all
      let qtyMatched = true;
      if (grns.length === 0 || grnReceivedQty === 0) {
        qtyMatched = false;
        itemDiscrepancies.push(`No goods receipt found: Pending delivery of ${invQty} units`);
        reasons.push(`Pending delivery: ${invQty} not yet received`);
        if (status === 'MATCHED') status = 'HOLD';
      } else {
        // Compare billed vs received
        const qtyDiff = invQty - grnReceivedQty;
        const qtyDiffRatio = qtyDiff / grnReceivedQty;

        if (qtyDiff > 0 && qtyDiffRatio > qtyTolerance) {
          qtyMatched = false;
          const msg = `Invoice qty ${invQty} exceeds received qty ${grnReceivedQty} by ${qtyDiff}`;
          itemDiscrepancies.push(msg);
          reasons.push(msg);
          status = 'MISMATCH';
        }

        // Check if there is pending delivery compared to PO
        if (grnReceivedQty < poQty) {
          const pendingQty = poQty - grnReceivedQty;
          reasons.push(`Pending delivery: ${pendingQty} not yet received`);
          if (status === 'MATCHED') {
            status = 'HOLD';
          }
        }
      }

      // Check Price against APPROVED PO price:
      let priceMatched = true;
      if (poApprovedPrice > 0) {
        const priceDiff = Math.abs(invUnitPrice - poApprovedPrice);
        const priceDiffRatio = priceDiff / poApprovedPrice;

        if (priceDiffRatio > priceTolerance) {
          priceMatched = false;
          const msg = `Invoice unit price ${invUnitPrice} differs from PO price ${poApprovedPrice}`;
          itemDiscrepancies.push(msg);
          reasons.push(msg);
          status = 'MISMATCH';
        }
      }

      // Check Tax rate
      let taxMatched = true;
      if (Math.abs(invTaxRate - poTaxRate) > 0.1) {
        taxMatched = false;
        const msg = `Invoice tax rate ${invTaxRate}% differs from PO tax rate ${poTaxRate}%`;
        itemDiscrepancies.push(msg);
        reasons.push(msg);
        status = 'MISMATCH';
      }

      comparedItems.push({
        item_name: invItemName,
        po_qty: poQty,
        po_unit_price: poListedPrice,
        po_approved_price: poApprovedPrice,
        grn_qty: grnReceivedQty,
        invoice_qty: invQty,
        invoice_unit_price: invUnitPrice,
        qty_diff: invQty - grnReceivedQty,
        price_diff: invUnitPrice - poApprovedPrice,
        qty_matched: qtyMatched,
        price_matched: priceMatched,
        tax_matched: taxMatched,
        discrepancies: itemDiscrepancies
      });
    }
  }

  // Deduplicate reasons
  const uniqueReasons = Array.from(new Set(reasons));

  const comparedValues: ComparedValues = {
    po_id: po.id,
    po_number: po.po_number,
    grn_numbers: grnNumbers,
    items: comparedItems,
    po_total: parseFloat(po.total_amount) || 0,
    po_approved_total: comparedItems.reduce((acc, it) => acc + (it.po_qty * it.po_approved_price), 0),
    invoice_total: parseFloat(invoice.total) || 0,
    tolerances: {
      qty_tolerance_percent: qtyTolerance * 100,
      price_tolerance_percent: priceTolerance * 100
    },
    unapproved_po_change_detected: unapprovedChangeDetected
  };

  const matchResult: MatchResult = {
    invoice_id: realInvoiceId,
    status,
    reasons: uniqueReasons,
    compared_values: comparedValues
  };

  await saveMatchResultAndAudit(realInvoiceId, matchResult, actorId);
  return matchResult;
}

/**
 * Saves match result to DB, enforces ON_HOLD on mismatch, and writes audit log.
 */
async function saveMatchResultAndAudit(
  invoiceId: string,
  result: MatchResult,
  actorId: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Enforce Golden Rule 2 & A.5:
    // Any MISMATCH sets the invoice to ON_HOLD. System never releases payment.
    if (result.status === 'MISMATCH' || result.status === 'HOLD') {
      await client.query(
        `UPDATE invoices SET status = 'ON_HOLD', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [invoiceId]
      );
    } else if (result.status === 'MATCHED') {
      // If currently VERIFIED or PENDING, update to MATCHED
      await client.query(
        `UPDATE invoices 
         SET status = 'MATCHED', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND status IN ('VERIFIED', 'PENDING')`,
        [invoiceId]
      );
    }

    // 2. Insert into match_results
    const insertRes = await client.query(
      `INSERT INTO match_results (invoice_id, status, reasons, compared_values, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING id, created_at`,
      [
        invoiceId,
        result.status,
        JSON.stringify(result.reasons),
        JSON.stringify(result.compared_values)
      ]
    );

    if (insertRes.rows.length > 0) {
      result.id = insertRes.rows[0].id;
      result.created_at = insertRes.rows[0].created_at;
    }

    // 3. Write hash-chained audit log
    await writeAuditLog(
      actorId,
      'INVOICE_MATCHED',
      'INVOICE',
      invoiceId,
      {
        status: result.status,
        reasons: result.reasons,
        po_number: result.compared_values.po_number,
        grn_numbers: result.compared_values.grn_numbers,
        item_count: result.compared_values.items.length
      }
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieves the latest 3-way match result for an invoice
 */
export async function getMatchResult(invoiceId: string): Promise<MatchResult | null> {
  const res = await pool.query(
    `SELECT * FROM match_results WHERE invoice_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [invoiceId]
  );

  if (res.rows.length === 0) {
    return null;
  }

  const row = res.rows[0];
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    status: row.status,
    reasons: typeof row.reasons === 'string' ? JSON.parse(row.reasons) : row.reasons || [],
    compared_values: typeof row.compared_values === 'string' ? JSON.parse(row.compared_values) : row.compared_values || {},
    created_at: row.created_at
  };
}
