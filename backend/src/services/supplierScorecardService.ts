import { pool } from '../db';
import { detectSupplierOverbilling } from './overbillingService';

export interface ScorecardMetric {
  key: string;
  name: string;
  category: string;
  score: number; // 0 to 100
  weight: number; // percentage weight, sums to 100
  weighted_score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  formula: string;
  inputs: Record<string, any>;
  description: string;
}

export interface SupplierScorecard {
  supplier_id: string;
  supplier_name: string;
  gstin: string;
  pan: string;
  overall_score: number; // 0 to 100
  overall_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  rating_label: string;
  metrics: ScorecardMetric[];
  summary: {
    total_invoices: number;
    matched_invoices: number;
    mismatched_invoices: number;
    total_po_quantity: number;
    total_grn_quantity: number;
    overbilling_charges_count: number;
    open_investigations_count: number;
    resolved_investigations_count: number;
  };
  evidence_invoices: Array<{
    id: string;
    invoice_number: string;
    invoice_date: string;
    total: number;
    status: string;
    match_status?: string;
    risk_level?: string;
  }>;
  disclaimer: string;
  computed_at: string;
}

function calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function getRatingLabel(grade: 'A' | 'B' | 'C' | 'D' | 'F'): string {
  switch (grade) {
    case 'A': return 'Excellent Performance';
    case 'B': return 'Good Performance';
    case 'C': return 'Satisfactory / Needs Attention';
    case 'D': return 'Underperforming / High Monitoring';
    case 'F': return 'Critical Performance Priority';
  }
}

/**
 * Computes a transparent, empirical Supplier Scorecard from real database records.
 * Wording: "performance score", NOT a fraud verdict (Golden Rule #3).
 */
export async function computeSupplierScorecard(supplierId: string): Promise<SupplierScorecard> {
  const supRes = await pool.query('SELECT * FROM suppliers WHERE id = $1 OR gstin = $1', [supplierId]);
  if (supRes.rows.length === 0) {
    throw new Error(`Supplier '${supplierId}' not found.`);
  }
  const supplier = supRes.rows[0];

  // 1. Fetch Invoices for this supplier
  const invRes = await pool.query(
    `SELECT inv.id, inv.invoice_number, inv.invoice_date, inv.total, inv.status, inv.payment_status, inv.risk_level, mr.status AS match_status
     FROM invoices inv
     LEFT JOIN match_results mr ON inv.id = mr.invoice_id
     WHERE inv.supplier_id = $1
     ORDER BY inv.created_at DESC`,
    [supplier.id]
  );
  const invoices = invRes.rows;
  const totalInvoices = invoices.length;
  const matchedInvoices = invoices.filter(
    (i: any) => i.status === 'MATCHED' || i.match_status === 'MATCHED' || i.payment_status === 'APPROVED'
  ).length;
  const mismatchedInvoices = invoices.filter(
    (i: any) => i.status === 'ON_HOLD' || i.match_status === 'MISMATCH'
  ).length;

  // 2. Fetch PO vs GRN quantities for this supplier
  const poRes = await pool.query(
    `SELECT pol.quantity AS po_qty, pol.total_price 
     FROM purchase_orders po
     JOIN po_lines pol ON po.id = pol.po_id
     WHERE po.supplier_id = $1`,
    [supplier.id]
  );
  const totalPoQty = poRes.rows.reduce((sum: number, r: any) => sum + (parseFloat(r.po_qty) || 0), 0);

  const grnRes = await pool.query(
    `SELECT grnl.quantity_received AS grn_qty
     FROM grns grn
     JOIN grn_lines grnl ON grn.id = grnl.grn_id
     JOIN purchase_orders po ON grn.po_id = po.id
     WHERE po.supplier_id = $1`,
    [supplier.id]
  );
  const totalGrnQty = grnRes.rows.reduce((sum: number, r: any) => sum + (parseFloat(r.grn_qty) || 0), 0);

  // 3. Overbilling / Recurring extra charges
  const overbilling = await detectSupplierOverbilling(supplier.id);
  const extraChargesCount = overbilling.extra_charges_count;
  const totalExtraAmount = overbilling.evidence_invoices.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

  // 4. Investigations linked to this supplier
  const invsRes = await pool.query(
    `SELECT id, status, issue_type, severity 
     FROM investigations 
     WHERE supplier_id = $1 OR invoice_id IN (SELECT id FROM invoices WHERE supplier_id = $1)`,
    [supplier.id]
  );
  const allInvestigations = invsRes.rows;
  const openInvestigations = allInvestigations.filter(
    (inv: any) => ['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(inv.status)
  ).length;
  const resolvedInvestigations = allInvestigations.filter(
    (inv: any) => ['RESOLVED', 'REVALIDATED', 'CLOSED'].includes(inv.status)
  ).length;

  // --------------------------------------------------------------------------
  // Compute the 6 Transparent Metrics
  // --------------------------------------------------------------------------

  // Metric 1: Invoice Accuracy (Weight: 25%)
  const invoiceAccuracyScore = totalInvoices > 0
    ? Math.round((matchedInvoices / totalInvoices) * 100)
    : 100;
  const metricInvoiceAccuracy: ScorecardMetric = {
    key: 'invoice_accuracy',
    name: 'Invoice Accuracy Rate',
    category: 'Billing Compliance',
    score: invoiceAccuracyScore,
    weight: 25,
    weighted_score: (invoiceAccuracyScore * 25) / 100,
    grade: calculateGrade(invoiceAccuracyScore),
    formula: '(matched_invoices / total_invoices) * 100',
    inputs: { total_invoices: totalInvoices, matched_invoices: matchedInvoices },
    description: 'Percentage of invoices successfully passing 3-way matching without quantity, price, or tax mismatch.'
  };

  // Metric 2: Delivery Consistency (Weight: 25%)
  const deliveryScore = totalPoQty > 0
    ? Math.min(100, Math.round((totalGrnQty / totalPoQty) * 100))
    : 100;
  const metricDelivery: ScorecardMetric = {
    key: 'delivery_consistency',
    name: 'Delivery Fulfillment Consistency',
    category: 'Operational Fulfillment',
    score: deliveryScore,
    weight: 25,
    weighted_score: (deliveryScore * 25) / 100,
    grade: calculateGrade(deliveryScore),
    formula: 'min(100, (total_received_qty / total_ordered_qty) * 100)',
    inputs: { total_ordered_qty: totalPoQty, total_received_qty: totalGrnQty },
    description: 'Proportion of contracted purchase order volume physically delivered and verified at warehouse receiving.'
  };

  // Metric 3: Repeated Errors & Surcharges (Weight: 15%)
  const surchargePenalty = Math.min(100, extraChargesCount * 10);
  const repeatedErrorsScore = Math.max(0, 100 - surchargePenalty);
  const metricRepeatedErrors: ScorecardMetric = {
    key: 'repeated_errors',
    name: 'Surcharge & Overbilling Control',
    category: 'Cost Integrity',
    score: repeatedErrorsScore,
    weight: 15,
    weighted_score: (repeatedErrorsScore * 15) / 100,
    grade: calculateGrade(repeatedErrorsScore),
    formula: 'max(0, 100 - (extra_charges_count * 10))',
    inputs: {
      extra_charges_count: extraChargesCount,
      total_extra_amount_inr: totalExtraAmount,
      charge_patterns: overbilling.distinct_charge_amounts.map((amt: number) => `Rs ${amt}`)
    },
    description: 'Absence of repetitive uncontracted freight, handling, and ancillary fee additions across billing history.'
  };

  // Metric 4: Discrepancy Frequency (Weight: 15%)
  const discrepancyScore = totalInvoices > 0
    ? Math.max(0, Math.round((1 - (mismatchedInvoices / totalInvoices)) * 100))
    : 100;
  const metricDiscrepancy: ScorecardMetric = {
    key: 'discrepancy_frequency',
    name: 'Discrepancy Avoidance Rate',
    category: 'Contract Adherence',
    score: discrepancyScore,
    weight: 15,
    weighted_score: (discrepancyScore * 15) / 100,
    grade: calculateGrade(discrepancyScore),
    formula: 'max(0, (1 - (mismatched_invoices / total_invoices)) * 100)',
    inputs: { total_invoices: totalInvoices, mismatched_invoices: mismatchedInvoices },
    description: 'Frequency of contract divergence involving unauthorized PO modifications or quantity variances.'
  };

  // Metric 5: Issue Resolution Rate (Weight: 10%)
  const totalIssues = allInvestigations.length;
  const resolutionScore = totalIssues > 0
    ? Math.round((resolvedInvestigations / totalIssues) * 100)
    : 100;
  const metricResolution: ScorecardMetric = {
    key: 'issue_resolution_time',
    name: 'Issue Resolution Closure',
    category: 'Vendor Responsiveness',
    score: resolutionScore,
    weight: 10,
    weighted_score: (resolutionScore * 10) / 100,
    grade: calculateGrade(resolutionScore),
    formula: 'total_issues === 0 ? 100 : (resolved_issues / total_issues) * 100',
    inputs: { open_issues: openInvestigations, resolved_issues: resolvedInvestigations, total_issues: totalIssues },
    description: 'Responsiveness in resolving warehouse counts, credit notes, or pricing clarifications.'
  };

  // Metric 6: GST Filing Status (Weight: 10%)
  const filingStatus = supplier.gst_filing_status || 'Active';
  const gstScore = filingStatus.toLowerCase() === 'active' ? 100 : filingStatus.toLowerCase() === 'late' ? 50 : 0;
  const metricGst: ScorecardMetric = {
    key: 'gst_filing_status',
    name: 'GST Regulatory Compliance',
    category: 'Tax & Regulatory',
    score: gstScore,
    weight: 10,
    weighted_score: (gstScore * 10) / 100,
    grade: calculateGrade(gstScore),
    formula: "filing_status === 'Active' ? 100 : filing_status === 'Late' ? 50 : 0",
    inputs: { filing_status: filingStatus },
    description: 'Timeliness and validity of statutory GSTR-1 filings enabling lawful Input Tax Credit (ITC) flow.'
  };

  const metrics: ScorecardMetric[] = [
    metricInvoiceAccuracy,
    metricDelivery,
    metricRepeatedErrors,
    metricDiscrepancy,
    metricResolution,
    metricGst
  ];

  // Overall Score (sum of weighted scores)
  const totalWeighted = metrics.reduce((sum, m) => sum + m.weighted_score, 0);
  const overallScore = Math.min(100, Math.max(0, Math.round(totalWeighted)));
  const overallGrade = calculateGrade(overallScore);
  const ratingLabel = getRatingLabel(overallGrade);

  return {
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    gstin: supplier.gstin,
    pan: supplier.pan,
    overall_score: overallScore,
    overall_grade: overallGrade,
    rating_label: ratingLabel,
    metrics,
    summary: {
      total_invoices: totalInvoices,
      matched_invoices: matchedInvoices,
      mismatched_invoices: mismatchedInvoices,
      total_po_quantity: totalPoQty,
      total_grn_quantity: totalGrnQty,
      overbilling_charges_count: extraChargesCount,
      open_investigations_count: openInvestigations,
      resolved_investigations_count: resolvedInvestigations
    },
    evidence_invoices: invoices.slice(0, 10).map((i: any) => ({
      id: i.id,
      invoice_number: i.invoice_number,
      invoice_date: i.invoice_date,
      total: parseFloat(i.total),
      status: i.status,
      match_status: i.match_status || null,
      risk_level: i.risk_level || null
    })),
    disclaimer: 'Performance score is an empirical operational indicator computed from ERP records. It is NOT a fraud verdict.',
    computed_at: new Date().toISOString()
  };
}

/**
 * Computes scorecards for all suppliers in the system
 */
export async function getAllSupplierScorecards(): Promise<SupplierScorecard[]> {
  const supRes = await pool.query('SELECT id FROM suppliers ORDER BY name ASC');
  const scorecards: SupplierScorecard[] = [];
  for (const row of supRes.rows) {
    const sc = await computeSupplierScorecard(row.id);
    scorecards.push(sc);
  }
  return scorecards;
}
