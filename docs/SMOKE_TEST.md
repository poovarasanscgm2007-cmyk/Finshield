# FINSHIELD AI: Automated Smoke Test Documentation

The automated smoke test suite verifies end-to-end functionality across all completed phases (**Phase 1: Setup & Schema**, **Phase 2: Auth, RBAC, Maker-Checker & Audit Log**, **Phase 3: Invoice Extraction & Verification**, **Phase 4: 3-Way Matching Engine & Duplicate Invoice Detection**, **Phase 5: GST Checks, PO Change Monitoring, Historical Overbilling & Explainable Risk Scoring**, and **Phase 6: Investigation & Resolution Workflow, AI Copilot & Dashboard Completion**).

---

## Running the Smoke Test

Execute the smoke test from the project root or backend folder:

```bash
npm run smoke
```

The script automatically spins up an in-process instance of the Express server on an ephemeral port, runs live HTTP requests through the full middleware and routing pipeline, and outputs a structured PASS/FAIL report.

---

## Covered Verification Flows

| # | Test Name | Target Route | Validation Criteria |
| :--- | :--- | :--- | :--- |
| **1** | **Health Check** | `GET /api/health` | Returns HTTP `200 OK` with `status: "ok"` and active database pool connectivity state. |
| **2** | **Authentication (5 Roles)** | `POST /api/auth/login` | Validates credentials for `Admin`, `Finance Manager`, `AP Employee`, `Warehouse Employee`, and `Procurement Employee` (Employee 102). Issues valid 8-hour JWTs for each. |
| **3** | **RBAC Enforcement** | `GET /api/audit-log` | Warehouse Employee attempts to call a Finance/Admin-only endpoint. Verifies HTTP `403 Forbidden` response and audit logging of `ACCESS_DENIED`. |
| **4** | **Maker-Checker Block** | `POST /api/approvals/:id/approve` | Employee 102 creates a PO price change on `PO-101`, then attempts to self-approve. Verifies HTTP `403 Forbidden` with `"Maker-checker violation: requester cannot approve their own request"`. |
| **5** | **Audit Chain Verification** | `GET /api/audit-log/verify` | Recomputes SHA-256 hashes across all blocks from the Genesis block to current head. Verifies `valid: true` and unbroken hash links. |
| **6** | **Invoice Upload & Extraction** | `POST /api/invoices/upload` | Uploads `sample-data/invoices/INV-101.pdf` as AP Employee. Extracts `INV-101`, supplier GSTIN `27AAACT1234A1Z5`, line items, `subtotal: 50000`, `total: 59000`, and per-field confidence scores. |
| **7** | **3-Way Matching Engine** | `POST /api/invoices/:id/match` | Reconciles PO-101, GRN-101 (80 kg received), and INV-101 (100 kg billed). Detects quantity discrepancy `"Invoice qty 100 exceeds received qty 80 by 20"`, unapproved PO price modification, sets invoice to `ON_HOLD`, and writes audit log. |
| **8** | **Duplicate Detection Engine** | `GET /api/invoices/:id/duplicates` | Evaluates seed duplicate invoice `INV_101` vs `INV-101`. Detects identical normalized invoice number (`INV101`), identical supplier, identical total (Rs 59,000), flags `is_possible_duplicate: true` (100% similarity). Never auto-rejects. |
| **9** | **Auto-Run Full Pipeline on Verify** | `PUT /api/invoices/:id/verify` | Confirms human verification by AP Employee automatically triggers full pipeline: 3-way match, duplicate detection, GST/ITC check, PO change check, and explainable risk calculation. |
| **10** | **GST & GSTR-2B Reconciliation** | `GET /api/invoices/:id/gst-check` | Validates 15-character GSTIN checksum via official Mod-36 Luhn algorithm, intra-state vs inter-state tax, and flags missing invoice in GSTR-2B with exact Rs 9,000 ITC at risk. |
| **11** | **PO Change Monitoring** | `GET /api/purchase-orders/:id/changes` | Inspects PO change history and approvals. Flags PO-101 modification from Rs 500 to Rs 700 without approval as `UNAUTHORIZED PO CHANGE` (approval status: `NOT_FOUND`). |
| **12** | **Historical Overbilling Engine** | `GET /api/suppliers/:id/overbilling` | Analyzes historical invoices for Supplier A. Detects repeated ancillary extra charges (Rs 500, Rs 700, Rs 1000) across 9 past invoices exceeding configured frequency threshold. |
| **13** | **Explainable Risk Score Engine** | `GET /api/invoices/:id/risk` | Computes deterministic 0-100 score with granular reasons and evidence citations. Flags Section 6 demo invoice INV-101 as `HIGH` (score: 100) and priority `HIGH` (never "fraud verdict"). |
| **14** | **Admin Risk Rules Configuration** | `GET & PUT /api/risk/config` | Admin lists configurable risk rules and updates weight/threshold with validation and hash-chained audit logging. |
| **15** | **Investigation Auto-Creation & Department Routing** | `GET /api/investigations` | Pipeline flags auto-generate distinct investigation records without duplicates, routed according to rule: Quantity -> Warehouse, PO Price -> Procurement/Finance, Overbilling -> AP/Finance, GST/ITC -> Finance/Compliance. |
| **16** | **Departmental RBAC Enforcement** | `PUT /api/investigations/:id/status` | Verifies that a Warehouse Employee cannot update or resolve an investigation assigned to Finance/Compliance, returning HTTP `403 Forbidden`. |
| **17** | **Supplementary Delivery & Pipeline Revalidation** | `POST /api/grns` & `PUT /api/investigations/:id/status` | Warehouse logs supplementary delivery GRN-102 (20 kg) and marks quantity issue `RESOLVED`. Revalidation pipeline re-runs, confirms quantity gap is cleared (`REVALIDATED`), while invoice remains safely `ON_HOLD` for other issues. |
| **18** | **AI Copilot Grounded Query** | `POST /api/copilot/ask` | Queries Copilot with `"Why is Supplier A's invoice flagged?"`. Copilot fetches factual database records and answers citing the 20 kg gap, PO price alteration, extra charges, and ITC risk with exact evidence and departmental action items. |
| **19** | **Dashboard Executive Metrics & Visualizations** | `GET /api/dashboard/stats` | Aggregates 7 executive KPI cards, status distributions, risk tier breakdown, department assignment workload, and recent alerts for Recharts and dashboard rendering. |
| **20** | **Payment Approval Gate Enforcement** | `POST /api/invoices/:id/approve-payment` | Confirms payment cannot be released while any investigation remains unresolved (HTTP `400`). Enforces human-only approval, maker-checker restrictions, and multi-level Finance sign-off. |

---

## Latest Test Execution Output

```
===============================================================
 FINSHIELD AI: Comprehensive Automated Smoke Test Suite
 Testing Key Flows Across Phases 1, 2, 3, 4, 5, and 6
===============================================================

1. Checking GET /api/health ... PASS
2. Checking Login for all 5 roles ... PASS (5/5 authenticated)
3. Checking 403 Forbidden on unauthorized route ... PASS (HTTP 403 received with clear message)
4. Checking Maker-Checker Self-Approval Block ... PASS (Maker-checker violation blocked with 403)
5. Checking Audit Chain Cryptographic Verification ... PASS (9 sequential SHA-256 blocks verified intact)
6. Checking Invoice Upload (INV-101.pdf) & Extraction ... PASS (Extracted INV-101, Total: Rs 59000, Source: FALLBACK)
7. Checking 3-Way Matching Engine on INV-101 ... PASS (Status: MISMATCH, Reasons: 2, Locked to ON_HOLD)
8. Checking Duplicate Invoice Detection Engine on INV_101 ... PASS (Similarity: 100%, Matched: INV-101)
9. Checking Auto-Run Full Pipeline on Invoice Verification ... PASS (Auto-pipeline complete: Match=MISMATCH, Risk=100)
10. Checking GST & GSTR-2B ITC-at-Risk Checks ... PASS (Detected Missing GSTR-2B, ITC at risk: Rs 9000)
11. Checking PO Change Monitoring ... PASS (Flagged unapproved price change from 500.00 to 700.00)
12. Checking Historical Overbilling Pattern Detection ... PASS (Detected 9 repeated surcharges of Rs 500, 700, 1000)
13. Checking Explainable Risk Score & Investigation Priority ... PASS (Score: 100/100, Priority: HIGH, 5 explainable reasons)
14. Checking Admin Risk Rule Configuration ... PASS (Admin successfully viewed and tuned rule weights)
15. Checking Investigation Auto-Creation & Department Routing ... PASS (Auto-created 4 investigations routed to Warehouse, Procurement, AP, Finance)
16. Checking Departmental RBAC Enforcement on Investigations ... PASS (Warehouse employee blocked from updating Finance investigation with 403)
17. Checking Supplementary Delivery & Pipeline Revalidation ... PASS (Quantity cleared, status set to REVALIDATED, invoice remains ON_HOLD for other issues)
18. Checking AI Copilot Grounded Query ... PASS (Copilot cited 20 kg gap, PO price alteration, extra charges, and ITC risk with exact evidence)
19. Checking Dashboard Executive Metrics & Chart Data ... PASS (Aggregated 7 KPI cards, 3 Recharts distributions, and recent alerts)
20. Checking Payment Approval Gate & Maker-Checker ... PASS (Premature payment blocked: all investigations must be REVALIDATED before release)

===============================================================
 FINSHIELD AI: SMOKE TEST SUMMARY REPORT
===============================================================
✓ PASS   | Health Check (GET /api/health)
         Details: Status: 200, DB: connected (In-Memory Prototype Vault)
✓ PASS   | Authentication for 5 Roles (POST /api/auth/login)
         Details: All 5 roles authenticated with 8h JWTs
✓ PASS   | RBAC Enforcement (403 on Restricted Route)
         Details: Forbidden: Insufficient role permissions. Required one of: [Admin, Finance Manager]. Current role: Warehouse Employee
✓ PASS   | Maker-Checker Self-Approval Block (POST /api/approvals/:id/approve)
         Details: Maker-checker violation: requester cannot approve their own request.
✓ PASS   | Cryptographic Audit Chain Verification (GET /api/audit-log/verify)
         Details: Verified intact across 9 entries
✓ PASS   | Invoice Upload & Extraction (POST /api/invoices/upload)
         Details: Invoice: INV-101, Total: Rs 59000, Status: EXTRACTED, Source: FALLBACK
✓ PASS   | 3-Way Matching Engine (POST /api/invoices/:id/match)
         Details: Status: MISMATCH, Detected Qty 100 vs 80 received, Reverted to approved price Rs 500, Invoice set to ON_HOLD
✓ PASS   | Duplicate Detection Engine (GET /api/invoices/:id/duplicates)
         Details: Flagged POSSIBLE DUPLICATE (100% similarity) vs INV-101
✓ PASS   | Auto-Triggered Pipeline on Verification (PUT /api/invoices/:id/verify)
         Details: Invoice verified, auto-matched (MISMATCH), GST evaluated, risk calculated: 100 (HIGH)
✓ PASS   | GST & GSTR-2B Reconciliation (GET /api/invoices/:id/gst-check)
         Details: Verified GSTIN & GSTR-2B check. Planted missing invoice triggers exact Rs 9,000 ITC at risk.
✓ PASS   | PO Change Monitoring (GET /api/purchase-orders/:id/changes)
         Details: Detected unauthorized modification to PO-101: unit_price changed from Rs 500.00 to Rs 700.00. Approval: NOT_FOUND
✓ PASS   | Historical Overbilling Engine (GET /api/suppliers/:id/overbilling)
         Details: TimberCraft Woodworks (Supplier A) (Sample Data): repeated ancillary extra charges of Rs 500, Rs 700, Rs 1000 across 9 historical invoices
✓ PASS   | Explainable Risk Engine (GET /api/invoices/:id/risk)
         Details: Score 100/100 (HIGH priority). Reasons: QTY_MISMATCH, DUPLICATE_INVOICE, GST_ITC_RISK, PO_UNAPPROVED_CHANGE, HISTORICAL_OVERBILLING
✓ PASS   | Risk Rules Configuration (GET & PUT /api/risk/config)
         Details: Admin retrieved 8 configurable rules and successfully updated QTY_MISMATCH weight to 32
✓ PASS   | Investigation Auto-Creation & Department Routing (GET /api/investigations)
         Details: 4 investigations created with departments: Warehouse (HIGH), Procurement/Finance (HIGH), AP/Finance (MEDIUM), Finance/Compliance (HIGH)
✓ PASS   | Departmental RBAC Enforcement (403 on Cross-Department Update)
         Details: Forbidden: Users with role 'Warehouse Employee' cannot update investigations assigned to 'Finance/Compliance'.
✓ PASS   | Supplementary Delivery & Pipeline Revalidation (POST /api/grns)
         Details: GRN-102 added (20 kg), QUANTITY_MISMATCH revalidated successfully. Remaining open issues keep invoice ON_HOLD.
✓ PASS   | AI Copilot Grounded Query (POST /api/copilot/ask)
         Details: Answer grounded in database facts: 4 evidence references cited (GRN, PO_CHANGE, OVERBILLING, GSTR2B). Recommended actions returned for Warehouse, Procurement, and Finance.
✓ PASS   | Dashboard Executive Metrics (GET /api/dashboard/stats)
         Details: KPIs: 12 invoices, 4 pending investigations, Rs 18000 ITC at risk. Recharts visual models ready.
✓ PASS   | Payment Approval Gate Enforcement (POST /api/invoices/:id/approve-payment)
         Details: Blocked premature release (HTTP 400): Cannot approve payment: Invoice has 4 unresolved or un-revalidated investigation(s). All investigations must be REVALIDATED before payment release.
===============================================================
OVERALL: ALL 20 KEY FLOWS PASSED (100% SUCCESS)
```
