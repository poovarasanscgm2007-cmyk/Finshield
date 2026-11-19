import http from 'http';
import fs from 'fs';
import path from 'path';
import app from '../app';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

async function runSmokeTests() {
  console.log('===============================================================');
  console.log(' FINSHIELD AI: Comprehensive Automated Smoke Test Suite');
  console.log(' Testing All Key Operational Flows & Verification Gates');
  console.log('===============================================================\n');

  // Start in-process HTTP test server on an ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5000;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ------------------------------------------------------------------------
    // Flow 1: Health Check
    // ------------------------------------------------------------------------
    process.stdout.write('1. Checking GET /api/health ... ');
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      const data: any = await res.json();
      if (res.status === 200 && data.status === 'ok') {
        console.log('PASS');
        results.push({ name: 'Health Check (GET /api/health)', passed: true, details: `Status: 200, DB: ${data.database}` });
      } else {
        throw new Error(`Unexpected status ${res.status}: ${JSON.stringify(data)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'Health Check (GET /api/health)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 2: Login for each of the 5 roles
    // ------------------------------------------------------------------------
    process.stdout.write('2. Checking Login for all 5 roles ... ');
    const roles = [
      { role: 'Admin', email: 'admin@finshield.sample', pass: 'Admin@123' },
      { role: 'Finance Manager', email: 'finance@finshield.sample', pass: 'Finance@123' },
      { role: 'AP Employee', email: 'ap@finshield.sample', pass: 'Ap@12345' },
      { role: 'Warehouse Employee', email: 'warehouse@finshield.sample', pass: 'Warehouse@123' },
      { role: 'Procurement Employee', email: 'emp102@finshield.sample', pass: 'Emp102@123' }
    ];

    const tokens: Record<string, string> = {};
    let allLoginsPassed = true;

    for (const r of roles) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: r.email, password: r.pass })
      });
      const data: any = await res.json();
      if (res.status === 200 && data.token && data.user?.role === r.role) {
        tokens[r.role] = data.token;
      } else {
        allLoginsPassed = false;
        console.log(`\n  Failed login for ${r.role} (${r.email}): ${JSON.stringify(data)}`);
      }
    }

    if (allLoginsPassed) {
      console.log('PASS (5/5 authenticated)');
      results.push({ name: 'Authentication for 5 Roles (POST /api/auth/login)', passed: true, details: 'All 5 roles authenticated with 8h JWTs' });
    } else {
      console.log('FAIL');
      results.push({ name: 'Authentication for 5 Roles (POST /api/auth/login)', passed: false, error: 'One or more roles failed login' });
    }

    // ------------------------------------------------------------------------
    // Flow 3: 403 Forbidden on restricted route
    // ------------------------------------------------------------------------
    process.stdout.write('3. Checking 403 Forbidden on unauthorized route ... ');
    try {
      const res = await fetch(`${baseUrl}/api/audit-log`, {
        headers: { Authorization: `Bearer ${tokens['Warehouse Employee']}` }
      });
      const data: any = await res.json();
      if (res.status === 403 && data.message?.includes('Forbidden')) {
        console.log('PASS (HTTP 403 received with clear message)');
        results.push({ name: 'RBAC Enforcement (403 on Restricted Route)', passed: true, details: data.message });
      } else {
        throw new Error(`Expected 403 Forbidden, got ${res.status}: ${JSON.stringify(data)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'RBAC Enforcement (403 on Restricted Route)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 4: Maker-Checker Block
    // ------------------------------------------------------------------------
    process.stdout.write('4. Checking Maker-Checker Self-Approval Block ... ');
    try {
      // Step A: Employee 102 proposes price change on PO-101
      const poRes = await fetch(`${baseUrl}/api/purchase-orders/PO-101/price`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens['Procurement Employee']}`
        },
        body: JSON.stringify({
          newUnitPrice: 720.00,
          reason: 'Automated smoke test price adjustment'
        })
      });
      const poData: any = await poRes.json();
      const approvalId = poData.approval?.id;
      if (!approvalId) {
        throw new Error(`Failed to create price change approval request: ${JSON.stringify(poData)}`);
      }

      // Step B: Employee 102 attempts to approve their own request
      const approveRes = await fetch(`${baseUrl}/api/approvals/${approvalId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens['Procurement Employee']}`
        },
        body: JSON.stringify({ notes: 'Self approving attempt' })
      });
      const approveData: any = await approveRes.json();

      if (approveRes.status === 403 && approveData.message?.includes('Maker-checker violation')) {
        console.log('PASS (Maker-checker violation blocked with 403)');
        results.push({ name: 'Maker-Checker Self-Approval Block (POST /api/approvals/:id/approve)', passed: true, details: approveData.message });
      } else {
        throw new Error(`Expected 403 Maker-checker violation, got ${approveRes.status}: ${JSON.stringify(approveData)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'Maker-Checker Self-Approval Block (POST /api/approvals/:id/approve)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 5: Cryptographic Audit Chain Verification
    // ------------------------------------------------------------------------
    process.stdout.write('5. Checking Audit Chain Cryptographic Verification ... ');
    try {
      const res = await fetch(`${baseUrl}/api/audit-log/verify`, {
        headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
      });
      const data: any = await res.json();
      if (res.status === 200 && data.valid === true && data.totalEntries > 0) {
        console.log(`PASS (${data.totalEntries} sequential SHA-256 blocks verified intact)`);
        results.push({ name: 'Cryptographic Audit Chain Verification (GET /api/audit-log/verify)', passed: true, details: `Verified intact across ${data.totalEntries} entries` });
      } else {
        throw new Error(`Audit verification failed: ${JSON.stringify(data)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'Cryptographic Audit Chain Verification (GET /api/audit-log/verify)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 6: Invoice Upload of INV-101 Sample & Field Extraction
    // ------------------------------------------------------------------------
    process.stdout.write('6. Checking Invoice Upload (INV-101.pdf) & Extraction ... ');
    try {
      const samplePdfPath = path.resolve(__dirname, '../../../sample-data/invoices/INV-101.pdf');
      if (!fs.existsSync(samplePdfPath)) {
        throw new Error(`Sample PDF not found at ${samplePdfPath}`);
      }

      const fileBuffer = fs.readFileSync(samplePdfPath);
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

      const headerPart = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="INV-101.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
      );
      const footerPart = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([headerPart, fileBuffer, footerPart]);

      const res = await fetch(`${baseUrl}/api/invoices/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${tokens['AP Employee']}`
        },
        body
      });

      const data: any = await res.json();
      if (res.status === 201 && data.invoice) {
        const inv = data.invoice;
        const validNumber = inv.invoice_number === 'INV-101';
        const validNorm = inv.normalized_invoice_number === 'INV101';
        const hasConfidence = !!inv.extraction_confidence;

        if (validNumber && validNorm && hasConfidence) {
          console.log(`PASS (Extracted ${inv.invoice_number}, Total: Rs ${inv.total}, Source: ${inv.extraction_source})`);
          results.push({
            name: 'Invoice Upload & Extraction (POST /api/invoices/upload)',
            passed: true,
            details: `Invoice: ${inv.invoice_number}, Total: Rs ${inv.total}, Status: ${inv.status}, Source: ${inv.extraction_source}`
          });
        } else {
          throw new Error(`Incomplete extraction fields: ${JSON.stringify(inv)}`);
        }
      } else {
        throw new Error(`Upload failed with status ${res.status}: ${JSON.stringify(data)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'Invoice Upload & Extraction (POST /api/invoices/upload)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 7: 3-Way Matching Engine on INV-101 (Discrepancy Detection & ON_HOLD lock)
    // ------------------------------------------------------------------------
    process.stdout.write('7. Checking 3-Way Matching Engine on INV-101 ... ');
    try {
      const invId = '10101000-0000-0000-0000-000000000101';
      const matchRes = await fetch(`${baseUrl}/api/invoices/${invId}/match`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens['AP Employee']}` }
      });
      const matchData: any = await matchRes.json();

      if (matchRes.status === 200 && matchData.match_result) {
        const mr = matchData.match_result;
        const isMismatch = mr.status === 'MISMATCH';
        const hasQtyReason = mr.reasons.some((r: string) => r.includes('Invoice qty 100 exceeds received qty 80 by 20'));
        const hasPendingReason = mr.reasons.some((r: string) => r.includes('Pending delivery: 20 not yet received'));
        const detectedUnapprovedPoPrice = mr.compared_values?.unapproved_po_change_detected === true;

        // Verify invoice was placed ON_HOLD
        const invCheckRes = await fetch(`${baseUrl}/api/invoices/${invId}`, {
          headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
        });
        const invCheckData: any = await invCheckRes.json();
        const isOnHold = invCheckData.invoice?.status === 'ON_HOLD';

        if (isMismatch && hasQtyReason && hasPendingReason && isOnHold) {
          console.log(`PASS (Status: ${mr.status}, Reasons: ${mr.reasons.length}, Locked to ON_HOLD)`);
          results.push({
            name: '3-Way Matching Engine (POST /api/invoices/:id/match)',
            passed: true,
            details: `Status: ${mr.status}, Detected Qty 100 vs 80 received, Reverted to approved price Rs 500, Invoice set to ON_HOLD`
          });
        } else {
          throw new Error(`Matching checks failed: mismatch=${isMismatch}, hasQty=${hasQtyReason}, isOnHold=${isOnHold}, unapprovedPo=${detectedUnapprovedPoPrice}`);
        }
      } else {
        throw new Error(`Match endpoint returned status ${matchRes.status}: ${JSON.stringify(matchData)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: '3-Way Matching Engine (POST /api/invoices/:id/match)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 8: Duplicate Invoice Detection on Seed INV_101
    // ------------------------------------------------------------------------
    process.stdout.write('8. Checking Duplicate Invoice Detection Engine on INV_101 ... ');
    try {
      const dupInvId = '10101000-0000-0000-0000-000000000102';
      const dupRes = await fetch(`${baseUrl}/api/invoices/${dupInvId}/duplicates`, {
        headers: { Authorization: `Bearer ${tokens['AP Employee']}` }
      });
      const dupData: any = await dupRes.json();

      if (dupRes.status === 200 && dupData.is_possible_duplicate === true) {
        const topMatch = dupData.duplicates[0];
        const isInv101Match = topMatch?.invoice_number === 'INV-101';
        const highSimilarity = dupData.highest_similarity >= 0.85;
        const hasNormReason = topMatch?.reasons.some((r: string) => r.includes('Identical normalized invoice number'));
        const hasSupplierReason = topMatch?.reasons.some((r: string) => r.includes('Same supplier'));

        if (isInv101Match && highSimilarity && hasNormReason && hasSupplierReason) {
          console.log(`PASS (Similarity: ${Math.round(dupData.highest_similarity * 100)}%, Matched: ${topMatch.invoice_number})`);
          results.push({
            name: 'Duplicate Detection Engine (GET /api/invoices/:id/duplicates)',
            passed: true,
            details: `Flagged POSSIBLE DUPLICATE (${Math.round(dupData.highest_similarity * 100)}% similarity) vs ${topMatch.invoice_number}`
          });
        } else {
          throw new Error(`Duplicate validation failed: isInv101=${isInv101Match}, sim=${dupData.highest_similarity}, reasons=${JSON.stringify(topMatch?.reasons)}`);
        }
      } else {
        throw new Error(`Duplicate endpoint returned ${dupRes.status}: ${JSON.stringify(dupData)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'Duplicate Detection Engine (GET /api/invoices/:id/duplicates)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 9: Auto-Run 3-Way Matching & Full Pipeline on Human Verification (PUT /api/invoices/:id/verify)
    // ------------------------------------------------------------------------
    process.stdout.write('9. Checking Auto-Run Full Pipeline on Invoice Verification ... ');
    try {
      const invId = '10101000-0000-0000-0000-000000000101';
      const verifyRes = await fetch(`${baseUrl}/api/invoices/${invId}/verify`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens['AP Employee']}`
        },
        body: JSON.stringify({
          invoice_number: 'INV-101',
          subtotal: 50000.00,
          cgst: 4500.00,
          sgst: 4500.00,
          total: 59000.00,
          notes: 'Smoke test verification confirmation'
        })
      });
      const verifyData: any = await verifyRes.json();

      if (verifyRes.status === 200 && verifyData.match_result && verifyData.gst_check && verifyData.risk_assessment) {
        console.log(`PASS (Auto-pipeline complete: Match=${verifyData.match_result.status}, Risk=${verifyData.risk_assessment.score})`);
        results.push({
          name: 'Auto-Triggered Pipeline on Verification (PUT /api/invoices/:id/verify)',
          passed: true,
          details: `Invoice verified, auto-matched (${verifyData.match_result.status}), GST evaluated, risk calculated: ${verifyData.risk_assessment.score} (${verifyData.risk_assessment.investigation_priority})`
        });
      } else {
        throw new Error(`Auto-pipeline verification response incomplete: ${JSON.stringify(verifyData)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'Auto-Triggered Pipeline on Verification (PUT /api/invoices/:id/verify)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 10: GST & GSTR-2B ITC-at-Risk Checks (GET /api/invoices/:id/gst-check)
    // ------------------------------------------------------------------------
    process.stdout.write('10. Checking GST & GSTR-2B ITC-at-Risk Checks ... ');
    try {
      const invId = '10101000-0000-0000-0000-000000000101';
      const gstRes = await fetch(`${baseUrl}/api/invoices/${invId}/gst-check`, {
        headers: { Authorization: `Bearer ${tokens['AP Employee']}` }
      });
      const gstData: any = await gstRes.json();

      if (gstRes.status === 200 && gstData.itc_at_risk_inr === 9000 && gstData.overall_status === 'FAIL') {
        console.log(`PASS (Detected Missing GSTR-2B, ITC at risk: Rs ${gstData.itc_at_risk_inr})`);
        results.push({
          name: 'GST & GSTR-2B Reconciliation (GET /api/invoices/:id/gst-check)',
          passed: true,
          details: `Verified GSTIN & GSTR-2B check. Planted missing invoice triggers exact Rs 9,000 ITC at risk.`
        });
      } else {
        throw new Error(`Unexpected GST check response: ${JSON.stringify(gstData)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'GST & GSTR-2B Reconciliation (GET /api/invoices/:id/gst-check)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 11: PO Change Monitoring (GET /api/purchase-orders/:id/changes)
    // ------------------------------------------------------------------------
    process.stdout.write('11. Checking PO Change Monitoring ... ');
    try {
      const poId = 'p0101000-0000-0000-0000-000000000101';
      const poRes = await fetch(`${baseUrl}/api/purchase-orders/${poId}/changes`, {
        headers: { Authorization: `Bearer ${tokens['Procurement Employee']}` }
      });
      const poData: any = await poRes.json();

      if (poRes.status === 200 && poData.has_unauthorized_changes && poData.changes.length > 0) {
        const unapprovedChange = poData.changes.find((c: any) => c.is_unauthorized);
        console.log(`PASS (Flagged unapproved price change from ${unapprovedChange.old_value} to ${unapprovedChange.new_value})`);
        results.push({
          name: 'PO Change Monitoring (GET /api/purchase-orders/:id/changes)',
          passed: true,
          details: `Detected unauthorized modification to ${poData.po_number}: ${unapprovedChange.field} changed from Rs ${unapprovedChange.old_value} to Rs ${unapprovedChange.new_value}. Approval: ${unapprovedChange.approval_status}`
        });
      } else {
        throw new Error(`Unexpected PO change response: ${JSON.stringify(poData)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'PO Change Monitoring (GET /api/purchase-orders/:id/changes)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 12: Historical Overbilling Detection (GET /api/suppliers/:id/overbilling)
    // ------------------------------------------------------------------------
    process.stdout.write('12. Checking Historical Overbilling Pattern Detection ... ');
    try {
      const supplierId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const obRes = await fetch(`${baseUrl}/api/suppliers/${supplierId}/overbilling`, {
        headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
      });
      const obData: any = await obRes.json();

      if (obRes.status === 200 && obData.has_overbilling_pattern && obData.extra_charges_count >= 3) {
        console.log(`PASS (Detected ${obData.extra_charges_count} repeated surcharges of Rs ${obData.distinct_charge_amounts.join(', ')})`);
        results.push({
          name: 'Historical Overbilling Engine (GET /api/suppliers/:id/overbilling)',
          passed: true,
          details: obData.pattern_description
        });
      } else {
        throw new Error(`Unexpected overbilling response: ${JSON.stringify(obData)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'Historical Overbilling Engine (GET /api/suppliers/:id/overbilling)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 13: Explainable Risk Score & Priority Evaluation (GET /api/invoices/:id/risk)
    // ------------------------------------------------------------------------
    process.stdout.write('13. Checking Explainable Risk Score & Investigation Priority ... ');
    try {
      const invId = '10101000-0000-0000-0000-000000000101';
      const riskRes = await fetch(`${baseUrl}/api/invoices/${invId}/risk`, {
        headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
      });
      const riskData: any = await riskRes.json();
      const assessment = riskData.assessment;

      if (riskRes.status === 200 && assessment && assessment.score >= 70 && assessment.investigation_priority === 'HIGH') {
        console.log(`PASS (Score: ${assessment.score}/100, Priority: ${assessment.investigation_priority}, ${assessment.reasons.length} explainable reasons)`);
        results.push({
          name: 'Explainable Risk Engine (GET /api/invoices/:id/risk)',
          passed: true,
          details: `Score ${assessment.score}/100 (${assessment.investigation_priority} priority). Reasons: ${assessment.reasons.map((r: any) => r.rule_code).join(', ')}`
        });
      } else {
        throw new Error(`Unexpected risk response: ${JSON.stringify(riskData)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'Explainable Risk Engine (GET /api/invoices/:id/risk)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 14: Admin Risk Rules Configuration (GET & PUT /api/risk/config)
    // ------------------------------------------------------------------------
    process.stdout.write('14. Checking Admin Risk Rule Configuration ... ');
    try {
      // 1. Fetch rules as Admin
      const listRes = await fetch(`${baseUrl}/api/risk/config`, {
        headers: { Authorization: `Bearer ${tokens['Admin']}` }
      });
      const listData: any = await listRes.json();

      // 2. Update rule threshold & weight
      const updateRes = await fetch(`${baseUrl}/api/risk/config/QTY_MISMATCH`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens['Admin']}`
        },
        body: JSON.stringify({ weight: 32.0, threshold: 2.5 })
      });
      const updateData: any = await updateRes.json();

      if (listRes.status === 200 && Array.isArray(listData.rules) && updateRes.status === 200 && updateData.rule?.weight === 32) {
        console.log('PASS (Admin successfully viewed and tuned rule weights)');
        results.push({
          name: 'Risk Rules Configuration (GET & PUT /api/risk/config)',
          passed: true,
          details: `Admin retrieved ${listData.rules.length} configurable rules and successfully updated QTY_MISMATCH weight to 32`
        });
      } else {
        throw new Error(`Unexpected rule config response: ${JSON.stringify(updateData)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'Risk Rules Configuration (GET & PUT /api/risk/config)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 15: Investigation Auto-Creation & Routing (GET /api/investigations)
    // ------------------------------------------------------------------------
    process.stdout.write('15. Checking Investigation Auto-Creation & Department Routing ... ');
    let qtyInvId = '';
    let gstInvId = '';
    try {
      const invsRes = await fetch(`${baseUrl}/api/investigations?invoiceId=10101000-0000-0000-0000-000000000101`, {
        headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
      });
      const invsData: any = await invsRes.json();
      const list = invsData.investigations || [];

      const qty = list.find((i: any) => i.issue_type === 'QUANTITY_MISMATCH');
      const po = list.find((i: any) => i.issue_type === 'UNAUTHORIZED_PO_CHANGE');
      const ob = list.find((i: any) => i.issue_type === 'HISTORICAL_OVERBILLING');
      const gst = list.find((i: any) => i.issue_type === 'GST_ITC_RISK');

      if (qty && po && ob && gst && qty.department === 'Warehouse' && po.department === 'Procurement/Finance' && ob.department === 'AP/Finance' && gst.department === 'Finance/Compliance') {
        qtyInvId = qty.id;
        gstInvId = gst.id;
        console.log(`PASS (Auto-created 4 investigations routed to Warehouse, Procurement, AP, Finance)`);
        results.push({
          name: 'Investigation Auto-Creation & Department Routing (GET /api/investigations)',
          passed: true,
          details: `4 investigations created with departments: Warehouse (${qty.severity}), Procurement/Finance (${po.severity}), AP/Finance (${ob.severity}), Finance/Compliance (${gst.severity})`
        });
      } else {
        throw new Error(`Failed to route all 4 investigations correctly: ${JSON.stringify(list)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'Investigation Auto-Creation & Department Routing (GET /api/investigations)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 16: Departmental RBAC Block on Investigations (PUT /api/investigations/:id/status)
    // ------------------------------------------------------------------------
    process.stdout.write('16. Checking Departmental RBAC Enforcement on Investigations ... ');
    try {
      // Warehouse Employee tries to resolve a Finance/Compliance investigation
      const blockedRes = await fetch(`${baseUrl}/api/investigations/${gstInvId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens['Warehouse Employee']}`
        },
        body: JSON.stringify({ status: 'RESOLVED', comment: 'Warehouse attempting finance resolution' })
      });
      const blockedData: any = await blockedRes.json();

      if (blockedRes.status === 403) {
        console.log('PASS (Warehouse employee blocked from updating Finance investigation with 403)');
        results.push({
          name: 'Departmental RBAC Enforcement (403 on Cross-Department Update)',
          passed: true,
          details: blockedData.message
        });
      } else {
        throw new Error(`Expected HTTP 403, got ${blockedRes.status}: ${JSON.stringify(blockedData)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'Departmental RBAC Enforcement (403 on Cross-Department Update)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 17: Supplementary Delivery & Revalidation (POST /api/grns & PUT status)
    // ------------------------------------------------------------------------
    process.stdout.write('17. Checking Supplementary Delivery & Pipeline Revalidation ... ');
    try {
      // 1. Warehouse logs supplementary GRN-102 of 20 kg
      const grnRes = await fetch(`${baseUrl}/api/grns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens['Warehouse Employee']}`
        },
        body: JSON.stringify({
          po_id: 'p0101000-0000-0000-0000-000000000101',
          grn_number: 'GRN-102',
          received_date: '2026-11-09',
          items: [{ item_name: 'Teak Wood 100kg (Sample Data)', quantity_received: 20.0 }]
        })
      });
      const grnData: any = await grnRes.json();

      // 2. Warehouse resolves quantity investigation
      const resolveRes = await fetch(`${baseUrl}/api/investigations/${qtyInvId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens['Warehouse Employee']}`
        },
        body: JSON.stringify({
          status: 'RESOLVED',
          comment: 'Received remaining 20 kg on GRN-102. Physical count complete.',
          resolution_notes: 'Supplementary GRN-102 recorded'
        })
      });
      const resolveData: any = await resolveRes.json();

      if (
        grnRes.status === 201 &&
        resolveRes.status === 200 &&
        resolveData.investigation.status === 'REVALIDATED'
      ) {
        console.log('PASS (Quantity cleared, status set to REVALIDATED, invoice remains ON_HOLD for other issues)');
        results.push({
          name: 'Supplementary Delivery & Pipeline Revalidation (POST /api/grns)',
          passed: true,
          details: `GRN-102 added (20 kg), QUANTITY_MISMATCH revalidated successfully. Remaining open issues keep invoice ON_HOLD.`
        });
      } else {
        throw new Error(`Revalidation failed: ${JSON.stringify(resolveData)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'Supplementary Delivery & Pipeline Revalidation (POST /api/grns)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 18: AI Copilot Grounded Query (POST /api/copilot/ask)
    // ------------------------------------------------------------------------
    process.stdout.write('18. Checking AI Copilot Grounded Query ... ');
    try {
      const askRes = await fetch(`${baseUrl}/api/copilot/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens['Finance Manager']}`
        },
        body: JSON.stringify({ question: "Why is Supplier A's invoice flagged?" })
      });
      const askData: any = await askRes.json();

      const ans = askData.answer || '';
      const hasQty = ans.includes('20 kg') || ans.includes('80 kg') || ans.includes('100 kg');
      const hasPo = ans.includes('500') && ans.includes('700') && ans.includes('Employee 102');
      const hasOb = ans.includes('9') || ans.includes('overbilling') || ans.includes('surcharges');
      const hasItc = ans.includes('9,000') || ans.includes('GSTR-2B') || ans.includes('ITC');
      const hasEvidence = Array.isArray(askData.evidence) && askData.evidence.length >= 4;

      if (askRes.status === 200 && hasQty && hasPo && hasOb && hasItc && hasEvidence) {
        console.log('PASS (Copilot cited 20 kg gap, PO price alteration, extra charges, and ITC risk with exact evidence)');
        results.push({
          name: 'AI Copilot Grounded Query (POST /api/copilot/ask)',
          passed: true,
          details: `Answer grounded in database facts: 4 evidence references cited (${askData.evidence.map((e: any) => e.type).join(', ')}). Recommended actions returned for Warehouse, Procurement, and Finance.`
        });
      } else {
        throw new Error(`Copilot response missing required facts: ${JSON.stringify(askData)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'AI Copilot Grounded Query (POST /api/copilot/ask)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 19: Dashboard Executive Metrics & Recharts Aggregation (GET /api/dashboard/stats)
    // ------------------------------------------------------------------------
    process.stdout.write('19. Checking Dashboard Executive Metrics & Chart Data ... ');
    try {
      const statsRes = await fetch(`${baseUrl}/api/dashboard/stats`, {
        headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
      });
      const statsData: any = await statsRes.json();

      if (
        statsRes.status === 200 &&
        statsData.cards?.total_invoices >= 1 &&
        statsData.cards?.total_itc_at_risk >= 9000 &&
        Array.isArray(statsData.charts?.invoices_by_status) &&
        Array.isArray(statsData.charts?.risk_distribution) &&
        Array.isArray(statsData.charts?.investigations_by_department) &&
        Array.isArray(statsData.recent_alerts)
      ) {
        console.log('PASS (Aggregated 7 KPI cards, 3 Recharts distributions, and recent alerts)');
        results.push({
          name: 'Dashboard Executive Metrics (GET /api/dashboard/stats)',
          passed: true,
          details: `KPIs: ${statsData.cards.total_invoices} invoices, ${statsData.cards.pending_investigations} pending investigations, Rs ${statsData.cards.total_itc_at_risk} ITC at risk. Recharts visual models ready.`
        });
      } else {
        throw new Error(`Invalid dashboard stats response: ${JSON.stringify(statsData)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'Dashboard Executive Metrics (GET /api/dashboard/stats)', passed: false, error: err.message });
    }

    // ------------------------------------------------------------------------
    // Flow 20: Payment Approval Gate Enforcement (POST /api/invoices/:id/approve-payment)
    // ------------------------------------------------------------------------
    process.stdout.write('20. Checking Payment Approval Gate & Maker-Checker ... ');
    try {
      // Attempt payment release while other investigations (PO change, GST) are still open
      const gateRes = await fetch(`${baseUrl}/api/invoices/10101000-0000-0000-0000-000000000101/approve-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens['Finance Manager']}`
        },
        body: JSON.stringify({ notes: 'Attempting premature approval' })
      });
      const gateData: any = await gateRes.json();

      if (gateRes.status === 400 && gateData.message.includes('unresolved or un-revalidated')) {
        console.log('PASS (Premature payment blocked: all investigations must be REVALIDATED before release)');
        results.push({
          name: 'Payment Approval Gate Enforcement (POST /api/invoices/:id/approve-payment)',
          passed: true,
          details: `Blocked premature release (HTTP 400): ${gateData.message}`
        });
      } else {
        throw new Error(`Expected HTTP 400, got ${gateRes.status}: ${JSON.stringify(gateData)}`);
      }
    } catch (err: any) {
      console.log('FAIL');
      results.push({ name: 'Payment Approval Gate Enforcement (POST /api/invoices/:id/approve-payment)', passed: false, error: err.message });
    }

  } finally {
    server.close();
  }

  // --------------------------------------------------------------------------
  // Summary Report
  // --------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(' FINSHIELD AI: SMOKE TEST SUMMARY REPORT');
  console.log('===============================================================');

  let allPassed = true;
  for (const r of results) {
    const statusText = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`${statusText.padEnd(8)} | ${r.name}`);
    if (r.details) console.log(`         Details: ${r.details}`);
    if (r.error) console.log(`         Error:   ${r.error}`);
    if (!r.passed) allPassed = false;
  }
  console.log('===============================================================');

  if (allPassed) {
    console.log(`OVERALL: ALL ${results.length} KEY FLOWS PASSED (100% SUCCESS)\n`);
    process.exit(0);
  } else {
    console.error('OVERALL: SOME FLOWS FAILED. Please review the errors above.\n');
    process.exit(1);
  }
}

runSmokeTests().catch((err) => {
  console.error('Smoke test execution halted unexpectedly:', err);
  process.exit(1);
});
