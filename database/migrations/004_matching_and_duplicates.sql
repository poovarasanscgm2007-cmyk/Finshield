-- ==============================================================================
-- FINSHIELD AI: Migration 004 - 3-Way Matching & Duplicate Detection
-- ==============================================================================

-- 1. Add compared_values column to match_results if not present
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS compared_values JSONB DEFAULT '{}'::jsonb;

-- 2. Add duplicate tracking columns to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS duplicate_similarity NUMERIC(5, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS duplicate_reasons JSONB;

-- 3. Add index on normalized_invoice_number and supplier_id for instant duplicate lookup
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_normalized ON invoices(supplier_id, normalized_invoice_number);
