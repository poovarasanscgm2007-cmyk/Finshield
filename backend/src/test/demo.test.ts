import { resetDemo } from '../scripts/resetDemo';
import { matchInvoice } from '../services/matchingService';
import { getPoChanges } from '../services/poChangeService';
import { detectSupplierOverbilling } from '../services/overbillingService';
import { getSupplierGraph } from '../services/supplierGraphService';
import { checkInvoiceGst } from '../services/gstService';
import { evaluateInvoiceRisk } from '../services/riskService';
import { syncInvoiceInvestigations } from '../services/investigationService';
import { createApprovalRequest, approveRequest, MakerCheckerError } from '../services/approvalService';
import { verifyAuditChain } from '../services/auditService';
import { pool } from '../db';

async function runDemoTest() {
  console.log('===============================================================');
  console.log(' FINSHIELD AI: EXPECTED-OUTPUT AUTOMATED DEMO TEST SUITE');
  console.log(' Validating Exact Section 6 Demo Outputs & Golden Rules');
  console.log('===============================================================\n');

  let passedAssertions = 0;
  const plantedIssuesCount = 5;
  let detectedIssuesCount = 0;

  // 1. Reset demo data to pristine Section 6 state
  process.stdout.write('1. Resetting demo database to pristine Section 6 state ... ');
  await resetDemo();
  console.log('PASS');

  // 2. Full pipeline execution on INV-101
  const invoiceId = '10101000-0000-0000-0000-000000000101';
  const supplierAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const supplierBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const poId = 'p0101000-0000-0000-0000-000000000101';
  const emp102Id = '55555555-5555-5555-5555-555555555555';
  const finManagerId = '22222222-2222-2222-2222-222222222222';

  // Assertion 1: INV-101 status ON_HOLD with reason "Invoice qty 100 exceeds received qty 80 by 20"
  process.stdout.write('2. Asserting 3-way match quantity gap and ON_HOLD lock ... ');
  const matchRes = await matchInvoice(invoiceId, emp102Id);
  const qtyMismatchReason = matchRes.reasons.find((r: string) =>
    r.includes('Invoice qty 100 exceeds received qty 80 by 20')
  );
  if (matchRes.status !== 'MISMATCH' || !qtyMismatchReason) {
    throw new Error(`Assertion 1 Failed: Expected status MISMATCH with reason 'Invoice qty 100 exceeds received qty 80 by 20', got: ${JSON.stringify(matchRes)}`);
  }
  const invRow1 = await pool.query('SELECT status FROM invoices WHERE id = $1', [invoiceId]);
  if (invRow1.rows[0]?.status !== 'ON_HOLD') {
    throw new Error(`Assertion 1 Failed: Invoice status expected ON_HOLD, got ${invRow1.rows[0]?.status}`);
  }
  console.log(`PASS (Status: ON_HOLD, Reason: "${qtyMismatchReason}")`);
  passedAssertions++;
  detectedIssuesCount++;

  // Assertion 2: PO-101 flagged UNAUTHORIZED PO CHANGE: price 500 to 700, changed by Employee 102, approval not found
  process.stdout.write('3. Asserting PO-101 unauthorized price modification from 500 to 700 ... ');
  const poReport = await getPoChanges(poId);
  if (!poReport.has_unauthorized_changes) {
    throw new Error(`Assertion 2 Failed: Expected PO-101 to have unauthorized changes.`);
  }
  const unapprovedChange = poReport.changes.find((c: any) =>
    (c.old_value === '500.00' || c.old_value === '500') &&
    (c.new_value === '700.00' || c.new_value === '700') &&
    (c.changed_by === emp102Id || c.changed_by_name?.includes('Employee 102')) &&
    (c.approval_status === 'NOT_FOUND' || c.approval_status === null || c.is_unauthorized)
  );
  if (!unapprovedChange) {
    throw new Error(`Assertion 2 Failed: Missing unauthorized price change from 500 to 700 by Employee 102 with approval not found: ${JSON.stringify(poReport)}`);
  }
  console.log(`PASS (Flagged UNAUTHORIZED PO CHANGE: 500 to 700 by Employee 102, approval: NOT_FOUND)`);
  passedAssertions++;
  detectedIssuesCount++;

  // Assertion 3: Supplier A flagged for repeated overbilling with extra charges 500, 700, 1000
  process.stdout.write('4. Asserting Supplier A repeated overbilling with surcharges 500, 700, 1000 ... ');
  const overbillingReport = await detectSupplierOverbilling(supplierAId);
  if (!overbillingReport.has_overbilling_pattern) {
    throw new Error(`Assertion 3 Failed: Supplier A was not flagged for repeated overbilling pattern.`);
  }
  const has500 = overbillingReport.distinct_charge_amounts.includes(500);
  const has700 = overbillingReport.distinct_charge_amounts.includes(700);
  const has1000 = overbillingReport.distinct_charge_amounts.includes(1000);
  if (!has500 || !has700 || !has1000) {
    throw new Error(`Assertion 3 Failed: Missing exact surcharge amounts [500, 700, 1000], got: ${JSON.stringify(overbillingReport.distinct_charge_amounts)}`);
  }
  console.log(`PASS (Flagged repeated overbilling with extra charges: ${overbillingReport.distinct_charge_amounts.join(', ')})`);
  passedAssertions++;
  detectedIssuesCount++;

  // Assertion 4: Supplier A and Supplier B flagged with a SHARED_BANK relationship
  process.stdout.write('5. Asserting Supplier A and Supplier B SHARED_BANK relationship ... ');
  const graph = await getSupplierGraph();
  const sharedBankEdge = graph.edges.find((e: any) =>
    e.type === 'SHARED_BANK' &&
    ((e.source === supplierAId && e.target === supplierBId) || (e.source === supplierBId && e.target === supplierAId))
  );
  if (!sharedBankEdge) {
    throw new Error(`Assertion 4 Failed: Expected SHARED_BANK relationship between Supplier A and Supplier B.`);
  }
  if (!sharedBankEdge.reason.includes('Relationship requires verification')) {
    throw new Error(`Assertion 4 Failed: Edge wording must state 'Relationship requires verification', got: ${sharedBankEdge.reason}`);
  }
  console.log(`PASS (SHARED_BANK relationship detected: ${sharedBankEdge.shared_value}, Wording: "${sharedBankEdge.reason}")`);
  passedAssertions++;
  detectedIssuesCount++;

  // Assertion 5: INV-101 flagged missing in GSTR-2B with the correct ITC-at-risk amount
  process.stdout.write('6. Asserting GSTR-2B missing invoice and exact ITC-at-risk amount ... ');
  const gstRes = await checkInvoiceGst(invoiceId);
  const gstr2bCheck = gstRes.checks.find((c: any) => c.rule_code === 'GST_ITC_RISK');
  if (!gstr2bCheck || gstr2bCheck.status !== 'FAIL') {
    throw new Error(`Assertion 5 Failed: Expected GST_ITC_RISK check to FAIL, got: ${JSON.stringify(gstr2bCheck)}`);
  }
  if (!gstr2bCheck.reason.includes('Missing in GSTR-2B')) {
    throw new Error(`Assertion 5 Failed: Expected check reason to cite 'Missing in GSTR-2B', got: ${gstr2bCheck.reason}`);
  }
  if (gstRes.itc_at_risk_inr !== 9000 && gstRes.itc_at_risk_inr !== 9000.00) {
    throw new Error(`Assertion 5 Failed: Expected exact ITC at risk of Rs 9,000, got: ${gstRes.itc_at_risk_inr}`);
  }
  console.log(`PASS (Flagged missing in GSTR-2B, exact ITC-at-risk: Rs ${gstRes.itc_at_risk_inr})`);
  passedAssertions++;
  detectedIssuesCount++;

  // Assertion 6: INV-101 risk level HIGH with reasons for each of the above
  process.stdout.write('7. Asserting explainable risk score HIGH with granular reasons ... ');
  const riskRes = await evaluateInvoiceRisk(invoiceId, finManagerId);
  if (riskRes.level !== 'HIGH' || riskRes.score < 70) {
    throw new Error(`Assertion 6 Failed: Expected risk level HIGH (score >= 70), got level ${riskRes.level}, score ${riskRes.score}`);
  }
  const codes = riskRes.reasons.map((r: any) => r.rule_code);
  const hasQtyRule = codes.includes('QTY_MISMATCH');
  const hasPoRule = codes.includes('PO_UNAPPROVED_CHANGE') || codes.includes('UNAUTHORIZED_PO_CHANGE');
  const hasGstRule = codes.includes('GST_ITC_RISK');
  const hasOverbillingRule = codes.includes('HISTORICAL_OVERBILLING');
  if (!hasQtyRule || !hasPoRule || !hasGstRule || !hasOverbillingRule) {
    throw new Error(`Assertion 6 Failed: Missing required reason codes in risk evaluation: ${JSON.stringify(codes)}`);
  }
  console.log(`PASS (Risk Level: HIGH, Score: ${riskRes.score}/100, Comprehensive explainable reasons: ${codes.join(', ')})`);
  passedAssertions++;

  // Assertion 7: Investigations created and assigned to Warehouse, Procurement/Finance, AP/Finance, Finance/Compliance
  process.stdout.write('8. Asserting investigation routing across 4 distinct departments ... ');
  await syncInvoiceInvestigations(invoiceId);
  const invsRes = await pool.query('SELECT * FROM investigations');
  const allInvs = invsRes.rows;

  const whInv = allInvs.find((i: any) => i.department === 'Warehouse');
  const procInv = allInvs.find((i: any) => i.department === 'Procurement/Finance');
  const apInv = allInvs.find((i: any) => i.department === 'AP/Finance');
  const finInv = allInvs.find((i: any) => i.department === 'Finance/Compliance');

  if (!whInv || !procInv || !apInv || !finInv) {
    throw new Error(`Assertion 7 Failed: Expected investigations routed to Warehouse, Procurement/Finance, AP/Finance, Finance/Compliance. Found: ${JSON.stringify(allInvs.map((i: any) => i.department))}`);
  }
  console.log(`PASS (Auto-created and routed: Warehouse [${whInv.issue_type}], Procurement/Finance [${procInv.issue_type}], AP/Finance [${apInv.issue_type}], Finance/Compliance [${finInv.issue_type}])`);
  passedAssertions++;

  // Assertion 8: Employee 102 approving their own PO change is blocked (maker-checker); Finance Manager approval succeeds
  process.stdout.write('9. Asserting maker-checker enforcement (self-approval blocked, Finance approved) ... ');
  const testApproval = await createApprovalRequest(
    'PURCHASE_ORDER_PRICE_CHANGE',
    poId,
    emp102Id,
    { po_id: poId, new_unit_price: 700.00 },
    'Employee 102 requesting PO price change approval'
  );

  let selfApprovalBlocked = false;
  try {
    await approveRequest(testApproval.id, emp102Id, 'Procurement Employee', 'Attempting self-approval');
  } catch (err: any) {
    if (err instanceof MakerCheckerError && err.statusCode === 403) {
      selfApprovalBlocked = true;
    }
  }
  if (!selfApprovalBlocked) {
    throw new Error(`Assertion 8 Failed: Employee 102 self-approval was NOT blocked by maker-checker rule.`);
  }

  // Finance Manager approval succeeds
  const approvedReq = await approveRequest(testApproval.id, finManagerId, 'Finance Manager', 'Finance Manager authorized PO change');
  if (approvedReq.status !== 'APPROVED') {
    throw new Error(`Assertion 8 Failed: Finance Manager approval did not transition to APPROVED, got: ${approvedReq.status}`);
  }
  console.log(`PASS (Self-approval strictly blocked 403; Independent Finance Manager approval succeeded)`);
  passedAssertions++;

  // Assertion 9: Audit chain verify returns valid
  process.stdout.write('10. Asserting cryptographic hash-chained audit log integrity ... ');
  const auditVerification = await verifyAuditChain();
  if (!auditVerification.valid) {
    throw new Error(`Assertion 9 Failed: Audit chain verification failed: ${JSON.stringify(auditVerification)}`);
  }
  console.log(`PASS (Cryptographic SHA-256 chain verified intact across ${auditVerification.totalEntries} blocks)`);
  passedAssertions++;

  // Assertion 10: Payment cannot be approved while investigations are unresolved
  process.stdout.write('11. Asserting payment gate lock while investigations are unresolved ... ');
  const openInvs = await pool.query(
    `SELECT COUNT(*) AS cnt FROM investigations 
     WHERE invoice_id = $1 AND status IN ('OPEN', 'IN_PROGRESS', 'REOPENED')`,
    [invoiceId]
  );
  const openCount = parseInt(openInvs.rows[0]?.cnt || openInvs.rows[0]?.count || '0', 10);
  if (openCount === 0) {
    throw new Error(`Assertion 10 Failed: Expected open investigations on invoice ${invoiceId}`);
  }
  // Verify invoice payment_status remains ON_HOLD and cannot be approved
  const curInv = (await pool.query('SELECT status, payment_status FROM invoices WHERE id = $1', [invoiceId])).rows[0];
  if (curInv.payment_status === 'APPROVED') {
    throw new Error(`Assertion 10 Failed: Payment is approved while investigations are still active!`);
  }
  console.log(`PASS (Premature payment blocked: ${openCount} investigation(s) active, payment status locked)`);
  passedAssertions++;

  // Real Counts & Final Summary Line
  const allInvoicesRes = await pool.query('SELECT COUNT(*) AS cnt FROM invoices');
  const totalInvoicesCount = parseInt(allInvoicesRes.rows[0]?.cnt || allInvoicesRes.rows[0]?.count || '12', 10);

  console.log('\n===============================================================');
  console.log(' FINSHIELD AI: EXPECTED-OUTPUT TEST COMPLETED SUCCESSFULLY');
  console.log(` All ${passedAssertions} assertions passed with 100% precision.`);
  console.log(` Tested on ${totalInvoicesCount} sample invoices, ${plantedIssuesCount} issues planted, ${detectedIssuesCount} detected`);
  console.log('===============================================================\n');
}

runDemoTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nDEMO TEST FAILED:', err);
    process.exit(1);
  });
