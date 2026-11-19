# FINSHIELD AI: AP Risk & GST Compliance Platform

> **"Beyond Invoice Matching: Catch Financial Risk and GST Loss Before You Pay."**

FINSHIELD AI is an AI-powered Accounts Payable (AP) Risk & GST Compliance Platform for Indian businesses (hackathon prototype). It automates invoice extraction, 3-way matching (PO, GRN, Invoice), detects duplicates, suspicious patterns, and GST/ITC risk, and gives evidence-based AI investigations.

---

## Folder Structure

```
FinShield/
├── PROJECT_SPEC.md       # Master specification and golden rules
├── README.md             # Setup, running, and testing documentation
├── backend/              # Node.js + Express + TypeScript API server
│   ├── src/
│   │   ├── auth/         # RBAC permissions map & role definitions
│   │   ├── db/           # PostgreSQL connection pool, migration & seed runners
│   │   ├── middleware/   # JWT authentication, requireRole RBAC, error handler
│   │   ├── routes/       # Auth, Approvals, POs, Audit Log, Health
│   │   ├── services/     # Approval service (maker-checker), Audit service (hash-chain)
│   │   ├── test/         # Automated test suite (22 unit/integration tests)
│   │   ├── app.ts        # Express application configuration
│   │   └── index.ts      # Server bootstrap
│   ├── .env.example      # Environment template
│   ├── package.json
│   └── tsconfig.json
├── frontend/             # React + TypeScript + Vite + TailwindCSS
│   ├── src/
│   │   ├── components/   # SampleDataBanner, LoginPage, Approvals, AuditLog, Header, Sidebar
│   │   ├── context/      # AuthContext (JWT session, login, logout, authFetch)
│   │   ├── types/        # Auth and data interfaces
│   │   ├── App.tsx       # Role-based dashboard and route container
│   │   ├── main.tsx
│   │   └── index.css     # Tailwind directives
│   ├── package.json
│   ├── vite.config.ts    # Configured with proxy to backend
│   └── tailwind.config.js
├── database/             # PostgreSQL database migrations and seed scripts
│   ├── migrations/
│   │   ├── 001_initial_schema.sql         # 16 core relational tables
│   │   └── 002_phase2_audit_approvals.sql # Approvals payload & append-only trigger
│   └── seed.sql          # Demo scenario seed data (Section 6) with bcrypt hashes
├── sample-data/          # Seed manifests, sample GSTR-2B, mock invoices
│   ├── demo_scenario.json
│   ├── gstr2b_sample.json
│   └── invoices/
└── docs/                 # Documentation
    ├── architecture.md
    └── database_schema.md
```

---

## Sample Data: Demo Users & Known Passwords

All demo user accounts are strictly synthetic sample data (`is_sample_data = TRUE`) adhering to Golden Rule 4.

| Role | Name | Email | Password | Allowed Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | Admin User | `admin@finshield.sample` | `Admin@123` | Audit log, user management, risk rules. *Cannot approve payments!* |
| **Finance Manager** | Finance Manager | `finance@finshield.sample` | `Finance@123` | Approves PO changes, payments, audit log, risk data. |
| **AP Employee** | AP Specialist | `ap@finshield.sample` | `Ap@12345` | Upload invoices, view matching results, create investigations. |
| **Procurement Employee** | Employee 102 | `emp102@finshield.sample` | `Emp102@123` | View & edit POs, propose price changes (under approval). |
| **Warehouse Employee** | Warehouse Supervisor | `warehouse@finshield.sample` | `Warehouse@123` | View & edit GRNs, intake notes, quantity reconciliation. |

---

## Prerequisites

- **Node.js**: v18.0.0 or higher (v24.x tested)
- **npm**: v9.0.0 or higher
- **PostgreSQL**: v13+ running locally or cloud-hosted (Supabase, Neon, RDS, Docker)

---

## Quick Start (Installation & Execution)

### 1. Backend Setup

```bash
cd backend

# 1. Copy environment configuration
cp .env.example .env
# Note: On Windows PowerShell:
# Copy-Item .env.example .env

# Edit .env with your PostgreSQL credentials:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/finshield
# PORT=5000

# 2. Install dependencies
npm install

# 3. Apply database migrations
npm run db:migrate

# 4. Load demo seed data
npm run db:seed

# 5. Run automated tests (22 tests verifying RBAC, bcrypt passwords, maker-checker, hash chain)
npm test

# 6. Start the backend development server
npm run dev
```

The backend starts at `http://localhost:5000`. Test the health endpoint:
```bash
curl http://localhost:5000/api/health
```

---

### 2. Frontend Setup

In a new terminal window:

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Start Vite development server
npm run dev
```

Open `http://localhost:5173` in your browser.
The interface provides:
- **Clean, Modern AP Risk Dashboard**: live KPI metrics, status distributions, and active alert counters.
- **Login Page** with one-click demo login buttons for each role.
- **Role-Based Dynamic Sidebar**: only displays modules authorized for the logged-in user.
- **Maker-Checker Approval Queue**: lists pending approvals, Approve/Reject buttons with real maker-checker enforcement.
- **Cryptographic Audit Log**: displays SHA-256 hash chains with one-click integrity verification.

---

## Testing Phase 2 Features (Curl Examples)

### 1. Authenticate (Login as Employee 102)

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "emp102@finshield.sample", "password": "Emp102@123"}'
```
*Response*: Returns 200 OK with `token` (JWT valid for 8 hours) and user info. Save this as `$EMP_TOKEN`.

---

### 2. RBAC Enforcement Test (403 Access Denied)

Login as Warehouse Employee (`warehouse@finshield.sample` / `Warehouse@123`) and attempt to access the Finance-only audit log:

```bash
# 1. Get warehouse token
WH_TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "warehouse@finshield.sample", "password": "Warehouse@123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# 2. Access audit log (Forbidden for Warehouse)
curl -X GET http://localhost:5000/api/audit-log \
  -H "Authorization: Bearer $WH_TOKEN"
```
*Response*:
```json
{
  "status": "error",
  "statusCode": 403,
  "message": "Forbidden: Insufficient role permissions. Required one of: [Admin, Finance Manager]. Current role: Warehouse Employee"
}
```
*(This 403 denial is automatically written to the hash-chained audit log with action `ACCESS_DENIED`)*.

---

### 3. Maker-Checker Block Test (Requester Cannot Approve Own Request)

1. Employee 102 submits a new price change request on PO-101 (proposing change to Rs 750):
```bash
curl -X PUT http://localhost:5000/api/purchase-orders/PO-101/price \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EMP_TOKEN" \
  -d '{"newUnitPrice": 750.00, "reason": "Vendor freight surcharge adjustment"}'
```
*Response*: Returns 202 Accepted with approval request ID (e.g. `app-id-123`).

2. Employee 102 attempts to approve their own request:
```bash
curl -X POST http://localhost:5000/api/approvals/<APPROVAL_ID>/approve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EMP_TOKEN" \
  -d '{"notes": "Self-approving"}'
```
*Response (HTTP 403 Forbidden)*:
```json
{
  "status": "error",
  "statusCode": 403,
  "message": "Maker-checker violation: requester cannot approve their own request."
}
```
*(This violation attempt is permanently recorded in the audit log with action `MAKER_CHECKER_VIOLATION_ATTEMPT`)*.

---

### 4. Checker Approval Test (Finance Manager Approves)

Login as Finance Manager and approve the request:
```bash
# 1. Get finance manager token
FIN_TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "finance@finshield.sample", "password": "Finance@123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# 2. Finance Manager approves request
curl -X POST http://localhost:5000/api/approvals/<APPROVAL_ID>/approve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FIN_TOKEN" \
  -d '{"notes": "Authorized after supplier rate review"}'
```
*Response*: Returns 200 OK `{"status": "ok", "message": "Approval granted successfully."}`. The PO price is now updated in `po_lines` and `purchase_orders`.

*(Note: The planted demo Section 6 unapproved modification on PO-101 with `approval_id = NULL` remains in `po_change_history` for subsequent risk engine testing)*.

---

### 5. Cryptographic Audit Chain Verification Test

Recompute and mathematically verify all SHA-256 blocks from genesis to the current head:

```bash
curl -X GET http://localhost:5000/api/audit-log/verify \
  -H "Authorization: Bearer $FIN_TOKEN"
```
*Response*:
```json
{
  "status": "ok",
  "valid": true,
  "totalEntries": 14,
  "message": "Audit log cryptographic hash chain is intact and untampered across all 14 entries."
}
```

---

### 6. Append-Only Database Trigger Test (UPDATE/DELETE Forbidden)

Attempting to update or delete any row in `audit_log` is rejected by the database trigger:

```sql
UPDATE audit_log SET action = 'ALTERED' WHERE id = '...';
-- Output: ERROR: audit_log is append-only: UPDATE and DELETE operations are forbidden

DELETE FROM audit_log WHERE id = '...';
-- Output: ERROR: audit_log is append-only: UPDATE and DELETE operations are forbidden
```

---

## Seed Data Verification SQL Query

```sql
SELECT 
    po.po_number,
    pol.item_name,
    pol.quantity AS po_ordered_qty,
    pol.unit_price AS po_current_unit_price,
    pch.field AS modified_field,
    pch.old_value AS po_original_price,
    pch.new_value AS po_modified_price,
    u_mod.name AS modified_by,
    CASE WHEN pch.approval_id IS NULL THEN 'UNAPPROVED MODIFICATION' ELSE 'APPROVED' END AS change_approval_status,
    grn.grn_number,
    grnl.quantity_received AS grn_received_qty,
    (pol.quantity - grnl.quantity_received) AS quantity_mismatch_discrepancy,
    inv.invoice_number,
    invl.quantity AS inv_billed_qty,
    invl.unit_price AS inv_unit_price,
    inv.total AS inv_total_amount,
    s_a.name AS supplier_a_name,
    s_a.bank_identifier AS supplier_a_bank,
    s_b.name AS supplier_b_name,
    s_b.bank_identifier AS supplier_b_bank,
    CASE WHEN s_a.bank_identifier = s_b.bank_identifier THEN 'SHARED BANK IDENTIFIER' ELSE 'DISTINCT' END AS relationship_indicator,
    CASE 
        WHEN EXISTS (SELECT 1 FROM gstr2b_records g WHERE g.invoice_number = inv.invoice_number) 
        THEN 'PRESENT IN GSTR-2B' 
        ELSE 'MISSING IN GSTR-2B (ITC AT RISK: Rs 9,000)' 
    END AS gst_compliance_status
FROM purchase_orders po
JOIN po_lines pol ON po.id = pol.po_id
LEFT JOIN po_change_history pch ON po.id = pch.po_id
LEFT JOIN users u_mod ON pch.changed_by = u_mod.id
LEFT JOIN grns grn ON po.id = grn.po_id
LEFT JOIN grn_lines grnl ON grn.id = grnl.grn_id
LEFT JOIN invoices inv ON po.id = inv.po_id
LEFT JOIN invoice_lines invl ON inv.id = invl.invoice_id
LEFT JOIN suppliers s_a ON po.supplier_id = s_a.id
CROSS JOIN suppliers s_b
WHERE po.po_number = 'PO-101'
  AND s_b.name LIKE '%Supplier B%'
LIMIT 1;
```

---

## Phase 4: 3-Way Matching Engine & Duplicate Invoice Detection

### 1. 3-Way Matching Engine (`POST /api/invoices/:id/match`, `GET /api/invoices/:id/match-result`)
- **Automated Reconciliation**: Compares Inward Invoices against Purchase Orders (authorized base price) and Goods Receipt Notes (summing multiple / partial deliveries).
- **Tolerance Engine**: Configurable tolerance (default 2% for quantity and unit price) fetched dynamically from `risk_rules_config`.
- **Golden Rule #2 Compliance**: Any `MISMATCH` or `HOLD` immediately locks the invoice to status `ON_HOLD`. The system NEVER releases or approves payment automatically.
- **Approved PO Price Enforcement**: The engine inspects `po_change_history`. If an unapproved price modification is detected (e.g., PO-101 changed from Rs 500 to Rs 700 with `approval_id = NULL`), the engine enforces the authorized base price (Rs 500.00).
- **Auto-Matching on Verification**: Verifying an invoice via `PUT /api/invoices/:id/verify` automatically executes 3-way matching.
- **Audit Logging**: Every matching execution writes an immutable block to `audit_log` with action `INVOICE_MATCHED`.

### 2. Duplicate Detection Engine (`GET /api/invoices/:id/duplicates`)
- **Normalized Invoice Number**: Removes whitespace, dashes, and underscores (e.g. `INV-101`, `INV_101`, `INV 101` all normalize to `INV101`).
- **Weighted Multi-Factor Scoring**:
  - Normalized Invoice Number match: 35%
  - Supplier ID match: 35%
  - Total Amount match (exact or within 2%): 15%
  - E-Invoice IRN match: Cryptographic proof (instant 100% / 1.0 similarity)
  - Invoice Date proximity (within 30 days): 10%
  - Line items description & quantity match: 5%
- **Threshold**: Configurable duplicate threshold (default 85% = 0.85) from `risk_rules_config`.
- **Human-in-the-Loop**: Above threshold, the invoice is flagged `POSSIBLE DUPLICATE`. The system never auto-rejects; a human decides.
- **Sample Seed Duplicate**: Includes `INV_101` resubmitted by Supplier A for Rs 59,000 on 2026-11-09 matching `INV-101` with 100% similarity.

### 3. API Commands for Testing Phase 4

```bash
# 1. Login as AP Employee
AP_TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "ap@finshield.sample", "password": "Ap@12345"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# 2. Trigger 3-Way Match on INV-101 (discrepancy detected: billed 100 kg vs 80 kg received)
curl -X POST http://localhost:5000/api/invoices/10101000-0000-0000-0000-000000000101/match \
  -H "Authorization: Bearer $AP_TOKEN"

# 3. Retrieve 3-Way Matching Result & Compared Values
curl -X GET http://localhost:5000/api/invoices/10101000-0000-0000-0000-000000000101/match-result \
  -H "Authorization: Bearer $AP_TOKEN"

# 4. Check Duplicate Detection on INV_101
curl -X GET http://localhost:5000/api/invoices/10101000-0000-0000-0000-000000000102/duplicates \
  -H "Authorization: Bearer $AP_TOKEN"
```

---

## Demo Presentation & Execution Guide

### Starting the Application

1. **Start Backend Server (`http://localhost:5000`)**:
   ```bash
   cd backend
   npm run dev
   ```

2. **Start Frontend Client (`http://localhost:5173`)**:
   ```bash
   cd frontend
   npm run dev
   ```

3. **Reset Demo State to Pristine (At any time)**:
   ```bash
   npm run reset-demo
   ```

---

## Automated Verification Suites

1. **Unit Tests (44 Unit Tests)**:
   ```bash
   npm test
   ```

2. **Integration Smoke Test Suite (20 Flows across all modules)**:
   ```bash
   npm run smoke
   ```

3. **Automated Expected-Output Demo Test (`npm run demo-test`)**:
   ```bash
   npm run demo-test
   ```
   *Resets demo data, runs the full pipeline on `INV-101`, and asserts all 10 exact expected outputs (status `ON_HOLD`, PO-101 unauthorized change, repeated overbilling, `SHARED_BANK` relationship, GSTR-2B missing ₹9,000 ITC risk, risk score `HIGH`, departmental investigations routing, maker-checker blocks, audit chain integrity, and payment gate locking).*

---

## 10-Step Demo Presentation Order

Refer to `/docs/DEMO_SCRIPT.md` for full step-by-step presentation instructions:

1. **Step 1: Role Authentication & RBAC**: Admin logs in, quick-switch bar changes context.
2. **Step 2: Invoice Upload & AI/OCR Extraction**: Upload `sample-data/invoices/INV-101.pdf` (per-field confidence scores).
3. **Step 3: Human Verification Gate**: AP Employee verifies extracted values, auto-triggering risk pipeline.
4. **Step 4: 3-Way Matching Engine**: Reconciles PO-101 (100 kg), GRN-101 (80 kg), and INV-101 (100 kg) &rarr; locked to `ON_HOLD`.
5. **Step 5: Duplicate Invoice Detection**: Normalized number matching (`INV_101` vs `INV-101`) &rarr; `POSSIBLE DUPLICATE` (100% similarity).
6. **Step 6: PO Change Monitoring & Maker-Checker**: Employee 102 unauthorized ₹500 to ₹700 alteration; self-approval blocked (HTTP 403).
7. **Step 7: GST & GSTR-2B Reconciliation**: Mod-36 checksum passes; missing in GSTR-2B &rarr; ₹9,000 ITC at risk.
8. **Step 8: Historical Overbilling Pattern**: 9 recurring ancillary surcharges (₹500, ₹700, ₹1000) flagged for Supplier A.
9. **Step 9: Supplier Relationship Graph**: Supplier A & B share bank identifier &rarr; red `SHARED_BANK` link; requires verification.
10. **Step 10: Departmental Investigations & Payment Gate**: Issues routed to Warehouse, Procurement, AP, Finance; supplementary GRN revalidates; human-only Finance payment release.
