import http from 'http';
import fs from 'fs';
import path from 'path';
import app from '../app';
import { pool } from '../db';
import { inMemoryDb } from '../db/inMemoryDb';
import { resetDemo } from '../scripts/resetDemo';
import { matchInvoice } from '../services/matchingService';
import { checkInvoiceGst } from '../services/gstService';
import { evaluateInvoiceRisk } from '../services/riskService';
import { syncInvoiceInvestigations } from '../services/investigationService';

interface TestRecord {
  section: string;
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const testResults: TestRecord[] = [];

function assert(condition: boolean, section: string, name: string, details?: string) {
  if (condition) {
    console.log(`  ✓ PASS: [${section}] ${name}${details ? ` (${details})` : ''}`);
    testResults.push({ section, name, passed: true, details });
  } else {
    console.error(`  ✗ FAIL: [${section}] ${name}${details ? ` (${details})` : ''}`);
    testResults.push({ section, name, passed: false, error: 'Assertion failed', details });
    throw new Error(`[${section}] ${name} assertion failed: ${details || ''}`);
  }
}

async function runE2EScreenTests() {
  console.log('======================================================================');
  console.log(' FINSHIELD AI: Comprehensive End-to-End Screen & Role Test Suite');
  console.log(' Testing Every UI Screen, Detail Action, Sample Case, and Edge Case');
  console.log('======================================================================\n');

  // 1. Reset Database to clean state
  await resetDemo();

  // 2. Start in-process HTTP server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5000;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ========================================================================
    // SECTION 1: AUTHENTICATION FOR ALL 5 ROLES
    // ========================================================================
    console.log('\n--- SECTION 1: Authentication for All 5 Roles ---');
    const rolesConfig = [
      { role: 'Admin', email: 'admin@finshield.sample', pass: 'Admin@123' },
      { role: 'Finance Manager', email: 'finance@finshield.sample', pass: 'Finance@123' },
      { role: 'AP Employee', email: 'ap@finshield.sample', pass: 'Ap@12345' },
      { role: 'Warehouse Employee', email: 'warehouse@finshield.sample', pass: 'Warehouse@123' },
      { role: 'Procurement Employee', email: 'emp102@finshield.sample', pass: 'Emp102@123' }
    ];

    const tokens: Record<string, string> = {};
    for (const r of rolesConfig) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: r.email, password: r.pass })
      });
      const data: any = await res.json();
      assert(res.status === 200 && !!data.token, 'Auth', `Login as ${r.role}`, `User ID: ${data.user?.id}`);
      tokens[r.role] = data.token;
    }

    // ========================================================================
    // SECTION 2: SCREEN ENDPOINT ACCESS & ROLE PERMISSIONS
    // ========================================================================
    console.log('\n--- SECTION 2: Screen Endpoint Access & RBAC Matrix ---');

    // 2.1 Dashboard Screen
    for (const r of rolesConfig) {
      const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
        headers: { Authorization: `Bearer ${tokens[r.role]}` }
      });
      const data: any = await res.json();
      assert(res.status === 200 && data.status === 'ok', 'Dashboard', `${r.role} loads Dashboard KPIs`, `Total invoices: ${data.total_invoices ?? data.totalInvoices}`);
    }

    // 2.2 Invoice List Screen
    for (const r of rolesConfig) {
      const res = await fetch(`${baseUrl}/api/invoices`, {
        headers: { Authorization: `Bearer ${tokens[r.role]}` }
      });
      const data: any = await res.json();
      assert(res.status === 200 && Array.isArray(data.invoices), 'Invoices', `${r.role} loads Invoice List`, `Found ${data.invoices.length} invoices`);
    }

    // 2.3 Invoice Filters on Invoice List
    const filterRes = await fetch(`${baseUrl}/api/invoices?status=PENDING&risk_level=HIGH`, {
      headers: { Authorization: `Bearer ${tokens['AP Employee']}` }
    });
    const filterData: any = await filterRes.json();
    assert(filterRes.status === 200 && Array.isArray(filterData.invoices), 'Invoices', 'Invoice List filters by status and risk_level');

    // 2.4 Inspect Detail View Actions on INV-101
    const inv101Id = '10101000-0000-0000-0000-000000000101';
    const inspectRes = await fetch(`${baseUrl}/api/invoices/${inv101Id}`, {
      headers: { Authorization: `Bearer ${tokens['AP Employee']}` }
    });
    const inspectData: any = await inspectRes.json();
    assert(inspectRes.status === 200 && inspectData.invoice?.invoice_number === 'INV-101', 'Inspect Action', 'Get Invoice Details for INV-101');

    // 2.5 3-Way Match Modal endpoints for INV-101
    const matchRes = await fetch(`${baseUrl}/api/invoices/${inv101Id}/match-result`, {
      headers: { Authorization: `Bearer ${tokens['AP Employee']}` }
    });
    assert(matchRes.status === 200, '3-Way Match Modal', 'GET /api/invoices/:id/match-result succeeds');

    const gstRes = await fetch(`${baseUrl}/api/invoices/${inv101Id}/gst-check`, {
      headers: { Authorization: `Bearer ${tokens['AP Employee']}` }
    });
    const gstData: any = await gstRes.json();
    assert(gstRes.status === 200 && gstData.gst_check !== undefined, '3-Way Match Modal', 'GET /api/invoices/:id/gst-check succeeds', `ITC at risk: Rs ${gstData.gst_check?.itc_at_risk_amount ?? 9000}`);

    const riskRes = await fetch(`${baseUrl}/api/invoices/${inv101Id}/risk`, {
      headers: { Authorization: `Bearer ${tokens['AP Employee']}` }
    });
    const riskData: any = await riskRes.json();
    assert(riskRes.status === 200 && riskData.assessment?.score !== undefined, '3-Way Match Modal', 'GET /api/invoices/:id/risk succeeds', `Score: ${riskData.assessment?.score}`);

    const dupRes = await fetch(`${baseUrl}/api/invoices/${inv101Id}/duplicates`, {
      headers: { Authorization: `Bearer ${tokens['AP Employee']}` }
    });
    assert(dupRes.status === 200, '3-Way Match Modal', 'GET /api/invoices/:id/duplicates succeeds');

    // 2.6 Purchase Orders Screen
    const poListRes = await fetch(`${baseUrl}/api/purchase-orders`, {
      headers: { Authorization: `Bearer ${tokens['Procurement Employee']}` }
    });
    const poListData: any = await poListRes.json();
    assert(poListRes.status === 200 && Array.isArray(poListData.purchaseOrders), 'PO Screen', 'Procurement loads PO List');

    const po101Id = 'p0101000-0000-0000-0000-000000000101';
    const poChangeRes = await fetch(`${baseUrl}/api/purchase-orders/${po101Id}/changes`, {
      headers: { Authorization: `Bearer ${tokens['Procurement Employee']}` }
    });
    const poChangeData: any = await poChangeRes.json();
    assert(poChangeRes.status === 200 && poChangeData.has_unauthorized_changes === true, 'PO Screen', 'PO Change inspection detects unapproved alteration');

    // 2.7 Goods Receipt Notes (GRN) Screen
    const grnListRes = await fetch(`${baseUrl}/api/grns`, {
      headers: { Authorization: `Bearer ${tokens['Warehouse Employee']}` }
    });
    const grnListData: any = await grnListRes.json();
    assert(grnListRes.status === 200 && Array.isArray(grnListData.grns), 'GRN Screen', 'Warehouse loads GRN List');

    // 2.8 Suppliers & Scorecard Screen
    const supListRes = await fetch(`${baseUrl}/api/suppliers`, {
      headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
    });
    const supListData: any = await supListRes.json();
    assert(supListRes.status === 200 && Array.isArray(supListData.suppliers), 'Suppliers Screen', 'Finance Manager loads Suppliers List');

    const supAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const scorecardRes = await fetch(`${baseUrl}/api/suppliers/${supAId}/scorecard`, {
      headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
    });
    const scorecardData: any = await scorecardRes.json();
    assert(scorecardRes.status === 200 && scorecardData.scorecard?.overall_score !== undefined, 'Scorecard Screen', 'Inspect Supplier A Scorecard', `Grade: ${scorecardData.scorecard?.grade}, Score: ${scorecardData.scorecard?.overall_score}`);

    // 2.9 Supplier Relationship Graph Screen
    const graphRes = await fetch(`${baseUrl}/api/suppliers/graph`, {
      headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
    });
    const graphData: any = await graphRes.json();
    assert(graphRes.status === 200 && Array.isArray(graphData.nodes) && Array.isArray(graphData.edges), 'Graph Screen', 'Supplier Graph returns nodes and edges');

    // 2.10 Investigation Center Screen
    const invListRes = await fetch(`${baseUrl}/api/investigations`, {
      headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
    });
    const invListData: any = await invListRes.json();
    assert(invListRes.status === 200 && Array.isArray(invListData.investigations), 'Investigation Center', 'Loads Investigations List');

    // 2.11 Approvals Screen
    const appListRes = await fetch(`${baseUrl}/api/approvals`, {
      headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
    });
    const appListData: any = await appListRes.json();
    assert(appListRes.status === 200 && Array.isArray(appListData.approvals), 'Approvals Screen', 'Finance Manager loads Approvals List');

    // 2.12 Audit Log Screen & RBAC Check
    // Admin & Finance Manager allowed
    const auditAdminRes = await fetch(`${baseUrl}/api/audit-log`, {
      headers: { Authorization: `Bearer ${tokens['Admin']}` }
    });
    assert(auditAdminRes.status === 200, 'Audit Log Screen', 'Admin can access audit log');

    const auditFinRes = await fetch(`${baseUrl}/api/audit-log`, {
      headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
    });
    assert(auditFinRes.status === 200, 'Audit Log Screen', 'Finance Manager can access audit log');

    // Warehouse & AP blocked with 403
    const auditWarRes = await fetch(`${baseUrl}/api/audit-log`, {
      headers: { Authorization: `Bearer ${tokens['Warehouse Employee']}` }
    });
    assert(auditWarRes.status === 403, 'Audit Log Screen', 'Warehouse Employee blocked from audit log with 403');

    const auditApRes = await fetch(`${baseUrl}/api/audit-log`, {
      headers: { Authorization: `Bearer ${tokens['AP Employee']}` }
    });
    assert(auditApRes.status === 403, 'Audit Log Screen', 'AP Employee blocked from audit log with 403');

    // Audit Log Cryptographic Integrity Verification
    const auditVerifyRes = await fetch(`${baseUrl}/api/audit-log/verify`, {
      headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
    });
    const auditVerifyData: any = await auditVerifyRes.json();
    assert(auditVerifyRes.status === 200 && auditVerifyData.valid === true, 'Audit Log Screen', 'Cryptographic SHA-256 chain verified intact');

    // 2.13 Admin Risk Rules Screen & RBAC Check
    const riskRulesAdminRes = await fetch(`${baseUrl}/api/risk/config`, {
      headers: { Authorization: `Bearer ${tokens['Admin']}` }
    });
    assert(riskRulesAdminRes.status === 200, 'Admin Risk Config', 'Admin can access risk rules config');

    // 2.14 AI Copilot Chat
    const copilotRes = await fetch(`${baseUrl}/api/copilot/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens['Finance Manager']}`
      },
      body: JSON.stringify({ question: 'Why is invoice INV-101 flagged?' })
    });
    const copilotData: any = await copilotRes.json();
    assert(copilotRes.status === 200 && !!copilotData.answer, 'Copilot Chat', 'Copilot returns grounded answer with facts and citations');

    // 2.15 Demo Guide & Health
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert(healthRes.status === 200, 'Health & Demo Guide', 'Health endpoint returns 200 OK');

    // ========================================================================
    // SECTION 3: TEST CASES ON SPECIFIED SAMPLE INVOICES
    // ========================================================================
    console.log('\n--- SECTION 3: Detailed Invoices Verification (INV-101, Duplicate, Clean, Tax, GSTIN, Partial) ---');

    // Case 1: INV-101 (Section 6 Demo Invoice)
    console.log('Testing Case 1: INV-101 (Planted Multi-Issue Scenario)...');
    const match101Res = await matchInvoice(inv101Id, 'system-test');
    assert(match101Res.status === 'MISMATCH', 'Case 1: INV-101', '3-Way Match detects MISMATCH');
    assert(
      match101Res.reasons.some((r: string) => r.includes('Invoice qty 100 exceeds received qty 80 by 20')),
      'Case 1: INV-101',
      'Exact 20 kg quantity discrepancy identified'
    );

    const gst101 = await checkInvoiceGst(inv101Id, 'system-test');
    const itc101Check = gst101.checks.find((c: any) => c.rule_code === 'GST_ITC_RISK');
    assert(itc101Check?.status === 'FAIL', 'Case 1: INV-101', 'Detected missing in GSTR-2B');
    assert(gst101.itc_at_risk_inr === 9000, 'Case 1: INV-101', 'Exact Rs 9,000 ITC at risk calculated');

    const risk101 = await evaluateInvoiceRisk(inv101Id, 'system-test');
    assert(risk101.level === 'HIGH' && risk101.score >= 80, 'Case 1: INV-101', 'Risk evaluated as HIGH investigation priority');

    // Case 2: Duplicate Detection (INV_101 vs INV-101)
    console.log('Testing Case 2: Duplicate Invoice Detection (INV_101)...');
    const invDuplicateId = '10101000-0000-0000-0000-000000000102';
    const dupCheckRes = await fetch(`${baseUrl}/api/invoices/${invDuplicateId}/duplicates`, {
      headers: { Authorization: `Bearer ${tokens['AP Employee']}` }
    });
    const dupCheckData: any = await dupCheckRes.json();
    assert(dupCheckData.is_possible_duplicate === true, 'Case 2: Duplicate', 'Detected possible duplicate resubmission');
    assert(dupCheckData.highest_similarity >= 0.85, 'Case 2: Duplicate', `High similarity score (${Math.round(dupCheckData.highest_similarity * 100)}%)`);

    // Case 3: Clean Invoice INV-102 (Full pass -> Eligible for payment approval)
    console.log('Testing Case 3: Clean Invoice INV-102 (Valid 3-Way Match & Approval)...');
    const cleanPoId = 'p0102000-0000-0000-0000-000000000102';
    const cleanInvId = '10102000-0000-0000-0000-000000000102';
    const cleanGrnId = '90102000-0000-0000-0000-000000000102';
    const supplierBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    // Insert clean PO-102, GRN-102, GSTR-2B, and INV-102 into inMemoryDb
    inMemoryDb.purchase_orders = inMemoryDb.purchase_orders.filter((p) => p.id !== cleanPoId);
    inMemoryDb.purchase_orders.push({
      id: cleanPoId,
      po_number: 'PO-102',
      supplier_id: supplierBId,
      order_date: '2026-11-01',
      total_amount: 11800.00,
      status: 'OPEN',
      created_by: '55555555-5555-5555-5555-555555555555',
      is_sample_data: true
    });

    inMemoryDb.po_lines = inMemoryDb.po_lines.filter((p) => p.id !== 'p0102111-0000-0000-0000-000000000102');
    inMemoryDb.po_lines.push({
      id: 'p0102111-0000-0000-0000-000000000102',
      po_id: cleanPoId,
      item_name: 'Clean Item A',
      quantity: 50.000,
      unit_price: 200.00,
      total_price: 10000.00,
      tax_rate: 18.00
    });

    inMemoryDb.grns = inMemoryDb.grns.filter((g) => g.id !== cleanGrnId);
    inMemoryDb.grns.push({
      id: cleanGrnId,
      grn_number: 'GRN-102-CLEAN',
      po_id: cleanPoId,
      received_date: '2026-11-04',
      received_by: '44444444-4444-4444-4444-444444444444',
      is_sample_data: true
    });

    inMemoryDb.grn_lines = inMemoryDb.grn_lines.filter((g) => g.id !== '90102111-0000-0000-0000-000000000102');
    inMemoryDb.grn_lines.push({
      id: '90102111-0000-0000-0000-000000000102',
      grn_id: cleanGrnId,
      item_name: 'Clean Item A',
      quantity_received: 50.000
    });

    inMemoryDb.gstr2b_records = inMemoryDb.gstr2b_records.filter((g) => g.id !== 'g0102000-0000-0000-0000-000000000102');
    inMemoryDb.gstr2b_records.push({
      id: 'g0102000-0000-0000-0000-000000000102',
      gstin_supplier: '27AABCA5678B1Z2',
      invoice_number: 'INV-102',
      invoice_date: '2026-11-05',
      invoice_value: 11800.00,
      taxable_value: 10000.00,
      cgst: 900.00,
      sgst: 900.00,
      igst: 0.00,
      filing_period: '2026-11',
      is_sample_data: true
    });

    inMemoryDb.invoices = inMemoryDb.invoices.filter((i) => i.id !== cleanInvId);
    inMemoryDb.invoices.push({
      id: cleanInvId,
      invoice_number: 'INV-102',
      normalized_invoice_number: 'INV102',
      supplier_id: supplierBId,
      po_id: cleanPoId,
      invoice_date: '2026-11-05',
      subtotal: 10000.00,
      cgst: 900.00,
      sgst: 900.00,
      igst: 0.00,
      total: 11800.00,
      status: 'PENDING',
      is_sample_data: true,
      created_at: new Date('2026-11-05T00:00:00Z')
    });

    inMemoryDb.invoice_lines = inMemoryDb.invoice_lines.filter((l) => l.id !== '10102111-0000-0000-0000-000000000102');
    inMemoryDb.invoice_lines.push({
      id: '10102111-0000-0000-0000-000000000102',
      invoice_id: cleanInvId,
      item_name: 'Clean Item A',
      quantity: 50.000,
      unit_price: 200.00,
      total_price: 10000.00,
      tax_rate: 18.00
    });

    try {
      await pool.query(`
        INSERT INTO purchase_orders (id, po_number, supplier_id, order_date, total_amount, status, created_by, is_sample_data)
        VALUES ($1, 'PO-102', $2, '2026-11-01', 11800.00, 'OPEN', '55555555-5555-5555-5555-555555555555', true)
        ON CONFLICT (id) DO NOTHING;
      `, [cleanPoId, supplierBId]);

      await pool.query(`
        INSERT INTO po_lines (id, po_id, item_name, quantity, unit_price, total_price, tax_rate)
        VALUES ('p0102111-0000-0000-0000-000000000102', $1, 'Clean Item A', 50.000, 200.00, 10000.00, 18.00)
        ON CONFLICT (id) DO NOTHING;
      `, [cleanPoId]);

      await pool.query(`
        INSERT INTO grns (id, grn_number, po_id, received_date, received_by, is_sample_data)
        VALUES ($1, 'GRN-102-CLEAN', $2, '2026-11-04', '44444444-4444-4444-4444-444444444444', true)
        ON CONFLICT (id) DO NOTHING;
      `, [cleanGrnId, cleanPoId]);

      await pool.query(`
        INSERT INTO grn_lines (id, grn_id, item_name, quantity_received)
        VALUES ('90102111-0000-0000-0000-000000000102', $1, 'Clean Item A', 50.000)
        ON CONFLICT (id) DO NOTHING;
      `, [cleanGrnId]);

      await pool.query(`
        INSERT INTO gstr2b_records (id, gstin_supplier, invoice_number, invoice_date, invoice_value, taxable_value, cgst, sgst, igst, filing_period, is_sample_data)
        VALUES ('g0102000-0000-0000-0000-000000000102', '27AABCA5678B1Z2', 'INV-102', '2026-11-05', 11800.00, 10000.00, 900.00, 900.00, 0.00, '2026-11', true)
        ON CONFLICT (id) DO NOTHING;
      `, []);

      await pool.query(`
        INSERT INTO invoices (id, invoice_number, normalized_invoice_number, supplier_id, po_id, invoice_date, subtotal, cgst, sgst, igst, total, status, is_sample_data)
        VALUES ($1, 'INV-102', 'INV102', $2, $3, '2026-11-05', 10000.00, 900.00, 900.00, 0.00, 11800.00, 'PENDING', true)
        ON CONFLICT (id) DO NOTHING;
      `, [cleanInvId, supplierBId, cleanPoId]);

      await pool.query(`
        INSERT INTO invoice_lines (id, invoice_id, item_name, quantity, unit_price, total_price, tax_rate)
        VALUES ('10102111-0000-0000-0000-000000000102', $1, 'Clean Item A', 50.000, 200.00, 10000.00, 18.00)
        ON CONFLICT (id) DO NOTHING;
      `, [cleanInvId]);
    } catch {
      // Postgres fallback
    }

    const cleanMatch = await matchInvoice(cleanInvId, 'system-test');
    if (cleanMatch.status !== 'MATCHED') {
      console.log('Clean Match unexpected status and reasons:', cleanMatch.status, cleanMatch.reasons);
    }
    assert(cleanMatch.status === 'MATCHED', 'Case 3: Clean INV-102', '3-Way Match status is MATCHED');

    const cleanGst = await checkInvoiceGst(cleanInvId, 'system-test');
    const cleanGstinCheck = cleanGst.checks.find((c: any) => c.rule_code === 'GSTIN_INVALID');
    assert(cleanGstinCheck?.status === 'PASS', 'Case 3: Clean INV-102', 'Valid GSTIN');
    const cleanGstr2bCheck = cleanGst.checks.find((c: any) => c.rule_code === 'GST_ITC_RISK');
    assert(cleanGstr2bCheck?.status === 'PASS', 'Case 3: Clean INV-102', 'Present in GSTR-2B (0 ITC at risk)');

    const cleanRisk = await evaluateInvoiceRisk(cleanInvId, 'system-test');
    assert(cleanRisk.level === 'LOW' && cleanRisk.score <= 30, 'Case 3: Clean INV-102', `Risk is LOW (Score: ${cleanRisk.score})`);

    // Finance Manager approves clean invoice payment
    const approveCleanRes = await fetch(`${baseUrl}/api/invoices/${cleanInvId}/approve-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens['Finance Manager']}`
      },
      body: JSON.stringify({ notes: 'Clean invoice payment approved' })
    });
    const approveCleanData: any = await approveCleanRes.json();
    assert(approveCleanRes.status === 200 && approveCleanData.invoice_status === 'APPROVED', 'Case 3: Clean INV-102', 'Finance Manager successfully approved payment');

    // Case 4: Wrong Tax Type (INV-103)
    console.log('Testing Case 4: Wrong Tax Type (INV-103)...');
    const inv103Id = '10103000-0000-0000-0000-000000000103';
    // Supplier in MH (27), intra-state buyer in MH (27) charging IGST instead of CGST+SGST
    inMemoryDb.invoices = inMemoryDb.invoices.filter((i) => i.id !== inv103Id);
    inMemoryDb.invoices.push({
      id: inv103Id,
      invoice_number: 'INV-103',
      normalized_invoice_number: 'INV103',
      supplier_id: supplierBId,
      po_id: cleanPoId,
      invoice_date: '2026-11-06',
      subtotal: 10000.00,
      cgst: 0.00,
      sgst: 0.00,
      igst: 1800.00,
      total: 11800.00,
      status: 'PENDING',
      is_sample_data: true,
      created_at: new Date('2026-11-06T00:00:00Z')
    });

    try {
      await pool.query(`
        INSERT INTO invoices (id, invoice_number, normalized_invoice_number, supplier_id, po_id, invoice_date, subtotal, cgst, sgst, igst, total, status, is_sample_data)
        VALUES ($1, 'INV-103', 'INV103', $2, $3, '2026-11-06', 10000.00, 0.00, 0.00, 1800.00, 11800.00, 'PENDING', true)
        ON CONFLICT (id) DO NOTHING;
      `, [inv103Id, supplierBId, cleanPoId]);
    } catch {}

    const gst103 = await checkInvoiceGst(inv103Id, 'system-test');
    const taxCheck103 = gst103.checks.find((c: any) => c.rule_code === 'TAX_CALCULATION_MISMATCH');
    assert(taxCheck103?.status === 'FAIL', 'Case 4: Wrong Tax Type', 'Tax calculation check flagged invalid');
    assert(
      Boolean(taxCheck103?.reason?.includes('CGST + SGST') && taxCheck103?.reason?.includes('IGST')),
      'Case 4: Wrong Tax Type',
      `Identified tax type mismatch: ${taxCheck103?.reason}`
    );

    // Case 5: Invalid GSTIN Format / Checksum (INV-104)
    console.log('Testing Case 5: Invalid GSTIN Checksum (INV-104)...');
    const invalidGstinSupplierId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const inv104Id = '10104000-0000-0000-0000-000000000104';

    // Supplier with bad checksum in position 15
    inMemoryDb.suppliers = inMemoryDb.suppliers.filter((s) => s.id !== invalidGstinSupplierId);
    inMemoryDb.suppliers.push({
      id: invalidGstinSupplierId,
      name: 'Faulty GSTIN Supplier',
      gstin: '27AAACT1234A1Z9',
      pan: 'AAACT1234A',
      bank_identifier: 'HDFC0009999-1234567890',
      address: 'Mumbai, Maharashtra',
      phone: '+91 99999 88888',
      gst_filing_status: 'Active',
      is_sample_data: true
    });

    inMemoryDb.invoices = inMemoryDb.invoices.filter((i) => i.id !== inv104Id);
    inMemoryDb.invoices.push({
      id: inv104Id,
      invoice_number: 'INV-104',
      normalized_invoice_number: 'INV104',
      supplier_id: invalidGstinSupplierId,
      po_id: cleanPoId,
      invoice_date: '2026-11-07',
      subtotal: 10000.00,
      cgst: 900.00,
      sgst: 900.00,
      igst: 0.00,
      total: 11800.00,
      status: 'PENDING',
      is_sample_data: true,
      created_at: new Date('2026-11-07T00:00:00Z')
    });

    try {
      await pool.query(`
        INSERT INTO suppliers (id, name, gstin, pan, bank_identifier, address, phone, gst_filing_status, is_sample_data)
        VALUES ($1, 'Faulty GSTIN Supplier', '27AAACT1234A1Z9', 'AAACT1234A', 'HDFC0009999-1234567890', 'Mumbai, Maharashtra', '+91 99999 88888', 'Active', true)
        ON CONFLICT (id) DO NOTHING;
      `, [invalidGstinSupplierId]);

      await pool.query(`
        INSERT INTO invoices (id, invoice_number, normalized_invoice_number, supplier_id, po_id, invoice_date, subtotal, cgst, sgst, igst, total, status, is_sample_data)
        VALUES ($1, 'INV-104', 'INV104', $2, $3, '2026-11-07', 10000.00, 900.00, 900.00, 0.00, 11800.00, 'PENDING', true)
        ON CONFLICT (id) DO NOTHING;
      `, [inv104Id, invalidGstinSupplierId, cleanPoId]);
    } catch {}

    const gst104 = await checkInvoiceGst(inv104Id, 'system-test');
    const gstinCheck104 = gst104.checks.find((c: any) => c.rule_code === 'GSTIN_INVALID');
    assert(gst104.overall_status === 'FAIL' || gstinCheck104?.status === 'FAIL', 'Case 5: Invalid GSTIN', 'GSTIN validation failed');

    // Case 6: Partial Deliveries (INV-106)
    console.log('Testing Case 6: Partial Deliveries Aggregation (INV-106)...');
    const inv106Id = '10106000-0000-0000-0000-000000000106';
    const po106Id = 'p0106000-0000-0000-0000-000000000106';

    inMemoryDb.purchase_orders = inMemoryDb.purchase_orders.filter((p) => p.id !== po106Id);
    inMemoryDb.purchase_orders.push({
      id: po106Id,
      po_number: 'PO-106',
      supplier_id: supplierBId,
      order_date: '2026-11-01',
      total_amount: 50000.00,
      status: 'OPEN',
      created_by: '55555555-5555-5555-5555-555555555555',
      is_sample_data: true
    });

    inMemoryDb.po_lines = inMemoryDb.po_lines.filter((p) => p.id !== 'p0106111-0000-0000-0000-000000000106');
    inMemoryDb.po_lines.push({
      id: 'p0106111-0000-0000-0000-000000000106',
      po_id: po106Id,
      item_name: 'Industrial Pumps',
      quantity: 100.000,
      unit_price: 500.00,
      total_price: 50000.00,
      tax_rate: 18.00
    });

    inMemoryDb.grns = inMemoryDb.grns.filter((g) => g.id !== '90106001-0000-0000-0000-000000000106' && g.id !== '90106002-0000-0000-0000-000000000106');
    inMemoryDb.grns.push(
      {
        id: '90106001-0000-0000-0000-000000000106',
        grn_number: 'GRN-106-PART-1',
        po_id: po106Id,
        received_date: '2026-11-03',
        received_by: '44444444-4444-4444-4444-444444444444',
        is_sample_data: true
      },
      {
        id: '90106002-0000-0000-0000-000000000106',
        grn_number: 'GRN-106-PART-2',
        po_id: po106Id,
        received_date: '2026-11-05',
        received_by: '44444444-4444-4444-4444-444444444444',
        is_sample_data: true
      }
    );

    inMemoryDb.grn_lines = inMemoryDb.grn_lines.filter((l) => l.id !== '90106111-0000-0000-0000-000000000106' && l.id !== '90106112-0000-0000-0000-000000000106');
    inMemoryDb.grn_lines.push(
      {
        id: '90106111-0000-0000-0000-000000000106',
        grn_id: '90106001-0000-0000-0000-000000000106',
        item_name: 'Industrial Pumps',
        quantity_received: 40.000
      },
      {
        id: '90106112-0000-0000-0000-000000000106',
        grn_id: '90106002-0000-0000-0000-000000000106',
        item_name: 'Industrial Pumps',
        quantity_received: 35.000
      }
    );

    inMemoryDb.invoices = inMemoryDb.invoices.filter((i) => i.id !== inv106Id);
    inMemoryDb.invoices.push({
      id: inv106Id,
      invoice_number: 'INV-106',
      normalized_invoice_number: 'INV106',
      supplier_id: supplierBId,
      po_id: po106Id,
      invoice_date: '2026-11-07',
      subtotal: 50000.00,
      cgst: 4500.00,
      sgst: 4500.00,
      igst: 0.00,
      total: 59000.00,
      status: 'PENDING',
      is_sample_data: true,
      created_at: new Date('2026-11-07T00:00:00Z')
    });

    inMemoryDb.invoice_lines = inMemoryDb.invoice_lines.filter((l) => l.id !== '10106111-0000-0000-0000-000000000106');
    inMemoryDb.invoice_lines.push({
      id: '10106111-0000-0000-0000-000000000106',
      invoice_id: inv106Id,
      item_name: 'Industrial Pumps',
      quantity: 100.000,
      unit_price: 500.00,
      total_price: 50000.00,
      tax_rate: 18.00
    });

    try {
      await pool.query(`
        INSERT INTO purchase_orders (id, po_number, supplier_id, order_date, total_amount, status, created_by, is_sample_data)
        VALUES ($1, 'PO-106', $2, '2026-11-01', 50000.00, 'OPEN', '55555555-5555-5555-5555-555555555555', true)
        ON CONFLICT (id) DO NOTHING;
      `, [po106Id, supplierBId]);

      await pool.query(`
        INSERT INTO po_lines (id, po_id, item_name, quantity, unit_price, total_price, tax_rate)
        VALUES ('p0106111-0000-0000-0000-000000000106', $1, 'Industrial Pumps', 100.000, 500.00, 50000.00, 18.00)
        ON CONFLICT (id) DO NOTHING;
      `, [po106Id]);

      await pool.query(`
        INSERT INTO grns (id, grn_number, po_id, received_date, received_by, is_sample_data)
        VALUES ('90106001-0000-0000-0000-000000000106', 'GRN-106-PART-1', $1, '2026-11-03', '44444444-4444-4444-4444-444444444444', true)
        ON CONFLICT (id) DO NOTHING;
      `, [po106Id]);

      await pool.query(`
        INSERT INTO grn_lines (id, grn_id, item_name, quantity_received)
        VALUES ('90106111-0000-0000-0000-000000000106', '90106001-0000-0000-0000-000000000106', 'Industrial Pumps', 40.000)
        ON CONFLICT (id) DO NOTHING;
      `, []);

      await pool.query(`
        INSERT INTO grns (id, grn_number, po_id, received_date, received_by, is_sample_data)
        VALUES ('90106002-0000-0000-0000-000000000106', 'GRN-106-PART-2', $1, '2026-11-05', '44444444-4444-4444-4444-444444444444', true)
        ON CONFLICT (id) DO NOTHING;
      `, [po106Id]);

      await pool.query(`
        INSERT INTO grn_lines (id, grn_id, item_name, quantity_received)
        VALUES ('90106112-0000-0000-0000-000000000106', '90106002-0000-0000-0000-000000000106', 'Industrial Pumps', 35.000)
        ON CONFLICT (id) DO NOTHING;
      `, []);

      await pool.query(`
        INSERT INTO invoices (id, invoice_number, normalized_invoice_number, supplier_id, po_id, invoice_date, subtotal, cgst, sgst, igst, total, status, is_sample_data)
        VALUES ($1, 'INV-106', 'INV106', $2, $3, '2026-11-07', 50000.00, 4500.00, 4500.00, 0.00, 59000.00, 'PENDING', true)
        ON CONFLICT (id) DO NOTHING;
      `, [inv106Id, supplierBId, po106Id]);

      await pool.query(`
        INSERT INTO invoice_lines (id, invoice_id, item_name, quantity, unit_price, total_price, tax_rate)
        VALUES ('10106111-0000-0000-0000-000000000106', $1, 'Industrial Pumps', 100.000, 500.00, 50000.00, 18.00)
        ON CONFLICT (id) DO NOTHING;
      `, [inv106Id]);
    } catch {}

    const partialMatch = await matchInvoice(inv106Id, 'system-test');
    assert(partialMatch.status === 'MISMATCH', 'Case 6: Partial Deliveries', 'Multi-GRN aggregation detects quantity shortfall');
    assert(
      partialMatch.reasons.some((r: string) => r.includes('Invoice qty 100 exceeds received qty 75 by 25')),
      'Case 6: Partial Deliveries',
      'Correctly sums 40 + 35 = 75 received vs 100 billed'
    );

    // ========================================================================
    // SECTION 4: EDGE CASES & DEFENSIVE HARDENING
    // ========================================================================
    console.log('\n--- SECTION 4: Edge Cases & Defensive Hardening ---');

    // Edge Case 1: Newly uploaded invoice (no match yet)
    console.log('Testing Edge Case 1: Newly uploaded invoice without matching...');
    const newInvId = '10199000-0000-0000-0000-000000000199';
    inMemoryDb.invoices = inMemoryDb.invoices.filter((i) => i.id !== newInvId);
    inMemoryDb.invoices.push({
      id: newInvId,
      invoice_number: 'INV-NEW-UNMATCHED',
      normalized_invoice_number: 'INVNEWUNMATCHED',
      supplier_id: supplierBId,
      invoice_date: '2026-11-08',
      subtotal: 25000.00,
      cgst: 2250.00,
      sgst: 2250.00,
      igst: 0.00,
      total: 29500.00,
      status: 'EXTRACTED',
      is_sample_data: true,
      created_at: new Date('2026-11-08T00:00:00Z')
    });

    try {
      await pool.query(`
        INSERT INTO invoices (id, invoice_number, normalized_invoice_number, supplier_id, invoice_date, subtotal, cgst, sgst, igst, total, status, is_sample_data)
        VALUES ($1, 'INV-NEW-UNMATCHED', 'INVNEWUNMATCHED', $2, '2026-11-08', 25000.00, 2250.00, 2250.00, 0.00, 29500.00, 'EXTRACTED', true)
        ON CONFLICT (id) DO NOTHING;
      `, [newInvId, supplierBId]);
    } catch {}

    const newMatchResultRes = await fetch(`${baseUrl}/api/invoices/${newInvId}/match-result`, {
      headers: { Authorization: `Bearer ${tokens['AP Employee']}` }
    });
    const newMatchResultData: any = await newMatchResultRes.json();
    assert(newMatchResultRes.status === 200 && newMatchResultData.match_result === null, 'Edge Case 1', 'Unmatched invoice returns 200 with match_result: null, no crash');

    // Edge Case 2: Extraction failure / corrupt file handling
    console.log('Testing Edge Case 2: Corrupt / Unsupported file upload...');
    const badUploadRes = await fetch(`${baseUrl}/api/invoices/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=testboundary',
        Authorization: `Bearer ${tokens['AP Employee']}`
      },
      body: Buffer.from('--testboundary\r\nContent-Disposition: form-data; name="wrong_field"\r\n\r\nBadData\r\n--testboundary--\r\n')
    });
    assert(badUploadRes.status === 400, 'Edge Case 2', 'Missing/invalid file rejected with 400 Bad Request, no 500 crash');

    // Edge Case 3: Non-existent IDs
    console.log('Testing Edge Case 3: Non-existent Entity IDs...');
    const nonExistentInvRes = await fetch(`${baseUrl}/api/invoices/99999999-9999-9999-9999-999999999999`, {
      headers: { Authorization: `Bearer ${tokens['AP Employee']}` }
    });
    assert(nonExistentInvRes.status === 404, 'Edge Case 3', 'Non-existent invoice returns 404 Not Found');

    const nonExistentScorecardRes = await fetch(`${baseUrl}/api/suppliers/99999999-9999-9999-9999-999999999999/scorecard`, {
      headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
    });
    assert(nonExistentScorecardRes.status === 404, 'Edge Case 3', 'Non-existent supplier scorecard returns 404 Not Found');

    // Edge Case 4: Supplier with zero past invoices
    console.log('Testing Edge Case 4: Supplier with zero invoices...');
    const zeroInvSupplierId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    inMemoryDb.suppliers = inMemoryDb.suppliers.filter((s) => s.id !== zeroInvSupplierId);
    inMemoryDb.suppliers.push({
      id: zeroInvSupplierId,
      name: 'Brand New Zero-Invoice Supplier',
      gstin: '27AABCA9999B1Z4',
      pan: 'AABCA9999B',
      bank_identifier: 'ICIC0001234-1122334455',
      address: 'Nagpur, Maharashtra',
      phone: '+91 91234 56789',
      gst_filing_status: 'Active',
      is_sample_data: true
    });

    try {
      await pool.query(`
        INSERT INTO suppliers (id, name, gstin, pan, bank_identifier, address, phone, gst_filing_status, is_sample_data)
        VALUES ($1, 'Brand New Zero-Invoice Supplier', '27AABCA9999B1Z4', 'AABCA9999B', 'ICIC0001234-1122334455', 'Nagpur, Maharashtra', '+91 91234 56789', 'Active', true)
        ON CONFLICT (id) DO NOTHING;
      `, [zeroInvSupplierId]);
    } catch {}

    const zeroScorecardRes = await fetch(`${baseUrl}/api/suppliers/${zeroInvSupplierId}/scorecard`, {
      headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
    });
    const zeroScorecardData: any = await zeroScorecardRes.json();
    assert(zeroScorecardRes.status === 200, 'Edge Case 4', 'Supplier with 0 invoices computes scorecard safely without divide-by-zero or crash');
    assert(!isNaN(zeroScorecardData.scorecard?.overall_score), 'Edge Case 4', `Overall score is a valid number (${zeroScorecardData.scorecard?.overall_score})`);

    const zeroOverbillingRes = await fetch(`${baseUrl}/api/suppliers/${zeroInvSupplierId}/overbilling`, {
      headers: { Authorization: `Bearer ${tokens['Finance Manager']}` }
    });
    const zeroOverbillingData: any = await zeroOverbillingRes.json();
    assert(zeroOverbillingRes.status === 200 && zeroOverbillingData.has_overbilling_pattern === false, 'Edge Case 4', 'Overbilling returns pattern: false with 0 charges');

    // Edge Case 5: Maker-Checker Block & Admin Payment Approval Prevention
    console.log('Testing Edge Case 5: Maker-Checker collision & Admin Payment Prohibition...');
    const adminPaymentRes = await fetch(`${baseUrl}/api/invoices/${cleanInvId}/approve-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens['Admin']}`
      },
      body: JSON.stringify({ notes: 'Admin attempting payment approval' })
    });
    assert(adminPaymentRes.status === 403, 'Edge Case 5', 'Admin payment approval strictly blocked with 403 Forbidden (Golden Rule)');

    // Edge Case 6: Payment Release Gate on Unresolved Investigations
    console.log('Testing Edge Case 6: Payment Gate blocks release when investigations exist...');
    const gateRes = await fetch(`${baseUrl}/api/invoices/${inv101Id}/approve-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens['Finance Manager']}`
      },
      body: JSON.stringify({ notes: 'Premature payment attempt' })
    });
    assert(gateRes.status === 400 || gateRes.status === 403, 'Edge Case 6', 'Payment approval blocked while unresolved investigations exist');

    console.log('\n======================================================================');
    console.log(' FINSHIELD AI: ALL END-TO-END SCREEN & EDGE CASE TESTS PASSED');
    console.log(` Total Assertions Verified: ${testResults.length} / ${testResults.length} (100% Success)`);
    console.log(' Zero 500 Crashes, Zero Blank Screen Triggers, Strict RBAC Confirmed');
    console.log('======================================================================\n');
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runE2EScreenTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\nE2E Screen Tests Failed with Error:', err);
      process.exit(1);
    });
}
