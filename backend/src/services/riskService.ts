import { pool } from '../db';
import { matchInvoice, getMatchResult } from './matchingService';
import { detectDuplicates } from './duplicateService';
import { checkInvoiceGst } from './gstService';
import { getPoChanges } from './poChangeService';
import { detectSupplierOverbilling } from './overbillingService';
import { writeAuditLog } from './auditService';

export interface RiskReason {
  rule_code: string;
  rule_name: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  points: number;
  reason: string;
  evidence: any;
}

export interface InvoiceRiskAssessment {
  invoice_id: string;
  invoice_number: string;
  supplier_id: string;
  supplier_name: string;
  score: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  investigation_priority: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: RiskReason[];
  itc_at_risk_inr: number;
  evaluated_at: Date;
}

export interface SupplierRiskAssessment {
  supplier_id: string;
  supplier_name: string;
  score: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  investigation_priority: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: RiskReason[];
  total_invoices_count: number;
  high_risk_invoices_count: number;
  total_itc_at_risk_inr: number;
  evaluated_at: Date;
}

/**
 * Retrieves rule weights and thresholds from risk_rules_config
 */
export async function getRiskRulesConfig(): Promise<Map<string, { weight: number; threshold: number; name: string }>> {
  const map = new Map<string, { weight: number; threshold: number; name: string }>();

  // Default fallback weights
  const defaults: Record<string, { weight: number; threshold: number; name: string }> = {
    QTY_MISMATCH: { weight: 30.00, threshold: 2.00, name: 'Quantity Discrepancy' },
    PRICE_MISMATCH: { weight: 25.00, threshold: 2.00, name: 'Price Variance' },
    PO_UNAPPROVED_CHANGE: { weight: 35.00, threshold: 1.00, name: 'Unapproved PO Modification' },
    DUPLICATE_INVOICE: { weight: 40.00, threshold: 85.00, name: 'Duplicate Invoice Detection' },
    HISTORICAL_OVERBILLING: { weight: 20.00, threshold: 3.00, name: 'Supplier Repeated Surcharges' },
    GST_ITC_RISK: { weight: 30.00, threshold: 0.00, name: 'Missing in GSTR-2B (ITC at Risk)' },
    GSTIN_INVALID: { weight: 50.00, threshold: 1.00, name: 'GSTIN Format / Checksum Mismatch' },
    SUPPLIER_GST_FILING: { weight: 20.00, threshold: 1.00, name: 'Supplier GST Non-Filing' },
    SHARED_BANK_ACCOUNT: { weight: 25.00, threshold: 1.00, name: 'Shared Bank Account Graph' }
  };

  try {
    const res = await pool.query(`SELECT * FROM risk_rules_config WHERE is_active = TRUE`);
    for (const row of res.rows) {
      map.set(row.rule_code, {
        weight: parseFloat(row.weight) || 20,
        threshold: parseFloat(row.threshold) || 1,
        name: row.rule_name || row.rule_code
      });
    }
  } catch (err) {
    console.warn('Could not read risk_rules_config, using defaults:', err);
  }

  // Backfill any missing with defaults
  for (const [code, val] of Object.entries(defaults)) {
    if (!map.has(code)) {
      map.set(code, val);
    }
  }

  return map;
}

/**
 * Explainable Risk Engine:
 * Combines 3-way matching, duplicate detection, GST/ITC compliance, PO changes, and historical overbilling
 * into a deterministic 0-100 score with granular reasons and evidence citations.
 * Golden Rule 3: Mapped to "Investigation priority", NEVER "fraud confirmed".
 */
export async function evaluateInvoiceRisk(
  invoiceId: string,
  actorId?: string
): Promise<InvoiceRiskAssessment> {
  // 1. Fetch Invoice
  const invRes = await pool.query(
    `SELECT inv.*, s.name AS supplier_name, s.gstin AS supplier_gstin 
     FROM invoices inv
     LEFT JOIN suppliers s ON inv.supplier_id = s.id
     WHERE inv.id = $1 OR inv.invoice_number = $1`,
    [invoiceId]
  );

  if (invRes.rows.length === 0) {
    throw new Error(`Invoice '${invoiceId}' not found for risk evaluation.`);
  }

  const invoice = invRes.rows[0];
  const realInvoiceId = invoice.id;
  const supplierId = invoice.supplier_id;
  const supplierName = invoice.supplier_name || 'Unknown Supplier';

  const rulesConfig = await getRiskRulesConfig();
  const reasons: RiskReason[] = [];

  // ---------------------------------------------------------------------------
  // Indicator 1: 3-Way Matching (Quantity & Price Discrepancies)
  // ---------------------------------------------------------------------------
  let matchResult = await getMatchResult(realInvoiceId);
  if (!matchResult) {
    matchResult = await matchInvoice(realInvoiceId, actorId || 'SYSTEM');
  }

  if (matchResult.status === 'MISMATCH' || matchResult.status === 'HOLD') {
    const qtyRule = rulesConfig.get('QTY_MISMATCH')!;
    const priceRule = rulesConfig.get('PRICE_MISMATCH')!;

    for (const r of matchResult.reasons) {
      if (r.includes('exceeds received qty') || r.includes('not yet received') || r.includes('No Goods Receipt')) {
        reasons.push({
          rule_code: 'QTY_MISMATCH',
          rule_name: qtyRule.name,
          severity: 'HIGH',
          points: qtyRule.weight,
          reason: r,
          evidence: {
            po_number: matchResult.compared_values.po_number,
            grn_numbers: matchResult.compared_values.grn_numbers,
            items: matchResult.compared_values.items.filter((i) => !i.qty_matched)
          }
        });
      } else if (r.includes('differs from PO price')) {
        reasons.push({
          rule_code: 'PRICE_MISMATCH',
          rule_name: priceRule.name,
          severity: 'HIGH',
          points: priceRule.weight,
          reason: r,
          evidence: {
            po_number: matchResult.compared_values.po_number,
            items: matchResult.compared_values.items.filter((i) => !i.price_matched)
          }
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Indicator 2: Duplicate Invoice Detection
  // ---------------------------------------------------------------------------
  const dupResult = await detectDuplicates(realInvoiceId, actorId);
  if (dupResult.is_possible_duplicate && dupResult.duplicates.length > 0) {
    const dupRule = rulesConfig.get('DUPLICATE_INVOICE')!;
    const topDup = dupResult.duplicates[0];
    reasons.push({
      rule_code: 'DUPLICATE_INVOICE',
      rule_name: dupRule.name,
      severity: 'HIGH',
      points: dupRule.weight,
      reason: `Possible duplicate invoice submission (Similarity: ${Math.round(dupResult.highest_similarity * 100)}% vs ${topDup.invoice_number})`,
      evidence: {
        matched_invoice: topDup.invoice_number,
        similarity_score: dupResult.highest_similarity,
        reasons: topDup.reasons
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Indicator 3: GST & ITC Compliance Checks
  // ---------------------------------------------------------------------------
  const gstResult = await checkInvoiceGst(realInvoiceId, actorId);
  for (const c of gstResult.checks) {
    if (c.status === 'FAIL') {
      const rule = rulesConfig.get(c.rule_code) || { weight: 25, name: c.check_name };
      reasons.push({
        rule_code: c.rule_code,
        rule_name: rule.name,
        severity: c.rule_code === 'GST_ITC_RISK' || c.rule_code === 'GSTIN_INVALID' ? 'HIGH' : 'MEDIUM',
        points: rule.weight,
        reason: c.reason,
        evidence: c.details
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Indicator 4: PO Change Monitoring (Unauthorized Modifications)
  // ---------------------------------------------------------------------------
  if (invoice.po_id) {
    const poReport = await getPoChanges(invoice.po_id);
    if (poReport.has_unauthorized_changes) {
      const poRule = rulesConfig.get('PO_UNAPPROVED_CHANGE')!;
      for (const ch of poReport.changes.filter((c) => c.is_unauthorized)) {
        reasons.push({
          rule_code: 'PO_UNAPPROVED_CHANGE',
          rule_name: poRule.name,
          severity: 'HIGH',
          points: poRule.weight,
          reason: ch.warning || `Unauthorized modification to PO ${poReport.po_number}: ${ch.field} changed from ${ch.old_value} to ${ch.new_value}`,
          evidence: {
            po_number: poReport.po_number,
            field: ch.field,
            old_value: ch.old_value,
            new_value: ch.new_value,
            changed_by: ch.changed_by_name,
            changed_at: ch.changed_at,
            approval_status: ch.approval_status
          }
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Indicator 5: Historical Overbilling (Repeated Extra Charges)
  // ---------------------------------------------------------------------------
  if (supplierId) {
    const obReport = await detectSupplierOverbilling(supplierId);
    if (obReport.has_overbilling_pattern) {
      const obRule = rulesConfig.get('HISTORICAL_OVERBILLING')!;
      reasons.push({
        rule_code: 'HISTORICAL_OVERBILLING',
        rule_name: obRule.name,
        severity: 'MEDIUM',
        points: obRule.weight,
        reason: obReport.pattern_description,
        evidence: {
          extra_charges_count: obReport.extra_charges_count,
          distinct_amounts: obReport.distinct_charge_amounts,
          sample_invoices: obReport.evidence_invoices.slice(0, 5)
        }
      });
    }
  }

  // Deduplicate reasons by rule_code
  const uniqueReasonsMap = new Map<string, RiskReason>();
  for (const r of reasons) {
    if (!uniqueReasonsMap.has(r.rule_code)) {
      uniqueReasonsMap.set(r.rule_code, r);
    }
  }
  const uniqueReasons = Array.from(uniqueReasonsMap.values());

  // Calculate cumulative score capped at 100
  const rawSum = uniqueReasons.reduce((acc, curr) => acc + curr.points, 0);
  const finalScore = Math.min(100, Math.round(rawSum));

  // Map to LOW, MEDIUM, HIGH investigation priority
  let level: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (finalScore >= 70) {
    level = 'HIGH';
  } else if (finalScore >= 31) {
    level = 'MEDIUM';
  }

  const assessment: InvoiceRiskAssessment = {
    invoice_id: realInvoiceId,
    invoice_number: invoice.invoice_number,
    supplier_id: supplierId,
    supplier_name: supplierName,
    score: finalScore,
    level,
    investigation_priority: level,
    reasons: uniqueReasons,
    itc_at_risk_inr: gstResult.itc_at_risk_inr,
    evaluated_at: new Date()
  };

  // Persist assessment into database
  try {
    // 1. Update invoice risk metrics
    await pool.query(
      `UPDATE invoices 
       SET risk_score = $1,
           risk_level = $2,
           itc_at_risk = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [finalScore, level, gstResult.itc_at_risk_inr, realInvoiceId]
    );

    // 2. Clear old risk_flags for this invoice and insert new ones
    await pool.query(
      `DELETE FROM risk_flags WHERE entity_type = 'INVOICE' AND entity_id = $1`,
      [realInvoiceId]
    );

    for (const r of uniqueReasons) {
      await pool.query(
        `INSERT INTO risk_flags (entity_type, entity_id, rule_code, severity, reason, score, evidence, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [
          'INVOICE',
          realInvoiceId,
          r.rule_code,
          r.severity,
          r.reason,
          r.points,
          JSON.stringify(r.evidence)
        ]
      );
    }

    // 3. Write immutable hash-chained audit log
    if (actorId) {
      await writeAuditLog(
        actorId,
        'RISK_EVALUATED',
        'INVOICE',
        realInvoiceId,
        {
          score: finalScore,
          investigation_priority: level,
          reasons_count: uniqueReasons.length,
          itc_at_risk_inr: gstResult.itc_at_risk_inr
        }
      );
    }
  } catch (err) {
    console.warn('Failed to persist risk flags to database:', err);
  }

  return assessment;
}

/**
 * Evaluates composite risk score for a supplier across all invoices and compliance indicators
 */
export async function evaluateSupplierRisk(supplierIdOrName: string, _actorId?: string): Promise<SupplierRiskAssessment> {
  const supRes = await pool.query(
    `SELECT * FROM suppliers WHERE id = $1 OR name ILIKE $1 LIMIT 1`,
    [supplierIdOrName]
  );

  if (supRes.rows.length === 0) {
    throw new Error(`Supplier '${supplierIdOrName}' not found.`);
  }

  const supplier = supRes.rows[0];

  // Fetch all invoices for supplier
  const invRes = await pool.query(
    `SELECT id, invoice_number, risk_score, risk_level, itc_at_risk 
     FROM invoices 
     WHERE supplier_id = $1`,
    [supplier.id]
  );
  const invoices = invRes.rows;

  const totalInvoices = invoices.length;
  const highRiskInvoices = invoices.filter((i: any) => i.risk_level === 'HIGH' || (i.risk_score && parseFloat(i.risk_score) >= 70)).length;
  const totalItcAtRisk = invoices.reduce((acc: number, curr: any) => acc + (parseFloat(curr.itc_at_risk) || 0), 0);

  // Overbilling check
  const obReport = await detectSupplierOverbilling(supplier.id);

  const reasons: RiskReason[] = [];
  let scoreSum = 0;

  if (obReport.has_overbilling_pattern) {
    reasons.push({
      rule_code: 'HISTORICAL_OVERBILLING',
      rule_name: 'Supplier Repeated Surcharges',
      severity: 'HIGH',
      points: 25,
      reason: obReport.pattern_description,
      evidence: { count: obReport.extra_charges_count }
    });
    scoreSum += 25;
  }

  if (totalItcAtRisk > 0) {
    reasons.push({
      rule_code: 'GST_ITC_RISK',
      rule_name: 'Supplier Missing GSTR-1 Filings',
      severity: 'HIGH',
      points: 30,
      reason: `Supplier has total Rs ${totalItcAtRisk.toLocaleString('en-IN')} Input Tax Credit at risk due to non-filing in GSTR-2B`,
      evidence: { itc_at_risk_inr: totalItcAtRisk }
    });
    scoreSum += 30;
  }

  if (highRiskInvoices > 0) {
    reasons.push({
      rule_code: 'HIGH_RISK_INVOICES',
      rule_name: 'High Investigation Priority Invoices',
      severity: 'HIGH',
      points: Math.min(45, highRiskInvoices * 25),
      reason: `${highRiskInvoices} invoice(s) flagged with HIGH investigation priority`,
      evidence: { highRiskCount: highRiskInvoices }
    });
    scoreSum += Math.min(45, highRiskInvoices * 25);
  }

  const finalScore = Math.min(100, scoreSum);
  const level: 'LOW' | 'MEDIUM' | 'HIGH' = finalScore >= 70 ? 'HIGH' : finalScore >= 31 ? 'MEDIUM' : 'LOW';

  // Update supplier in database
  try {
    await pool.query(
      `UPDATE suppliers SET risk_score = $1, risk_level = $2 WHERE id = $3`,
      [finalScore, level, supplier.id]
    );
  } catch (err) {
    console.warn('Failed to update supplier risk score:', err);
  }

  return {
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    score: finalScore,
    level,
    investigation_priority: level,
    reasons,
    total_invoices_count: totalInvoices,
    high_risk_invoices_count: highRiskInvoices,
    total_itc_at_risk_inr: totalItcAtRisk,
    evaluated_at: new Date()
  };
}

/**
 * Returns all HIGH risk invoices and suppliers
 */
export async function getHighRiskItems(): Promise<{
  invoices: any[];
  suppliers: any[];
  total_itc_at_risk_inr: number;
}> {
  const invRes = await pool.query(
    `SELECT 
       inv.id,
       inv.invoice_number,
       inv.normalized_invoice_number,
       inv.total,
       inv.status,
       inv.risk_score,
       inv.risk_level,
       inv.itc_at_risk,
       s.id AS supplier_id,
       s.name AS supplier_name,
       po.po_number
     FROM invoices inv
     LEFT JOIN suppliers s ON inv.supplier_id = s.id
     LEFT JOIN purchase_orders po ON inv.po_id = po.id
     WHERE inv.risk_level = 'HIGH' OR inv.risk_score >= 70
     ORDER BY inv.risk_score DESC`
  );

  const supRes = await pool.query(
    `SELECT id, name, gstin, risk_score, risk_level, gst_filing_status 
     FROM suppliers 
     WHERE risk_level = 'HIGH' OR risk_score >= 70
     ORDER BY risk_score DESC`
  );

  const totalItcRes = await pool.query(
    `SELECT COALESCE(SUM(itc_at_risk), 0) AS total_itc FROM invoices`
  );

  const totalItc = parseFloat(totalItcRes.rows[0]?.total_itc) || 0;

  return {
    invoices: invRes.rows,
    suppliers: supRes.rows,
    total_itc_at_risk_inr: totalItc
  };
}
