-- ==============================================================================
-- FINSHIELD AI: Initial Database Schema (Phase 1)
-- PostgreSQL Migration: 001_initial_schema.sql
-- All demonstration / seed data is tagged with is_sample_data = true
-- ==============================================================================

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop existing tables in reverse dependency order if resetting
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS investigations CASCADE;
DROP TABLE IF EXISTS risk_flags CASCADE;
DROP TABLE IF EXISTS match_results CASCADE;
DROP TABLE IF EXISTS risk_rules_config CASCADE;
DROP TABLE IF EXISTS gstr2b_records CASCADE;
DROP TABLE IF EXISTS invoice_lines CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS grn_lines CASCADE;
DROP TABLE IF EXISTS grns CASCADE;
DROP TABLE IF EXISTS po_change_history CASCADE;
DROP TABLE IF EXISTS approvals CASCADE;
DROP TABLE IF EXISTS po_lines CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ------------------------------------------------------------------------------
-- 1. USERS TABLE
-- Roles: AP Employee, Procurement Employee, Warehouse Employee, Finance Manager, Admin
-- ------------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (
        role IN (
            'AP Employee',
            'Procurement Employee',
            'Warehouse Employee',
            'Finance Manager',
            'Admin'
        )
    ),
    is_sample_data BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 2. SUPPLIERS TABLE
-- Contains GSTIN, PAN, Bank Identifier (for shared entity graph detection)
-- ------------------------------------------------------------------------------
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    gstin VARCHAR(15) NOT NULL,
    pan VARCHAR(10) NOT NULL,
    bank_identifier VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(50) NOT NULL,
    gst_filing_status VARCHAR(50) NOT NULL DEFAULT 'Active',
    is_sample_data BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_suppliers_gstin ON suppliers(gstin);
CREATE INDEX idx_suppliers_bank ON suppliers(bank_identifier);

-- ------------------------------------------------------------------------------
-- 3. APPROVALS TABLE
-- Multi-level and maker-checker approval records
-- ------------------------------------------------------------------------------
CREATE TABLE approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actioned_at TIMESTAMPTZ,
    notes TEXT,
    is_sample_data BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 4. PURCHASE ORDERS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number VARCHAR(100) UNIQUE NOT NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    order_date DATE NOT NULL,
    total_amount NUMERIC(15, 2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_sample_data BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_purchase_orders_number ON purchase_orders(po_number);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);

-- ------------------------------------------------------------------------------
-- 5. PO LINES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE po_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL,
    quantity NUMERIC(12, 3) NOT NULL,
    unit_price NUMERIC(15, 2) NOT NULL,
    total_price NUMERIC(15, 2) NOT NULL,
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_po_lines_po_id ON po_lines(po_id);

-- ------------------------------------------------------------------------------
-- 6. PO CHANGE HISTORY TABLE
-- Tracks field modifications with original values, modifier, and approval record
-- ------------------------------------------------------------------------------
CREATE TABLE po_change_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    field VARCHAR(100) NOT NULL,
    old_value TEXT NOT NULL,
    new_value TEXT NOT NULL,
    approval_id UUID REFERENCES approvals(id) ON DELETE SET NULL,
    is_sample_data BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_po_change_history_po_id ON po_change_history(po_id);

-- ------------------------------------------------------------------------------
-- 7. GOODS RECEIPT NOTES (GRN) TABLE
-- Multiple GRNs per PO are permitted
-- ------------------------------------------------------------------------------
CREATE TABLE grns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_number VARCHAR(100) UNIQUE NOT NULL,
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    received_date DATE NOT NULL,
    received_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_sample_data BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_grns_po_id ON grns(po_id);
CREATE INDEX idx_grns_number ON grns(grn_number);

-- ------------------------------------------------------------------------------
-- 8. GRN LINES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE grn_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID NOT NULL REFERENCES grns(id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL,
    quantity_received NUMERIC(12, 3) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_grn_lines_grn_id ON grn_lines(grn_id);

-- ------------------------------------------------------------------------------
-- 9. INVOICES TABLE
-- Stores raw and normalized numbers, IRN, extraction confidence JSONB
-- ------------------------------------------------------------------------------
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(100) NOT NULL,
    normalized_invoice_number VARCHAR(100) NOT NULL,
    irn VARCHAR(100),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    invoice_date DATE NOT NULL,
    subtotal NUMERIC(15, 2) NOT NULL,
    cgst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    sgst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    igst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(15, 2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    extraction_confidence JSONB,
    extraction_source VARCHAR(20) DEFAULT 'FALLBACK',
    raw_extracted_data JSONB DEFAULT '{}'::jsonb,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    file_path VARCHAR(500),
    is_sample_data BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoices_status ON invoices(status);

CREATE INDEX idx_invoices_normalized_num ON invoices(normalized_invoice_number);
CREATE INDEX idx_invoices_supplier ON invoices(supplier_id);
CREATE INDEX idx_invoices_po ON invoices(po_id);

-- ------------------------------------------------------------------------------
-- 10. INVOICE LINES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL,
    quantity NUMERIC(12, 3) NOT NULL,
    unit_price NUMERIC(15, 2) NOT NULL,
    total_price NUMERIC(15, 2) NOT NULL,
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoice_lines_invoice_id ON invoice_lines(invoice_id);

-- ------------------------------------------------------------------------------
-- 11. GSTR-2B RECORDS TABLE
-- Official Government GSTR-2B inward auto-drafted records for ITC reconciliation
-- ------------------------------------------------------------------------------
CREATE TABLE gstr2b_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gstin_supplier VARCHAR(15) NOT NULL,
    invoice_number VARCHAR(100) NOT NULL,
    invoice_date DATE NOT NULL,
    invoice_value NUMERIC(15, 2) NOT NULL,
    taxable_value NUMERIC(15, 2) NOT NULL,
    cgst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    sgst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    igst NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    filing_period VARCHAR(20) NOT NULL,
    is_sample_data BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_gstr2b_gstin_inv ON gstr2b_records(gstin_supplier, invoice_number);

-- ------------------------------------------------------------------------------
-- 12. MATCH RESULTS TABLE (3-Way Matching Outputs: MATCHED / MISMATCH / HOLD)
-- ------------------------------------------------------------------------------
CREATE TABLE match_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('MATCHED', 'MISMATCH', 'HOLD')),
    reasons JSONB NOT NULL,
    is_sample_data BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_match_results_invoice_id ON match_results(invoice_id);

-- ------------------------------------------------------------------------------
-- 13. RISK FLAGS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE risk_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    rule_code VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    reason TEXT NOT NULL,
    score NUMERIC(5, 2) NOT NULL,
    is_sample_data BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_risk_flags_entity ON risk_flags(entity_type, entity_id);

-- ------------------------------------------------------------------------------
-- 14. INVESTIGATIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE investigations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_type VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL CHECK (
        department IN (
            'Warehouse',
            'Procurement/Finance',
            'AP/Finance',
            'Finance/Compliance'
        )
    ),
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN' CHECK (
        status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')
    ),
    evidence JSONB NOT NULL,
    is_sample_data BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 15. AUDIT LOG TABLE (Hash-chained immutable audit trail)
-- ------------------------------------------------------------------------------
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    prev_hash VARCHAR(64) NOT NULL,
    hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_entity ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- Make audit_log table append-only (blocks UPDATE and DELETE via Trigger)
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only: UPDATE and DELETE operations are forbidden';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON audit_log;
CREATE TRIGGER trg_audit_log_append_only
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_modification();

-- ------------------------------------------------------------------------------
-- 16. RISK RULES CONFIG TABLE
-- Configurable rules, weights, and thresholds
-- ------------------------------------------------------------------------------
CREATE TABLE risk_rules_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_code VARCHAR(50) UNIQUE NOT NULL,
    weight NUMERIC(5, 2) NOT NULL,
    threshold NUMERIC(10, 2) NOT NULL,
    rule_name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_sample_data BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
