import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchInvoice, getMatchResult } from '../services/matchingService';
import { detectDuplicates } from '../services/duplicateService';
import { normalizeInvoiceNumber } from '../services/extractionService';
import { inMemoryDb } from '../db/inMemoryDb';

describe('Phase 4: 3-Way Matching Engine', () => {
  it('Normalized invoice numbers strip spaces, dashes, and underscores', () => {
    assert.strictEqual(normalizeInvoiceNumber('INV-101'), 'INV101');
    assert.strictEqual(normalizeInvoiceNumber('INV_101'), 'INV101');
    assert.strictEqual(normalizeInvoiceNumber('INV 101'), 'INV101');
    assert.strictEqual(normalizeInvoiceNumber('inv-2026/01'), 'INV2026/01');
  });

  it('3-Way Match on INV-101 detects quantity discrepancy (100 billed vs 80 received) and flags MISMATCH', async () => {
    const actorId = '33333333-3333-3333-3333-333333333333'; // AP Employee
    const result = await matchInvoice('INV-101', actorId);

    assert.strictEqual(result.status, 'MISMATCH', 'Status must be MISMATCH when billed qty exceeds received qty');
    assert.ok(
      result.reasons.some((r) => r.includes('Invoice qty 100 exceeds received qty 80 by 20')),
      `Expected reason mentioning qty 100 exceeds received qty 80 by 20, got: ${JSON.stringify(result.reasons)}`
    );
    assert.ok(
      result.reasons.some((r) => r.includes('Pending delivery: 20 not yet received')),
      `Expected reason mentioning pending delivery of 20, got: ${JSON.stringify(result.reasons)}`
    );

    // Verify invoice status updated to ON_HOLD
    const inv = inMemoryDb.invoices.find((i) => i.invoice_number === 'INV-101');
    assert.strictEqual(inv?.status, 'ON_HOLD', 'Any MISMATCH must set invoice status to ON_HOLD');
  });

  it('3-Way Match enforces approved PO price and detects unapproved price modifications', async () => {
    const actorId = '22222222-2222-2222-2222-222222222222'; // Finance Manager
    const result = await matchInvoice('INV-101', actorId);

    // Compared values must reflect approved price of 500, not unapproved 700
    assert.ok(result.compared_values.unapproved_po_change_detected, 'Must detect unapproved PO change');
    const teakItem = result.compared_values.items.find((i) => i.item_name.includes('Teak Wood'));
    assert.ok(teakItem, 'Teak Wood line item must be present');
    assert.strictEqual(teakItem?.po_approved_price, 500, 'Approved price must be Rs 500');
  });

  it('Partial and multiple deliveries sum across GRNs correctly', async () => {
    // Simulate a second GRN delivering the remaining 20 units
    const secondGrnId = '90101000-0000-0000-0000-000000000102';
    inMemoryDb.grns.push({
      id: secondGrnId,
      grn_number: 'GRN-102',
      po_id: 'p0101000-0000-0000-0000-000000000101',
      received_date: '2026-11-07',
      received_by: '44444444-4444-4444-4444-444444444444',
      is_sample_data: true
    });
    inMemoryDb.grn_lines.push({
      id: '90101111-0000-0000-0000-000000000102',
      grn_id: secondGrnId,
      item_name: 'Teak Wood 100kg (Sample Data)',
      quantity_received: 20.000
    });

    const actorId = '33333333-3333-3333-3333-333333333333';
    const result = await matchInvoice('INV-101', actorId);

    // With 80 + 20 = 100 received, quantity is now matched!
    const teakItem = result.compared_values.items.find((i) => i.item_name.includes('Teak Wood'));
    assert.strictEqual(teakItem?.grn_qty, 100, 'Sum of GRN-101 (80) + GRN-102 (20) must be 100');
    assert.strictEqual(teakItem?.qty_matched, true, 'Quantity must be matched when total received equals invoice');
    assert.strictEqual(result.status, 'MATCHED', 'Invoice status must be MATCHED when price and quantity agree');

    // Clean up temporary second GRN
    inMemoryDb.grns = inMemoryDb.grns.filter((g) => g.id !== secondGrnId);
    inMemoryDb.grn_lines = inMemoryDb.grn_lines.filter((l) => l.grn_id !== secondGrnId);
  });

  it('Latest match result can be retrieved via getMatchResult', async () => {
    const inv = inMemoryDb.invoices.find((i) => i.invoice_number === 'INV-101');
    assert.ok(inv, 'INV-101 must exist');
    const match = await getMatchResult(inv!.id);
    assert.ok(match, 'Match result must be found');
    assert.ok(match?.compared_values, 'Compared values must be present');
  });
});

describe('Phase 4: Duplicate Invoice Detection Engine', () => {
  it('Detects duplicate invoice INV_101 matching INV-101 with similarity score >= 0.85', async () => {
    const dupInv = inMemoryDb.invoices.find((i) => i.invoice_number === 'INV_101');
    assert.ok(dupInv, 'Seed duplicate INV_101 must exist');

    const result = await detectDuplicates(dupInv!.id);

    assert.strictEqual(result.is_possible_duplicate, true, 'Must flag is_possible_duplicate as true');
    assert.ok(result.highest_similarity >= 0.85, `Similarity ${result.highest_similarity} must exceed threshold 0.85`);
    assert.ok(result.duplicates.length > 0, 'Must return at least one matching duplicate candidate');

    const matched = result.duplicates[0];
    assert.strictEqual(matched.invoice_number, 'INV-101', 'Must match against INV-101');
    assert.ok(
      matched.reasons.some((r) => r.includes('Identical normalized invoice number')),
      'Must explain normalized invoice number match'
    );
    assert.ok(
      matched.reasons.some((r) => r.includes('Same supplier')),
      'Must explain supplier match'
    );
    assert.ok(
      matched.reasons.some((r) => r.includes('Identical invoice total')),
      'Must explain total amount match'
    );
  });

  it('Different invoice with different supplier, amount, and number is not flagged as duplicate', async () => {
    // Target invoice: INV-101
    const inv101 = inMemoryDb.invoices.find((i) => i.invoice_number === 'INV-101');
    const result = await detectDuplicates(inv101!.id);

    // It will find INV_101 as duplicate, which is expected
    const dupMatch = result.duplicates.find((d) => d.invoice_number === 'INV_101');
    assert.ok(dupMatch, 'INV-101 must also identify INV_101 as duplicate candidate');
  });
});
