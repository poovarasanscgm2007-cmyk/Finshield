-- ==============================================================================
-- FINSHIELD AI: Migration 005 - GST Checks, Risk Scoring & Overbilling
-- ==============================================================================

-- 1. Add risk score and GST check tracking columns to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) DEFAULT 'LOW';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gst_check_result JSONB;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS itc_at_risk NUMERIC(15, 2) DEFAULT 0.00;

-- 2. Add risk metrics to suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5, 2) DEFAULT 0.00;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) DEFAULT 'LOW';

-- 3. Add evidence JSONB column to risk_flags if not present
ALTER TABLE risk_flags ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}'::jsonb;

-- 4. Create index for high-risk item queries
CREATE INDEX IF NOT EXISTS idx_invoices_risk_score ON invoices(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_risk_flags_entity ON risk_flags(entity_type, entity_id);
