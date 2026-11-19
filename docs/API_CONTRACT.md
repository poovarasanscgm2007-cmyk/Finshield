# FINSHIELD AI: API Contract & Data Schema Specification

**Version:** 1.0.0  
**Last Updated:** November 19, 2026  
**Status:** Approved & Implemented  

This document defines the formal API Contract between the FINSHIELD AI backend and frontend clients. All endpoints adhere to standard HTTP status codes, consistent data envelope formats, and explicit type contracts to prevent runtime deserialization and property access errors.

---

## 1. Global Conventions & Protocols

### 1.1 Base URL & Transport
- **Base URL:** `/api` (Backend default: `http://localhost:5000/api`)
- **Transport:** HTTP/1.1 with TLS in production.
- **Content Type:** All JSON requests and responses use `application/json; charset=utf-8`. File uploads use `multipart/form-data`.

### 1.2 Authentication & Authorization
- **Header:** `Authorization: Bearer <JWT>`
- **Token Format:** Signed JSON Web Token containing `{ id, name, email, role }` with 8-hour expiry.
- **Roles:**
  - `AP_EMPLOYEE`: Invoice upload, manual verification, match inspection.
  - `PROCUREMENT_EMPLOYEE`: PO modification requests (maker), vendor inquiries.
  - `WAREHOUSE_EMPLOYEE`: GRN creation, quantity dispute resolution.
  - `FINANCE_MANAGER`: Payment approvals (checker), bank change approvals, investigation sign-off.
  - `ADMIN`: Configuration, user management, audit log verification, demo reset.

### 1.3 Standard Error Format
When an endpoint encounters an error, it returns a standard error body:
```json
{
  "status": "error",
  "statusCode": 400,
  "message": "Human-readable description of the error",
  "details": null
}
```

### 1.4 Standard HTTP Status Codes
- `200 OK`: Request succeeded.
- `201 Created`: Resource successfully created.
- `400 Bad Request`: Validation failure, missing fields, or malformed payload.
- `401 Unauthorized`: Missing or invalid JWT token.
- `403 Forbidden`: User role does not have permission for the requested action.
- `404 Not Found`: Target entity does not exist.
- `409 Conflict`: Business rule violation (e.g. duplicate entity or maker-checker collision).
- `500 Internal Server Error`: Server exception.

---

## 2. Authentication Endpoints (`/api/auth`)

### `POST /api/auth/login`
Authenticate user with email and password.
- **Request Body:**
  ```json
  {
    "email": "finance@finshield.local",
    "password": "Password123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "message": "Authentication successful",
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "id": "USR-FIN-01",
      "name": "Priya Sharma",
      "email": "finance@finshield.local",
      "role": "FINANCE_MANAGER"
    }
  }
  ```

### `GET /api/auth/me`
Retrieve profile of currently authenticated user.
- **Headers:** `Authorization: Bearer <JWT>`
- **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "user": {
      "id": "USR-FIN-01",
      "name": "Priya Sharma",
      "email": "finance@finshield.local",
      "role": "FINANCE_MANAGER"
    }
  }
  ```

---

## 3. Invoice Endpoints (`/api/invoices`)

### `GET /api/invoices`
List invoices with optional filters.
- **Query Params:**
  - `status` (string, optional): `EXTRACTED`, `PENDING_MATCH`, `MATCHED`, `FLAGGED`, `APPROVED`, `REJECTED`
  - `supplier_id` (string, optional)
  - `risk_level` (string, optional): `LOW`, `MEDIUM`, `HIGH`
  - `search` (string, optional)
- **Response (200 OK):**
  ```json
  [
    {
      "id": "INV-101",
      "supplier_id": "SUP-001",
      "supplier_name": "Apex Industrial Supplies",
      "po_id": "PO-101",
      "invoice_number": "INV/2026/001",
      "invoice_date": "2026-11-01T00:00:00.000Z",
      "due_date": "2026-11-30T00:00:00.000Z",
      "subtotal": 700000.0,
      "tax_amount": 126000.0,
      "total_amount": 826000.0,
      "status": "FLAGGED",
      "risk_score": 75,
      "risk_level": "HIGH",
      "payment_status": "LOCKED",
      "extraction_confidence": 0.98,
      "line_items": [
        {
          "line_number": 1,
          "item_name": "Industrial Bearing Assembly",
          "hsn_code": "8482",
          "quantity": 1000,
          "unit_price": 700.0,
          "total_price": 700000.0
        }
      ]
    }
  ]
  ```

### `GET /api/invoices/:id`
Retrieve invoice details by ID.
- **Response (200 OK):** Returns single invoice object as above.
- **Response (404 Not Found):**
  ```json
  {
    "status": "error",
    "statusCode": 404,
    "message": "Invoice INV-999 not found"
  }
  ```

### `POST /api/invoices/upload`
Upload invoice PDF or scanned image for OCR extraction.
- **Content-Type:** `multipart/form-data`
- **Form Fields:** `file` (binary PDF/PNG/JPG)
- **Response (201 Created):**
  ```json
  {
    "status": "ok",
    "message": "Invoice extracted successfully",
    "invoice": {
      "id": "INV-109",
      "invoice_number": "INV/2026/009",
      "extraction_confidence": 0.95,
      "status": "EXTRACTED",
      "line_items": []
    }
  }
  ```

### `POST /api/invoices/:id/verify`
Submit user review/corrections on OCR extraction data.
- **Request Body:**
  ```json
  {
    "invoice_number": "INV/2026/001",
    "supplier_id": "SUP-001",
    "po_id": "PO-101",
    "invoice_date": "2026-11-01",
    "subtotal": 700000.0,
    "tax_amount": 126000.0,
    "total_amount": 826000.0,
    "line_items": [...]
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "message": "Invoice verified and queued for 3-way matching",
    "invoice_id": "INV-101"
  }
  ```

### `GET /api/invoices/:id/matching`
Inspect 3-way matching breakdown against PO and GRN.
- **Response (200 OK):**
  ```json
  {
    "invoice_id": "INV-101",
    "po_id": "PO-101",
    "grn_id": "GRN-101",
    "status": "FLAGGED",
    "quantity_match": false,
    "price_match": false,
    "tax_match": true,
    "discrepancies": [
      {
        "type": "QUANTITY_MISMATCH",
        "item_name": "Industrial Bearing Assembly",
        "invoice_qty": 1000,
        "grn_qty": 980,
        "variance": -20,
        "variance_pct": -2.0,
        "reason": "GRN-101 received quantity (980) differs from invoiced quantity (1000)"
      },
      {
        "type": "PRICE_MISMATCH",
        "item_name": "Industrial Bearing Assembly",
        "invoice_unit_price": 700.0,
        "po_unit_price": 500.0,
        "variance": 200.0,
        "variance_pct": 40.0,
        "reason": "Invoiced unit price (700.00) exceeds PO unit price (500.00) by 40.0%"
      }
    ],
    "po_summary": {
      "po_number": "PO-101",
      "original_amount": 500000.0,
      "current_amount": 700000.0,
      "unapproved_changes": true
    },
    "grn_summary": {
      "grn_number": "GRN-101",
      "received_date": "2026-11-02",
      "received_by": "Warehouse Officer"
    }
  }
  ```

### `GET /api/invoices/:id/gst-check`
Retrieve GST compliance and GSTR-2B reconciliation report.
- **Response (200 OK):**
  ```json
  {
    "invoice_id": "INV-101",
    "supplier_gstin": "27AABCA1234F1Z8",
    "gstin_validation": {
      "valid": true,
      "state_code": "27",
      "pan": "AABCA1234F",
      "checksum_valid": true,
      "message": "Valid GSTIN format and checksum"
    },
    "tax_calculation": {
      "valid": true,
      "supplier_state": "27",
      "pos_state": "27",
      "expected_tax_type": "CGST_SGST",
      "applied_tax_type": "CGST_SGST",
      "rate_pct": 18.0,
      "calculated_tax": 126000.0,
      "invoiced_tax": 126000.0,
      "variance": 0.0
    },
    "gstr2b_match": {
      "matched": false,
      "gstr2b_record_found": false,
      "itc_at_risk": 126000.0,
      "reason": "Invoice INV/2026/001 not found in supplier GSTR-2B filing records"
    },
    "filing_status": {
      "status": "NON_FILED",
      "flagged": true,
      "reason": "Supplier has not filed GSTR-1 for the corresponding period"
    }
  }
  ```

### `GET /api/invoices/:id/risk`
Retrieve explainable risk scoring breakdown for invoice.
- **Response (200 OK):**
  ```json
  {
    "invoice_id": "INV-101",
    "score": 75,
    "level": "HIGH",
    "priority": "HIGH",
    "factors": [
      {
        "category": "3_WAY_MATCH",
        "description": "Quantity and unit price mismatch between invoice, PO, and GRN",
        "points": 35,
        "max_points": 40
      },
      {
        "category": "GST_COMPLIANCE",
        "description": "Invoice missing in GSTR-2B; ITC ₹1,26,000 at risk",
        "points": 25,
        "max_points": 30
      },
      {
        "category": "PO_MODIFICATION",
        "description": "Unauthorized PO price increase from ₹500 to ₹700",
        "points": 15,
        "max_points": 20
      }
    ]
  }
  ```

### `POST /api/invoices/:id/approve`
Release payment approval for invoice (Finance Manager only).
- **Headers:** `Authorization: Bearer <FinanceManagerJWT>`
- **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "message": "Invoice INV-101 payment approved successfully",
    "invoice_status": "APPROVED",
    "approval_id": "APP-201"
  }
  ```
- **Response (403 Forbidden):**
  ```json
  {
    "status": "error",
    "statusCode": 403,
    "message": "Payment locked: unresolved investigations exist for this invoice"
  }
  ```

---

## 4. Purchase Order Endpoints (`/api/purchase-orders`)

### `GET /api/purchase-orders`
List purchase orders.
- **Response (200 OK):** Array of purchase order objects with line items.

### `GET /api/purchase-orders/:id`
Retrieve PO details and line items.

### `GET /api/purchase-orders/:id/changes`
Get PO change history and maker-checker approval state.
- **Response (200 OK):**
  ```json
  {
    "po_id": "PO-101",
    "has_unapproved_changes": true,
    "changes": [
      {
        "id": "POC-01",
        "po_id": "PO-101",
        "item_name": "Industrial Bearing Assembly",
        "field_changed": "unit_price",
        "old_value": "500.00",
        "new_value": "700.00",
        "changed_by": "USR-PROC-02",
        "changed_by_name": "Rohan Verma",
        "changed_at": "2026-11-01T10:00:00.000Z",
        "approval_status": "PENDING",
        "approval_id": "APP-051"
      }
    ]
  }
  ```

### `PUT /api/purchase-orders/:id/price`
Request a PO line item unit price change (Procurement maker).
- **Request Body:**
  ```json
  {
    "item_name": "Industrial Bearing Assembly",
    "new_unit_price": 650.0,
    "reason": "Manufacturer raw material price increase"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "message": "Price change request submitted for Finance Manager approval",
    "approval_id": "APP-052"
  }
  ```

---

## 5. Goods Receipt Note Endpoints (`/api/grns`)

### `GET /api/grns`
List all goods receipt notes.

### `GET /api/grns/:id`
Retrieve specific GRN and inspection items.

### `POST /api/grns`
Create a new GRN (Warehouse Employee).
- **Request Body:**
  ```json
  {
    "po_id": "PO-101",
    "grn_number": "GRN-101-CORRECTED",
    "received_date": "2026-11-05",
    "items": [
      {
        "item_name": "Industrial Bearing Assembly",
        "quantity_received": 1000,
        "quantity_accepted": 1000,
        "quantity_rejected": 0
      }
    ]
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "status": "ok",
    "message": "GRN created successfully",
    "grn_id": "GRN-102"
  }
  ```

---

## 6. Supplier Endpoints (`/api/suppliers`)

### `GET /api/suppliers`
List suppliers.

### `GET /api/suppliers/:id`
Retrieve supplier profile.

### `GET /api/suppliers/graph`
Retrieve vendor relationship graph (shared bank accounts, phones, PANs).
- **Response (200 OK):**
  ```json
  {
    "nodes": [
      {
        "id": "SUP-001",
        "name": "Apex Industrial Supplies",
        "gstin": "27AABCA1234F1Z8",
        "risk_level": "HIGH"
      },
      {
        "id": "SUP-002",
        "name": "Zenith Technical Solutions",
        "gstin": "27AABCA1234F1Z8",
        "risk_level": "HIGH"
      }
    ],
    "links": [
      {
        "source": "SUP-001",
        "target": "SUP-002",
        "type": "SHARED_BANK",
        "shared_value": "XXXX1234",
        "reason": "Relationship requires verification: Suppliers share identical bank account identifier"
      }
    ]
  }
  ```

### `GET /api/suppliers/:id/scorecard`
Retrieve vendor performance scorecard and grading.
- **Response (200 OK):**
  ```json
  {
    "supplier_id": "SUP-001",
    "supplier_name": "Apex Industrial Supplies",
    "overall_score": 58,
    "grade": "D",
    "metrics": [
      {
        "name": "Invoice Accuracy",
        "score": 60,
        "weight": 0.25,
        "formula": "(Matched Invoices / Total Invoices) * 100",
        "details": "3 matched out of 5 submitted invoices"
      },
      {
        "name": "Delivery Consistency",
        "score": 75,
        "weight": 0.25,
        "formula": "(Accepted GRN Quantity / PO Quantity) * 100",
        "details": "Quantity variances detected on 2 shipments"
      },
      {
        "name": "Discrepancy Frequency",
        "score": 40,
        "weight": 0.20,
        "formula": "100 - (Discrepancy Invoices / Total Invoices * 100)",
        "details": "High frequency of price and extra charge additions"
      },
      {
        "name": "Issue Resolution Time",
        "score": 55,
        "weight": 0.15,
        "formula": "Average turnaround time for dispute closure",
        "details": "Average resolution time: 8.4 business days"
      },
      {
        "name": "GST Filing Compliance",
        "score": 50,
        "weight": 0.15,
        "formula": "GSTR-1 on-time filing compliance rate",
        "details": "Supplier flagged for non-filing in current tax cycle"
      }
    ],
    "evidence_invoices": [
      {
        "invoice_id": "INV-101",
        "invoice_number": "INV/2026/001",
        "amount": 826000.0,
        "status": "FLAGGED",
        "issue": "Quantity mismatch (-20) and unapproved price hike"
      }
    ]
  }
  ```

### `GET /api/suppliers/:id/overbilling`
Retrieve historical pattern analysis of extra charges and price creeps.
- **Response (200 OK):**
  ```json
  {
    "supplier_id": "SUP-001",
    "pattern_detected": true,
    "repeat_extra_charge_count": 9,
    "total_extra_billed": 27500.0,
    "price_jump_detected": true,
    "max_price_jump_pct": 40.0,
    "evidence": [
      {
        "invoice_number": "INV/2026/001",
        "extra_charge_name": "Freight & Handling Surcharge",
        "extra_charge_amount": 2500.0,
        "amount": 2500.0,
        "total": 826000.0,
        "date": "2026-11-01"
      }
    ]
  }
  ```

### `PUT /api/suppliers/:id/bank`
Propose a change to supplier bank account (Requires Maker-Checker approval).
- **Request Body:**
  ```json
  {
    "bank_name": "HDFC Bank",
    "bank_identifier": "HDFC0001234-9876543210",
    "account_holder": "Apex Industrial Supplies Private Limited",
    "reason": "Corporate account migration"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "message": "Bank identifier modification request submitted for Finance Manager approval",
    "approval_id": "APP-088"
  }
  ```

---

## 7. Investigation Center Endpoints (`/api/investigations`)

### `GET /api/investigations`
List investigations with optional filters.
- **Query Params:**
  - `status`: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `REVALIDATED`, `REOPENED`
  - `department`: `Warehouse`, `Procurement`, `Finance`, `AP`
  - `assignee_id`: string
  - `invoice_id`: string
- **Response (200 OK):**
  ```json
  [
    {
      "id": "INV-REC-01",
      "issue_type": "QUANTITY_MISMATCH",
      "severity": "HIGH",
      "invoice_id": "INV-101",
      "supplier_id": "SUP-001",
      "department": "Warehouse",
      "assignee_id": "USR-WAR-01",
      "assignee_name": "Kavita Rao",
      "status": "OPEN",
      "created_at": "2026-11-02T10:15:00.000Z",
      "evidence": {
        "invoice_qty": 1000,
        "grn_qty": 980,
        "variance": -20
      },
      "comments": []
    }
  ]
  ```

### `GET /api/investigations/:id`
Retrieve detailed investigation with comments and evidence attachments.

### `PUT /api/investigations/:id/status`
Update investigation lifecycle status with required audit note.
- **Request Body:**
  ```json
  {
    "status": "RESOLVED",
    "comment": "Warehouse supervisor verified physical goods received: shipment shortfall confirmed and credit note requested from supplier."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "message": "Investigation updated and pipeline revalidation triggered",
    "revalidation_outcome": "REVALIDATED"
  }
  ```

### `POST /api/investigations/:id/comments`
Add progress comment to investigation.
- **Request Body:**
  ```json
  {
    "comment": "Contacted vendor accounts team regarding billing adjustment."
  }
  ```

### `POST /api/investigations/:id/evidence`
Attach supporting document or note to investigation record.
- **Request Body:**
  ```json
  {
    "title": "Credit Note CN-2026-88",
    "evidence_type": "DOCUMENT_LINK",
    "data": {
      "reference": "CN-2026-88",
      "amount": 14000.0
    }
  }
  ```

---

## 8. Approvals & Maker-Checker Endpoints (`/api/approvals`)

### `GET /api/approvals`
List pending and historical approval requests.
- **Query Params:**
  - `status`: `PENDING`, `APPROVED`, `REJECTED`
  - `entity_type`: `PO_PRICE_CHANGE`, `SUPPLIER_BANK_CHANGE`, `INVOICE_PAYMENT`
- **Response (200 OK):** Array of approval records.

### `POST /api/approvals/:id/decide`
Approve or reject a pending request (Finance Manager only; Maker cannot approve own request).
- **Request Body:**
  ```json
  {
    "decision": "APPROVED",
    "comment": "Verified bank statement provided by vendor finance director."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "message": "Approval request APP-088 approved",
    "approval_status": "APPROVED"
  }
  ```

---

## 9. Explainable Risk Configuration Endpoints (`/api/risk`)

### `GET /api/risk/rules`
Get active configurable risk rules and scoring weights.
- **Response (200 OK):**
  ```json
  [
    {
      "id": "RULE-01",
      "name": "3-Way Match Quantity Variance",
      "category": "3_WAY_MATCH",
      "weight": 25,
      "threshold_pct": 0.0,
      "enabled": true
    },
    {
      "id": "RULE-02",
      "name": "GSTR-2B Missing ITC Risk",
      "category": "GST_COMPLIANCE",
      "weight": 30,
      "threshold_amount": 10000.0,
      "enabled": true
    }
  ]
  ```

### `PUT /api/risk/rules/:id`
Update risk rule parameters (Admin only).
- **Request Body:**
  ```json
  {
    "weight": 35,
    "threshold_pct": 1.5,
    "enabled": true
  }
  ```

---

## 10. Audit Log Endpoints (`/api/audit-log`)

### `GET /api/audit-log`
List cryptographic audit log entries.
- **Query Params:**
  - `action`: string
  - `entity_type`: string
  - `user_id`: string
  - `limit`: number (default 50)
  - `offset`: number (default 0)
- **Response (200 OK):** Array of audit log records including `previous_hash` and `current_hash`.

### `GET /api/audit-log/verify`
Verify cryptographic SHA-256 hash chain integrity from genesis record to head.
- **Response (200 OK):**
  ```json
  {
    "valid": true,
    "total_records": 128,
    "chain_head_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "message": "Audit trail integrity verified: all cryptographic hashes unbroken"
  }
  ```

---

## 11. AI Copilot Endpoints (`/api/copilot`)

### `POST /api/copilot/chat`
Ask natural language questions about invoices, suppliers, compliance, and PO history. Returns strictly grounded database facts with citations.
- **Request Body:**
  ```json
  {
    "message": "Why is invoice INV-101 flagged?",
    "conversation_id": "conv-101"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "reply": "Invoice INV-101 is flagged due to three high-severity discrepancies:\n1. 3-Way Match Quantity Variance: Invoiced for 1,000 units, but GRN-101 records receipt of only 980 units (-20 units variance).\n2. Unapproved PO Price Increase: Unit price is ₹700 versus approved PO-101 price of ₹500.\n3. GST Compliance: The invoice is missing in supplier GSTR-2B filing, placing ₹1,26,000 ITC at risk.",
    "citations": [
      { "type": "INVOICE", "id": "INV-101" },
      { "type": "GRN", "id": "GRN-101" },
      { "type": "PO", "id": "PO-101" },
      { "type": "GST", "id": "GSTR2B-101" }
    ]
  }
  ```

---

## 12. Dashboard Endpoints (`/api/dashboard`)

### `GET /api/dashboard/stats`
Retrieve aggregated AP risk, compliance, and investigation metrics.
- **Response (200 OK):**
  ```json
  {
    "total_invoices": 18,
    "pending_match": 2,
    "matched": 9,
    "flagged": 5,
    "approved": 2,
    "itc_at_risk_total": 248000.0,
    "open_investigations": 6,
    "pending_approvals": 4,
    "high_risk_invoices": 4
  }
  ```

---

## 13. Summary of Frontend Alignment & Type Safety
1. **Numeric Serialization:** All backend `numeric` / `decimal` columns from PostgreSQL are parsed safely to floating point values or explicitly converted via `Number()` / `safeNumber()` before arithmetic or `.toFixed()` formatting.
2. **JSONB Parsing:** All PostgreSQL `jsonb` fields (`evidence`, `payload`, `line_items`) are safely handled by `safeJsonParse()` on both stringified JSON and pre-parsed objects.
3. **Array Fallbacks:** All array iteration (`.map`, `.filter`, `.reduce`) is protected via `safeArray()` to prevent `TypeError: undefined is not a function`.
4. **Invalid Dates:** Date formatting guards against `Invalid Date` / `NaN` with `isNaN(date.getTime())` before invoking date formatters.
5. **No Blank Screens:** Every UI tab and modal is protected by the top-level and per-view React `ErrorBoundary`.
