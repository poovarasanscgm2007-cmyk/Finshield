# FINSHIELD AI: Database Schema Documentation (Phase 1)

This document describes the PostgreSQL relational schema designed for FINSHIELD AI, supporting 3-way matching, duplicate detection, PO change audits, historical overbilling, GST compliance checks, investigation workflows, and hash-chained audit logging.

All demo data records are tagged with `is_sample_data = TRUE` in compliance with Golden Rule 4.

---

## Entity Relationship Overview

```
users
  ├── purchase_orders (created_by)
  ├── po_change_history (changed_by)
  ├── approvals (requested_by, approved_by)
  ├── grns (received_by)
  ├── investigations (assigned_to)
  └── audit_log (actor_id)

suppliers
  ├── purchase_orders (supplier_id)
  └── invoices (supplier_id)

purchase_orders
  ├── po_lines (po_id)
  ├── po_change_history (po_id)
  ├── grns (po_id)
  └── invoices (po_id)

grns
  └── grn_lines (grn_id)

invoices
  ├── invoice_lines (invoice_id)
  └── match_results (invoice_id)

approvals
  └── po_change_history (approval_id)

gstr2b_records (reconciled by gstin_supplier + invoice_number)
risk_flags (polymorphic entity_type + entity_id)
risk_rules_config (rules, weights, thresholds)
audit_log (hash-chained tamper-evident event log)
```

---

## Table Definitions

### 1. `users`
System actors with strict role-based access control (RBAC).
- `id` (UUID, PK)
- `name` (VARCHAR 255)
- `email` (VARCHAR 255, UNIQUE)
- `password_hash` (VARCHAR 255)
- `role` (VARCHAR 50) - Check constraint: `'AP Employee'`, `'Procurement Employee'`, `'Warehouse Employee'`, `'Finance Manager'`, `'Admin'`
- `is_sample_data` (BOOLEAN, default TRUE)
- `created_at` / `updated_at` (TIMESTAMPTZ)

### 2. `suppliers`
Vendor master with GSTIN, PAN, and banking identifier.
- `id` (UUID, PK)
- `name` (VARCHAR 255)
- `gstin` (VARCHAR 15) - Indexed
- `pan` (VARCHAR 10)
- `bank_identifier` (VARCHAR 100) - Indexed (Used to detect shared banking relations)
- `address` (TEXT)
- `phone` (VARCHAR 50)
- `gst_filing_status` (VARCHAR 50)
- `is_sample_data` (BOOLEAN)
- `created_at` / `updated_at` (TIMESTAMPTZ)

### 3. `purchase_orders`
Authorized purchase orders.
- `id` (UUID, PK)
- `po_number` (VARCHAR 100, UNIQUE)
- `supplier_id` (UUID, FK -> suppliers.id)
- `order_date` (DATE)
- `total_amount` (NUMERIC 15,2)
- `status` (VARCHAR 50)
- `created_by` (UUID, FK -> users.id)
- `is_sample_data` (BOOLEAN)
- `created_at` / `updated_at` (TIMESTAMPTZ)

### 4. `po_lines`
Line items for purchase orders.
- `id` (UUID, PK)
- `po_id` (UUID, FK -> purchase_orders.id CASCADE)
- `item_name` (VARCHAR 255)
- `quantity` (NUMERIC 12,3)
- `unit_price` (NUMERIC 15,2)
- `total_price` (NUMERIC 15,2)
- `tax_rate` (NUMERIC 5,2, default 18.00)
- `created_at` (TIMESTAMPTZ)

### 5. `po_change_history`
Audit of every PO modification, including price/qty changes and approval status.
- `id` (UUID, PK)
- `po_id` (UUID, FK -> purchase_orders.id CASCADE)
- `changed_by` (UUID, FK -> users.id)
- `changed_at` (TIMESTAMPTZ)
- `field` (VARCHAR 100)
- `old_value` (TEXT)
- `new_value` (TEXT)
- `approval_id` (UUID, FK -> approvals.id NULLABLE) - If NULL, change is unapproved!
- `is_sample_data` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)

### 6. `approvals`
Maker-checker and multi-level authorization records.
- `id` (UUID, PK)
- `entity_type` (VARCHAR 50)
- `entity_id` (VARCHAR 100)
- `requested_by` (UUID, FK -> users.id)
- `approved_by` (UUID, FK -> users.id)
- `status` (VARCHAR 50) - Check constraint: `'PENDING'`, `'APPROVED'`, `'REJECTED'`
- `requested_at` / `actioned_at` (TIMESTAMPTZ)
- `notes` (TEXT)
- `is_sample_data` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)

### 7. `grns` (Goods Receipt Notes)
Warehouse intake records (supports multiple GRNs per PO).
- `id` (UUID, PK)
- `grn_number` (VARCHAR 100, UNIQUE)
- `po_id` (UUID, FK -> purchase_orders.id)
- `received_date` (DATE)
- `received_by` (UUID, FK -> users.id)
- `is_sample_data` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)

### 8. `grn_lines`
Items received by warehouse.
- `id` (UUID, PK)
- `grn_id` (UUID, FK -> grns.id CASCADE)
- `item_name` (VARCHAR 255)
- `quantity_received` (NUMERIC 12,3)
- `created_at` (TIMESTAMPTZ)

### 9. `invoices`
Inward supplier invoices with OCR confidence and e-invoice IRN.
- `id` (UUID, PK)
- `invoice_number` (VARCHAR 100)
- `normalized_invoice_number` (VARCHAR 100, indexed)
- `irn` (VARCHAR 100)
- `supplier_id` (UUID, FK -> suppliers.id)
- `po_id` (UUID, FK -> purchase_orders.id NULLABLE)
- `invoice_date` (DATE)
- `subtotal` (NUMERIC 15,2)
- `cgst`, `sgst`, `igst`, `total` (NUMERIC 15,2)
- `status` (VARCHAR 50)
- `extraction_confidence` (JSONB)
- `file_path` (VARCHAR 500)
- `is_sample_data` (BOOLEAN)
- `created_at` / `updated_at` (TIMESTAMPTZ)

### 10. `invoice_lines`
Line items extracted from invoices.
- `id` (UUID, PK)
- `invoice_id` (UUID, FK -> invoices.id CASCADE)
- `item_name` (VARCHAR 255)
- `quantity` (NUMERIC 12,3)
- `unit_price` (NUMERIC 15,2)
- `total_price` (NUMERIC 15,2)
- `tax_rate` (NUMERIC 5,2)
- `created_at` (TIMESTAMPTZ)

### 11. `gstr2b_records`
Official GST portal auto-drafted inward supply records for ITC reconciliation.
- `id` (UUID, PK)
- `gstin_supplier` (VARCHAR 15)
- `invoice_number` (VARCHAR 100)
- `invoice_date` (DATE)
- `invoice_value` (NUMERIC 15,2)
- `taxable_value` (NUMERIC 15,2)
- `cgst`, `sgst`, `igst` (NUMERIC 15,2)
- `filing_period` (VARCHAR 20)
- `is_sample_data` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)

### 12. `match_results`
Deterministic 3-way matching output.
- `id` (UUID, PK)
- `invoice_id` (UUID, FK -> invoices.id CASCADE)
- `status` (VARCHAR 50) - Check constraint: `'MATCHED'`, `'MISMATCH'`, `'HOLD'`
- `reasons` (JSONB)
- `is_sample_data` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)

### 13. `risk_flags`
Configurable risk evaluation indicators.
- `id` (UUID, PK)
- `entity_type` (VARCHAR 50)
- `entity_id` (VARCHAR 100)
- `rule_code` (VARCHAR 50)
- `severity` (VARCHAR 20) - Check constraint: `'LOW'`, `'MEDIUM'`, `'HIGH'`, `'CRITICAL'`
- `reason` (TEXT)
- `score` (NUMERIC 5,2)
- `is_sample_data` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)

### 14. `investigations`
Departmental auto-routed discrepancy resolution workflows.
- `id` (UUID, PK)
- `issue_type` (VARCHAR 100)
- `department` (VARCHAR 100) - Check: `'Warehouse'`, `'Procurement/Finance'`, `'AP/Finance'`, `'Finance/Compliance'`
- `assigned_to` (UUID, FK -> users.id NULLABLE)
- `status` (VARCHAR 50) - Check: `'OPEN'`, `'IN_PROGRESS'`, `'RESOLVED'`, `'CLOSED'`
- `evidence` (JSONB)
- `is_sample_data` (BOOLEAN)
- `created_at` / `updated_at` (TIMESTAMPTZ)

### 15. `audit_log`
Hash-chained immutable audit log.
- `id` (UUID, PK)
- `actor_id` (UUID, FK -> users.id NULLABLE)
- `action` (VARCHAR 100)
- `entity` (VARCHAR 50)
- `entity_id` (VARCHAR 100)
- `payload` (JSONB)
- `prev_hash` (VARCHAR 64) - SHA-256 hash of previous block
- `hash` (VARCHAR 64) - SHA-256 hash of current block
- `created_at` (TIMESTAMPTZ)

### 16. `risk_rules_config`
Configurable rules, weights, and thresholds.
- `id` (UUID, PK)
- `rule_code` (VARCHAR 50, UNIQUE)
- `weight` (NUMERIC 5,2)
- `threshold` (NUMERIC 10,2)
- `rule_name` (VARCHAR 255)
- `description` (TEXT)
- `is_active` (BOOLEAN)
- `is_sample_data` (BOOLEAN)
- `created_at` / `updated_at` (TIMESTAMPTZ)
