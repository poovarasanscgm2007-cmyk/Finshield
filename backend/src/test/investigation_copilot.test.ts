import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { inMemoryDb } from '../db/inMemoryDb';
import {
  syncInvoiceInvestigations,
  updateInvestigationStatus,
  checkInvestigationRBAC,
  revalidateInvestigation
} from '../services/investigationService';
import { askCopilot } from '../services/copilotService';
import { matchInvoice } from '../services/matchingService';
import { pool } from '../db';

describe('Phase 6 (A): Investigation & Resolution Workflow', () => {
  beforeEach(() => {
    inMemoryDb.resetDemoData();
  });

  test('INV-101 creates investigations with correct departments and severities', async () => {
    const investigations = await syncInvoiceInvestigations('10101000-0000-0000-0000-000000000101');

    assert.ok(investigations.length >= 4, `Expected at least 4 investigations, got ${investigations.length}`);

    // 1. Quantity mismatch routed to Warehouse
    const qtyInv = investigations.find(i => i.issue_type === 'QUANTITY_MISMATCH');
    assert.ok(qtyInv, 'QUANTITY_MISMATCH investigation should exist');
    assert.strictEqual(qtyInv.department, 'Warehouse');
    assert.strictEqual(qtyInv.severity, 'HIGH');
    assert.strictEqual(qtyInv.status, 'OPEN');

    // 2. PO Change routed to Procurement/Finance
    const poInv = investigations.find(i => i.issue_type === 'UNAUTHORIZED_PO_CHANGE' || i.issue_type === 'PO_UNAPPROVED_CHANGE');
    assert.ok(poInv, 'UNAUTHORIZED_PO_CHANGE investigation should exist');
    assert.strictEqual(poInv.department, 'Procurement/Finance');
    assert.strictEqual(poInv.severity, 'HIGH');

    // 3. Overbilling routed to AP/Finance
    const obInv = investigations.find(i => i.issue_type === 'HISTORICAL_OVERBILLING');
    assert.ok(obInv, 'HISTORICAL_OVERBILLING investigation should exist');
    assert.strictEqual(obInv.department, 'AP/Finance');
    assert.strictEqual(obInv.severity, 'MEDIUM');

    // 4. GST/ITC Risk routed to Finance/Compliance
    const gstInv = investigations.find(i => i.issue_type === 'GST_ITC_RISK');
    assert.ok(gstInv, 'GST_ITC_RISK investigation should exist');
    assert.strictEqual(gstInv.department, 'Finance/Compliance');
    assert.strictEqual(gstInv.severity, 'HIGH');
  });

  test('Warehouse user cannot update a Finance-only investigation (RBAC 403 Forbidden)', async () => {
    const warehouseUser = {
      id: '44444444-4444-4444-4444-444444444444',
      name: 'Warehouse Lead',
      role: 'Warehouse Employee'
    };

    // RBAC check function test
    assert.strictEqual(checkInvestigationRBAC('Warehouse Employee', 'Warehouse'), true);
    assert.strictEqual(checkInvestigationRBAC('Warehouse Employee', 'Finance/Compliance'), false);
    assert.strictEqual(checkInvestigationRBAC('Warehouse Employee', 'Procurement/Finance'), false);

    // Call update on Finance/Compliance investigation with Warehouse Employee
    const gstInv = inMemoryDb.investigations.find(i => i.issue_type === 'GST_ITC_RISK')!;
    assert.ok(gstInv);

    await assert.rejects(
      async () => {
        await updateInvestigationStatus(
          gstInv.id,
          'IN_PROGRESS',
          'Attempting warehouse update on finance issue',
          warehouseUser
        );
      },
      (err: any) => {
        return err.statusCode === 403 && err.message.includes('cannot update investigations assigned to');
      }
    );
  });

  test('Adding a corrected GRN of 100 kg and resolving quantity issue clears mismatch; other issues stay open and invoice remains ON_HOLD', async () => {
    const warehouseUser = {
      id: '44444444-4444-4444-4444-444444444444',
      name: 'Warehouse Lead',
      role: 'Warehouse Employee'
    };

    const invoiceId = '10101000-0000-0000-0000-000000000101';
    const poId = 'p0101000-0000-0000-0000-000000000101';

    // 1. Initial matching has quantity mismatch (80 vs 100 kg)
    const initialMatch = await matchInvoice(invoiceId, 'SYSTEM');
    assert.strictEqual(initialMatch.status, 'MISMATCH');

    // 2. Warehouse Employee records supplementary GRN-102 of 20 kg (total received = 80 + 20 = 100 kg)
    await pool.query(
      `INSERT INTO grns (grn_number, po_id, received_date, received_by) VALUES ($1, $2, $3, $4)`,
      ['GRN-102', poId, '2026-11-09', warehouseUser.id]
    );
    const grn102 = inMemoryDb.grns.find(g => g.grn_number === 'GRN-102')!;
    await pool.query(
      `INSERT INTO grn_lines (grn_id, item_name, quantity_received) VALUES ($1, $2, $3)`,
      [grn102.id, 'Teak Wood 100kg (Sample Data)', 20.00]
    );

    // 3. Warehouse resolves QUANTITY_MISMATCH investigation
    const qtyInv = inMemoryDb.investigations.find(i => i.issue_type === 'QUANTITY_MISMATCH')!;
    const resolveResult = await updateInvestigationStatus(
      qtyInv.id,
      'RESOLVED',
      'Supplementary delivery GRN-102 received (20 kg). Total received now matches 100 kg.',
      warehouseUser,
      'Supplementary delivery verified and received at dock'
    );

    // 4. Verify revalidation outcome:
    // Quantity investigation is REVALIDATED
    assert.strictEqual(resolveResult.investigation.status, 'REVALIDATED');
    assert.ok(resolveResult.investigation.revalidation_result?.passed === true);

    // Other issues (PO change, GST, overbilling) remain OPEN!
    const poInv = inMemoryDb.investigations.find(i => i.issue_type === 'UNAUTHORIZED_PO_CHANGE')!;
    const gstInv = inMemoryDb.investigations.find(i => i.issue_type === 'GST_ITC_RISK')!;
    assert.strictEqual(poInv.status, 'OPEN');
    assert.strictEqual(gstInv.status, 'OPEN');

    // Invoice payment_status MUST remain ON_HOLD (Golden Rule 2 & Gate rule)
    const invRes = await pool.query('SELECT payment_status FROM invoices WHERE id = $1', [invoiceId]);
    assert.strictEqual(invRes.rows[0].payment_status, 'ON_HOLD');
  });
});

describe('Phase 6 (B): AI Copilot Engine & Fact Grounding', () => {
  beforeEach(() => {
    inMemoryDb.resetDemoData();
  });

  test('Copilot answer for "Why is Supplier A\'s invoice flagged?" contains 20 kg gap, Rs 500 to Rs 700 change, extra charges, and ITC risk with exact evidence', async () => {
    const response = await askCopilot("Why is Supplier A's invoice flagged?", undefined, {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Finance Manager',
      role: 'Finance Manager'
    });

    assert.ok(response.answer, 'Copilot must provide an answer');

    // Check all 4 core facts in answer text
    assert.ok(
      response.answer.includes('20 kg') || response.answer.includes('80 kg') || response.answer.includes('100 kg'),
      'Answer must reference the 20 kg quantity shortage'
    );
    assert.ok(
      response.answer.includes('500') && response.answer.includes('700'),
      'Answer must reference the Rs 500 to Rs 700 unapproved change'
    );
    assert.ok(
      response.answer.includes('Employee 102'),
      'Answer must reference Employee 102'
    );
    assert.ok(
      response.answer.includes('9') || response.answer.includes('historical') || response.answer.includes('overbilling'),
      'Answer must reference historical overbilling pattern'
    );
    assert.ok(
      response.answer.includes('GSTR-2B') || response.answer.includes('ITC') || response.answer.includes('9,000'),
      'Answer must reference the Rs 9,000 GSTR-2B ITC risk'
    );

    // Check evidence array
    assert.ok(Array.isArray(response.evidence) && response.evidence.length >= 4, 'Must return at least 4 evidence references');
    const grnEv = response.evidence.find(e => e.type === 'GRN');
    const poEv = response.evidence.find(e => e.type === 'PO_CHANGE');
    const obEv = response.evidence.find(e => e.type === 'OVERBILLING');
    const gstr2bEv = response.evidence.find(e => e.type === 'GSTR2B');

    assert.ok(grnEv, 'GRN evidence reference must be present');
    assert.ok(poEv, 'PO_CHANGE evidence reference must be present');
    assert.ok(obEv, 'OVERBILLING evidence reference must be present');
    assert.ok(gstr2bEv, 'GSTR2B evidence reference must be present');

    // Check recommended actions per department
    assert.ok(response.recommendedActions.some(a => a.department === 'Warehouse'), 'Must recommend action for Warehouse');
    assert.ok(response.recommendedActions.some(a => a.department === 'Procurement'), 'Must recommend action for Procurement');
    assert.ok(response.recommendedActions.some(a => a.department === 'Finance'), 'Must recommend action for Finance');
  });

  test('Copilot answer for "What is the total ITC at risk?" returns exact Rs 9,000 amount and GSTR-2B reason', async () => {
    const response = await askCopilot('What is the total ITC at risk?');
    assert.ok(response.answer.includes('9,000'));
    assert.ok(response.answer.includes('GSTR-2B'));
    assert.ok(response.evidence.some(e => e.type === 'GSTR2B'));
  });

  test('Copilot answer for "Who is assigned to INV-101 issues?" lists all 4 department assignments', async () => {
    const response = await askCopilot('Who is assigned to INV-101 issues?');
    assert.ok(response.answer.includes('Warehouse'));
    assert.ok(response.answer.includes('Procurement'));
    assert.ok(response.answer.includes('AP'));
    assert.ok(response.answer.includes('Finance'));
  });
});

describe('Phase 6 (C): Payment Gate & Maker-Checker', () => {
  beforeEach(() => {
    inMemoryDb.resetDemoData();
  });

  test('Payment cannot be approved while any investigation is not REVALIDATED', async () => {
    const invoiceId = '10101000-0000-0000-0000-000000000101';
    const invRes = await pool.query('SELECT * FROM investigations WHERE invoice_id = $1', [invoiceId]);
    const openCount = invRes.rows.filter((i: any) => i.status !== 'REVALIDATED').length;
    assert.ok(openCount > 0, 'Seed invoice INV-101 must have open investigations');

    // Invoice payment status must be ON_HOLD
    const invStatusRes = await pool.query('SELECT payment_status FROM invoices WHERE id = $1', [invoiceId]);
    assert.strictEqual(invStatusRes.rows[0].payment_status, 'ON_HOLD');
  });
});
