-- ==============================================================================
-- FINSHIELD AI: Migration 002 - Phase 2 Approvals Payload & Append-Only Audit Log
-- ==============================================================================

-- 1. Ensure payload column on approvals table
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;

-- 2. Make audit_log table append-only (blocks UPDATE and DELETE via Trigger)
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
