-- ==============================================================================
-- FINSHIELD AI: Migration 007 - Phase 7 Supplier Graph, Scorecard & Bank Approvals
-- ==============================================================================

-- 1. Index supplier relational attributes for fast graph link discovery
CREATE INDEX IF NOT EXISTS idx_suppliers_bank_identifier ON suppliers(bank_identifier);
CREATE INDEX IF NOT EXISTS idx_suppliers_pan ON suppliers(pan);
CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON suppliers(phone);

-- 2. Ensure supplier scorecard metrics columns if needed
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS performance_score NUMERIC(5,2) DEFAULT NULL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS performance_grade VARCHAR(10) DEFAULT NULL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS scorecard_data JSONB DEFAULT NULL;
