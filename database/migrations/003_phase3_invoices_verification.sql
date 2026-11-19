-- ==============================================================================
-- FINSHIELD AI: Migration 003 - Phase 3 Invoice Extraction & Human Verification
-- ==============================================================================

-- 1. Add extraction_source, raw_extracted_data, verified_by, verified_at to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS extraction_source VARCHAR(20) DEFAULT 'FALLBACK';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS raw_extracted_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 2. Add index on invoice status for faster filtering
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
