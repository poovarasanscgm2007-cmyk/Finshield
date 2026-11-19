import { pool } from '../db';
import { writeAuditLog } from './auditService';
import { assignUserByRole } from './investigationService';
import { createApprovalRequest } from './approvalService';

export interface GraphNode {
  id: string;
  name: string;
  gstin: string;
  pan: string;
  bank_identifier?: string;
  address?: string;
  phone?: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_score: number;
  gst_filing_status: string;
  is_sample_data: boolean;
}

export type RelationshipType = 'SHARED_BANK' | 'SHARED_ADDRESS' | 'SHARED_PHONE' | 'SHARED_PAN';

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  shared_value: string;
  reason: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  requires_verification: boolean;
  disclaimer: string;
  linked_investigation_id?: string;
}

export interface SupplierGraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: {
    total_suppliers: number;
    total_relationships: number;
    shared_bank_relationships: number;
    shared_address_relationships: number;
    shared_phone_relationships: number;
    shared_pan_relationships: number;
  };
  disclaimer: string;
}

/**
 * Masks sensitive bank identifier for display (e.g. HDFC0001234-9876543210 -> HDFC-XXXX-3210)
 */
export function maskBankIdentifier(bankId?: string | null): string {
  if (!bankId) return 'N/A';
  const clean = bankId.trim();
  if (clean.length <= 6) return 'XXXX' + clean.slice(-2);
  const prefix = clean.slice(0, 4);
  const suffix = clean.slice(-4);
  return `${prefix}-XXXX-${suffix}`;
}

/**
 * Masks phone number for display (e.g. +91 98765 43210 -> +91 98*** 43210)
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return 'N/A';
  const clean = phone.trim();
  if (clean.length <= 6) return clean;
  return clean.slice(0, 6) + '***' + clean.slice(-4);
}

/**
 * Builds the supplier relationship graph by comparing relational attributes across all suppliers in PostgreSQL.
 * Wording strictly adheres to: "Relationship requires verification" (Golden Rule #3: indicator, not proof of fraud).
 * Automatically raises a risk flag and an investigation (Finance/Compliance) for SHARED_BANK edges.
 */
export async function getSupplierGraph(): Promise<SupplierGraphResult> {
  const supRes = await pool.query(`
    SELECT id, name, gstin, pan, bank_identifier, address, phone, gst_filing_status, risk_score, risk_level, is_sample_data
    FROM suppliers
    ORDER BY name ASC
  `);

  const suppliers = supRes.rows;
  const nodes: GraphNode[] = suppliers.map((s: any) => ({
    id: s.id,
    name: s.name,
    gstin: s.gstin,
    pan: s.pan,
    bank_identifier: maskBankIdentifier(s.bank_identifier),
    address: s.address,
    phone: maskPhone(s.phone),
    risk_level: s.risk_level || (s.risk_score >= 70 ? 'HIGH' : s.risk_score >= 40 ? 'MEDIUM' : 'LOW'),
    risk_score: s.risk_score || 0,
    gst_filing_status: s.gst_filing_status || 'Active',
    is_sample_data: true
  }));

  const edges: GraphEdge[] = [];

  // Compare each pair of suppliers
  for (let i = 0; i < suppliers.length; i++) {
    for (let j = i + 1; j < suppliers.length; j++) {
      const s1 = suppliers[i];
      const s2 = suppliers[j];

      // 1. SHARED_BANK (Critical Indicator)
      if (
        s1.bank_identifier &&
        s2.bank_identifier &&
        s1.bank_identifier.trim().toLowerCase() === s2.bank_identifier.trim().toLowerCase()
      ) {
        const masked = maskBankIdentifier(s1.bank_identifier);
        edges.push({
          id: `edge-${s1.id}-${s2.id}-SHARED_BANK`,
          source: s1.id,
          target: s2.id,
          type: 'SHARED_BANK',
          shared_value: masked,
          reason: `Suppliers share identical bank identifier (${masked}). Relationship requires verification.`,
          severity: 'HIGH',
          requires_verification: true,
          disclaimer: 'Relationship requires verification, not proof of fraud'
        });

        // Auto-raise investigation & risk flag for SHARED_BANK
        await syncSharedBankInvestigation(s1, s2, masked);
      }

      // 2. SHARED_ADDRESS
      if (
        s1.address &&
        s2.address &&
        s1.address.trim().toLowerCase() === s2.address.trim().toLowerCase()
      ) {
        edges.push({
          id: `edge-${s1.id}-${s2.id}-SHARED_ADDRESS`,
          source: s1.id,
          target: s2.id,
          type: 'SHARED_ADDRESS',
          shared_value: s1.address.slice(0, 30) + '...',
          reason: 'Suppliers share registered business address. Relationship requires verification.',
          severity: 'MEDIUM',
          requires_verification: true,
          disclaimer: 'Relationship requires verification, not proof of fraud'
        });
      }

      // 3. SHARED_PHONE
      if (
        s1.phone &&
        s2.phone &&
        s1.phone.trim().replace(/\s+/g, '') === s2.phone.trim().replace(/\s+/g, '')
      ) {
        edges.push({
          id: `edge-${s1.id}-${s2.id}-SHARED_PHONE`,
          source: s1.id,
          target: s2.id,
          type: 'SHARED_PHONE',
          shared_value: maskPhone(s1.phone),
          reason: 'Suppliers share registered contact phone number. Relationship requires verification.',
          severity: 'MEDIUM',
          requires_verification: true,
          disclaimer: 'Relationship requires verification, not proof of fraud'
        });
      }

      // 4. SHARED_PAN
      if (
        s1.pan &&
        s2.pan &&
        s1.pan.trim().toUpperCase() === s2.pan.trim().toUpperCase()
      ) {
        edges.push({
          id: `edge-${s1.id}-${s2.id}-SHARED_PAN`,
          source: s1.id,
          target: s2.id,
          type: 'SHARED_PAN',
          shared_value: s1.pan.trim(),
          reason: 'Suppliers share the same Permanent Account Number (PAN). Relationship requires verification.',
          severity: 'HIGH',
          requires_verification: true,
          disclaimer: 'Relationship requires verification, not proof of fraud'
        });
      }
    }
  }

  const summary = {
    total_suppliers: nodes.length,
    total_relationships: edges.length,
    shared_bank_relationships: edges.filter(e => e.type === 'SHARED_BANK').length,
    shared_address_relationships: edges.filter(e => e.type === 'SHARED_ADDRESS').length,
    shared_phone_relationships: edges.filter(e => e.type === 'SHARED_PHONE').length,
    shared_pan_relationships: edges.filter(e => e.type === 'SHARED_PAN').length
  };

  return {
    nodes,
    edges,
    summary,
    disclaimer: 'All relationships and indicators represent verification priorities and NOT proof of fraud.'
  };
}

/**
 * Ensures a SHARED_BANK investigation and risk flag exists without duplicates.
 */
async function syncSharedBankInvestigation(s1: any, s2: any, maskedBank: string): Promise<void> {
  try {
    // Check if an investigation for SHARED_BANK_ACCOUNT already exists involving these suppliers
    const existingInv = await pool.query(
      `SELECT id, status FROM investigations 
       WHERE issue_type = 'SHARED_BANK_ACCOUNT' 
       AND (supplier_id = $1 OR supplier_id = $2)`,
      [s1.id, s2.id]
    );

    if (existingInv.rows.length === 0) {
      const assignee = await assignUserByRole('Finance Manager');

      const evidencePayload = {
        indicator_type: 'SHARED_BANK',
        supplier_a: { id: s1.id, name: s1.name, gstin: s1.gstin },
        supplier_b: { id: s2.id, name: s2.name, gstin: s2.gstin },
        masked_bank_identifier: maskedBank,
        reason: 'Suppliers share identical bank account identifier. Relationship requires verification.',
        disclaimer: 'Relationship requires verification, not proof of fraud',
        investigation_priority: 'HIGH'
      };

      // 1. Insert investigation
      await pool.query(
        `INSERT INTO investigations (
          issue_type, department, assigned_to, supplier_id, severity, status, title, description, evidence, is_sample_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          'SHARED_BANK_ACCOUNT',
          'Finance/Compliance',
          assignee.id,
          s1.id,
          'HIGH',
          'OPEN',
          `Shared Bank Identifier: ${s1.name} & ${s2.name}`,
          `Suppliers share identical bank account identifier (${maskedBank}). Relationship requires verification.`,
          JSON.stringify(evidencePayload),
          true
        ]
      );

      // 2. Insert risk flag
      await pool.query(
        `INSERT INTO risk_flags (entity_type, entity_id, rule_code, severity, reason, score, is_sample_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          'SUPPLIER',
          s1.id,
          'SHARED_BANK',
          'HIGH',
          `Shared bank identifier (${maskedBank}) with ${s2.name}. Relationship requires verification.`,
          85,
          true
        ]
      );

      // 3. Write hash-chained audit log
      await writeAuditLog(
        assignee.id,
        'SHARED_BANK_RELATIONSHIP_FLAGGED',
        'SUPPLIER',
        s1.id,
        evidencePayload
      );
    }
  } catch (err) {
    console.error('Error syncing shared bank investigation:', err);
  }
}

/**
 * Initiates a supplier bank identifier change under maker-checker controls.
 * Creates an approval request requiring a different Finance Manager's approval before taking effect.
 */
export async function requestSupplierBankChange(
  supplierId: string,
  newBankIdentifier: string,
  requesterId: string,
  reason?: string
): Promise<any> {
  const supRes = await pool.query('SELECT * FROM suppliers WHERE id = $1', [supplierId]);
  if (supRes.rows.length === 0) {
    throw new Error(`Supplier '${supplierId}' not found.`);
  }

  const supplier = supRes.rows[0];
  const oldBank = supplier.bank_identifier;

  if (oldBank === newBankIdentifier.trim()) {
    throw new Error('New bank identifier is identical to the current bank identifier.');
  }

  // Create approval request with entity_type SUPPLIER_BANK_CHANGE
  const payload = {
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    old_bank_identifier: oldBank,
    new_bank_identifier: newBankIdentifier.trim(),
    reason: reason || 'Vendor bank account update submitted for verification'
  };

  const approval = await createApprovalRequest(
    'SUPPLIER_BANK_CHANGE',
    supplier.id,
    requesterId,
    payload,
    `Bank identifier change requested for ${supplier.name} from ${maskBankIdentifier(oldBank)} to ${maskBankIdentifier(newBankIdentifier)}.`
  );

  // Write to hash-chained audit log
  await writeAuditLog(
    requesterId,
    'SUPPLIER_BANK_CHANGE_REQUESTED',
    'SUPPLIER',
    supplier.id,
    {
      approval_id: approval.id,
      old_bank_masked: maskBankIdentifier(oldBank),
      new_bank_masked: maskBankIdentifier(newBankIdentifier),
      reason: reason || null
    }
  );

  return approval;
}
