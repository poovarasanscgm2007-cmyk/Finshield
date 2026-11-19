# FINSHIELD AI: Comprehensive 10-Step Demo Presentation Script

This document provides a guided walkthrough for evaluators and presenters demonstrating FINSHIELD AI, adhering strictly to **Section 6 (Demo Scenario)** and all **Golden Rules** in `PROJECT_SPEC.md`.

---

## Demo Credentials Summary (Sample Data)

| Role | Email | Password | Allowed Capabilities |
| :--- | :--- | :--- | :--- |
| **AP Employee** | `ap@finshield.sample` | `AP@123` | Invoice upload, verify extraction, run matching, trigger investigations. |
| **Procurement Employee** | `emp102@finshield.sample` | `Emp102@123` | View/edit POs, request price modifications (blocked from self-approval). |
| **Warehouse Employee** | `warehouse@finshield.sample` | `Warehouse@123` | View/record GRNs, resolve quantity discrepancies. |
| **Finance Manager** | `finance@finshield.sample` | `Finance@123` | Approve PO changes, approve high-risk items, final payment release. |
| **Admin** | `admin@finshield.sample` | `Admin@123` | User management, rule weights tuning, audit log verification. *(Blocked from approving payments).* |

---

## Step-by-Step 10-Step Journey

### Step 1: Login & Navigation by Role
- **Action**: Navigate to `http://localhost:5173`. Click **Demo Guide & Steps** tab or log in as **Admin User** (`admin@finshield.sample` / `Admin@123`).
- **What to Click**: Use the top Quick-Switch buttons on the **Demo Guide** page to switch between roles instantly.
- **On Screen**: Observe how sidebar navigation dynamically filters according to RBAC permissions. Note the visible **"Sample data"** banner across every view.
- **Key Takeaway**: Strict RBAC enforced on both UI routes and backend API endpoints.

---

### Step 2: Invoice Upload & AI/OCR Extraction
- **Action**: Quick-switch to **AP Employee** (`ap@finshield.sample`). Navigate to **Invoices & OCR**.
- **What to Click**: Click the **"Upload Invoice"** button. Select `sample-data/invoices/INV-101.pdf` (or observe pre-extracted `INV-101`).
- **On Screen**: The document is processed through the OCR/AI extraction pipeline. Each field (Supplier Name, GSTIN, Invoice Number, Subtotal, CGST, SGST, Line Items, Total Amount ₹59,000) displays an individual confidence score (e.g. 0.95 - 0.99).
- **Key Takeaway**: Low-confidence or unconfirmed invoices are held in `NEEDS_VERIFICATION` status. No hallucinated values.

---

### Step 3: Human Verification Gate
- **Action**: As **AP Employee**, click **"Review & Verify"** on `INV-101`.
- **What to Click**: Inspect the extracted fields against the invoice summary. Click **"Confirm & Verify Invoice"**.
- **On Screen**: Invoice status updates from `EXTRACTED` to `VERIFIED`. The system automatically triggers the full downstream risk pipeline: 3-way matching, duplicate detection, GST check, and risk score calculation.
- **Key Takeaway**: AI assists; humans verify. Every verification writes an immutable entry to the hash-chained audit log.

---

### Step 4: 3-Way Matching Engine (Quantity Mismatch Detected)
- **Action**: Navigate to **3-Way Matching** or click **"3-Way Match"** on `INV-101`.
- **What to Click**: View the reconciliation grid comparing **PO-101** (100 kg Teak Wood @ ₹500), **GRN-101** (80 kg physically received), and **INV-101** (100 kg billed).
- **On Screen**: Status is locked to **MISMATCH / ON_HOLD**.
  - Red banner highlights discrepancy: `"Invoice qty 100 exceeds received qty 80 by 20"`.
  - Payment Gate displays: **ON_HOLD - Payment release locked**.
- **Golden Rule Enforced**: AI NEVER releases payment. Discrepant invoices cannot be paid.

---

### Step 5: Duplicate Invoice Detection Engine
- **Action**: In the 3-Way Match modal, click the **"Signal Analysis"** tab or view invoice list.
- **What to Click**: Inspect duplicate signals comparing `INV-101` against `INV_101`.
- **On Screen**: The normalized invoice number algorithm identifies `INV101` with **100% similarity** (same supplier, same total ₹59,000, same date).
- **Key Takeaway**: System labels it **"POSSIBLE DUPLICATE"** for investigation priority. It is never auto-rejected without human review.

---

### Step 6: PO Change Monitoring & Maker-Checker Self-Approval Block
- **Action**: Quick-switch to **Procurement Employee** (`emp102@finshield.sample`). Navigate to **Purchase Orders**.
- **What to Click**: Click on **PO-101**. View the modification history where Employee 102 edited `unit_price` from ₹500.00 to ₹700.00.
- **Try Self-Approval**: Go to **Maker-Checker Approvals** and attempt to approve this change as Employee 102.
- **On Screen**: The action is blocked with an alert: **"Maker-checker violation: requester cannot approve their own request."** (HTTP 403).
- **Key Takeaway**: Core maker-checker guard is cryptographically logged in the audit log under `MAKER_CHECKER_VIOLATION_ATTEMPT`.

---

### Step 7: GST & GSTR-2B Tax Reconciliation
- **Action**: Quick-switch to **Finance Manager** (`finance@finshield.sample`). Navigate to **GST & ITC Risk**.
- **What to Click**: Inspect `INV-101` in the compliance table.
- **On Screen**:
  - GSTIN `27AAACT1234A1Z5` passed state and Mod-36 checksum checks.
  - Tax calculation passed (Intra-state Maharashtra: CGST 9% + SGST 9%).
  - GSTR-2B check **FAILS**: Invoice is missing from government auto-drafted GSTR-2B.
  - Exposure highlighted: **"ITC at Risk: ₹9,000.00"**.
- **Key Takeaway**: Prevents buyer from claiming ineligible ITC before the vendor files GSTR-1.

---

### Step 8: Historical Overbilling & Surcharge Detection
- **Action**: As **Finance Manager**, navigate to **Supplier Scorecards** and select **TimberCraft Woodworks (Supplier A)**.
- **What to Click**: Inspect the **Cost Integrity** metric and **Evidence Invoices**.
- **On Screen**: The system detects a systematic pattern of recurring ancillary surcharges (₹500, ₹700, ₹1000 for "Handling Surcharge", "Logistics Surcharge", "Unloading Fee") across 9 historical invoices.
- **Key Takeaway**: Catches incremental margin leakage that standard 3-way matching misses.

---

### Step 9: Supplier Relationship Graph (Verification Indicator)
- **Action**: Navigate to **Supplier Graph**.
- **What to Click**: Examine the network nodes. Click on the red connection link between **Supplier A** and **Supplier B**.
- **On Screen**:
  - Edge type: `SHARED_BANK` with masked identifier `HDFC-XXXX-3210`.
  - Prominent disclaimer: **"Relationship requires verification, not proof of fraud."**
  - An investigation is auto-created and routed to **Finance/Compliance**.
- **Try Bank Change**: Click **Supplier A** node and click **"Request Bank Detail Change"**. Notice that changes require a separate Finance Manager approval.

---

### Step 10: Departmental Investigations, Revalidation & Final Payment Gate
- **Action**: Navigate to **Investigation Center**.
- **What to Click**: View the 4 auto-routed investigations for `INV-101`:
  1. `QUANTITY_MISMATCH` &rarr; Assigned to **Warehouse**
  2. `UNAUTHORIZED_PO_CHANGE` &rarr; Assigned to **Procurement/Finance**
  3. `POSSIBLE_DUPLICATE` &rarr; Assigned to **AP/Finance**
  4. `GST_ITC_RISK` / `SHARED_BANK` &rarr; Assigned to **Finance/Compliance**
- **Supplementary Delivery Resolution**:
  - Quick-switch to **Warehouse Employee** (`warehouse@finshield.sample`).
  - Open the Quantity Mismatch investigation. Click **"Resolve Investigation"** with note: *"Supplementary delivery GRN-102 of 20 kg received and verified."*
  - Watch the pipeline re-run automatically: Quantity issue becomes **`REVALIDATED`**.
  - Notice invoice payment gate status strictly remains **`ON_HOLD`** because the remaining 3 issues are still open.
- **Final Human Approval Gate**:
  - Only when all investigations are cleared does the invoice reach **`ELIGIBLE_FOR_APPROVAL`**.
  - Final payment release is executed strictly by a **Finance Manager** button click (`POST /api/invoices/:id/approve-payment`).

---

## Resetting Demo Data
At any point during or after a demonstration:
- Click the red **"Reset Demo Data"** button on the **Demo Guide** page.
- Or run in terminal:
  ```bash
  npm run reset-demo
  ```
All database tables, approvals, investigations, and audit chains immediately return to the pristine seed state.
