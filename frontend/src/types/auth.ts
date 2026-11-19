export type UserRole =
  | 'AP Employee'
  | 'Procurement Employee'
  | 'Warehouse Employee'
  | 'Finance Manager'
  | 'Admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  status: string;
  token: string;
  user: User;
}

export interface Approval {
  id: string;
  entity_type: string;
  entity_id: string;
  payload: any;
  requested_by: string;
  requester_name?: string;
  requester_role?: string;
  approved_by?: string | null;
  approver_name?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requested_at: string;
  actioned_at?: string | null;
  notes?: string | null;
}

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  action: string;
  entity: string;
  entity_id: string;
  payload: any;
  prev_hash: string;
  hash: string;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_name: string;
  supplier_gstin: string;
  order_date: string;
  total_amount: string | number;
  status: string;
}

export interface InvoiceLineItem {
  id?: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tax_rate: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  normalized_invoice_number: string;
  irn?: string | null;
  supplier_id: string;
  supplier_name?: string;
  supplier_gstin?: string;
  supplier_bank_identifier?: string;
  po_id?: string | null;
  po_number?: string | null;
  invoice_date: string;
  subtotal: number | string;
  cgst: number | string;
  sgst: number | string;
  igst: number | string;
  total: number | string;
  status:
    | 'EXTRACTING'
    | 'NEEDS_VERIFICATION'
    | 'EXTRACTED'
    | 'VERIFIED'
    | 'PAID'
    | 'PENDING'
    | 'ON_HOLD'
    | 'MATCHED'
    | 'MISMATCH';
  extraction_source?: 'LLM' | 'FALLBACK';
  extraction_confidence?: Record<string, number>;
  raw_extracted_data?: any;
  verified_by?: string | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  duplicate_similarity?: number | null;
  duplicate_reasons?: string[] | null;
  match_status?: 'MATCHED' | 'MISMATCH' | 'HOLD' | null;
  risk_score?: number | null;
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  itc_at_risk?: number | null;
  payment_status?: 'ON_HOLD' | 'ELIGIBLE_FOR_APPROVAL' | 'PENDING_SECOND_APPROVAL' | 'APPROVED' | 'REJECTED';
  approved_by?: string | null;
  second_approved_by?: string | null;
  approved_at?: string | null;
  payment_approval_notes?: string | null;
  gst_check_result?: any;
  file_path?: string;
  created_at: string;
  line_items?: InvoiceLineItem[];
  match_result?: MatchResult | null;
  duplicate_info?: DuplicateDetectionResult | null;
}

export interface ComparedLineItem {
  item_name: string;
  po_qty: number;
  po_unit_price: number;
  po_approved_price: number;
  grn_qty: number;
  invoice_qty: number;
  invoice_unit_price: number;
  qty_diff: number;
  price_diff: number;
  qty_matched: boolean;
  price_matched: boolean;
  tax_matched: boolean;
  discrepancies: string[];
}

export interface ComparedValues {
  po_id?: string;
  po_number?: string;
  grn_numbers: string[];
  items: ComparedLineItem[];
  po_total?: number;
  po_approved_total?: number;
  invoice_total: number;
  tolerances: {
    qty_tolerance_percent: number;
    price_tolerance_percent: number;
  };
  unapproved_po_change_detected?: boolean;
}

export interface MatchResult {
  id?: string;
  invoice_id: string;
  status: 'MATCHED' | 'MISMATCH' | 'HOLD';
  reasons: string[];
  compared_values: ComparedValues;
  created_at?: string;
}

export interface DuplicateMatch {
  invoice_id: string;
  invoice_number: string;
  normalized_invoice_number: string;
  supplier_id: string;
  supplier_name?: string;
  invoice_date?: string;
  total: number;
  similarity_score: number;
  reasons: string[];
  created_at: string;
}

export interface DuplicateDetectionResult {
  target_invoice_id: string;
  target_invoice_number: string;
  is_possible_duplicate: boolean;
  highest_similarity: number;
  threshold: number;
  duplicates: DuplicateMatch[];
}

export interface GstCheckItem {
  check_name: string;
  rule_code: string;
  status: 'PASS' | 'FAIL';
  reason: string;
  itc_at_risk_inr?: number;
  details?: any;
}

export interface GstValidationResult {
  invoice_id: string;
  invoice_number: string;
  supplier_gstin: string;
  overall_status: 'PASS' | 'FAIL';
  itc_at_risk_inr: number;
  checks: GstCheckItem[];
  checked_at: string;
}

export interface PoChangeItem {
  id: string;
  po_id: string;
  field: string;
  old_value: string;
  new_value: string;
  changed_by: string;
  changed_by_name?: string;
  changed_at: string;
  approval_id?: string | null;
  approval_status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'NOT_FOUND';
  is_unauthorized: boolean;
  warning?: string | null;
}

export interface PoChangeReport {
  po_id: string;
  po_number: string;
  has_unauthorized_changes: boolean;
  unauthorized_changes_count: number;
  total_changes_count: number;
  changes: PoChangeItem[];
}

export interface OverbillingEvidenceInvoice {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  total: number;
  extra_charge_name: string;
  extra_charge_amount: number;
}

export interface OverbillingReport {
  supplier_id: string;
  supplier_name: string;
  has_overbilling_pattern: boolean;
  extra_charges_count: number;
  distinct_charge_amounts: number[];
  pattern_description: string;
  evidence_invoices: OverbillingEvidenceInvoice[];
}

export interface RiskReason {
  rule_code: string;
  rule_name: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  points: number;
  reason: string;
  evidence: any;
}

export interface InvoiceRiskAssessment {
  invoice_id: string;
  invoice_number: string;
  supplier_id: string;
  supplier_name: string;
  score: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  investigation_priority: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: RiskReason[];
  itc_at_risk_inr: number;
  evaluated_at: string;
}

export interface RiskRuleConfig {
  id: string;
  rule_code: string;
  rule_name: string;
  description: string;
  weight: number;
  threshold: number;
  is_active: boolean;
}

export interface InvestigationComment {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  text: string;
  created_at: string;
}

export interface Investigation {
  id: string;
  issue_type: string;
  department: 'Warehouse' | 'Procurement/Finance' | 'AP/Finance' | 'Finance/Compliance';
  assigned_to?: string;
  assigned_user_name?: string;
  invoice_id?: string;
  invoice_number?: string;
  supplier_id?: string;
  supplier_name?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REVALIDATED' | 'REOPENED' | 'CLOSED';
  title: string;
  description: string;
  evidence: any;
  comments: InvestigationComment[];
  resolution_notes?: string | null;
  revalidation_result?: any | null;
  reopened_reason?: string | null;
  is_sample_data: boolean;
  created_at: string;
  updated_at: string;
}

export interface CopilotEvidence {
  type: 'INVOICE' | 'PURCHASE_ORDER' | 'GRN' | 'PO_CHANGE' | 'GSTR2B' | 'OVERBILLING' | 'INVESTIGATION' | 'RISK_SCORE';
  id: string;
  label: string;
  details: any;
}

export interface CopilotRecommendedAction {
  department: 'Warehouse' | 'Procurement' | 'AP' | 'Finance' | 'Compliance';
  action: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface CopilotQueryResponse {
  status: string;
  answer: string;
  evidence: CopilotEvidence[];
  recommendedActions: CopilotRecommendedAction[];
  source?: string;
}

export interface DashboardStats {
  cards: {
    total_invoices: number;
    matched_invoices: number;
    mismatched_invoices: number;
    possible_duplicates: number;
    high_risk_invoices: number;
    pending_investigations: number;
    total_itc_at_risk: number;
  };
  charts: {
    invoices_by_status: Array<{ status: string; count: number }>;
    risk_distribution: Array<{ level: string; count: number }>;
    investigations_by_department: Array<{ department: string; count: number }>;
  };
  recent_alerts: Array<{
    id: string;
    invoice_id?: string;
    invoice_number: string;
    title: string;
    issue_type: string;
    department: string;
    severity: string;
    status: string;
    created_at: string;
  }>;
}

export interface GraphNode {
  id: string;
  name: string;
  gstin: string;
  pan: string;
  bank_identifier?: string;
  address?: string;
  phone?: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_score: number;
  gst_filing_status: string;
  is_sample_data: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'SHARED_BANK' | 'SHARED_ADDRESS' | 'SHARED_PHONE' | 'SHARED_PAN';
  shared_value: string;
  reason: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  requires_verification: boolean;
  disclaimer: string;
}

export interface SupplierGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: {
    total_suppliers: number;
    total_relationships: number;
    shared_bank_relationships: number;
    shared_address_relationships: number;
    shared_phone_relationships: number;
    shared_pan_relationships: number;
  };
  disclaimer: string;
}

export interface ScorecardMetric {
  key: string;
  name: string;
  category: string;
  score: number;
  weight: number;
  weighted_score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  formula: string;
  inputs: Record<string, any>;
  description: string;
}

export interface SupplierScorecard {
  supplier_id: string;
  supplier_name: string;
  gstin: string;
  pan: string;
  overall_score: number;
  overall_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  rating_label: string;
  metrics: ScorecardMetric[];
  summary: {
    total_invoices: number;
    matched_invoices: number;
    mismatched_invoices: number;
    total_po_quantity: number;
    total_grn_quantity: number;
    overbilling_charges_count: number;
    open_investigations_count: number;
    resolved_investigations_count: number;
  };
  evidence_invoices: Array<{
    id: string;
    invoice_number: string;
    invoice_date: string;
    total: number;
    status: string;
    match_status?: string;
    risk_level?: string;
  }>;
  disclaimer: string;
  computed_at: string;
}


