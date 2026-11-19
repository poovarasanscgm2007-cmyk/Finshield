import fs from 'fs';
import path from 'path';
import { pool } from './index';

async function runSeed() {
  console.log('--- FINSHIELD AI: Running Seed Data Script (Demo Scenario) ---');
  const seedFilePath = path.resolve(__dirname, '../../../database/seed.sql');

  if (!fs.existsSync(seedFilePath)) {
    throw new Error(`Seed SQL file not found at: ${seedFilePath}`);
  }

  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(seedFilePath, 'utf-8');
    console.log('Executing seed SQL statements...');
    await client.query(sql);
    console.log('✓ Seed data loaded successfully.');

    // Print summary verification counts
    console.log('\n--- Seed Verification Summary ---');
    const userRes = await client.query('SELECT COUNT(*) FROM users WHERE is_sample_data = TRUE;');
    const supplierRes = await client.query('SELECT COUNT(*) FROM suppliers WHERE is_sample_data = TRUE;');
    const poRes = await client.query('SELECT po_number, total_amount FROM purchase_orders WHERE po_number = $1;', ['PO-101']);
    const poChangeRes = await client.query('SELECT field, old_value, new_value, approval_id FROM po_change_history WHERE po_id = (SELECT id FROM purchase_orders WHERE po_number = $1);', ['PO-101']);
    const grnRes = await client.query('SELECT g.grn_number, l.quantity_received FROM grns g JOIN grn_lines l ON g.id = l.grn_id WHERE g.grn_number = $1;', ['GRN-101']);
    const invRes = await client.query('SELECT invoice_number, total, status FROM invoices WHERE invoice_number = $1;', ['INV-101']);
    const histInvRes = await client.query('SELECT COUNT(*) FROM invoices WHERE invoice_number LIKE $1;', ['INV-HIST-%']);
    const gstr2bRes = await client.query('SELECT COUNT(*) FROM gstr2b_records WHERE invoice_number = $1;', ['INV-101']);

    console.log(`- Sample Users: ${userRes.rows[0].count} roles`);
    console.log(`- Sample Suppliers: ${supplierRes.rows[0].count} (Supplier A & B share bank_identifier)`);
    console.log(`- PO-101 Found: ${poRes.rows.length > 0 ? `Yes (Total: Rs ${poRes.rows[0].total_amount})` : 'No'}`);
    console.log(`- PO Change Record: ${poChangeRes.rows.length > 0 ? `Field: ${poChangeRes.rows[0].field}, Old: ${poChangeRes.rows[0].old_value}, New: ${poChangeRes.rows[0].new_value}, Approval: ${poChangeRes.rows[0].approval_id || 'NULL (Unapproved)'}` : 'None'}`);
    console.log(`- GRN-101 Found: ${grnRes.rows.length > 0 ? `Received: ${grnRes.rows[0].quantity_received} kg (Planted Qty Mismatch vs 100 kg billed)` : 'No'}`);
    console.log(`- INV-101 Found: ${invRes.rows.length > 0 ? `Total: Rs ${invRes.rows[0].total}, Status: ${invRes.rows[0].status}` : 'No'}`);
    console.log(`- Historical Invoices (Overbilling Pattern): ${histInvRes.rows[0].count} invoices`);
    console.log(`- INV-101 in GSTR-2B: ${gstr2bRes.rows[0].count} (0 = Missing in GSTR-2B, ITC at risk)`);
    console.log('---------------------------------');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed();
