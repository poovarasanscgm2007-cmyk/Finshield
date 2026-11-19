import crypto from 'crypto';

export const GENESIS_PREV_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export interface Row {
  [key: string]: any;
}

export class InMemoryDatabase {
  users: Row[] = [];
  suppliers: Row[] = [];
  purchase_orders: Row[] = [];
  po_lines: Row[] = [];
  po_change_history: Row[] = [];
  approvals: Row[] = [];
  grns: Row[] = [];
  grn_lines: Row[] = [];
  invoices: Row[] = [];
  invoice_lines: Row[] = [];
  gstr2b_records: Row[] = [];
  match_results: Row[] = [];
  risk_flags: Row[] = [];
  investigations: Row[] = [];
  audit_log: Row[] = [];
  risk_rules_config: Row[] = [];

  constructor() {
    this.seedInitialData();
  }

  // Reset all in-memory tables to the pristine Section 6 seed state
  resetDemoData() {
    this.seedInitialData();
  }

  seedInitialData() {
    // 1. Users with bcrypt hashes
    this.users = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Admin User (Sample Data)',
        email: 'admin@finshield.sample',
        password_hash: '$2b$10$W59YKQZYj2PLQncLmvtKcO0bAe/tJ0CyGH1EqtEeTAQPUxGqHVRna', // Admin@123
        role: 'Admin',
        is_sample_data: true,
        created_at: new Date('2026-11-01T00:00:00Z')
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Finance Manager (Sample Data)',
        email: 'finance@finshield.sample',
        password_hash: '$2b$10$bnFpgwNewg.CBT1FDGgmSuYxd9A7IDXuEGh6U9l/bI74TUwvqhwu6', // Finance@123
        role: 'Finance Manager',
        is_sample_data: true,
        created_at: new Date('2026-11-01T00:00:00Z')
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        name: 'AP Specialist (Sample Data)',
        email: 'ap@finshield.sample',
        password_hash: '$2b$10$18yK/pse/9vAXrFmgWJNwe9l1P72SlxWbYX1wfj/sHKC6iuVmOifi', // Ap@12345
        role: 'AP Employee',
        is_sample_data: true,
        created_at: new Date('2026-11-01T00:00:00Z')
      },
      {
        id: '44444444-4444-4444-4444-444444444444',
        name: 'Warehouse Supervisor (Sample Data)',
        email: 'warehouse@finshield.sample',
        password_hash: '$2b$10$OX3Wx4WAdAwhD6e7CWMrdulqYiEujRAAXVia0WjZ.qMSZLwL23.iu', // Warehouse@123
        role: 'Warehouse Employee',
        is_sample_data: true,
        created_at: new Date('2026-11-01T00:00:00Z')
      },
      {
        id: '55555555-5555-5555-5555-555555555555',
        name: 'Employee 102 (Sample Data)',
        email: 'emp102@finshield.sample',
        password_hash: '$2b$10$wIA0di0CF0xBfExwlLS48OgnxP/bk1yWeSE5q.IHrn04TPH5l2kXO', // Emp102@123
        role: 'Procurement Employee',
        is_sample_data: true,
        created_at: new Date('2026-11-01T00:00:00Z')
      }
    ];

    // 2. Suppliers (Supplier A and B share bank_identifier)
    this.suppliers = [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        name: 'TimberCraft Woodworks (Supplier A) (Sample Data)',
        gstin: '27AAACT1234A1Z5',
        pan: 'AAACT1234A',
        bank_identifier: 'HDFC0001234-9876543210',
        address: 'Plot 42, Wood Processing Zone, Pune, Maharashtra 411001',
        phone: '+91 98765 43210',
        gst_filing_status: 'Active',
        is_sample_data: true
      },
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        name: 'Apex Timber Supplies (Supplier B) (Sample Data)',
        gstin: '27AABCA5678B1Z2',
        pan: 'AABCA5678B',
        bank_identifier: 'HDFC0001234-9876543210',
        address: 'Unit 10, Metro Logistics Park, Pune, Maharashtra 411014',
        phone: '+91 98765 43211',
        gst_filing_status: 'Active',
        is_sample_data: true
      }
    ];

    // 3. Purchase Orders: PO-101
    this.purchase_orders = [
      {
        id: 'p0101000-0000-0000-0000-000000000101',
        po_number: 'PO-101',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        order_date: '2026-11-01',
        total_amount: 70000.00,
        status: 'OPEN',
        created_by: '55555555-5555-5555-5555-555555555555',
        is_sample_data: true,
        created_at: new Date('2026-11-01T00:00:00Z')
      }
    ];

    this.po_lines = [
      {
        id: 'p0101111-0000-0000-0000-000000000101',
        po_id: 'p0101000-0000-0000-0000-000000000101',
        item_name: 'Teak Wood 100kg (Sample Data)',
        quantity: 100.000,
        unit_price: 700.00,
        total_price: 70000.00,
        tax_rate: 18.00
      }
    ];

    // 4. Planted unapproved price change from 500 to 700 by Employee 102
    this.po_change_history = [
      {
        id: 'c0101000-0000-0000-0000-000000000101',
        po_id: 'p0101000-0000-0000-0000-000000000101',
        changed_by: '55555555-5555-5555-5555-555555555555',
        changed_at: new Date('2026-11-03T10:30:00Z'),
        field: 'unit_price',
        old_value: '500.00',
        new_value: '700.00',
        approval_id: null,
        is_sample_data: true
      }
    ];

    // 5. GRN-101 (80 kg received vs 100 kg billed)
    this.grns = [
      {
        id: '90101000-0000-0000-0000-000000000101',
        grn_number: 'GRN-101',
        po_id: 'p0101000-0000-0000-0000-000000000101',
        received_date: '2026-11-05',
        received_by: '44444444-4444-4444-4444-444444444444',
        is_sample_data: true
      }
    ];

    this.grn_lines = [
      {
        id: '90101111-0000-0000-0000-000000000101',
        grn_id: '90101000-0000-0000-0000-000000000101',
        item_name: 'Teak Wood 100kg (Sample Data)',
        quantity_received: 80.000
      }
    ];

    // 6. Genesis Audit Block
    const genesisDate = new Date('2026-11-01T00:00:00Z');
    const genesisPayload = { event: 'Phase 1 Seed Data Loaded', is_sample_data: true, scenario: 'Section 6 Demo Scenario' };
    const dateStr = genesisDate.toISOString();
    const dataToHash = `${GENESIS_PREV_HASH}|11111111-1111-1111-1111-111111111111|SYSTEM_SEED_INITIALIZED|SYSTEM|SEED-001|${JSON.stringify(genesisPayload)}|${dateStr}`;
    const genesisHash = crypto.createHash('sha256').update(dataToHash, 'utf8').digest('hex');

    this.audit_log = [
      {
        id: 'e0000001-0000-0000-0000-000000000001',
        actor_id: '11111111-1111-1111-1111-111111111111',
        action: 'SYSTEM_SEED_INITIALIZED',
        entity: 'SYSTEM',
        entity_id: 'SEED-001',
        payload: genesisPayload,
        prev_hash: GENESIS_PREV_HASH,
        hash: genesisHash,
        created_at: genesisDate
      }
    ];

    // 7. Seed INV-101 and Seed Duplicate INV_101
    this.invoices = [
      {
        id: '10101000-0000-0000-0000-000000000101',
        invoice_number: 'INV-101',
        normalized_invoice_number: 'INV101',
        irn: '3b48f9361adce6e7194f4a3e9819ec417a8c3d97f1f0a3592bc1784918e9c402',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        po_id: 'p0101000-0000-0000-0000-000000000101',
        invoice_date: '2026-11-08',
        subtotal: 50000.00,
        cgst: 4500.00,
        sgst: 4500.00,
        igst: 0.00,
        total: 59000.00,
        status: 'PENDING',
        extraction_source: 'FALLBACK',
        extraction_confidence: {
          supplier_name: 0.98,
          supplier_gstin: 0.98,
          invoice_number: 0.99,
          invoice_date: 0.95,
          po_reference: 0.96,
          subtotal: 0.95,
          cgst: 0.95,
          sgst: 0.95,
          total_amount: 0.98,
          line_items: 0.92
        },
        file_path: 'sample-data/invoices/INV-101.pdf',
        duplicate_similarity: null,
        duplicate_reasons: null,
        risk_score: 95,
        risk_level: 'HIGH',
        itc_at_risk: 9000.00,
        payment_status: 'ON_HOLD',
        approved_by: null,
        second_approved_by: null,
        approved_at: null,
        gst_check_result: null,
        is_sample_data: true,
        created_at: new Date('2026-11-08T00:00:00Z')
      },
      // Seed Duplicate Case: INV_101 (resubmitted by Supplier A)
      {
        id: '10101000-0000-0000-0000-000000000102',
        invoice_number: 'INV_101',
        normalized_invoice_number: 'INV101',
        irn: '3b48f9361adce6e7194f4a3e9819ec417a8c3d97f1f0a3592bc1784918e9c402',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        po_id: 'p0101000-0000-0000-0000-000000000101',
        invoice_date: '2026-11-09',
        subtotal: 50000.00,
        cgst: 4500.00,
        sgst: 4500.00,
        igst: 0.00,
        total: 59000.00,
        status: 'PENDING',
        extraction_source: 'FALLBACK',
        extraction_confidence: {
          supplier_name: 0.98,
          supplier_gstin: 0.98,
          invoice_number: 0.99,
          invoice_date: 0.95,
          po_reference: 0.96,
          subtotal: 0.95,
          cgst: 0.95,
          sgst: 0.95,
          total_amount: 0.98,
          line_items: 0.92
        },
        file_path: 'sample-data/invoices/INV-101.pdf',
        duplicate_similarity: null,
        duplicate_reasons: null,
        risk_score: null,
        risk_level: null,
        itc_at_risk: 0.00,
        gst_check_result: null,
        is_sample_data: true,
        created_at: new Date('2026-11-09T00:00:00Z')
      },
      // 9 Historical Invoices for Supplier A with repeated extra charges
      {
        id: 'a0000001-0000-0000-0000-000000000001',
        invoice_number: 'INV-HIST-01',
        normalized_invoice_number: 'INVHIST01',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        invoice_date: '2026-05-10',
        subtotal: 40500.00,
        cgst: 3645.00,
        sgst: 3645.00,
        igst: 0.00,
        total: 47790.00,
        status: 'PAID',
        is_sample_data: true,
        created_at: new Date('2026-05-10T00:00:00Z')
      },
      {
        id: 'a0000002-0000-0000-0000-000000000002',
        invoice_number: 'INV-HIST-02',
        normalized_invoice_number: 'INVHIST02',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        invoice_date: '2026-05-28',
        subtotal: 55700.00,
        cgst: 5013.00,
        sgst: 5013.00,
        igst: 0.00,
        total: 65726.00,
        status: 'PAID',
        is_sample_data: true,
        created_at: new Date('2026-05-28T00:00:00Z')
      },
      {
        id: 'a0000003-0000-0000-0000-000000000003',
        invoice_number: 'INV-HIST-03',
        normalized_invoice_number: 'INVHIST03',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        invoice_date: '2026-06-15',
        subtotal: 61000.00,
        cgst: 5490.00,
        sgst: 5490.00,
        igst: 0.00,
        total: 71980.00,
        status: 'PAID',
        is_sample_data: true,
        created_at: new Date('2026-06-15T00:00:00Z')
      },
      {
        id: 'a0000004-0000-0000-0000-000000000004',
        invoice_number: 'INV-HIST-04',
        normalized_invoice_number: 'INVHIST04',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        invoice_date: '2026-07-02',
        subtotal: 32500.00,
        cgst: 2925.00,
        sgst: 2925.00,
        igst: 0.00,
        total: 38350.00,
        status: 'PAID',
        is_sample_data: true,
        created_at: new Date('2026-07-02T00:00:00Z')
      },
      {
        id: 'a0000005-0000-0000-0000-000000000005',
        invoice_number: 'INV-HIST-05',
        normalized_invoice_number: 'INVHIST05',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        invoice_date: '2026-07-24',
        subtotal: 48700.00,
        cgst: 4383.00,
        sgst: 4383.00,
        igst: 0.00,
        total: 57466.00,
        status: 'PAID',
        is_sample_data: true,
        created_at: new Date('2026-07-24T00:00:00Z')
      },
      {
        id: 'a0000006-0000-0000-0000-000000000006',
        invoice_number: 'INV-HIST-06',
        normalized_invoice_number: 'INVHIST06',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        invoice_date: '2026-08-11',
        subtotal: 71000.00,
        cgst: 6390.00,
        sgst: 6390.00,
        igst: 0.00,
        total: 83780.00,
        status: 'PAID',
        is_sample_data: true,
        created_at: new Date('2026-08-11T00:00:00Z')
      },
      {
        id: 'a0000007-0000-0000-0000-000000000007',
        invoice_number: 'INV-HIST-07',
        normalized_invoice_number: 'INVHIST07',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        invoice_date: '2026-09-05',
        subtotal: 45500.00,
        cgst: 4095.00,
        sgst: 4095.00,
        igst: 0.00,
        total: 53690.00,
        status: 'PAID',
        is_sample_data: true,
        created_at: new Date('2026-09-05T00:00:00Z')
      },
      {
        id: 'a0000008-0000-0000-0000-000000000008',
        invoice_number: 'INV-HIST-08',
        normalized_invoice_number: 'INVHIST08',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        invoice_date: '2026-09-28',
        subtotal: 53700.00,
        cgst: 4833.00,
        sgst: 4833.00,
        igst: 0.00,
        total: 63366.00,
        status: 'PAID',
        is_sample_data: true,
        created_at: new Date('2026-09-28T00:00:00Z')
      },
      {
        id: 'a0000009-0000-0000-0000-000000000009',
        invoice_number: 'INV-HIST-09',
        normalized_invoice_number: 'INVHIST09',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        invoice_date: '2026-10-18',
        subtotal: 66000.00,
        cgst: 5940.00,
        sgst: 5940.00,
        igst: 0.00,
        total: 77880.00,
        status: 'PAID',
        is_sample_data: true,
        created_at: new Date('2026-10-18T00:00:00Z')
      }
    ];

    this.invoice_lines = [
      {
        id: '10101111-0000-0000-0000-000000000101',
        invoice_id: '10101000-0000-0000-0000-000000000101',
        item_name: 'Teak Wood 100kg (Sample Data)',
        quantity: 100.000,
        unit_price: 500.00,
        total_price: 50000.00,
        tax_rate: 18.00
      },
      {
        id: '10101111-0000-0000-0000-000000000102',
        invoice_id: '10101000-0000-0000-0000-000000000102',
        item_name: 'Teak Wood 100kg (Sample Data)',
        quantity: 100.000,
        unit_price: 500.00,
        total_price: 50000.00,
        tax_rate: 18.00
      },
      // Lines for Historical Invoices (including extra charges of 500, 700, 1000)
      { id: 'h01-1', invoice_id: 'a0000001-0000-0000-0000-000000000001', item_name: 'Timber Raw Logs (Sample Data)', quantity: 80.0, unit_price: 500.0, total_price: 40000.0, tax_rate: 18.0 },
      { id: 'h01-2', invoice_id: 'a0000001-0000-0000-0000-000000000001', item_name: 'Handling Surcharge (Sample Extra Charge)', quantity: 1.0, unit_price: 500.0, total_price: 500.0, tax_rate: 18.0 },

      { id: 'h02-1', invoice_id: 'a0000002-0000-0000-0000-000000000002', item_name: 'Timber Raw Logs (Sample Data)', quantity: 110.0, unit_price: 500.0, total_price: 55000.0, tax_rate: 18.0 },
      { id: 'h02-2', invoice_id: 'a0000002-0000-0000-0000-000000000002', item_name: 'Logistics Surcharge (Sample Extra Charge)', quantity: 1.0, unit_price: 700.0, total_price: 700.0, tax_rate: 18.0 },

      { id: 'h03-1', invoice_id: 'a0000003-0000-0000-0000-000000000003', item_name: 'Timber Raw Logs (Sample Data)', quantity: 120.0, unit_price: 500.0, total_price: 60000.0, tax_rate: 18.0 },
      { id: 'h03-2', invoice_id: 'a0000003-0000-0000-0000-000000000003', item_name: 'Expedited Unloading Surcharge (Sample Extra Charge)', quantity: 1.0, unit_price: 1000.0, total_price: 1000.0, tax_rate: 18.0 },

      { id: 'h04-1', invoice_id: 'a0000004-0000-0000-0000-000000000004', item_name: 'Timber Raw Logs (Sample Data)', quantity: 64.0, unit_price: 500.0, total_price: 32000.0, tax_rate: 18.0 },
      { id: 'h04-2', invoice_id: 'a0000004-0000-0000-0000-000000000004', item_name: 'Pallet Packing Fee (Sample Extra Charge)', quantity: 1.0, unit_price: 500.0, total_price: 500.0, tax_rate: 18.0 },

      { id: 'h05-1', invoice_id: 'a0000005-0000-0000-0000-000000000005', item_name: 'Timber Raw Logs (Sample Data)', quantity: 96.0, unit_price: 500.0, total_price: 48000.0, tax_rate: 18.0 },
      { id: 'h05-2', invoice_id: 'a0000005-0000-0000-0000-000000000005', item_name: 'Logistics Surcharge (Sample Extra Charge)', quantity: 1.0, unit_price: 700.0, total_price: 700.0, tax_rate: 18.0 },

      { id: 'h06-1', invoice_id: 'a0000006-0000-0000-0000-000000000006', item_name: 'Timber Raw Logs (Sample Data)', quantity: 140.0, unit_price: 500.0, total_price: 70000.0, tax_rate: 18.0 },
      { id: 'h06-2', invoice_id: 'a0000006-0000-0000-0000-000000000006', item_name: 'Site Gate Processing Fee (Sample Extra Charge)', quantity: 1.0, unit_price: 1000.0, total_price: 1000.0, tax_rate: 18.0 },

      { id: 'h07-1', invoice_id: 'a0000007-0000-0000-0000-000000000007', item_name: 'Timber Raw Logs (Sample Data)', quantity: 90.0, unit_price: 500.0, total_price: 45000.0, tax_rate: 18.0 },
      { id: 'h07-2', invoice_id: 'a0000007-0000-0000-0000-000000000007', item_name: 'Handling Surcharge (Sample Extra Charge)', quantity: 1.0, unit_price: 500.0, total_price: 500.0, tax_rate: 18.0 },

      { id: 'h08-1', invoice_id: 'a0000008-0000-0000-0000-000000000008', item_name: 'Timber Raw Logs (Sample Data)', quantity: 106.0, unit_price: 500.0, total_price: 53000.0, tax_rate: 18.0 },
      { id: 'h08-2', invoice_id: 'a0000008-0000-0000-0000-000000000008', item_name: 'Logistics Surcharge (Sample Extra Charge)', quantity: 1.0, unit_price: 700.0, total_price: 700.0, tax_rate: 18.0 },

      { id: 'h09-1', invoice_id: 'a0000009-0000-0000-0000-000000000009', item_name: 'Timber Raw Logs (Sample Data)', quantity: 130.0, unit_price: 500.0, total_price: 65000.0, tax_rate: 18.0 },
      { id: 'h09-2', invoice_id: 'a0000009-0000-0000-0000-000000000009', item_name: 'Expedited Unloading Surcharge (Sample Extra Charge)', quantity: 1.0, unit_price: 1000.0, total_price: 1000.0, tax_rate: 18.0 }
    ];

    // GSTR-2B Records (INV-101 is intentionally missing)
    this.gstr2b_records = [
      {
        id: 'g0000001-0000-0000-0000-000000000001',
        gstin_supplier: '27AAACT1234A1Z5',
        invoice_number: 'INV-HIST-08',
        invoice_date: '2026-09-28',
        invoice_value: 63366.00,
        taxable_value: 53700.00,
        cgst: 4833.00,
        sgst: 4833.00,
        igst: 0.00,
        filing_period: '2026-09',
        is_sample_data: true
      },
      {
        id: 'g0000002-0000-0000-0000-000000000002',
        gstin_supplier: '27AAACT1234A1Z5',
        invoice_number: 'INV-HIST-09',
        invoice_date: '2026-10-18',
        invoice_value: 77880.00,
        taxable_value: 66000.00,
        cgst: 5940.00,
        sgst: 5940.00,
        igst: 0.00,
        filing_period: '2026-10',
        is_sample_data: true
      },
      {
        id: 'g0000003-0000-0000-0000-000000000003',
        gstin_supplier: '27AABCA5678B1Z2',
        invoice_number: 'INV-B-201',
        invoice_date: '2026-11-02',
        invoice_value: 41300.00,
        taxable_value: 35000.00,
        cgst: 3150.00,
        sgst: 3150.00,
        igst: 0.00,
        filing_period: '2026-11',
        is_sample_data: true
      },
      {
        id: 'g0000004-0000-0000-0000-000000000004',
        gstin_supplier: '27AAACG9999K1Z8',
        invoice_number: 'INV-STEEL-44',
        invoice_date: '2026-11-04',
        invoice_value: 118000.00,
        taxable_value: 100000.00,
        cgst: 9000.00,
        sgst: 9000.00,
        igst: 0.00,
        filing_period: '2026-11',
        is_sample_data: true
      }
    ];

    // 8. Risk Rules Configuration
    this.risk_rules_config = [
      {
        id: 'r0000001-0000-0000-0000-000000000001',
        rule_code: 'QTY_MISMATCH',
        rule_name: 'Quantity Discrepancy (PO/GRN vs Invoice)',
        description: 'Flags when invoice quantity differs from received GRN quantity',
        weight: 30.00,
        threshold: 2.00,
        is_active: true,
        is_sample_data: true
      },
      {
        id: 'r0000002-0000-0000-0000-000000000002',
        rule_code: 'PRICE_MISMATCH',
        rule_name: 'Price Variance (PO vs Invoice)',
        description: 'Flags when unit price on invoice exceeds authorized PO price beyond tolerance',
        weight: 25.00,
        threshold: 2.00,
        is_active: true,
        is_sample_data: true
      },
      {
        id: 'r0000003-0000-0000-0000-000000000003',
        rule_code: 'PO_UNAPPROVED_CHANGE',
        rule_name: 'Unapproved PO Modification',
        description: 'Flags when purchase order was edited without formal maker-checker approval',
        weight: 35.00,
        threshold: 1.00,
        is_active: true,
        is_sample_data: true
      },
      {
        id: 'r0000004-0000-0000-0000-000000000004',
        rule_code: 'DUPLICATE_INVOICE',
        rule_name: 'Duplicate Invoice Detection',
        description: 'Flags duplicate invoices matching normalized number, amount, or e-invoice IRN',
        weight: 40.00,
        threshold: 85.00,
        is_active: true,
        is_sample_data: true
      },
      {
        id: 'r0000005-0000-0000-0000-000000000005',
        rule_code: 'HISTORICAL_OVERBILLING',
        rule_name: 'Supplier Repeated Surcharges',
        description: 'Flags suppliers exhibiting persistent patterns of ancillary extra charges',
        weight: 20.00,
        threshold: 3.00,
        is_active: true,
        is_sample_data: true
      },
      {
        id: 'r0000006-0000-0000-0000-000000000006',
        rule_code: 'GST_ITC_RISK',
        rule_name: 'Missing in GSTR-2B (ITC at Risk)',
        description: 'Flags invoices missing from government auto-drafted GSTR-2B',
        weight: 30.00,
        threshold: 0.00,
        is_active: true,
        is_sample_data: true
      },
      {
        id: 'r0000007-0000-0000-0000-000000000007',
        rule_code: 'SHARED_BANK_ACCOUNT',
        rule_name: 'Shared Bank Account Graph Indicator',
        description: 'Identifies suppliers sharing identical banking accounts or IFSC identifiers',
        weight: 25.00,
        threshold: 1.00,
        is_active: true,
        is_sample_data: true
      },
      {
        id: 'r0000008-0000-0000-0000-000000000008',
        rule_code: 'GSTIN_INVALID',
        rule_name: 'GSTIN Format / Checksum Mismatch',
        description: 'Flags invalid 15-character GST identification numbers or checksum errors',
        weight: 50.00,
        threshold: 1.00,
        is_active: true,
        is_sample_data: true
      }
    ];

    // 10. Initial Investigations for Section 6 Demo Scenario (INV-101)
    this.investigations = [
      {
        id: 'inv-est-0001-0000-0000-000000000001',
        issue_type: 'QUANTITY_MISMATCH',
        department: 'Warehouse',
        assigned_to: '44444444-4444-4444-4444-444444444444',
        assigned_user_name: 'Warehouse Lead (Sample Data)',
        invoice_id: '10101000-0000-0000-0000-000000000101',
        invoice_number: 'INV-101',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        supplier_name: 'TimberCraft Woodworks (Supplier A)',
        severity: 'HIGH',
        title: 'Quantity Discrepancy: 100 kg billed vs 80 kg received (20 kg gap)',
        description: 'Invoice billed 100 kg against PO-101, but GRN-101 confirms receipt of only 80 kg. 20 kg discrepancy remaining.',
        status: 'OPEN',
        evidence: {
          po_number: 'PO-101',
          grn_numbers: ['GRN-101'],
          billed_quantity: 100,
          received_quantity: 80,
          difference: 20,
          unit: 'kg'
        },
        comments: [
          {
            id: 'c1',
            user_id: '11111111-1111-1111-1111-111111111111',
            user_name: 'System Pipeline',
            user_role: 'System',
            text: 'Auto-flagged from 3-way matching engine. Assigned to Warehouse team for physical verification.',
            created_at: new Date('2026-11-08T10:00:00Z').toISOString()
          }
        ],
        resolution_notes: null,
        revalidation_result: null,
        reopened_reason: null,
        is_sample_data: true,
        created_at: new Date('2026-11-08T10:00:00Z'),
        updated_at: new Date('2026-11-08T10:00:00Z')
      },
      {
        id: 'inv-est-0002-0000-0000-000000000002',
        issue_type: 'UNAUTHORIZED_PO_CHANGE',
        department: 'Procurement/Finance',
        assigned_to: '55555555-5555-5555-5555-555555555555',
        assigned_user_name: 'Employee 102 (Sample Data)',
        invoice_id: '10101000-0000-0000-0000-000000000101',
        invoice_number: 'INV-101',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        supplier_name: 'TimberCraft Woodworks (Supplier A)',
        severity: 'HIGH',
        title: 'Unauthorized PO Price Modification: Rs 500 to Rs 700 without approval',
        description: 'PO-101 unit price was increased from Rs 500.00 to Rs 700.00 by Employee 102 without formal Finance Manager approval.',
        status: 'OPEN',
        evidence: {
          po_number: 'PO-101',
          field: 'unit_price',
          old_value: '500.00',
          new_value: '700.00',
          changed_by: 'Employee 102 (Procurement Employee)',
          changed_at: '2026-11-06T14:30:00Z',
          approval_status: 'NOT_FOUND'
        },
        comments: [
          {
            id: 'c2',
            user_id: '11111111-1111-1111-1111-111111111111',
            user_name: 'System Pipeline',
            user_role: 'System',
            text: 'Detected unapproved PO alteration in po_change_history. Requires maker-checker review.',
            created_at: new Date('2026-11-08T10:00:00Z').toISOString()
          }
        ],
        resolution_notes: null,
        revalidation_result: null,
        reopened_reason: null,
        is_sample_data: true,
        created_at: new Date('2026-11-08T10:00:00Z'),
        updated_at: new Date('2026-11-08T10:00:00Z')
      },
      {
        id: 'inv-est-0003-0000-0000-000000000003',
        issue_type: 'HISTORICAL_OVERBILLING',
        department: 'AP/Finance',
        assigned_to: '33333333-3333-3333-3333-333333333333',
        assigned_user_name: 'AP Specialist (Sample Data)',
        invoice_id: '10101000-0000-0000-0000-000000000101',
        invoice_number: 'INV-101',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        supplier_name: 'TimberCraft Woodworks (Supplier A)',
        severity: 'MEDIUM',
        title: 'Recurring Ancillary Surcharges: 9 historical extra charges detected',
        description: 'Supplier A exhibits a systematic pattern of uncontracted handling, freight, and processing fees of Rs 500, Rs 700, and Rs 1000 across 9 prior invoices.',
        status: 'OPEN',
        evidence: {
          supplier: 'TimberCraft Woodworks (Supplier A)',
          extra_charges_count: 9,
          charges: [500, 700, 1000],
          invoices: ['INV-HIST-01', 'INV-HIST-02', 'INV-HIST-03', 'INV-HIST-04', 'INV-HIST-05', 'INV-HIST-06', 'INV-HIST-07', 'INV-HIST-08', 'INV-HIST-09']
        },
        comments: [
          {
            id: 'c3',
            user_id: '11111111-1111-1111-1111-111111111111',
            user_name: 'System Pipeline',
            user_role: 'System',
            text: 'Historical overbilling engine detected recurring fee pattern above threshold (threshold = 3).',
            created_at: new Date('2026-11-08T10:00:00Z').toISOString()
          }
        ],
        resolution_notes: null,
        revalidation_result: null,
        reopened_reason: null,
        is_sample_data: true,
        created_at: new Date('2026-11-08T10:00:00Z'),
        updated_at: new Date('2026-11-08T10:00:00Z')
      },
      {
        id: 'inv-est-0004-0000-0000-000000000004',
        issue_type: 'GST_ITC_RISK',
        department: 'Finance/Compliance',
        assigned_to: '22222222-2222-2222-2222-222222222222',
        assigned_user_name: 'Finance Manager (Sample Data)',
        invoice_id: '10101000-0000-0000-0000-000000000101',
        invoice_number: 'INV-101',
        supplier_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        supplier_name: 'TimberCraft Woodworks (Supplier A)',
        severity: 'HIGH',
        title: 'GSTR-2B Reconciliation Failure: Invoice missing, Rs 9,000 ITC at risk',
        description: 'Invoice INV-101 does not appear in the auto-drafted GSTR-2B statement from GSTN. Billed GST amount of Rs 9,000 cannot be claimed as Input Tax Credit until supplier files GSTR-1.',
        status: 'OPEN',
        evidence: {
          invoice_number: 'INV-101',
          supplier_gstin: '27AAACT1234A1Z5',
          tax_amount: 9000,
          itc_at_risk: 9000,
          gstr2b_status: 'NOT_FOUND_IN_GSTR2B'
        },
        comments: [
          {
            id: 'c4',
            user_id: '11111111-1111-1111-1111-111111111111',
            user_name: 'System Pipeline',
            user_role: 'System',
            text: 'Tax reconciliation check failed. Payment must be held to prevent ITC loss.',
            created_at: new Date('2026-11-08T10:00:00Z').toISOString()
          }
        ],
        resolution_notes: null,
        revalidation_result: null,
        reopened_reason: null,
        is_sample_data: true,
        created_at: new Date('2026-11-08T10:00:00Z'),
        updated_at: new Date('2026-11-08T10:00:00Z')
      }
    ];
  }

  // Basic SQL interpreter for queries used by FinShield backend
  async executeQuery(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
    const q = text.trim();

    // Prevent UPDATE or DELETE on audit_log (Database Trigger Simulation)
    if (/^(UPDATE|DELETE)\s+FROM?\s+audit_log/i.test(q)) {
      throw new Error('audit_log is append-only: UPDATE and DELETE operations are forbidden');
    }

    // Transaction & locking commands
    if (/^(BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory_xact_lock)/i.test(q)) {
      return { rows: [], rowCount: 0 };
    }

    // USERS: Find by email
    if (q.includes('FROM users WHERE email = $1')) {
      const email = params[0]?.toLowerCase();
      const rows = this.users.filter(u => u.email.toLowerCase() === email);
      return { rows, rowCount: rows.length };
    }

    // USERS: Find by ID
    if (q.includes('FROM users WHERE id = $1')) {
      const id = params[0];
      const rows = this.users.filter(u => u.id === id);
      return { rows, rowCount: rows.length };
    }

    // RISK RULES CONFIG
    if (q.includes('FROM risk_rules_config')) {
      if (q.includes('rule_code IN') || q.includes('rule_code = $1')) {
        if (q.includes('rule_code = $1')) {
          const rows = this.risk_rules_config.filter(r => r.rule_code === params[0] && r.is_active);
          return { rows, rowCount: rows.length };
        }
        const rows = this.risk_rules_config.filter(r => r.is_active);
        return { rows, rowCount: rows.length };
      }
      return { rows: this.risk_rules_config, rowCount: this.risk_rules_config.length };
    }

    // AUDIT LOG: Latest record
    if (q.includes('SELECT id, hash FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 1') ||
        q.includes('SELECT id, hash FROM audit_log ORDER BY created_at DESC')) {
      const last = this.audit_log.length > 0 ? this.audit_log[this.audit_log.length - 1] : null;
      return { rows: last ? [last] : [], rowCount: last ? 1 : 0 };
    }

    // AUDIT LOG: Insert
    if (q.startsWith('INSERT INTO audit_log')) {
      const [actor_id, action, entity, entity_id, payloadRaw, prev_hash, hash, now] = params;
      const payload = typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : payloadRaw;
      const newEntry = {
        id: crypto.randomUUID(),
        actor_id,
        action,
        entity,
        entity_id,
        payload,
        prev_hash,
        hash,
        created_at: new Date(now)
      };
      this.audit_log.push(newEntry);
      return { rows: [newEntry], rowCount: 1 };
    }

    // AUDIT LOG: Sequential verify query
    if (q.includes('SELECT id, actor_id, action, entity, entity_id, payload, prev_hash, hash, created_at FROM audit_log ORDER BY created_at ASC')) {
      return { rows: [...this.audit_log], rowCount: this.audit_log.length };
    }

    // AUDIT LOG: Paginated query & count
    if (q.includes('SELECT COUNT(*) FROM audit_log')) {
      return { rows: [{ count: this.audit_log.length.toString() }], rowCount: 1 };
    }
    if (q.includes('FROM audit_log al')) {
      const rows = this.audit_log.map(al => {
        const u = this.users.find(usr => usr.id === al.actor_id);
        return {
          ...al,
          actor_name: u?.name || null,
          actor_role: u?.role || null
        };
      }).sort((a: any, b: any) => b.created_at.getTime() - a.created_at.getTime());
      return { rows, rowCount: rows.length };
    }

    // APPROVALS: Insert
    if (q.startsWith('INSERT INTO approvals')) {
      const [entity_type, entity_id, requested_by, payloadRaw, notes] = params;
      const payload = typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : payloadRaw;
      const newApp = {
        id: crypto.randomUUID(),
        entity_type,
        entity_id,
        requested_by,
        approved_by: null,
        payload,
        status: 'PENDING',
        requested_at: new Date(),
        actioned_at: null,
        notes: notes || null
      };
      this.approvals.push(newApp);
      return { rows: [newApp], rowCount: 1 };
    }

    // APPROVALS: Select single
    if (q.includes('FROM approvals WHERE id = $1')) {
      const app = this.approvals.find(a => a.id === params[0]);
      return { rows: app ? [app] : [], rowCount: app ? 1 : 0 };
    }

    // APPROVALS: List
    if (q.includes('FROM approvals a')) {
      const statusFilter = params[0];
      let list = this.approvals;
      if (statusFilter) {
        list = list.filter(a => a.status === statusFilter);
      }
      const rows = list.map(a => {
        const u_req = this.users.find(u => u.id === a.requested_by);
        const u_app = this.users.find(u => u.id === a.approved_by);
        return {
          ...a,
          requester_name: u_req?.name || null,
          requester_role: u_req?.role || null,
          approver_name: u_app?.name || null
        };
      });
      return { rows, rowCount: rows.length };
    }

    // APPROVALS: Update status
    if (q.startsWith('UPDATE approvals')) {
      const app = this.approvals.find(a => a.id === params[2]);
      if (app) {
        app.status = q.includes("'APPROVED'") ? 'APPROVED' : 'REJECTED';
        app.approved_by = params[0];
        app.actioned_at = new Date();
        app.notes = params[1] || app.notes;
        return { rows: [app], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // PURCHASE ORDERS: Query by po_number or id
    if (q.includes('FROM purchase_orders WHERE po_number = $1')) {
      const po = this.purchase_orders.find(p => p.po_number === params[0]);
      return { rows: po ? [po] : [], rowCount: po ? 1 : 0 };
    }
    if (q.includes('FROM purchase_orders WHERE id = $1')) {
      const po = this.purchase_orders.find(p => p.id === params[0]);
      return { rows: po ? [po] : [], rowCount: po ? 1 : 0 };
    }

    // PURCHASE ORDERS: List
    if (q.includes('FROM purchase_orders po')) {
      const idParam = params[0];
      if (idParam) {
        const po = this.purchase_orders.find(p => p.id === idParam || p.po_number === idParam);
        if (!po) return { rows: [], rowCount: 0 };
        const s = this.suppliers.find(sup => sup.id === po.supplier_id);
        const u = this.users.find(usr => usr.id === po.created_by);
        return {
          rows: [{ ...po, supplier_name: s?.name, supplier_gstin: s?.gstin, created_by_name: u?.name }],
          rowCount: 1
        };
      }
      const rows = this.purchase_orders.map(po => {
        const s = this.suppliers.find(sup => sup.id === po.supplier_id);
        const u = this.users.find(usr => usr.id === po.created_by);
        return {
          ...po,
          supplier_name: s?.name,
          supplier_gstin: s?.gstin,
          created_by_name: u?.name
        };
      });
      return { rows, rowCount: rows.length };
    }

    // PO LINES
    if (q.includes('FROM purchase_orders po') && q.includes('JOIN po_lines pol') && q.includes('po.supplier_id = $1')) {
      const supId = params[0];
      const supPos = this.purchase_orders.filter(p => p.supplier_id === supId).map(p => p.id);
      const lines = this.po_lines.filter(l => supPos.includes(l.po_id)).map(l => ({
        po_qty: l.quantity,
        total_price: l.total_price
      }));
      return { rows: lines, rowCount: lines.length };
    }

    if (q.includes('FROM po_lines WHERE po_id = $1')) {
      const rows = this.po_lines.filter(l => l.po_id === params[0]);
      return { rows, rowCount: rows.length };
    }

    // PO CHANGE HISTORY: List
    if (q.includes('FROM po_change_history pch')) {
      const rows = this.po_change_history.filter(h => h.po_id === params[0]).map(h => {
        const u = this.users.find(usr => usr.id === h.changed_by);
        const a = this.approvals.find(app => app.id === h.approval_id);
        return {
          ...h,
          changed_by_name: u?.name,
          approval_status: a?.status || null
        };
      });
      return { rows, rowCount: rows.length };
    }

    // PO CHANGE HISTORY: Insert
    if (q.startsWith('INSERT INTO po_change_history')) {
      const [po_id, changed_by, field, old_value, new_value, approval_id] = params;
      const newHist = {
        id: crypto.randomUUID(),
        po_id,
        changed_by,
        field,
        old_value,
        new_value,
        approval_id,
        changed_at: new Date()
      };
      this.po_change_history.push(newHist);
      return { rows: [newHist], rowCount: 1 };
    }

    // GRNS: By po_id
    if (q.includes('FROM grns WHERE po_id = $1')) {
      const rows = this.grns.filter(g => g.po_id === params[0]);
      return { rows, rowCount: rows.length };
    }

    // GRN LINES: By grn_id
    if (q.includes('FROM grns grn') && q.includes('JOIN grn_lines grnl') && q.includes('po.supplier_id = $1')) {
      const supId = params[0];
      const supPos = this.purchase_orders.filter(p => p.supplier_id === supId).map(p => p.id);
      const supGrns = this.grns.filter(g => supPos.includes(g.po_id)).map(g => g.id);
      const lines = this.grn_lines.filter(l => supGrns.includes(l.grn_id)).map(l => ({
        grn_qty: l.quantity_received
      }));
      return { rows: lines, rowCount: lines.length };
    }

    if (q.includes('FROM grn_lines WHERE grn_id = $1')) {
      const rows = this.grn_lines.filter(l => l.grn_id === params[0]);
      return { rows, rowCount: rows.length };
    }

    // SUPPLIERS: High risk query
    if (q.includes('FROM suppliers') && (q.includes("risk_level = 'HIGH'") || q.includes('risk_score >= 70'))) {
      const highSuppliers = this.suppliers.filter(s => (s.risk_level === 'HIGH' || (s.risk_score && s.risk_score >= 70))).map(s => ({
        id: s.id,
        name: s.name,
        gstin: s.gstin,
        gst_filing_status: s.gst_filing_status,
        bank_identifier: s.bank_identifier,
        risk_score: s.risk_score || 0,
        risk_level: s.risk_level || 'HIGH'
      })).sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
      return { rows: highSuppliers, rowCount: highSuppliers.length };
    }

    // SUPPLIERS: Single supplier with invoice count
    if (q.includes('FROM suppliers s LEFT JOIN invoices inv ON s.id = inv.supplier_id WHERE s.id = $1')) {
      const sup = this.suppliers.find(s => s.id === params[0] || s.gstin === params[0]);
      if (!sup) return { rows: [], rowCount: 0 };
      const count = this.invoices.filter(i => i.supplier_id === sup.id).length;
      return {
        rows: [{
          ...sup,
          invoice_count: count.toString()
        }],
        rowCount: 1
      };
    }

    // SUPPLIERS: Group by query with count
    if (q.includes('FROM suppliers s LEFT JOIN invoices inv ON s.id = inv.supplier_id GROUP BY')) {
      const rows = this.suppliers.map(s => {
        const count = this.invoices.filter(i => i.supplier_id === s.id).length;
        return {
          ...s,
          total_invoices_count: count.toString()
        };
      }).sort((a: any, b: any) => (b.risk_score || 0) - (a.risk_score || 0));
      return { rows, rowCount: rows.length };
    }

    // SUPPLIERS: Find by ID or Name ILIKE (e.g. overbilling service lookup)
    if (q.includes('FROM suppliers') && q.includes('id = $1 OR name ILIKE $1')) {
      const term = (params[0] || '').toLowerCase().replace(/%/g, '');
      const s = this.suppliers.find(sup => sup.id === params[0] || sup.name.toLowerCase().includes(term));
      return { rows: s ? [s] : [], rowCount: s ? 1 : 0 };
    }

    // SUPPLIERS: Find by name ILIKE standalone
    if (q.includes('FROM suppliers') && q.includes('name ILIKE')) {
      let term = '';
      if (params.length > 0 && params[0]) {
        term = params[0].replace(/%/g, '').toLowerCase();
      } else {
        const match = q.match(/name\s+ILIKE\s+'%?([^%']+)%?'/i);
        if (match) term = match[1].toLowerCase();
      }
      const rows = this.suppliers.filter(s => s.name.toLowerCase().includes(term));
      return { rows, rowCount: rows.length };
    }

    // SUPPLIERS: Find by GSTIN or ID
    if (q.includes('FROM suppliers WHERE id = $1 OR gstin = $1')) {
      const s = this.suppliers.find(sup => sup.id === params[0] || sup.gstin === params[0]);
      return { rows: s ? [s] : [], rowCount: s ? 1 : 0 };
    }
    if (q.includes('FROM suppliers WHERE id = $1 OR name ILIKE $1')) {
      const s = this.suppliers.find(sup => sup.id === params[0] || sup.name.toLowerCase().includes(params[0].toLowerCase()));
      return { rows: s ? [s] : [], rowCount: s ? 1 : 0 };
    }
    if (q.includes('FROM suppliers WHERE gstin = $1')) {
      const rows = this.suppliers.filter(s => s.gstin === params[0]);
      return { rows, rowCount: rows.length };
    }
    if (q.includes('FROM suppliers WHERE id = $1')) {
      const s = this.suppliers.find(sup => sup.id === params[0]);
      return { rows: s ? [s] : [], rowCount: s ? 1 : 0 };
    }
    if (q.includes('UPDATE suppliers') && q.includes('bank_identifier = $1')) {
      const [bankId, id] = params;
      const s = this.suppliers.find(sup => sup.id === id);
      if (s) {
        s.bank_identifier = bankId;
        s.updated_at = new Date();
        return { rows: [s], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (q.includes('FROM suppliers')) {
      return { rows: this.suppliers, rowCount: this.suppliers.length };
    }

    // MATCH RESULTS: Insert
    if (q.startsWith('INSERT INTO match_results')) {
      const [invoice_id, status, reasonsRaw, comparedValuesRaw] = params;
      const reasons = typeof reasonsRaw === 'string' ? JSON.parse(reasonsRaw) : reasonsRaw;
      const compared_values = typeof comparedValuesRaw === 'string' ? JSON.parse(comparedValuesRaw) : comparedValuesRaw;
      const newMatch = {
        id: crypto.randomUUID(),
        invoice_id,
        status,
        reasons,
        compared_values,
        created_at: new Date()
      };
      this.match_results.push(newMatch);
      return { rows: [newMatch], rowCount: 1 };
    }

    // MATCH RESULTS: Query by invoice_id
    if (q.includes('FROM match_results WHERE invoice_id = $1')) {
      const matches = this.match_results.filter(m => m.invoice_id === params[0]);
      matches.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      return { rows: matches.length > 0 ? [matches[0]] : [], rowCount: matches.length > 0 ? 1 : 0 };
    }

    // INVOICES: Insert
    if (q.startsWith('INSERT INTO invoices')) {
      const [
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
        extraction_confidence_raw,
        extraction_source,
        raw_extracted_data_raw,
        file_path
      ] = params;

      const newInv = {
        id: crypto.randomUUID(),
        invoice_number,
        normalized_invoice_number,
        irn,
        supplier_id,
        po_id,
        invoice_date,
        subtotal: Number(subtotal),
        cgst: Number(cgst),
        sgst: Number(sgst),
        igst: Number(igst),
        total: Number(total),
        status,
        extraction_confidence: typeof extraction_confidence_raw === 'string' ? JSON.parse(extraction_confidence_raw) : extraction_confidence_raw,
        extraction_source,
        raw_extracted_data: typeof raw_extracted_data_raw === 'string' ? JSON.parse(raw_extracted_data_raw) : raw_extracted_data_raw,
        file_path,
        duplicate_similarity: null,
        duplicate_reasons: null,
        created_at: new Date()
      };
      this.invoices.push(newInv);
      return { rows: [newInv], rowCount: 1 };
    }

    // INVOICES: Candidates for duplicate check (WHERE inv.id != $1)
    if (q.includes('FROM invoices inv') && q.includes('WHERE inv.id != $1')) {
      const excludeId = params[0];
      const rows = this.invoices.filter(i => i.id !== excludeId).map(inv => {
        const s = this.suppliers.find(sup => sup.id === inv.supplier_id);
        return {
          ...inv,
          supplier_name: s?.name,
          supplier_gstin: s?.gstin
        };
      });
      return { rows, rowCount: rows.length };
    }

    // INVOICES: High risk query
    if (q.includes('FROM invoices inv') && (q.includes("inv.risk_level = 'HIGH'") || q.includes('inv.risk_score >= 70'))) {
      const highInvoices = this.invoices.filter(i => (i.risk_level === 'HIGH' || (i.risk_score && i.risk_score >= 70))).map(inv => {
        const s = this.suppliers.find(sup => sup.id === inv.supplier_id);
        const po = this.purchase_orders.find(p => p.id === inv.po_id);
        return {
          id: inv.id,
          invoice_number: inv.invoice_number,
          normalized_invoice_number: inv.normalized_invoice_number,
          total: inv.total,
          status: inv.status,
          risk_score: inv.risk_score || 0,
          risk_level: inv.risk_level || 'HIGH',
          itc_at_risk: inv.itc_at_risk || 0,
          supplier_id: s?.id || '',
          supplier_name: s?.name || '',
          supplier_gstin: s?.gstin || '',
          po_number: po?.po_number || ''
        };
      }).sort((a, b) => b.risk_score - a.risk_score);
      return { rows: highInvoices, rowCount: highInvoices.length };
    }

    // INVOICES: Historical join for overbilling service
    if (q.includes('FROM invoices inv JOIN invoice_lines inl ON inv.id = inl.invoice_id WHERE inv.supplier_id = $1')) {
      const supId = params[0];
      const rows: any[] = [];
      const supInvoices = this.invoices.filter(i => i.supplier_id === supId);
      for (const inv of supInvoices) {
        const lines = this.invoice_lines.filter(l => l.invoice_id === inv.id);
        for (const l of lines) {
          rows.push({
            id: inv.id,
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            subtotal: inv.subtotal,
            total: inv.total,
            status: inv.status,
            item_name: l.item_name,
            quantity: l.quantity,
            unit_price: l.unit_price,
            total_price: l.total_price
          });
        }
      }
      return { rows, rowCount: rows.length };
    }

    // INVOICES: Find by invoice_number standalone or id / invoice_number
    if (q.includes('FROM invoices') && q.includes('invoice_number =') && !q.includes('inv.id = $1')) {
      let val = '';
      if (params.length > 0 && params[0]) {
        val = params[0];
      } else {
        const match = q.match(/invoice_number\s*=\s*'([^']+)'/i);
        if (match) val = match[1];
      }
      const rows = this.invoices.filter(i => i.invoice_number === val || i.id === val);
      return { rows, rowCount: rows.length };
    }

    // INVOICES: Find by supplier_id with match results join
    if (q.includes('FROM invoices inv') && q.includes('LEFT JOIN match_results mr') && q.includes('inv.supplier_id = $1')) {
      const supId = params[0];
      const rows = this.invoices.filter(i => i.supplier_id === supId).map(inv => {
        const mr = this.match_results.find(m => m.invoice_id === inv.id);
        return {
          ...inv,
          match_status: mr?.status || null
        };
      });
      return { rows, rowCount: rows.length };
    }

    // INVOICES: Find by supplier_id
    if (q.includes('FROM invoices') && q.includes('WHERE supplier_id = $1')) {
      const rows = this.invoices.filter(i => i.supplier_id === params[0]);
      return { rows, rowCount: rows.length };
    }

    // INVOICES: List & Single fetch
    if (q.includes('FROM invoices inv')) {
      const idParam = params[0];
      if (idParam && q.includes('WHERE inv.id = $1 OR inv.invoice_number = $1')) {
        const inv = this.invoices.find(i => i.id === idParam || i.invoice_number === idParam);
        if (!inv) return { rows: [], rowCount: 0 };
        const s = this.suppliers.find(sup => sup.id === inv.supplier_id);
        const po = this.purchase_orders.find(p => p.id === inv.po_id);
        const u = this.users.find(usr => usr.id === inv.verified_by);
        const match = this.match_results.find(m => m.invoice_id === inv.id);
        return {
          rows: [{
            ...inv,
            supplier_name: s?.name,
            supplier_gstin: s?.gstin,
            supplier_bank_identifier: s?.bank_identifier,
            po_number: po?.po_number,
            verified_by_name: u?.name,
            match_status: match?.status || null
          }],
          rowCount: 1
        };
      }

      const rows = this.invoices.map(inv => {
        const s = this.suppliers.find(sup => sup.id === inv.supplier_id);
        const po = this.purchase_orders.find(p => p.id === inv.po_id);
        const u = this.users.find(usr => usr.id === inv.verified_by);
        const match = this.match_results.find(m => m.invoice_id === inv.id);
        return {
          ...inv,
          supplier_name: s?.name,
          supplier_gstin: s?.gstin,
          po_number: po?.po_number,
          verified_by_name: u?.name,
          match_status: match?.status || null
        };
      }).sort((a: any, b: any) => b.created_at.getTime() - a.created_at.getTime());
      return { rows, rowCount: rows.length };
    }

    // INVOICES: Find for file or update or single lookup
    if (q.includes('FROM invoices WHERE id = $1 OR invoice_number = $1') || (q.includes('FROM invoices WHERE id = $1') && !q.includes('inv.'))) {
      const inv = this.invoices.find(i => i.id === params[0] || i.invoice_number === params[0]);
      return { rows: inv ? [inv] : [], rowCount: inv ? 1 : 0 };
    }

    // INVOICES: General list / dashboard fetch without WHERE
    if (q.includes('FROM invoices') && !q.includes('WHERE') && !q.includes('JOIN') && !q.includes('GROUP BY') && !q.includes('COUNT(') && !q.includes('SUM(')) {
      return { rows: [...this.invoices], rowCount: this.invoices.length };
    }

    // INVOICES: Update duplicate fields
    if (q.includes('UPDATE invoices') && q.includes('duplicate_similarity = $1')) {
      const [sim, reasonsRaw, invId] = params;
      const inv = this.invoices.find(i => i.id === invId);
      if (inv) {
        inv.duplicate_similarity = Number(sim);
        inv.duplicate_reasons = typeof reasonsRaw === 'string' ? JSON.parse(reasonsRaw) : reasonsRaw;
        inv.updated_at = new Date();
        return { rows: [inv], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // INVOICES: Update status to ON_HOLD or MATCHED
    if (q.includes('UPDATE invoices SET status =')) {
      const invId = params[params.length - 1];
      const inv = this.invoices.find(i => i.id === invId);
      if (inv) {
        if (q.includes("'ON_HOLD'")) {
          inv.status = 'ON_HOLD';
        } else if (q.includes("'MATCHED'")) {
          inv.status = 'MATCHED';
        }
        inv.updated_at = new Date();
        return { rows: [inv], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // INVOICES: Update risk score and level
    if (q.includes('UPDATE invoices') && q.includes('risk_score = $1')) {
      const [riskScore, riskLevel, itcAtRisk, id] = params;
      const inv = this.invoices.find(i => i.id === id || i.invoice_number === id);
      if (inv) {
        inv.risk_score = Number(riskScore);
        inv.risk_level = riskLevel;
        if (itcAtRisk !== undefined) inv.itc_at_risk = Number(itcAtRisk);
        inv.updated_at = new Date();
        return { rows: [inv], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // INVOICES: Update GST check result
    if (q.includes('UPDATE invoices') && q.includes('itc_at_risk = $1')) {
      const [itcAtRisk, checkResultRaw, id] = params;
      const inv = this.invoices.find(i => i.id === id || i.invoice_number === id);
      if (inv) {
        inv.itc_at_risk = Number(itcAtRisk);
        inv.gst_check_result = typeof checkResultRaw === 'string' ? JSON.parse(checkResultRaw) : checkResultRaw;
        inv.updated_at = new Date();
        return { rows: [inv], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // INVOICES: Verify Update
    if (q.startsWith('UPDATE invoices')) {
      const [invNum, normNum, supId, poId, date, subtotal, cgst, sgst, igst, total, verified_by, id] = params;
      const inv = this.invoices.find(i => i.id === id);
      if (inv) {
        inv.invoice_number = invNum;
        inv.normalized_invoice_number = normNum;
        inv.supplier_id = supId;
        inv.po_id = poId;
        inv.invoice_date = date;
        inv.subtotal = Number(subtotal);
        inv.cgst = Number(cgst);
        inv.sgst = Number(sgst);
        inv.igst = Number(igst);
        inv.total = Number(total);
        inv.status = 'VERIFIED';
        inv.verified_by = verified_by;
        inv.verified_at = new Date();
        return { rows: [inv], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // INVOICE LINES: Insert
    if (q.startsWith('INSERT INTO invoice_lines')) {
      const [invoice_id, item_name, quantity, unit_price, total_price, tax_rate] = params;
      const newLine = {
        id: crypto.randomUUID(),
        invoice_id,
        item_name,
        quantity: Number(quantity),
        unit_price: Number(unit_price),
        total_price: Number(total_price),
        tax_rate: Number(tax_rate)
      };
      this.invoice_lines.push(newLine);
      return { rows: [newLine], rowCount: 1 };
    }

    // INVOICE LINES: Select
    if (q.includes('FROM invoice_lines WHERE invoice_id = $1')) {
      const rows = this.invoice_lines.filter(l => l.invoice_id === params[0]);
      return { rows, rowCount: rows.length };
    }

    // GSTR-2B RECORDS
    if (q.includes('FROM gstr2b_records')) {
      const gstin = params[0];
      const invNum1 = params[1];
      const invNum2 = params[2];
      const rows = this.gstr2b_records.filter(r => 
        r.gstin_supplier === gstin && 
        (r.invoice_number === invNum1 || r.invoice_number === invNum2 || (invNum1 && r.invoice_number?.replace(/[^a-zA-Z0-9]/g, '') === invNum1?.replace(/[^a-zA-Z0-9]/g, '')))
      );
      return { rows, rowCount: rows.length };
    }

    // RISK FLAGS: Delete
    if (q.startsWith('DELETE FROM risk_flags')) {
      const entity_type = params[0];
      const entity_id = params[1];
      this.risk_flags = this.risk_flags.filter(rf => !(rf.entity_type === entity_type && rf.entity_id === entity_id));
      return { rows: [], rowCount: 0 };
    }

    // RISK FLAGS: Insert
    if (q.startsWith('INSERT INTO risk_flags')) {
      const [entity_type, entity_id, rule_code, severity, reason, score, evidenceRaw] = params;
      const newFlag = {
        id: crypto.randomUUID(),
        entity_type,
        entity_id,
        rule_code,
        severity,
        reason,
        score: Number(score),
        evidence: typeof evidenceRaw === 'string' ? JSON.parse(evidenceRaw) : evidenceRaw,
        created_at: new Date()
      };
      this.risk_flags.push(newFlag);
      return { rows: [newFlag], rowCount: 1 };
    }

    // RISK FLAGS: Select by entity
    if (q.includes('FROM risk_flags') && q.includes('entity_type = $1 AND entity_id = $2')) {
      const entity_type = params[0];
      const entity_id = params[1];
      const rows = this.risk_flags
        .filter(rf => rf.entity_type === entity_type && rf.entity_id === entity_id)
        .sort((a, b) => b.score - a.score);
      return { rows, rowCount: rows.length };
    }

    // UPDATE risk_rules_config
    if (q.startsWith('UPDATE risk_rules_config')) {
      const [weight, threshold, is_active, rule_code] = params;
      const rule = this.risk_rules_config.find(r => r.rule_code === rule_code);
      if (rule) {
        if (weight !== null && weight !== undefined) rule.weight = Number(weight);
        if (threshold !== null && threshold !== undefined) rule.threshold = Number(threshold);
        if (is_active !== null && is_active !== undefined) rule.is_active = Boolean(is_active);
        return { rows: [rule], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // HIGH RISK & ITC AT RISK METRICS
    if (q.includes('SELECT COALESCE(SUM(itc_at_risk), 0)')) {
      const sum = this.invoices.reduce((acc, i) => acc + (parseFloat(i.itc_at_risk) || 0), 0);
      return { rows: [{ total_itc: sum.toFixed(2), total_itc_at_risk: sum.toFixed(2) }], rowCount: 1 };
    }

    // =========================================================================
    // INVESTIGATIONS HANDLERS
    // =========================================================================

    // INVESTIGATIONS: Count active
    if (q.includes('FROM investigations') && q.includes('COUNT(')) {
      let filtered = [...this.investigations];
      if (q.includes("status IN ('OPEN', 'IN_PROGRESS', 'REOPENED')") || q.includes("status != 'REVALIDATED'")) {
        filtered = filtered.filter(inv => ['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(inv.status));
      } else if (q.includes("status = 'REVALIDATED'")) {
        filtered = filtered.filter(inv => inv.status === 'REVALIDATED');
      }
      if (q.includes('invoice_id = $1')) {
        filtered = filtered.filter(inv => inv.invoice_id === params[0]);
      }
      return { rows: [{ count: filtered.length.toString(), cnt: filtered.length.toString() }], rowCount: 1 };
    }

    // INVESTIGATIONS: Group by department
    if (q.includes('FROM investigations') && q.includes('GROUP BY department')) {
      const counts: Record<string, number> = {};
      for (const inv of this.investigations) {
        counts[inv.department] = (counts[inv.department] || 0) + 1;
      }
      const rows = Object.entries(counts).map(([department, count]) => ({
        department,
        count: count.toString()
      }));
      return { rows, rowCount: rows.length };
    }

    // INVESTIGATIONS: Select by ID
    if (q.includes('FROM investigations') && q.includes('WHERE id = $1')) {
      const id = params[0];
      const found = this.investigations.find(inv => inv.id === id);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }

    // INVESTIGATIONS: Select by invoice_id and issue_type (dedup check)
    if (q.includes('FROM investigations') && q.includes('invoice_id = $1') && q.includes('issue_type = $2')) {
      const [invoice_id, issue_type] = params;
      const found = this.investigations.find(inv => inv.invoice_id === invoice_id && inv.issue_type === issue_type);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }

    // INVESTIGATIONS: Select by invoice_id
    if (q.includes('FROM investigations') && q.includes('WHERE invoice_id = $1')) {
      const invoice_id = params[0];
      const rows = this.investigations
        .filter(inv => inv.invoice_id === invoice_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { rows, rowCount: rows.length };
    }

    // INVESTIGATIONS: Select SHARED_BANK_ACCOUNT deduplication check
    if (q.includes('FROM investigations') && q.includes("issue_type = 'SHARED_BANK_ACCOUNT'")) {
      const [s1, s2] = params;
      const found = this.investigations.filter(
        inv => inv.issue_type === 'SHARED_BANK_ACCOUNT' && (inv.supplier_id === s1 || inv.supplier_id === s2)
      );
      return { rows: found, rowCount: found.length };
    }

    // INVESTIGATIONS: Select by supplier_id or linked invoices
    if (q.includes('FROM investigations') && q.includes('supplier_id = $1')) {
      const supId = params[0];
      const supInvIds = this.invoices.filter(i => i.supplier_id === supId).map(i => i.id);
      const found = this.investigations.filter(
        inv => inv.supplier_id === supId || (inv.invoice_id && supInvIds.includes(inv.invoice_id))
      );
      return { rows: found, rowCount: found.length };
    }

    // INVESTIGATIONS: Generic list with filters
    if (q.includes('FROM investigations')) {
      let rows = [...this.investigations];
      if (params.length > 0) {
        if (q.includes('status = $')) {
          const match = q.match(/status = \$(\d+)/);
          if (match) {
            const pNum = parseInt(match[1], 10) - 1;
            if (params[pNum]) rows = rows.filter(r => r.status === params[pNum]);
          }
        }
        if (q.includes('department = $')) {
          const match = q.match(/department = \$(\d+)/);
          if (match) {
            const pNum = parseInt(match[1], 10) - 1;
            if (params[pNum]) rows = rows.filter(r => r.department === params[pNum]);
          }
        }
        if (q.includes('assigned_to = $')) {
          const match = q.match(/assigned_to = \$(\d+)/);
          if (match) {
            const pNum = parseInt(match[1], 10) - 1;
            if (params[pNum]) rows = rows.filter(r => r.assigned_to === params[pNum]);
          }
        }
      }
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { rows, rowCount: rows.length };
    }

    // INVESTIGATIONS: Insert
    if (q.startsWith('INSERT INTO investigations')) {
      const newInv: any = {
        id: crypto.randomUUID(),
        issue_type: params[0],
        department: params[1],
        assigned_to: params[2],
        assigned_user_name: params[3],
        invoice_id: params[4],
        invoice_number: params[5],
        supplier_id: params[6],
        supplier_name: params[7],
        severity: params[8] || 'MEDIUM',
        title: params[9],
        description: params[10],
        status: params[11] || 'OPEN',
        evidence: typeof params[12] === 'string' ? JSON.parse(params[12]) : (params[12] || {}),
        comments: typeof params[13] === 'string' ? JSON.parse(params[13]) : (params[13] || []),
        resolution_notes: null,
        revalidation_result: null,
        reopened_reason: null,
        is_sample_data: true,
        created_at: new Date(),
        updated_at: new Date()
      };
      this.investigations.unshift(newInv);
      return { rows: [newInv], rowCount: 1 };
    }

    // INVESTIGATIONS: Update
    if (q.startsWith('UPDATE investigations')) {
      const id = params[params.length - 1];
      const inv = this.investigations.find(i => i.id === id);
      if (inv) {
        inv.updated_at = new Date();
        if (q.includes('status = $1')) {
          inv.status = params[0];
          if (params[1] !== undefined) {
            inv.comments = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
          }
          if (params[2] !== undefined) inv.resolution_notes = params[2];
          if (params[3] !== undefined) {
            inv.revalidation_result = typeof params[3] === 'string' ? JSON.parse(params[3]) : params[3];
          }
          if (params[4] !== undefined) inv.reopened_reason = params[4];
        } else if (q.includes('comments = $1')) {
          inv.comments = typeof params[0] === 'string' ? JSON.parse(params[0]) : params[0];
        } else if (q.includes('evidence = $1')) {
          inv.evidence = typeof params[0] === 'string' ? JSON.parse(params[0]) : params[0];
        } else if (q.includes('assigned_to = $1')) {
          inv.assigned_to = params[0];
          inv.assigned_user_name = params[1];
        }
        return { rows: [inv], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // =========================================================================
    // GRN HANDLERS
    // =========================================================================
    if (q.startsWith('INSERT INTO grns')) {
      const [grn_number, po_id, received_date, received_by] = params;
      const newGrn = {
        id: crypto.randomUUID(),
        grn_number,
        po_id,
        received_date: received_date || new Date().toISOString().split('T')[0],
        received_by,
        is_sample_data: true,
        created_at: new Date()
      };
      this.grns.push(newGrn);
      return { rows: [newGrn], rowCount: 1 };
    }

    if (q.startsWith('INSERT INTO grn_lines')) {
      const [grn_id, item_name, quantity_received] = params;
      const newLine = {
        id: crypto.randomUUID(),
        grn_id,
        item_name,
        quantity_received: parseFloat(quantity_received) || 0
      };
      this.grn_lines.push(newLine);
      return { rows: [newLine], rowCount: 1 };
    }

    // =========================================================================
    // INVOICES: Payment Status & Approval Updates
    // =========================================================================
    if (q.includes('UPDATE invoices') && q.includes('payment_status = $1')) {
      const [payment_status, approved_by, second_approved_by, approved_at, notes, id] = params;
      const inv = this.invoices.find(i => i.id === id || i.invoice_number === id);
      if (inv) {
        inv.payment_status = payment_status;
        if (approved_by !== undefined) inv.approved_by = approved_by;
        if (second_approved_by !== undefined) inv.second_approved_by = second_approved_by;
        if (approved_at !== undefined) inv.approved_at = approved_at;
        if (notes !== undefined) inv.payment_approval_notes = notes;
        inv.updated_at = new Date();
        return { rows: [inv], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // INVOICES: Status distribution for dashboard
    if (q.includes('FROM invoices') && q.includes('GROUP BY status')) {
      const counts: Record<string, number> = {};
      for (const inv of this.invoices) {
        const s = inv.status || 'UNKNOWN';
        counts[s] = (counts[s] || 0) + 1;
      }
      const rows = Object.entries(counts).map(([status, count]) => ({
        status,
        count: count.toString()
      }));
      return { rows, rowCount: rows.length };
    }

    // Default fallback
    return { rows: [], rowCount: 0 };
  }
}

export const inMemoryDb = new InMemoryDatabase();
