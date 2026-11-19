# FINSHIELD AI: System Limitations & Operating Boundaries

This document provides transparent, factual disclosures regarding the current prototype implementation of **FINSHIELD AI**, its operating assumptions, and its production boundaries.

---

## 1. Prototype & Hackathon Scope
- **Current Maturity**: FINSHIELD AI is currently implemented as an enterprise-grade functional prototype designed for hackathon demonstration, architectural validation, and user experience testing.
- **Storage Tier**: The system supports both PostgreSQL 16 (production migrations `001` through `007`) and a zero-dependency In-Memory Prototype Vault for local evaluation when PostgreSQL is unreachable.

---

## 2. Sample Data Disclaimer
- **Empirical Context**: All suppliers, purchase orders, goods receipts, and invoices are **sample demo records** specifically constructed to demonstrate financial leakage scenarios (such as Section 6 demo scenario).
- **Data Boundary**: In compliance with Golden Rule #4, demo data lives strictly in the seed scripts and test fixtures; the UI maintains a clean, modern interface without an intrusive sample-data banner.

---

## 3. GST Portal Integration & GSP Sandbox
- **Current Simulation**: GSTIN format validation uses official Government of India 15-character Mod-36 Luhn checksum algorithms. GSTR-2B inward reconciliation is executed against pre-loaded government filing snapshots.
- **Production Requirement**: Real-time GSTR-2B syncing in production requires an authorized GST Suvidha Provider (GSP) API license, digital signature certificate (DSC) authentication, and e-Way bill portal API keys issued by the Goods and Services Tax Network (GSTN).

---

## 4. OCR & LLM Extraction Boundaries
- **Optical Limitations**: OCR accuracy (via Tesseract.js / direct PDF text streams) depends on scan resolution, lighting conditions, and skewed document orientation.
- **Human Verification Mandate**: Extracted fields carry per-field confidence scores (0.0 to 1.0). Invoices with missing or low-confidence fields require human confirmation by an authorized AP Employee before entering the matching pipeline.
- **Zero Hallucination Guarantee**: If an LLM or OCR engine fails to identify a value, the field is stored as `null` with confidence `0.0` and marked `MISSING`. The system never invents numbers.

---

## 5. Risk Score vs. Fraud Verdict
- **Investigation Priority Only**: The composite risk score (0 to 100) and risk level (`LOW`, `MEDIUM`, `HIGH`) represent an **investigation priority queue**, never a legal fraud verdict or criminal conclusion.
- **Explainable Evidence**: Every score is accompanied by granular, auditable rules (e.g. `QTY_MISMATCH`, `GST_ITC_RISK`, `PO_UNAPPROVED_CHANGE`) and verifiable database records.

---

## 6. Payment Authority & Golden Rule 2
- **AI Never Releases Payment**: Under no circumstances can AI agents, rule engines, or background automations disburse funds or approve payments.
- **Human Sign-Off**: Final payment approval is strictly reserved for authenticated **Finance Managers**. High-risk invoices mandate multi-level approval (two distinct Finance Managers) with strict maker-checker controls.

---

## 7. Graph Relational Indicators
- **Verification Standard**: Shared attributes discovered in the supplier relationship graph (such as identical bank identifiers or shared postal addresses) are **indicators requiring human investigation**, not proof of collusion or corporate fraud.
- **Legitimate Use Cases**: Related entities (e.g. parent company and subsidiaries, or sister concerns operating from the same commercial park) often share legitimate accounts or addresses.
