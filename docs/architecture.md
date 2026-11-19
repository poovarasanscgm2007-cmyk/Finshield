# FINSHIELD AI: System Architecture & Integration Model

FINSHIELD AI is engineered as an **Accounts Payable (AP) Risk & GST Compliance layer** that complements existing Enterprise Resource Planning (ERP) installations (such as SAP S/4HANA, TallyPrime, Oracle NetSuite, and Microsoft Dynamics). It does not replace the ERP; rather, it intercepts financial risk and GST losses *before* payments are disbursed.

Tagline: *"Beyond Invoice Matching: Catch Financial Risk and GST Loss Before You Pay."*

---

## 1. High-Level Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                  USER INTERFACE                                   |
|   React 18 + Vite + TypeScript + TailwindCSS + Recharts + react-force-graph-2d    |
|   (Role-Based Views: AP Specialist, Procurement, Warehouse, Finance, Admin)       |
+----------------------------------------+------------------------------------------+
                                         | REST / HTTPS (JWT Auth)
                                         v
+-----------------------------------------------------------------------------------+
|                               FINSHIELD API GATEWAY                               |
|   Node.js + Express + TypeScript Router & Role-Based Access Control (RBAC)        |
+----------------------------------------+------------------------------------------+
                                         |
     +-----------------------------------+-----------------------------------+
     |                                   |                                   |
     v                                   v                                   v
+-----------------------+   +-----------------------+   +---------------------------+
| INGESTION & OCR ENGINE|   | 3-WAY MATCHING ENGINE |   | GST COMPLIANCE ENGINE     |
| - PDF-Parse (Direct)  |   | - Multi-GRN Aggregator|   | - 15-char Mod-36 Luhn     |
| - Tesseract OCR       |   | - Configurable Toler. |   | - Inter vs Intra Tax Math |
| - Gemini LLM Struct.  |   | - Approved Price Gate |   | - GSTR-2B vs AP Register  |
+-----------------------+   +-----------------------+   +---------------------------+
     |                                   |                                   |
     +-----------------------------------+-----------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        FINSHIELD GUARD & CORE PLATFORM SERVICES                   |
|  - Cryptographic Hash-Chained Audit Log (SHA-256 blocks with genesis link)        |
|  - Maker-Checker Separation of Duties (Anti-Self-Approval enforcement)            |
|  - Explainable Risk Engine (Configurable weights: 0-100 investigation priority)   |
|  - Supplier Relationship Graph (Bank, address, phone, PAN relational links)       |
|  - Departmental Investigation Center (Auto-routing & revalidation pipeline)      |
|  - Fact-Grounded AI Copilot (Evidence citations strictly backed by DB facts)     |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                               DATA PERSISTENCE TIER                               |
|  - Primary: PostgreSQL 16 Relational Vault (Migrations 001 - 007)                 |
|  - Fallback / Demo: Zero-Dependency In-Memory Database Engine                     |
+-----------------------------------------------------------------------------------+
```

---

## 2. ERP Adapter Pattern (Design & Extensibility)

FINSHIELD AI implements an **Adapter Pattern** to ingest Purchase Orders, Goods Receipt Notes, and vendor master data from diverse enterprise accounting systems without coupling core risk algorithms to vendor-specific schemas.

### Architecture Contract: `IErpAdapter`

```typescript
export interface IErpAdapter {
  name: string;
  fetchPurchaseOrders(since: Date): Promise<CanonicalPurchaseOrder[]>;
  fetchGoodsReceiptNotes(poId: string): Promise<CanonicalGrn[]>;
  fetchSuppliers(): Promise<CanonicalSupplier[]>;
  postPaymentHold(invoiceId: string, reason: string): Promise<boolean>;
  releasePaymentHold(invoiceId: string, approvalToken: string): Promise<boolean>;
}
```

### Supported & Extensible Implementations:

1. **CSV / Flat File Adapter (Current Active Default)**:
   - Ingests batch exports from legacy ERPs, spreadsheets, or scheduled SFTP drops.
   - Provides automated header normalization and schema validation.
   - Used for standalone deployments, audits, and prototype demonstrations.

2. **REST / OData Connectors (Planned Enterprise Adapters)**:
   - **SAP S/4HANA Adapter**:
     - Connects via SAP OData APIs (`API_PURCHASEORDER_PROCESS_SRV`, `API_MATERIAL_DOCUMENT_SRV`).
     - Directly checks PO release strategy (`EKKO-FRGKE`) and pushes payment blocking reason (`BSEG-ZLSPR`).
   - **TallyPrime Adapter**:
     - Connects via Tally XML / JSON REST interface on port 9000.
     - Maps Ledger Masters to canonical supplier profiles and tracks purchase vouchers.
   - **Oracle NetSuite Adapter**:
     - Connects via NetSuite SuiteTalk REST Web Services using Token-Based Authentication (TBA).

---

## 3. Cryptographic Hash-Chained Audit Log

Every security-sensitive action (invoice upload, verification, matching evaluation, approval grant, self-approval block, and status change) is recorded as a cryptographically linked block in the `audit_log` table:

$$\text{hash}_n = \text{SHA256}(\text{hash}_{n-1} \,\|\, \text{actor\_id} \,\|\, \text{action} \,\|\, \text{entity} \,\|\, \text{entity\_id} \,\|\, \text{canonical\_json}(\text{payload}) \,\|\, \text{timestamp})$$

Any direct tampering with database rows or hashes breaks sequential block validation (`GET /api/audit-log/verify`), ensuring legal non-repudiation.
