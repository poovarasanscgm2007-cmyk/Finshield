-- ==============================================================================
-- FINSHIELD AI: Sample Seed Data (Phase 1)
-- Seed script for Demo Scenario (PROJECT_SPEC.md Section 6)
-- ALL RECORDS ARE SYNTHETIC SAMPLE DATA (is_sample_data = TRUE)
-- ==============================================================================

-- Clean existing data
DELETE FROM audit_log WHERE is_sample_data = TRUE;
DELETE FROM investigations WHERE is_sample_data = TRUE;
DELETE FROM risk_flags WHERE is_sample_data = TRUE;
DELETE FROM match_results WHERE is_sample_data = TRUE;
DELETE FROM risk_rules_config WHERE is_sample_data = TRUE;
DELETE FROM gstr2b_records WHERE is_sample_data = TRUE;
DELETE FROM invoice_lines WHERE item_name LIKE '%(Sample%';
DELETE FROM invoices WHERE is_sample_data = TRUE;
DELETE FROM grn_lines WHERE item_name LIKE '%(Sample%';
DELETE FROM grns WHERE is_sample_data = TRUE;
DELETE FROM po_change_history WHERE is_sample_data = TRUE;
DELETE FROM approvals WHERE is_sample_data = TRUE;
DELETE FROM po_lines WHERE item_name LIKE '%(Sample%';
DELETE FROM purchase_orders WHERE is_sample_data = TRUE;
DELETE FROM suppliers WHERE is_sample_data = TRUE;
DELETE FROM users WHERE is_sample_data = TRUE;

-- ------------------------------------------------------------------------------
-- 1. USERS (5 distinct roles, including Employee 102 in Procurement)
-- ------------------------------------------------------------------------------
INSERT INTO users (id, name, email, password_hash, role, is_sample_data) VALUES
('11111111-1111-1111-1111-111111111111', 'Admin User (Sample Data)', 'admin@finshield.sample', '$2b$10$W59YKQZYj2PLQncLmvtKcO0bAe/tJ0CyGH1EqtEeTAQPUxGqHVRna', 'Admin', TRUE),
('22222222-2222-2222-2222-222222222222', 'Finance Manager (Sample Data)', 'finance@finshield.sample', '$2b$10$bnFpgwNewg.CBT1FDGgmSuYxd9A7IDXuEGh6U9l/bI74TUwvqhwu6', 'Finance Manager', TRUE),
('33333333-3333-3333-3333-333333333333', 'AP Specialist (Sample Data)', 'ap@finshield.sample', '$2b$10$18yK/pse/9vAXrFmgWJNwe9l1P72SlxWbYX1wfj/sHKC6iuVmOifi', 'AP Employee', TRUE),
('44444444-4444-4444-4444-444444444444', 'Warehouse Supervisor (Sample Data)', 'warehouse@finshield.sample', '$2b$10$OX3Wx4WAdAwhD6e7CWMrdulqYiEujRAAXVia0WjZ.qMSZLwL23.iu', 'Warehouse Employee', TRUE),
('55555555-5555-5555-5555-555555555555', 'Employee 102 (Sample Data)', 'emp102@finshield.sample', '$2b$10$wIA0di0CF0xBfExwlLS48OgnxP/bk1yWeSE5q.IHrn04TPH5l2kXO', 'Procurement Employee', TRUE);

-- ------------------------------------------------------------------------------
-- 2. SUPPLIERS (Supplier A & Supplier B sharing same bank_identifier)
-- ------------------------------------------------------------------------------
INSERT INTO suppliers (id, name, gstin, pan, bank_identifier, address, phone, gst_filing_status, is_sample_data) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TimberCraft Woodworks (Supplier A) (Sample Data)', '27AAACT1234A1Z5', 'AAACT1234A', 'HDFC0001234-9876543210', 'Plot 42, Wood Processing Zone, Pune, Maharashtra 411001', '+91 98765 43210', 'Active', TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Apex Timber Supplies (Supplier B) (Sample Data)', '27AABCA5678B1Z2', 'AABCA5678B', 'HDFC0001234-9876543210', 'Unit 10, Metro Logistics Park, Pune, Maharashtra 411014', '+91 98765 43211', 'Active', TRUE);

-- ------------------------------------------------------------------------------
-- 3. PURCHASE ORDER: PO-101 (Buyer: ABC Manufacturing sample)
-- Originally Rs 500/kg for 100 kg wood = Rs 50,000, modified to Rs 700/kg = Rs 70,000
-- ------------------------------------------------------------------------------
INSERT INTO purchase_orders (id, po_number, supplier_id, order_date, total_amount, status, created_by, is_sample_data) VALUES
('p0101000-0000-0000-0000-000000000101', 'PO-101', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-01', 70000.00, 'OPEN', '55555555-5555-5555-5555-555555555555', TRUE);

INSERT INTO po_lines (id, po_id, item_name, quantity, unit_price, total_price, tax_rate) VALUES
('p0101111-0000-0000-0000-000000000101', 'p0101000-0000-0000-0000-000000000101', 'Teak Wood 100kg (Sample Data)', 100.000, 700.00, 70000.00, 18.00);

-- ------------------------------------------------------------------------------
-- 4. PO CHANGE HISTORY: Planted unapproved price modification
-- Modified Rs 500 to Rs 700 by Employee 102 with NO approval record (approval_id = NULL)
-- ------------------------------------------------------------------------------
INSERT INTO po_change_history (id, po_id, changed_by, changed_at, field, old_value, new_value, approval_id, is_sample_data) VALUES
('c0101000-0000-0000-0000-000000000101', 'p0101000-0000-0000-0000-000000000101', '55555555-5555-5555-5555-555555555555', '2026-11-03 10:30:00+05:30', 'unit_price', '500.00', '700.00', NULL, TRUE);

-- ------------------------------------------------------------------------------
-- 5. GOODS RECEIPT NOTE: GRN-101
-- Planted discrepancy: 80 kg received vs 100 kg ordered/billed
-- ------------------------------------------------------------------------------
INSERT INTO grns (id, grn_number, po_id, received_date, received_by, is_sample_data) VALUES
('90101000-0000-0000-0000-000000000101', 'GRN-101', 'p0101000-0000-0000-0000-000000000101', '2026-11-05', '44444444-4444-4444-4444-444444444444', TRUE);

INSERT INTO grn_lines (id, grn_id, item_name, quantity_received) VALUES
('90101111-0000-0000-0000-000000000101', '90101000-0000-0000-0000-000000000101', 'Teak Wood 100kg (Sample Data)', 80.000);

-- ------------------------------------------------------------------------------
-- 6. INVOICE: INV-101 and Seed Duplicate Case INV_101
-- 100 kg billed at Rs 500/kg = Rs 50,000 subtotal + Rs 9,000 GST = Rs 59,000 total
-- ------------------------------------------------------------------------------
INSERT INTO invoices (
    id,
    invoice_number,
    normalized_invoice_number,
    irn,
    supplier_id,
    po_id,
    invoice_date,
    subtotal,
    cgst,
    sgst,
    igst,
    total,
    status,
    extraction_confidence,
    file_path,
    is_sample_data
) VALUES (
    '10101000-0000-0000-0000-000000000101',
    'INV-101',
    'INV101',
    '3b48f9361adce6e7194f4a3e9819ec417a8c3d97f1f0a3592bc1784918e9c402',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'p0101000-0000-0000-0000-000000000101',
    '2026-11-08',
    50000.00,
    4500.00,
    4500.00,
    0.00,
    59000.00,
    'PENDING',
    '{"invoice_number": 0.99, "supplier_gstin": 0.98, "subtotal": 0.96, "tax": 0.96, "quantity": 0.97, "unit_price": 0.95}'::jsonb,
    '/sample-data/invoices/INV-101-wood-supplierA.pdf',
    TRUE
),
(
    '10101000-0000-0000-0000-000000000102',
    'INV_101',
    'INV101',
    '3b48f9361adce6e7194f4a3e9819ec417a8c3d97f1f0a3592bc1784918e9c402',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'p0101000-0000-0000-0000-000000000101',
    '2026-11-09',
    50000.00,
    4500.00,
    4500.00,
    0.00,
    59000.00,
    'PENDING',
    '{"invoice_number": 0.99, "supplier_gstin": 0.98, "subtotal": 0.96, "tax": 0.96, "quantity": 0.97, "unit_price": 0.95}'::jsonb,
    '/sample-data/invoices/INV-101-wood-supplierA.pdf',
    TRUE
);

INSERT INTO invoice_lines (id, invoice_id, item_name, quantity, unit_price, total_price, tax_rate) VALUES
('10101111-0000-0000-0000-000000000101', '10101000-0000-0000-0000-000000000101', 'Teak Wood 100kg (Sample Data)', 100.000, 500.00, 50000.00, 18.00),
('10101111-0000-0000-0000-000000000102', '10101000-0000-0000-0000-000000000102', 'Teak Wood 100kg (Sample Data)', 100.000, 500.00, 50000.00, 18.00);

-- ------------------------------------------------------------------------------
-- 7. HISTORICAL INVOICES FOR SUPPLIER A (9 invoices with repeated extra charges: Rs 500, Rs 700, Rs 1000)
-- Demonstrates overbilling history pattern
-- ------------------------------------------------------------------------------
INSERT INTO invoices (id, invoice_number, normalized_invoice_number, irn, supplier_id, invoice_date, subtotal, cgst, sgst, igst, total, status, is_sample_data) VALUES
('a0000001-0000-0000-0000-000000000001', 'INV-HIST-01', 'INVHIST01', NULL, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-05-10', 40500.00, 3645.00, 3645.00, 0.00, 47790.00, 'PAID', TRUE),
('a0000002-0000-0000-0000-000000000002', 'INV-HIST-02', 'INVHIST02', NULL, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-05-28', 55700.00, 5013.00, 5013.00, 0.00, 65726.00, 'PAID', TRUE),
('a0000003-0000-0000-0000-000000000003', 'INV-HIST-03', 'INVHIST03', NULL, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-06-15', 61000.00, 5490.00, 5490.00, 0.00, 71980.00, 'PAID', TRUE),
('a0000004-0000-0000-0000-000000000004', 'INV-HIST-04', 'INVHIST04', NULL, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-07-02', 32500.00, 2925.00, 2925.00, 0.00, 38350.00, 'PAID', TRUE),
('a0000005-0000-0000-0000-000000000005', 'INV-HIST-05', 'INVHIST05', NULL, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-07-24', 48700.00, 4383.00, 4383.00, 0.00, 57466.00, 'PAID', TRUE),
('a0000006-0000-0000-0000-000000000006', 'INV-HIST-06', 'INVHIST06', NULL, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-08-11', 71000.00, 6390.00, 6390.00, 0.00, 83780.00, 'PAID', TRUE),
('a0000007-0000-0000-0000-000000000007', 'INV-HIST-07', 'INVHIST07', NULL, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-05', 45500.00, 4095.00, 4095.00, 0.00, 53690.00, 'PAID', TRUE),
('a0000008-0000-0000-0000-000000000008', 'INV-HIST-08', 'INVHIST08', NULL, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-28', 53700.00, 4833.00, 4833.00, 0.00, 63366.00, 'PAID', TRUE),
('a0000009-0000-0000-0000-000000000009', 'INV-HIST-09', 'INVHIST09', NULL, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-10-18', 66000.00, 5940.00, 5940.00, 0.00, 77880.00, 'PAID', TRUE);

-- Line items for historical invoices with extra charges: Rs 500, Rs 700, Rs 1000
INSERT INTO invoice_lines (invoice_id, item_name, quantity, unit_price, total_price, tax_rate) VALUES
-- HIST-01: Base + Rs 500 extra charge
('a0000001-0000-0000-0000-000000000001', 'Timber Raw Logs (Sample Data)', 80.000, 500.00, 40000.00, 18.00),
('a0000001-0000-0000-0000-000000000001', 'Handling Surcharge (Sample Extra Charge)', 1.000, 500.00, 500.00, 18.00),

-- HIST-02: Base + Rs 700 extra charge
('a0000002-0000-0000-0000-000000000002', 'Timber Raw Logs (Sample Data)', 110.000, 500.00, 55000.00, 18.00),
('a0000002-0000-0000-0000-000000000002', 'Logistics Surcharge (Sample Extra Charge)', 1.000, 700.00, 700.00, 18.00),

-- HIST-03: Base + Rs 1000 extra charge
('a0000003-0000-0000-0000-000000000003', 'Timber Raw Logs (Sample Data)', 120.000, 500.00, 60000.00, 18.00),
('a0000003-0000-0000-0000-000000000003', 'Expedited Unloading Surcharge (Sample Extra Charge)', 1.000, 1000.00, 1000.00, 18.00),

-- HIST-04: Base + Rs 500 extra charge
('a0000004-0000-0000-0000-000000000004', 'Timber Raw Logs (Sample Data)', 64.000, 500.00, 32000.00, 18.00),
('a0000004-0000-0000-0000-000000000004', 'Pallet Packing Fee (Sample Extra Charge)', 1.000, 500.00, 500.00, 18.00),

-- HIST-05: Base + Rs 700 extra charge
('a0000005-0000-0000-0000-000000000005', 'Timber Raw Logs (Sample Data)', 96.000, 500.00, 48000.00, 18.00),
('a0000005-0000-0000-0000-000000000005', 'Logistics Surcharge (Sample Extra Charge)', 1.000, 700.00, 700.00, 18.00),

-- HIST-06: Base + Rs 1000 extra charge
('a0000006-0000-0000-0000-000000000006', 'Timber Raw Logs (Sample Data)', 140.000, 500.00, 70000.00, 18.00),
('a0000006-0000-0000-0000-000000000006', 'Site Gate Processing Fee (Sample Extra Charge)', 1.000, 1000.00, 1000.00, 18.00),

-- HIST-07: Base + Rs 500 extra charge
('a0000007-0000-0000-0000-000000000007', 'Timber Raw Logs (Sample Data)', 90.000, 500.00, 45000.00, 18.00),
('a0000007-0000-0000-0000-000000000007', 'Handling Surcharge (Sample Extra Charge)', 1.000, 500.00, 500.00, 18.00),

-- HIST-08: Base + Rs 700 extra charge
('a0000008-0000-0000-0000-000000000008', 'Timber Raw Logs (Sample Data)', 106.000, 500.00, 53000.00, 18.00),
('a0000008-0000-0000-0000-000000000008', 'Logistics Surcharge (Sample Extra Charge)', 1.000, 700.00, 700.00, 18.00),

-- HIST-09: Base + Rs 1000 extra charge
('a0000009-0000-0000-0000-000000000009', 'Timber Raw Logs (Sample Data)', 130.000, 500.00, 65000.00, 18.00),
('a0000009-0000-0000-0000-000000000009', 'Expedited Unloading Surcharge (Sample Extra Charge)', 1.000, 1000.00, 1000.00, 18.00);

-- ------------------------------------------------------------------------------
-- 8. GSTR-2B RECORDS (INV-101 IS INTENTIONALLY MISSING => ITC at risk!)
-- Historical invoices and Supplier B are present, but INV-101 is NOT reported
-- ------------------------------------------------------------------------------
INSERT INTO gstr2b_records (
    id,
    gstin_supplier,
    invoice_number,
    invoice_date,
    invoice_value,
    taxable_value,
    cgst,
    sgst,
    igst,
    filing_period,
    is_sample_data
) VALUES
('g0000001-0000-0000-0000-000000000001', '27AAACT1234A1Z5', 'INV-HIST-08', '2026-09-28', 63366.00, 53700.00, 4833.00, 4833.00, 0.00, '2026-09', TRUE),
('g0000002-0000-0000-0000-000000000002', '27AAACT1234A1Z5', 'INV-HIST-09', '2026-10-18', 77880.00, 66000.00, 5940.00, 5940.00, 0.00, '2026-10', TRUE),
('g0000003-0000-0000-0000-000000000003', '27AABCA5678B1Z2', 'INV-B-201', '2026-11-02', 41300.00, 35000.00, 3150.00, 3150.00, 0.00, '2026-11', TRUE),
('g0000004-0000-0000-0000-000000000004', '27AAACG9999K1Z8', 'INV-STEEL-44', '2026-11-04', 118000.00, 100000.00, 9000.00, 9000.00, 0.00, '2026-11', TRUE);
-- NOTE: INV-101 is NOT present in this table, indicating Supplier A failed to upload GSTR-1, causing Rs 9,000 ITC at risk!

-- ------------------------------------------------------------------------------
-- 9. RISK RULES CONFIGURATION (Default weights and thresholds)
-- ------------------------------------------------------------------------------
INSERT INTO risk_rules_config (id, rule_code, rule_name, description, weight, threshold, is_active, is_sample_data) VALUES
('r0000001-0000-0000-0000-000000000001', 'QTY_MISMATCH', 'Quantity Discrepancy (PO/GRN vs Invoice)', 'Flags when invoice quantity differs from received GRN quantity', 30.00, 2.00, TRUE, TRUE),
('r0000002-0000-0000-0000-000000000002', 'PRICE_MISMATCH', 'Price Variance (PO vs Invoice)', 'Flags when unit price on invoice exceeds authorized PO price beyond tolerance', 25.00, 2.00, TRUE, TRUE),
('r0000003-0000-0000-0000-000000000003', 'PO_UNAPPROVED_CHANGE', 'Unapproved PO Modification', 'Flags when purchase order was edited without formal maker-checker approval', 35.00, 1.00, TRUE, TRUE),
('r0000004-0000-0000-0000-000000000004', 'DUPLICATE_INVOICE', 'Duplicate Invoice Detection', 'Flags duplicate invoices matching normalized number, amount, or e-invoice IRN', 40.00, 85.00, TRUE, TRUE),
('r0000005-0000-0000-0000-000000000005', 'HISTORICAL_OVERBILLING', 'Supplier Repeated Surcharges', 'Flags suppliers exhibiting persistent patterns of ancillary extra charges', 20.00, 3.00, TRUE, TRUE),
('r0000006-0000-0000-0000-000000000006', 'GST_ITC_RISK', 'Missing in GSTR-2B (ITC at Risk)', 'Flags invoices missing from government auto-drafted GSTR-2B', 30.00, 0.00, TRUE, TRUE),
('r0000007-0000-0000-0000-000000000007', 'SHARED_BANK_ACCOUNT', 'Shared Bank Account Graph Indicator', 'Identifies suppliers sharing identical banking accounts or IFSC identifiers', 25.00, 1.00, TRUE, TRUE),
('r0000008-0000-0000-0000-000000000008', 'GSTIN_INVALID', 'GSTIN Format / Checksum Mismatch', 'Flags invalid 15-character GST identification numbers or checksum errors', 50.00, 1.00, TRUE, TRUE);

-- ------------------------------------------------------------------------------
-- 10. INITIAL AUDIT LOG (Genesis block with SHA256 hash chaining)
-- ------------------------------------------------------------------------------
INSERT INTO audit_log (
    id,
    actor_id,
    action,
    entity,
    entity_id,
    payload,
    prev_hash,
    hash,
    created_at
) VALUES (
    'e0000001-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'SYSTEM_SEED_INITIALIZED',
    'SYSTEM',
    'SEED-001',
    '{"event": "Phase 1 Seed Data Loaded", "scenario": "Section 6 Demo Scenario", "is_sample_data": true}'::jsonb,
    '0000000000000000000000000000000000000000000000000000000000000000',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    CURRENT_TIMESTAMP
);
