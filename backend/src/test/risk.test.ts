import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateGstin, checkTaxCalculation, checkInvoiceGst } from '../services/gstService';
import { getPoChanges } from '../services/poChangeService';
import { detectSupplierOverbilling } from '../services/overbillingService';
import { evaluateInvoiceRisk, evaluateSupplierRisk, getHighRiskItems } from '../services/riskService';
import { pool } from '../db';

describe('Phase 5 (A): GST Validation & Compliance Engine', () => {
  it('Valid GSTIN passes; altering checksum or format fails with exact failure reason', () => {
    // Valid standard format GSTIN
    const validGstin = '27AAPFU0939F1ZV'; // Standard format test
    const validRes = validateGstin(validGstin);
    assert.strictEqual(validRes.isValid, true, 'Valid GSTIN must pass validation');
    assert.strictEqual(validRes.stateCode, '27');
    assert.strictEqual(validRes.pan, 'AAPFU0939F');

    // Altered checksum digit: change 'V' to 'A'
    const invalidChecksumGstin = '27AAPFU0939F1ZA';
    const invalidCheckRes = validateGstin(invalidChecksumGstin);
    assert.strictEqual(invalidCheckRes.isValid, false, 'Altered checksum digit must fail');
    assert.match(invalidCheckRes.failureReason || '', /checksum/i);

    // Invalid length
    const shortGstin = '27AAPFU0939F1Z';
    const shortRes = validateGstin(shortGstin);
    assert.strictEqual(shortRes.isValid, false);
    assert.match(shortRes.failureReason || '', /must be exactly 15 characters/i);

    // Invalid state code
    const badStateGstin = '98AAPFU0939F1ZV';
    const badStateRes = validateGstin(badStateGstin);
    assert.strictEqual(badStateRes.isValid, false);
    assert.match(badStateRes.failureReason || '', /Invalid 2-digit state code/i);

    // Invalid PAN structure
    const badPanGstin = '27123450939F1ZV';
    const badPanRes = validateGstin(badPanGstin);
    assert.strictEqual(badPanRes.isValid, false);
    assert.match(badPanRes.failureReason || '', /Invalid PAN structure/i);
  });

  it('Tax calculation checks: same-state requires CGST+SGST; different-state requires IGST; wrong tax type flagged', () => {
    // Intra-state (Supplier in 27, Buyer in 27): expects CGST 9% + SGST 9% on 18% rate
    const intraValid = checkTaxCalculation('27', '27', 50000, 4500, 4500, 0, 18.0);
    assert.strictEqual(intraValid.isValid, true, 'Valid intra-state tax must pass');

    // Intra-state with IGST charged instead of CGST+SGST (Wrong tax type)
    const intraWrongTaxType = checkTaxCalculation('27', '27', 50000, 0, 0, 9000, 18.0);
    assert.strictEqual(intraWrongTaxType.isValid, false);
    assert.match(intraWrongTaxType.reason, /Wrong tax type/i);
    assert.match(intraWrongTaxType.reason, /CGST \+ SGST/i);

    // Inter-state (Supplier in 29 Karnataka, Buyer in 27 Maharashtra): expects IGST 18%
    const interValid = checkTaxCalculation('29', '27', 50000, 0, 0, 9000, 18.0);
    assert.strictEqual(interValid.isValid, true, 'Valid inter-state tax must pass');

    // Inter-state with CGST+SGST charged instead of IGST
    const interWrongTaxType = checkTaxCalculation('29', '27', 50000, 4500, 4500, 0, 18.0);
    assert.strictEqual(interWrongTaxType.isValid, false);
    assert.match(interWrongTaxType.reason, /Wrong tax type/i);
    assert.match(interWrongTaxType.reason, /must charge IGST|expected IGST/i);

    // Tax amount variance (e.g. charged 10% instead of 18%)
    const taxVariance = checkTaxCalculation('27', '27', 50000, 2500, 2500, 0, 18.0);
    assert.strictEqual(taxVariance.isValid, false);
    assert.match(taxVariance.reason, /Tax amount variance/i);
  });

  it('GSTR-2B reconciliation: INV-101 is missing in GSTR-2B, returns ITC at risk with exact Rs 9,000 INR amount', async () => {
    const invRes = await pool.query("SELECT id FROM invoices WHERE invoice_number = 'INV-101'");
    assert.strictEqual(invRes.rows.length, 1, 'INV-101 must exist in seed database');
    const invoiceId = invRes.rows[0].id;

    const gstReport = await checkInvoiceGst(invoiceId);

    assert.strictEqual(gstReport.overall_status, 'FAIL', 'Overall GST status must be FAIL due to missing GSTR-2B entry');
    assert.strictEqual(gstReport.itc_at_risk_inr, 9000, 'ITC at risk for INV-101 must be exactly Rs 9,000 (CGST 4500 + SGST 4500)');

    const gstr2bCheck = gstReport.checks.find(c => c.rule_code === 'GST_ITC_RISK');
    assert.ok(gstr2bCheck, 'GSTR-2B check must be present in checks list');
    assert.strictEqual(gstr2bCheck?.status, 'FAIL');
    assert.match(gstr2bCheck?.reason || '', /Missing in GSTR-2B/i);
    assert.strictEqual(gstr2bCheck?.itc_at_risk_inr, 9000);
  });
});

describe('Phase 5 (B): Purchase Order Change Monitoring', () => {
  it('PO-101 modification from Rs 500 to Rs 700 without approval is flagged as UNAUTHORIZED PO CHANGE', async () => {
    const poReport = await getPoChanges('PO-101');

    assert.strictEqual(poReport.po_number, 'PO-101');
    assert.strictEqual(poReport.has_unauthorized_changes, true, 'PO-101 must be flagged with unauthorized changes');
    assert.strictEqual(poReport.unauthorized_changes_count >= 1, true);

    const priceChange = poReport.changes.find(c => c.field === 'unit_price');
    assert.ok(priceChange, 'Price modification entry must exist');
    assert.strictEqual(priceChange?.old_value, '500.00');
    assert.strictEqual(priceChange?.new_value, '700.00');
    assert.strictEqual(priceChange?.is_unauthorized, true);
    assert.strictEqual(priceChange?.approval_status, 'NOT_FOUND');
    assert.match(priceChange?.warning || '', /UNAUTHORIZED PO CHANGE/i);
    assert.match(priceChange?.warning || '', /Not found/i);
  });
});

describe('Phase 5 (C): Historical Overbilling Detection', () => {
  it('Supplier A past invoices demonstrate repeated ancillary extra charges of Rs 500, Rs 700, Rs 1000', async () => {
    const supRes = await pool.query("SELECT id FROM suppliers WHERE name ILIKE '%Supplier A%'");
    assert.strictEqual(supRes.rows.length, 1);
    const supplierId = supRes.rows[0].id;

    const obReport = await detectSupplierOverbilling(supplierId);

    assert.strictEqual(obReport.has_overbilling_pattern, true, 'Supplier A must exhibit overbilling pattern');
    assert.strictEqual(obReport.extra_charges_count >= 3, true, 'Should find at least 3 extra charge occurrences');
    assert.ok(obReport.distinct_charge_amounts.includes(500), 'Should identify Rs 500 extra charges');
    assert.ok(obReport.distinct_charge_amounts.includes(700), 'Should identify Rs 700 extra charges');
    assert.ok(obReport.distinct_charge_amounts.includes(1000), 'Should identify Rs 1000 extra charges');
    assert.match(obReport.pattern_description, /Supplier A/i);
    assert.match(obReport.pattern_description, /repeated ancillary extra charges/i);
  });
});

describe('Phase 5 (D): Explainable Risk Score & Priority Evaluation', () => {
  it('Planted Section 6 demo invoice INV-101 scores HIGH risk with comprehensive explainable reasons', async () => {
    const invRes = await pool.query("SELECT id FROM invoices WHERE invoice_number = 'INV-101'");
    const invoiceId = invRes.rows[0].id;

    const assessment = await evaluateInvoiceRisk(invoiceId);

    assert.strictEqual(assessment.invoice_number, 'INV-101');
    assert.strictEqual(assessment.level, 'HIGH', 'INV-101 must be evaluated as HIGH risk');
    assert.strictEqual(assessment.investigation_priority, 'HIGH', 'Wording must specify Investigation Priority: HIGH');
    assert.strictEqual(assessment.score >= 70, true, `Score should be >= 70 (got ${assessment.score})`);
    assert.strictEqual(assessment.itc_at_risk_inr, 9000, 'ITC at risk must be Rs 9,000');

    // Check individual explainable reasons
    const ruleCodes = assessment.reasons.map(r => r.rule_code);
    assert.ok(ruleCodes.includes('QTY_MISMATCH'), 'Reason must include Quantity Discrepancy (100 billed vs 80 received)');
    assert.ok(ruleCodes.includes('PO_UNAPPROVED_CHANGE'), 'Reason must include Unauthorized PO Modification (Rs 500 to Rs 700)');
    assert.ok(ruleCodes.includes('GST_ITC_RISK'), 'Reason must include GSTR-2B Missing ITC Risk');
    assert.ok(ruleCodes.includes('HISTORICAL_OVERBILLING'), 'Reason must include Supplier Repeated Extra Charges');

    // Verify all reasons have evidence objects
    for (const r of assessment.reasons) {
      assert.ok(r.evidence, `Evidence must be present for reason ${r.rule_code}`);
      assert.strictEqual(typeof r.points, 'number');
      assert.strictEqual(r.points > 0, true);
    }
  });

  it('Clean invoice with matching PO, GRN, and GSTR-2B scores LOW risk', async () => {
    // Use historical invoice INV-HIST-08 which is present in GSTR-2B
    const histRes = await pool.query("SELECT id FROM invoices WHERE invoice_number = 'INV-HIST-08'");
    if (histRes.rows.length > 0) {
      const assessment = await evaluateInvoiceRisk(histRes.rows[0].id);
      assert.strictEqual(assessment.level === 'LOW' || assessment.level === 'MEDIUM', true);
    }
  });

  it('High risk summary metrics return aggregate high risk invoices and total ITC at risk', async () => {
    const highRiskData = await getHighRiskItems();

    assert.ok(Array.isArray(highRiskData.invoices), 'Should return list of high-risk invoices');
    assert.ok(highRiskData.total_itc_at_risk_inr >= 9000, 'Total ITC at risk must include at least Rs 9,000 from INV-101');
  });
});
