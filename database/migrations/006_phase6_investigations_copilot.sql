-- FINSHIELD AI: Migration 006 - Investigations Workflow, AI Copilot & Payment Gate
-- Adds missing columns, updated constraints and payment authorization tracking.

-- 1. Update investigations table constraints and columns
ALTER TABLE investigations 
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
  ADD COLUMN IF NOT EXISTS revalidation_result JSONB,
  ADD COLUMN IF NOT EXISTS reopened_reason TEXT,
  ADD COLUMN IF NOT EXISTS assigned_user_name VARCHAR(100);

-- Drop old check constraints if needed and recreate
ALTER TABLE investigations DROP CONSTRAINT IF EXISTS investigations_status_check;
ALTER TABLE investigations ADD CONSTRAINT investigations_status_check 
  CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REVALIDATED', 'REOPENED', 'CLOSED'));

ALTER TABLE investigations DROP CONSTRAINT IF EXISTS investigations_department_check;
ALTER TABLE investigations ADD CONSTRAINT investigations_department_check 
  CHECK (department IN ('Warehouse', 'Procurement', 'Procurement/Finance', 'AP', 'AP/Finance', 'Finance', 'Finance/Compliance'));

-- 2. Update invoices table with payment workflow columns
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'ON_HOLD' 
    CHECK (payment_status IN ('ON_HOLD', 'ELIGIBLE_FOR_APPROVAL', 'PENDING_SECOND_APPROVAL', 'APPROVED', 'REJECTED')),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS second_approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_approval_notes TEXT;

-- 3. Indexes for fast dashboard and investigation lookups
CREATE INDEX IF NOT EXISTS idx_investigations_invoice_id ON investigations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_investigations_department ON investigations(department);
CREATE INDEX IF NOT EXISTS idx_investigations_status ON investigations(status);
CREATE INDEX IF NOT EXISTS idx_investigations_assigned_to ON investigations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);
