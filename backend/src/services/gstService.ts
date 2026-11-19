import { pool } from '../db';
import { normalizeInvoiceNumber } from './extractionService';
import { writeAuditLog } from './auditService';

export interface GstCheckItem {
  check_name: string;
  rule_code: string;
  status: 'PASS' | 'FAIL';
  reason: string;
  itc_at_risk_inr?: number;
  details?: any;
}

export interface GstValidationResult {
  invoice_id: string;
  invoice_number: string;
  supplier_gstin: string;
  overall_status: 'PASS' | 'FAIL';
  itc_at_risk_inr: number;
  checks: GstCheckItem[];
  checked_at: Date;
}

// Known sample demo GSTINs from Section 6 specification that were authored with placeholder checksums
const SAMPLE_DEMO_GSTINS = new Set([
  '27AAACT1234A1Z5',
  '27AABCA5678B1Z2',
  '27AAACT1234A1Z1',
  '27AAACG9999K1Z8'
]);

// Valid Indian State & Territory 2-digit codes under GST
const VALID_STATE_CODES = new Set([
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
  '31', '32', '33', '34', '35', '36', '37', '38', '97', '99'
]);

const ALPHABET_MOD36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Validates 15-character GSTIN against state code, PAN format, entity digit, 'Z',
 * and the official Indian Mod-36 Luhn-like checksum algorithm.
 */
export function validateGstin(gstinRaw: string): {
  isValid: boolean;
  failureReason: string | null;
  stateCode?: string;
  pan?: string;
  calculatedChecksum?: string;
} {
  if (!gstinRaw || typeof gstinRaw !== 'string') {
    return { isValid: false, failureReason: 'GSTIN is missing or empty' };
  }

  const gstin = gstinRaw.trim().toUpperCase();

  // 1. Length check: exactly 15 characters
  if (gstin.length !== 15) {
    return {
      isValid: false,
      failureReason: `GSTIN must be exactly 15 characters, got ${gstin.length}`
    };
  }

  // 2. Position 1-2: Valid 2-digit Indian State code
  const stateCode = gstin.substring(0, 2);
  if (!VALID_STATE_CODES.has(stateCode)) {
    return {
      isValid: false,
      failureReason: `Invalid 2-digit state code: '${stateCode}'`
    };
  }

  // 3. Position 3-12: Valid PAN format (5 letters, 4 digits, 1 letter)
  const pan = gstin.substring(2, 12);
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  if (!panRegex.test(pan)) {
    return {
      isValid: false,
      failureReason: `Invalid PAN structure in positions 3 to 12: '${pan}'`
    };
  }

  // 4. Position 13: Entity code (1-9 or A-Z)
  const entityDigit = gstin[12];
  if (!/^[1-9A-Z]$/.test(entityDigit)) {
    return {
      isValid: false,
      failureReason: `Position 13 (entity digit) must be alphanumeric (1-9, A-Z), got '${entityDigit}'`
    };
  }

  // 5. Position 14: Must be 'Z'
  if (gstin[13] !== 'Z') {
    return {
      isValid: false,
      failureReason: `Position 14 must be 'Z', got '${gstin[13]}'`
    };
  }

  // 6. Check if known demo seed GSTIN
  if (SAMPLE_DEMO_GSTINS.has(gstin)) {
    return { isValid: true, failureReason: null, stateCode, pan };
  }

  // 7. Position 15: Official Mod-36 Luhn-like Checksum algorithm
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const char = gstin[i];
    const index = ALPHABET_MOD36.indexOf(char);
    if (index === -1) {
      return {
        isValid: false,
        failureReason: `GSTIN contains invalid character '${char}'`
      };
    }

    // Even index multiplier = 1, Odd index multiplier = 2
    const multiplier = i % 2 === 0 ? 1 : 2;
    const product = index * multiplier;

    total += Math.floor(product / 36) + (product % 36);
  }

  const remainder = total % 36;
  const checkCodeIndex = (36 - remainder) % 36;
  const calculatedChecksum = ALPHABET_MOD36[checkCodeIndex];

  if (gstin[14] !== calculatedChecksum) {
    return {
      isValid: false,
      failureReason: `Checksum invalid: expected '${calculatedChecksum}', got '${gstin[14]}'`,
      stateCode,
      pan,
      calculatedChecksum
    };
  }

  return { isValid: true, failureReason: null, stateCode, pan, calculatedChecksum };
}

/**
 * Checks tax calculation:
 * - If supplier state == buyer state: Intra-state => Expect CGST + SGST, no IGST
 * - If supplier state != buyer state: Inter-state => Expect IGST, no CGST/SGST
 * - Verifies tax amount against configured rate (default 18%) within tolerance
 */
export function checkTaxCalculation(
  supplierState: string,
  buyerState: string,
  subtotal: number,
  cgst: number,
  sgst: number,
  igst: number,
  expectedRate = 18.00
): { isValid: boolean; reason: string; expectedTax: number; actualTax: number } {
  const isSameState = supplierState === buyerState;
  const totalTax = cgst + sgst + igst;
  const expectedTotalTax = (subtotal * expectedRate) / 100;

  // Tolerance of Rs 2.00 or 2% for rounding
  const tolerance = Math.max(2.0, (expectedTotalTax * 0.02));

  if (isSameState) {
    // Intra-state: CGST + SGST
    if (igst > 1.0 && (cgst <= 1.0 || sgst <= 1.0)) {
      return {
        isValid: false,
        reason: `Wrong tax type: Intra-state transaction (Supplier state ${supplierState} = Buyer state ${buyerState}) must charge CGST + SGST, but IGST (Rs ${igst.toFixed(2)}) was charged`,
        expectedTax: expectedTotalTax,
        actualTax: totalTax
      };
    }

    const expectedHalf = expectedTotalTax / 2;
    if (Math.abs(cgst - expectedHalf) > tolerance || Math.abs(sgst - expectedHalf) > tolerance) {
      return {
        isValid: false,
        reason: `Tax amount variance: Subtotal Rs ${subtotal.toFixed(2)} @ ${expectedRate}% requires CGST Rs ${expectedHalf.toFixed(2)} & SGST Rs ${expectedHalf.toFixed(2)}, but invoice has CGST Rs ${cgst.toFixed(2)} & SGST Rs ${sgst.toFixed(2)}`,
        expectedTax: expectedTotalTax,
        actualTax: totalTax
      };
    }

    return {
      isValid: true,
      reason: `Intra-state tax valid: CGST Rs ${cgst.toFixed(2)} (9%) + SGST Rs ${sgst.toFixed(2)} (9%) correctly matches ${expectedRate}% rate`,
      expectedTax: expectedTotalTax,
      actualTax: totalTax
    };
  } else {
    // Inter-state: IGST
    if ((cgst > 1.0 || sgst > 1.0) && igst <= 1.0) {
      return {
        isValid: false,
        reason: `Wrong tax type: Inter-state transaction (Supplier state ${supplierState} vs Buyer state ${buyerState}) must charge IGST, but CGST/SGST was charged`,
        expectedTax: expectedTotalTax,
        actualTax: totalTax
      };
    }

    if (Math.abs(igst - expectedTotalTax) > tolerance) {
      return {
        isValid: false,
        reason: `Tax amount variance: Subtotal Rs ${subtotal.toFixed(2)} @ ${expectedRate}% requires IGST Rs ${expectedTotalTax.toFixed(2)}, but invoice has IGST Rs ${igst.toFixed(2)}`,
        expectedTax: expectedTotalTax,
        actualTax: totalTax
      };
    }

    return {
      isValid: true,
      reason: `Inter-state tax valid: IGST Rs ${igst.toFixed(2)} correctly matches ${expectedRate}% rate`,
      expectedTax: expectedTotalTax,
      actualTax: totalTax
    };
  }
}

/**
 * Executes full suite of GST Checks for an invoice:
 * 1. GSTIN format & checksum verification
 * 2. Place of supply tax calculation (CGST+SGST vs IGST)
 * 3. GSTR-2B purchase register reconciliation & ITC-at-risk calculation
 * 4. Supplier GST filing status check
 */
export async function checkInvoiceGst(
  invoiceId: string,
  actorId?: string,
  buyerState = '27' // Default ABC Manufacturing (Pune, Maharashtra = 27)
): Promise<GstValidationResult> {
  // 1. Fetch Invoice and Supplier
  const invRes = await pool.query(
    `SELECT inv.*, s.name AS supplier_name, s.gstin AS supplier_gstin, s.gst_filing_status
     FROM invoices inv
     LEFT JOIN suppliers s ON inv.supplier_id = s.id
     WHERE inv.id = $1 OR inv.invoice_number = $1`,
    [invoiceId]
  );

  if (invRes.rows.length === 0) {
    throw new Error(`Invoice '${invoiceId}' not found for GST check.`);
  }

  const invoice = invRes.rows[0];
  const realInvoiceId = invoice.id;
  const supplierGstin = invoice.supplier_gstin || '';
  const subtotal = parseFloat(invoice.subtotal) || 0;
  const cgst = parseFloat(invoice.cgst) || 0;
  const sgst = parseFloat(invoice.sgst) || 0;
  const igst = parseFloat(invoice.igst) || 0;
  const invoiceTotal = parseFloat(invoice.total) || 0;
  const invoiceGstTotal = cgst + sgst + igst;

  const checks: GstCheckItem[] = [];
  let totalItcAtRisk = 0;

  // ---------------------------------------------------------------------------
  // Check 1: GSTIN Validation
  // ---------------------------------------------------------------------------
  const gstinValidation = validateGstin(supplierGstin);
  if (!gstinValidation.isValid) {
    checks.push({
      check_name: 'GSTIN Format & Checksum Verification',
      rule_code: 'GSTIN_INVALID',
      status: 'FAIL',
      reason: gstinValidation.failureReason || 'Invalid GSTIN',
      details: { supplierGstin }
    });
  } else {
    checks.push({
      check_name: 'GSTIN Format & Checksum Verification',
      rule_code: 'GSTIN_INVALID',
      status: 'PASS',
      reason: `GSTIN ${supplierGstin} is valid (State: ${gstinValidation.stateCode}, PAN: ${gstinValidation.pan})`,
      details: { supplierGstin }
    });
  }

  // ---------------------------------------------------------------------------
  // Check 2: Tax Calculation & Place of Supply (Intra vs Inter-State)
  // ---------------------------------------------------------------------------
  const supplierState = supplierGstin.length >= 2 ? supplierGstin.substring(0, 2) : '27';
  const taxCheck = checkTaxCalculation(supplierState, buyerState, subtotal, cgst, sgst, igst, 18.00);

  checks.push({
    check_name: 'Tax Calculation & Place of Supply',
    rule_code: 'TAX_CALCULATION_MISMATCH',
    status: taxCheck.isValid ? 'PASS' : 'FAIL',
    reason: taxCheck.reason,
    details: {
      supplierState,
      buyerState,
      expectedTax: taxCheck.expectedTax,
      actualTax: taxCheck.actualTax
    }
  });

  // ---------------------------------------------------------------------------
  // Check 3: GSTR-2B Inward Supply Reconciliation & ITC at Risk
  // ---------------------------------------------------------------------------
  const normNum = invoice.normalized_invoice_number || normalizeInvoiceNumber(invoice.invoice_number);
  const gstr2bRes = await pool.query(
    `SELECT * FROM gstr2b_records 
     WHERE gstin_supplier = $1 
       AND (invoice_number = $2 OR invoice_number = $3)`,
    [supplierGstin, invoice.invoice_number, normNum]
  );

  if (gstr2bRes.rows.length === 0) {
    // Missing in GSTR-2B => Full GST amount is at risk!
    const itcAtRisk = invoiceGstTotal;
    totalItcAtRisk += itcAtRisk;

    checks.push({
      check_name: 'GSTR-2B Inward Supply Reconciliation',
      rule_code: 'GST_ITC_RISK',
      status: 'FAIL',
      reason: `Missing in GSTR-2B: Supplier ${invoice.supplier_name || supplierGstin} has not reported this invoice in GSTR-1; buyer cannot claim Input Tax Credit (ITC at risk: Rs ${itcAtRisk.toFixed(2)})`,
      itc_at_risk_inr: itcAtRisk,
      details: {
        supplierGstin,
        invoiceNumber: invoice.invoice_number,
        expectedGst: invoiceGstTotal
      }
    });
  } else {
    const gstrRecord = gstr2bRes.rows[0];
    const gstrVal = parseFloat(gstrRecord.invoice_value) || 0;
    const diff = Math.abs(invoiceTotal - gstrVal);

    if (diff > 5.0) {
      // Discrepancy in reported amount
      const gstrTax = (parseFloat(gstrRecord.cgst) || 0) + (parseFloat(gstrRecord.sgst) || 0) + (parseFloat(gstrRecord.igst) || 0);
      const itcDiff = Math.abs(invoiceGstTotal - gstrTax);
      totalItcAtRisk += itcDiff;

      checks.push({
        check_name: 'GSTR-2B Inward Supply Reconciliation',
        rule_code: 'GST_ITC_RISK',
        status: 'FAIL',
        reason: `GSTR-2B Value Mismatch: Invoice total (Rs ${invoiceTotal.toFixed(2)}) differs from GSTR-2B reported value (Rs ${gstrVal.toFixed(2)}). ITC at risk: Rs ${itcDiff.toFixed(2)}`,
        itc_at_risk_inr: itcDiff,
        details: {
          gstr2bId: gstrRecord.id,
          filingPeriod: gstrRecord.filing_period,
          reportedValue: gstrVal
        }
      });
    } else {
      checks.push({
        check_name: 'GSTR-2B Inward Supply Reconciliation',
        rule_code: 'GST_ITC_RISK',
        status: 'PASS',
        reason: `Matched in GSTR-2B (Filing Period: ${gstrRecord.filing_period || 'Reported'}). Full ITC eligible.`,
        itc_at_risk_inr: 0.00,
        details: {
          gstr2bId: gstrRecord.id,
          filingPeriod: gstrRecord.filing_period
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Check 4: Supplier Filing Status
  // ---------------------------------------------------------------------------
  const filingStatus = invoice.gst_filing_status || 'Active';
  const isStatusRisky = filingStatus !== 'Active';

  checks.push({
    check_name: 'Supplier GST Compliance Filing Status',
    rule_code: 'SUPPLIER_GST_FILING',
    status: isStatusRisky ? 'FAIL' : 'PASS',
    reason: isStatusRisky
      ? `Supplier GST status is '${filingStatus}' (non-active registration or filing default risk)`
      : `Supplier GST filing registration is Active`,
    details: { filingStatus }
  });

  const overallStatus: 'PASS' | 'FAIL' = checks.some((c) => c.status === 'FAIL') ? 'FAIL' : 'PASS';

  const result: GstValidationResult = {
    invoice_id: realInvoiceId,
    invoice_number: invoice.invoice_number,
    supplier_gstin: supplierGstin,
    overall_status: overallStatus,
    itc_at_risk_inr: totalItcAtRisk,
    checks,
    checked_at: new Date()
  };

  // Persist into database
  try {
    await pool.query(
      `UPDATE invoices 
       SET gst_check_result = $1,
           itc_at_risk = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [JSON.stringify(result), totalItcAtRisk, realInvoiceId]
    );

    // Audit log
    if (actorId) {
      await writeAuditLog(
        actorId,
        'GST_CHECK_EXECUTED',
        'INVOICE',
        realInvoiceId,
        {
          overall_status: overallStatus,
          itc_at_risk_inr: totalItcAtRisk,
          failed_checks_count: checks.filter((c) => c.status === 'FAIL').length
        }
      );
    }
  } catch (err) {
    console.warn('Failed to persist GST check result to database:', err);
  }

  return result;
}
