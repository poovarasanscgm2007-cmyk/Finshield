import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  AlertOctagon,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Copy,
  ShieldAlert,
  ArrowRight,
  BadgeAlert,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  TrendingUp,
  ShieldCheck,
  Bot,
  UserCheck,
  Lock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  Invoice,
  MatchResult,
  DuplicateDetectionResult,
  GstValidationResult,
  PoChangeReport,
  OverbillingReport,
  InvoiceRiskAssessment,
  Investigation
} from '../types/auth';
import { CopilotChatPanel } from './CopilotChatPanel';
import { safeNumber, formatCurrency, formatDate, safeArray } from '../utils/formatters';

interface ThreeWayMatchModalProps {
  invoiceId: string;
  onClose: () => void;
  onMatchUpdated?: () => void;
}

export const ThreeWayMatchModal: React.FC<ThreeWayMatchModalProps> = ({
  invoiceId,
  onClose,
  onMatchUpdated
}) => {
  const { authFetch, user } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateDetectionResult | null>(null);
  const [gstCheck, setGstCheck] = useState<GstValidationResult | null>(null);
  const [poChanges, setPoChanges] = useState<PoChangeReport | null>(null);
  const [overbilling, setOverbilling] = useState<OverbillingReport | null>(null);
  const [riskAssessment, setRiskAssessment] = useState<InvoiceRiskAssessment | null>(null);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [activeTab, setActiveTab] = useState<'match' | 'issues' | 'copilot'>('match');
  const [paymentApprovalLoading, setPaymentApprovalLoading] = useState(false);
  const [paymentApprovalMessage, setPaymentApprovalMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [showApprovalPrompt, setShowApprovalPrompt] = useState(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [matchingAction, setMatchingAction] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedReasons, setExpandedReasons] = useState<boolean>(true);
  const [showEvidenceIndex, setShowEvidenceIndex] = useState<number | null>(null);

  const canRunMatch = user?.role === 'AP Employee' || user?.role === 'Finance Manager' || user?.role === 'Admin';

  const loadDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch invoice details
      const invRes = await authFetch(`/api/invoices/${invoiceId}`);
      const invData = await invRes.json();
      if (!invRes.ok) throw new Error(invData.message || 'Failed to load invoice');
      const inv = invData.invoice;
      setInvoice(inv);

      // 2. Fetch match result
      const matchRes = await authFetch(`/api/invoices/${invoiceId}/match-result`);
      const matchData = await matchRes.json();
      if (matchRes.ok && matchData.match_result) {
        setMatchResult(matchData.match_result);
      }

      // 3. Fetch duplicate detection result
      const dupRes = await authFetch(`/api/invoices/${invoiceId}/duplicates`);
      const dupData = await dupRes.json();
      if (dupRes.ok) {
        setDuplicateInfo(dupData);
      }

      // 4. Fetch GST Check Result
      const gstRes = await authFetch(`/api/invoices/${invoiceId}/gst-check`);
      const gstData = await gstRes.json();
      if (gstRes.ok) {
        setGstCheck(gstData);
      }

      // 5. Fetch Risk Assessment
      const riskRes = await authFetch(`/api/invoices/${invoiceId}/risk`);
      const riskData = await riskRes.json();
      if (riskRes.ok && riskData.assessment) {
        setRiskAssessment(riskData.assessment);
      }

      // 6. Fetch PO Changes if PO is linked
      if (inv.po_id || inv.po_number) {
        const poKey = inv.po_id || inv.po_number;
        const poRes = await authFetch(`/api/purchase-orders/${poKey}/changes`);
        const poData = await poRes.json();
        if (poRes.ok) {
          setPoChanges(poData);
        }
      }

      // 7. Fetch Overbilling Report if supplier linked
      if (inv.supplier_id) {
        const obRes = await authFetch(`/api/suppliers/${inv.supplier_id}/overbilling`);
        const obData = await obRes.json();
        if (obRes.ok) {
          setOverbilling(obData);
        }
      }

      // 7. Fetch active investigations
      const invsRes = await authFetch(`/api/investigations?invoiceId=${inv.id || invoiceId}`);
      if (invsRes.ok) {
        const invsData = await invsRes.json();
        setInvestigations(invsData.investigations || []);
      }
    } catch (err: any) {
      console.error('Error loading match details:', err);
      setError(err.message || 'Failed to fetch matching data');
    } finally {
      setLoading(false);
    }
  };

  const handleApprovePayment = async () => {
    setPaymentApprovalLoading(true);
    setPaymentApprovalMessage(null);
    try {
      const res = await authFetch(`/api/invoices/${invoiceId}/approve-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: approvalNotes || 'Payment release authorized by Finance Manager' })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Payment approval failed');
      }
      setPaymentApprovalMessage({
        text: data.message || 'Payment approval recorded.',
        type: 'success'
      });
      setShowApprovalPrompt(false);
      setApprovalNotes('');
      await loadDetails();
      if (onMatchUpdated) onMatchUpdated();
    } catch (err: any) {
      setPaymentApprovalMessage({ text: err.message, type: 'error' });
    } finally {
      setPaymentApprovalLoading(false);
    }
  };

  const handleRunMatch = async () => {
    setMatchingAction(true);
    setError(null);
    try {
      const res = await authFetch(`/api/invoices/${invoiceId}/match`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to execute 3-way match');
      setMatchResult(data.match_result);
      await loadDetails();
      if (onMatchUpdated) onMatchUpdated();
    } catch (err: any) {
      console.error('Matching failed:', err);
      setError(err.message || 'Matching engine error');
    } finally {
      setMatchingAction(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [invoiceId]);

  const compared = matchResult?.compared_values;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-950 border border-sky-800 rounded-lg text-sky-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Invoice Investigation &amp; Compliance: {invoice?.invoice_number || 'Loading...'}
                </h3>
                {matchResult?.status === 'MATCHED' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-950/90 border border-emerald-700 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> MATCHED
                  </span>
                )}
                {matchResult?.status === 'MISMATCH' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-300 bg-rose-950/90 border border-rose-700 px-2.5 py-0.5 rounded-full">
                    <AlertOctagon className="w-3 h-3 text-rose-400" /> MISMATCH (ON HOLD)
                  </span>
                )}
                {matchResult?.status === 'HOLD' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-950/90 border border-amber-700 px-2.5 py-0.5 rounded-full">
                    <Clock className="w-3 h-3 text-amber-400" /> ON HOLD
                  </span>
                )}
                {duplicateInfo?.is_possible_duplicate && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-300 bg-orange-950/90 border border-orange-700 px-2.5 py-0.5 rounded-full">
                    <Copy className="w-3 h-3 text-orange-400" /> POSSIBLE DUPLICATE ({Math.round(duplicateInfo.highest_similarity * 100)}%)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                3-Way Matching (PO vs GRN vs Invoice) &bull; GST / ITC Risk Check &bull; PO Change History &bull; Historical Overbilling
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canRunMatch && (
              <button
                onClick={handleRunMatch}
                disabled={matchingAction}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg shadow-sm transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${matchingAction ? 'animate-spin' : ''}`} />
                <span>{matchingAction ? 'Re-Evaluating...' : 'Re-Run Pipeline'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-slate-800 bg-slate-900/40 flex items-center gap-6 text-xs">
          <button
            onClick={() => setActiveTab('match')}
            className={`py-3 font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'match'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>3-Way Matching &amp; Signals</span>
          </button>
          <button
            onClick={() => setActiveTab('issues')}
            className={`py-3 font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'issues'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Issues &amp; Investigations ({investigations.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('copilot')}
            className={`py-3 font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'copilot'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-4 h-4 text-indigo-400" />
            <span>AI Copilot Q&amp;A</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {paymentApprovalMessage && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                paymentApprovalMessage.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-800 text-rose-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{paymentApprovalMessage.text}</span>
            </div>
          )}

          {/* Payment Gate Banner */}
          <div
            className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              invoice?.payment_status === 'APPROVED'
                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                : invoice?.payment_status === 'ELIGIBLE_FOR_APPROVAL'
                ? 'bg-cyan-950/40 border-cyan-800 text-cyan-200'
                : invoice?.payment_status === 'PENDING_SECOND_APPROVAL'
                ? 'bg-indigo-950/40 border-indigo-800 text-indigo-200'
                : 'bg-rose-950/40 border-rose-800 text-rose-200'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div
                className={`p-2 rounded-lg ${
                  invoice?.payment_status === 'APPROVED' ? 'bg-emerald-900 text-emerald-300' : 'bg-rose-900 text-rose-300'
                }`}
              >
                {invoice?.payment_status === 'APPROVED' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <ShieldAlert className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm">
                    Payment Gate Status: {invoice?.payment_status || 'ON_HOLD'}
                  </span>
                  {invoice?.payment_status === 'APPROVED' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      RELEASE AUTHORIZED
                    </span>
                  )}
                  {invoice?.payment_status === 'ELIGIBLE_FOR_APPROVAL' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      READY FOR APPROVAL
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  {invoice?.payment_status === 'APPROVED'
                    ? 'Final human payment approval granted by authorized Finance Manager. Funds released.'
                    : invoice?.payment_status === 'ELIGIBLE_FOR_APPROVAL'
                    ? 'All department investigations successfully revalidated. Invoice is now unlocked for Finance authorization.'
                    : invoice?.payment_status === 'PENDING_SECOND_APPROVAL'
                    ? 'First-level Finance approval granted. High-risk invoice requires second independent Finance approval.'
                    : 'Payment release locked. All investigations must be REVALIDATED before payment release.'}
                </p>
              </div>
            </div>

            {user?.role === 'Finance Manager' && invoice?.payment_status !== 'APPROVED' && (
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => setShowApprovalPrompt(true)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md transition flex items-center space-x-1.5"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Authorize Payment Approval</span>
                </button>
              </div>
            )}

            {user?.role === 'Admin' && invoice?.payment_status !== 'APPROVED' && (
              <div className="flex items-center space-x-1.5 shrink-0 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-slate-400">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Admin payment approval prohibited (Golden Rule #2)</span>
              </div>
            )}
          </div>

          {/* Inline Approval Confirmation Modal / Form */}
          {showApprovalPrompt && (
            <div className="p-4 bg-slate-900 border border-emerald-700/80 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-white font-semibold text-xs">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <span>Confirm Human Payment Authorization ({user?.name})</span>
                </div>
                <button
                  onClick={() => setShowApprovalPrompt(false)}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-slate-400">
                You are about to release payment for invoice <strong className="text-white">{invoice?.invoice_number}</strong> (Total: Rs {invoice?.total}).
                Maker-checker verification and multi-level policy will be applied.
              </p>
              <input
                type="text"
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Optional approval notes (e.g. Audit cleared and validated)..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowApprovalPrompt(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprovePayment}
                  disabled={paymentApprovalLoading}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
                >
                  {paymentApprovalLoading ? 'Processing...' : 'Authorize Payment Release'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Golden Rule #2 & #3 Reminders */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between text-xs text-slate-300 gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong className="text-amber-300 font-semibold">Golden Rule #2:</strong> AI NEVER releases payment. Any discrepancy locks invoice to <span className="text-rose-400 font-mono font-bold">ON_HOLD</span>.
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                <strong className="text-sky-300 font-semibold">Golden Rule #3:</strong> Risk score = <strong className="text-white">Investigation priority</strong>, NOT a fraud verdict.
              </span>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* TAB 1: 3-WAY MATCHING & RISK SIGNALS                                      */}
          {/* ========================================================================= */}
          {activeTab === 'match' && (
            <>
          {/* ========================================================================= */}
          {/* PANEL 1: EXPLAINABLE RISK SCORE BADGE & REASONS LIST                      */}
          {/* ========================================================================= */}
          {riskAssessment && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* Circular / Badge Score */}
                  <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center border font-mono font-bold shadow-inner ${
                    riskAssessment.score >= 70
                      ? 'bg-rose-950/90 text-rose-300 border-rose-700'
                      : riskAssessment.score >= 31
                      ? 'bg-amber-950/90 text-amber-300 border-amber-700'
                      : 'bg-emerald-950/90 text-emerald-300 border-emerald-700'
                  }`}>
                    <span className="text-2xl leading-none">{riskAssessment.score}</span>
                    <span className="text-[9px] text-slate-400 uppercase font-sans">/ 100</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                        AI Risk Assessment:
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono border ${
                        riskAssessment.investigation_priority === 'HIGH'
                          ? 'bg-rose-950/80 text-rose-300 border-rose-700'
                          : riskAssessment.investigation_priority === 'MEDIUM'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-700'
                          : 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                      }`}>
                        Investigation Priority: {riskAssessment.investigation_priority}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Computed deterministically from 3-way match variance, PO changes, duplicate detection, GST/ITC gaps, and surcharge patterns.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {riskAssessment.itc_at_risk_inr > 0 && (
                    <div className="px-3 py-1.5 bg-rose-950/70 border border-rose-800 rounded-lg text-right">
                      <div className="text-[10px] text-rose-400 uppercase font-semibold">ITC at Risk</div>
                      <div className="text-sm font-bold font-mono text-rose-200">
                        ₹ {Number(riskAssessment.itc_at_risk_inr).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setExpandedReasons(!expandedReasons)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition"
                  >
                    <span>{expandedReasons ? 'Collapse Reasons' : 'Show Reasons'}</span>
                    {expandedReasons ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Expandable Reasons List */}
              {expandedReasons && (
                <div className="border-t border-slate-800/80 pt-4 space-y-2.5">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Contributing Evidence Points ({riskAssessment.reasons.length})</span>
                    <span className="text-[10px] text-slate-500 font-mono">Configurable Weights</span>
                  </div>

                  {riskAssessment.reasons.length === 0 ? (
                    <div className="p-3 bg-emerald-950/30 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Clean assessment: No risk indicators or discrepancies triggered for this invoice.</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {riskAssessment.reasons.map((r, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-950 border border-slate-800/90 rounded-lg p-3 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                r.severity === 'CRITICAL' || r.severity === 'HIGH'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}>
                                {r.severity}
                              </span>
                              <span className="font-bold text-white font-mono text-[11px] text-sky-400">
                                {r.rule_name}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-rose-400 text-xs">
                              +{r.points} pts
                            </span>
                          </div>

                          <p className="text-slate-300 text-xs">
                            {r.reason}
                          </p>

                          {r.evidence && (
                            <div className="pt-1">
                              <button
                                onClick={() => setShowEvidenceIndex(showEvidenceIndex === idx ? null : idx)}
                                className="text-[10px] text-sky-400 hover:text-sky-300 underline font-mono inline-flex items-center gap-1"
                              >
                                {showEvidenceIndex === idx ? 'Hide evidence object' : 'View evidence details'}
                              </button>
                              {showEvidenceIndex === idx && (
                                <pre className="mt-2 p-2 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-300 overflow-x-auto font-mono">
                                  {JSON.stringify(r.evidence, null, 2)}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* PANEL 2: GST COMPLIANCE & GSTR-2B ITC RECONCILIATION                      */}
          {/* ========================================================================= */}
          {gstCheck && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <BadgeAlert className="w-5 h-5 text-amber-400" />
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      GST Compliance &amp; GSTR-2B Inward Supply Verification
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Supplier GSTIN: <strong className="text-sky-300 font-mono">{gstCheck.supplier_gstin || 'N/A'}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1 rounded-lg border font-mono font-bold text-xs flex items-center gap-1.5 ${
                    gstCheck.itc_at_risk_inr > 0
                      ? 'bg-rose-950/80 text-rose-300 border-rose-700'
                      : 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                  }`}>
                    <span>ITC at risk:</span>
                    <span>₹ {Number(gstCheck.itc_at_risk_inr).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono border ${
                    gstCheck.overall_status === 'PASS'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : 'bg-rose-950 text-rose-300 border-rose-800'
                  }`}>
                    Status: {gstCheck.overall_status}
                  </span>
                </div>
              </div>

              {/* GST Checks Checklist */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {gstCheck.checks.map((c, i) => (
                  <div
                    key={i}
                    className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                      c.status === 'PASS'
                        ? 'bg-slate-950/70 border-slate-800 text-slate-300'
                        : 'bg-rose-950/30 border-rose-800 text-rose-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        {c.status === 'PASS' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        )}
                        {c.check_name}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        c.status === 'PASS'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                          : 'bg-rose-950 text-rose-300 border border-rose-700'
                      }`}>
                        {c.status}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {c.reason}
                    </p>

                    {c.itc_at_risk_inr !== undefined && c.itc_at_risk_inr > 0 && (
                      <div className="text-[11px] font-mono font-bold text-rose-400 mt-1">
                        Impact: ₹ {c.itc_at_risk_inr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Input Tax Credit disallowance
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PANEL 3: PURCHASE ORDER CHANGE MONITORING                                 */}
          {/* ========================================================================= */}
          {poChanges && poChanges.changes.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-sky-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    PO Modification Audit: {poChanges.po_number}
                  </h4>
                </div>
                {poChanges.has_unauthorized_changes ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-rose-950 text-rose-300 border border-rose-700">
                    UNAUTHORIZED MODIFICATION DETECTED
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-emerald-950 text-emerald-300 border border-emerald-700">
                    All Changes Approved
                  </span>
                )}
              </div>

              {poChanges.has_unauthorized_changes && (
                <div className="p-3 bg-amber-950/40 border border-amber-800 rounded-lg text-xs text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-amber-300">Maker-Checker Policy Enforcement:</span>
                    <p className="text-[11px] text-amber-200/90 mt-0.5">
                      Purchase Order price changes are invalid without formal Finance Manager approval. 3-Way Matching automatically reverts comparison to the original authorized baseline price.
                    </p>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Field</th>
                      <th className="py-2.5 px-3">Original Value</th>
                      <th className="py-2.5 px-3">Modified Value</th>
                      <th className="py-2.5 px-3">Changed By</th>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3 text-center">Approval Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-300 font-mono text-[11px]">
                    {poChanges.changes.map((ch) => (
                      <tr key={ch.id} className="hover:bg-slate-950/40">
                        <td className="py-2.5 px-3 font-semibold text-white font-sans">{ch.field}</td>
                        <td className="py-2.5 px-3 text-slate-400">Rs {ch.old_value}</td>
                        <td className="py-2.5 px-3 text-rose-300 font-bold">Rs {ch.new_value}</td>
                        <td className="py-2.5 px-3 font-sans text-slate-300">{ch.changed_by_name}</td>
                        <td className="py-2.5 px-3 text-slate-500">{new Date(ch.changed_at).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-center">
                          {ch.is_unauthorized ? (
                            <span className="px-2 py-0.5 bg-rose-950 text-rose-300 border border-rose-800 rounded text-[10px] font-bold">
                              {ch.approval_status === 'NOT_FOUND' ? 'Not found' : ch.approval_status}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded text-[10px] font-bold">
                              {ch.approval_status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PANEL 4: HISTORICAL OVERBILLING & REPEATED EXTRA CHARGES                  */}
          {/* ========================================================================= */}
          {overbilling && overbilling.has_overbilling_pattern && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-amber-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Historical Overbilling Pattern: {overbilling.supplier_name}
                  </h4>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-amber-950 text-amber-300 border border-amber-700">
                  {overbilling.extra_charges_count} Repeated Surcharges
                </span>
              </div>

              <div className="p-3 bg-amber-950/30 border border-amber-800 rounded-lg text-xs text-amber-200">
                <span className="font-semibold text-amber-300">Pattern Insight:</span>
                <p className="mt-0.5">{overbilling.pattern_description}</p>
              </div>

              {overbilling.evidence_invoices.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Evidence Invoice</th>
                        <th className="py-2 px-3">Invoice Date</th>
                        <th className="py-2 px-3">Extra Charge Description</th>
                        <th className="py-2 px-3 text-right">Extra Amount</th>
                        <th className="py-2 px-3 text-right">Invoice Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-300 font-mono text-[11px]">
                      {safeArray(overbilling.evidence_invoices).slice(0, 5).map((ev: any, i) => (
                        <tr key={i} className="hover:bg-slate-950/40">
                          <td className="py-2 px-3 font-bold text-white font-sans">{ev.invoice_number || 'N/A'}</td>
                          <td className="py-2 px-3 text-slate-400">{formatDate(ev.invoice_date)}</td>
                          <td className="py-2 px-3 font-sans text-amber-300">{ev.extra_charge_name || ev.item_name || 'Extra Charge'}</td>
                          <td className="py-2 px-3 text-right text-rose-300 font-bold">
                            ₹ {formatCurrency(ev.extra_charge_amount ?? ev.amount ?? 0)}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300">
                            ₹ {formatCurrency(ev.total ?? ev.amount ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* PANEL 5: DUPLICATE DETECTION WARNING                                      */}
          {/* ========================================================================= */}
          {duplicateInfo?.is_possible_duplicate && (
            <div className="bg-orange-950/40 border border-orange-800/80 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-orange-300 flex items-center gap-1.5">
                  <Copy className="w-4 h-4 text-orange-400" />
                  POSSIBLE DUPLICATE INVOICE DETECTED (Similarity: {Math.round(duplicateInfo.highest_similarity * 100)}%)
                </span>
                <span className="text-[10px] font-mono bg-orange-900/60 text-orange-200 border border-orange-700 px-2 py-0.5 rounded">
                  Config Threshold: {Math.round(duplicateInfo.threshold * 100)}%
                </span>
              </div>
              <p className="text-xs text-orange-200/90">
                This document closely mirrors an existing invoice in the system. Never auto-rejected: flagged for human AP investigation.
              </p>
              {duplicateInfo.duplicates.length > 0 && (
                <div className="mt-2 bg-slate-950/60 rounded-lg p-3 border border-orange-900/40 space-y-2">
                  <div className="text-xs font-semibold text-slate-200">
                    Matches existing invoice: <span className="font-mono text-orange-300 font-bold">{duplicateInfo.duplicates[0].invoice_number}</span> (Rs {Number(duplicateInfo.duplicates[0].total).toLocaleString('en-IN')})
                  </div>
                  <ul className="text-[11px] text-orange-300/80 list-disc list-inside space-y-0.5">
                    {duplicateInfo.duplicates[0].reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* PANEL 6: 3-WAY MATCHING RECONCILIATION TABLE                              */}
          {/* ========================================================================= */}
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading 3-way matching data...</div>
          ) : !invoice ? (
            <div className="p-12 text-center text-xs text-slate-400">Invoice not found.</div>
          ) : (
            <>
              {/* Document Summary Headers Grid (PO vs GRN vs Invoice) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. PO Summary Box */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                      1. Purchase Order
                    </span>
                    <span className="font-mono text-xs font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
                      {compared?.po_number || invoice.po_number || 'No PO'}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Supplier:</span>
                      <span className="font-medium text-slate-200 truncate max-w-[180px]">{invoice.supplier_name || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">PO Listed Total:</span>
                      <span className="font-mono text-slate-300">Rs {compared?.po_total ? Number(compared.po_total).toLocaleString('en-IN') : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span className="text-slate-400">Approved PO Total:</span>
                      <span className="font-mono text-sky-300">Rs {compared?.po_approved_total ? Number(compared.po_approved_total).toLocaleString('en-IN') : 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* 2. GRN Summary Box */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                      2. Goods Receipt (GRN)
                    </span>
                    <span className="font-mono text-xs font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
                      {compared?.grn_numbers && compared.grn_numbers.length > 0
                        ? compared.grn_numbers.join(', ')
                        : 'No GRN Found'}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Intake Deliveries:</span>
                      <span className="font-medium text-slate-200">
                        {compared?.grn_numbers ? `${compared.grn_numbers.length} Receipt(s)` : '0 Receipts'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Delivery Status:</span>
                      <span className={`font-semibold ${matchResult?.status === 'MATCHED' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {matchResult?.status === 'MATCHED' ? 'Complete Intake' : 'Partial / Discrepancy'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Multi-GRN Summation:</span>
                      <span className="font-mono text-indigo-300 font-semibold">Active &amp; Reconciled</span>
                    </div>
                  </div>
                </div>

                {/* 3. Invoice Summary Box */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                      3. Billed Invoice
                    </span>
                    <span className="font-mono text-xs font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
                      {invoice.invoice_number}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Invoice Date:</span>
                      <span className="font-medium text-slate-200">{formatDate(invoice.invoice_date)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Billed Total:</span>
                      <span className="font-mono font-bold text-white">Rs {formatCurrency(invoice.total)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Current Status:</span>
                      <span className="font-mono font-bold text-amber-400">{invoice.status}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Side-by-Side 3-Way Table */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                <div className="px-4 py-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <ArrowRight className="w-3.5 h-3.5 text-sky-400" />
                    Line Items 3-Way Reconciliation Comparison
                  </span>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span> Mismatch
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span> Matched
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3 border-r border-slate-800" rowSpan={2}>Item Description</th>
                        <th className="py-2 px-3 text-center border-r border-slate-800 bg-sky-950/40 text-sky-300" colSpan={3}>
                          1. Purchase Order
                        </th>
                        <th className="py-2 px-3 text-center border-r border-slate-800 bg-indigo-950/40 text-indigo-300" colSpan={1}>
                          2. GRN (Received)
                        </th>
                        <th className="py-2 px-3 text-center border-r border-slate-800 bg-purple-950/40 text-purple-300" colSpan={3}>
                          3. Invoice (Billed)
                        </th>
                        <th className="py-2.5 px-3 text-center" rowSpan={2}>Match State</th>
                      </tr>
                      <tr className="border-b border-slate-800 text-[9px]">
                        <th className="py-1.5 px-3 bg-sky-950/20 text-sky-400 font-mono">Ordered Qty</th>
                        <th className="py-1.5 px-3 bg-sky-950/20 text-sky-400 font-mono">Listed Price</th>
                        <th className="py-1.5 px-3 bg-sky-950/20 text-sky-400 font-mono border-r border-slate-800">Approved Price</th>
                        <th className="py-1.5 px-3 bg-indigo-950/20 text-indigo-400 font-mono border-r border-slate-800">Received Qty</th>
                        <th className="py-1.5 px-3 bg-purple-950/20 text-purple-400 font-mono">Billed Qty</th>
                        <th className="py-1.5 px-3 bg-purple-950/20 text-purple-400 font-mono">Billed Price</th>
                        <th className="py-1.5 px-3 bg-purple-950/20 text-purple-400 font-mono border-r border-slate-800">Billed Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-300 font-mono text-[11px]">
                      {compared?.items && compared.items.length > 0 ? (
                        compared.items.map((item: any, idx: number) => {
                          const poQty = safeNumber(item.po_qty, 0);
                          const poPrice = safeNumber(item.po_unit_price, 0);
                          const poApprovedPrice = safeNumber(item.po_approved_price, 0);
                          const grnQty = safeNumber(item.grn_qty, 0);
                          const invQty = safeNumber(item.invoice_qty, 0);
                          const invPrice = safeNumber(item.invoice_unit_price, 0);
                          const invBilledTotal = invQty * invPrice;
                          const qtyMismatch = !item.qty_matched;
                          const priceMismatch = !item.price_matched;

                          return (
                            <tr key={idx} className="hover:bg-slate-900/30 transition">
                              <td className="py-3 px-3 font-sans font-medium text-slate-200 border-r border-slate-800">
                                {item.item_name || 'Item'}
                              </td>

                              <td className="py-3 px-3 text-right">{poQty}</td>
                              <td className="py-3 px-3 text-right">Rs {poPrice.toFixed(2)}</td>
                              <td className={`py-3 px-3 text-right border-r border-slate-800 font-bold ${
                                priceMismatch ? 'bg-rose-950/60 text-rose-300 font-bold border border-rose-800' : 'text-sky-300'
                              }`}>
                                Rs {poApprovedPrice.toFixed(2)}
                              </td>

                              <td className={`py-3 px-3 text-right border-r border-slate-800 font-bold ${
                                qtyMismatch ? 'bg-rose-950/70 text-rose-300 border-l border-r border-rose-800' : 'text-indigo-300'
                              }`}>
                                {grnQty}
                              </td>

                              <td className={`py-3 px-3 text-right font-bold ${
                                qtyMismatch ? 'bg-rose-950/70 text-rose-300 border-l border-r border-rose-800' : 'text-slate-200'
                              }`}>
                                {invQty}
                              </td>

                              <td className={`py-3 px-3 text-right font-bold ${
                                priceMismatch ? 'bg-rose-950/60 text-rose-300 border-l border-r border-rose-800' : 'text-slate-200'
                              }`}>
                                Rs {invPrice.toFixed(2)}
                              </td>

                              <td className="py-3 px-3 text-right border-r border-slate-800 text-white font-bold">
                                Rs {invBilledTotal.toFixed(2)}
                              </td>

                              <td className="py-3 px-3 text-center">
                                {qtyMismatch || priceMismatch ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-950/80 border border-rose-800 px-2 py-0.5 rounded">
                                    <AlertOctagon className="w-3 h-3 text-rose-400" /> Discrepancy
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Matched
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={9} className="py-6 text-center text-slate-500 font-sans">
                            Run 3-way matching to inspect line item comparison.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Exact Discrepancy Reasons Below */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Matching Engine Findings &amp; Discrepancy Reasons
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Deterministic Rule Output
                  </span>
                </div>

                {matchResult?.reasons && matchResult.reasons.length > 0 ? (
                  <div className="space-y-2">
                    {matchResult.reasons.map((reason, idx) => {
                      const isQtyExceeded = reason.includes('exceeds received qty');
                      const isPending = reason.includes('Pending delivery');
                      const isPriceMismatch = reason.includes('differs from PO price');

                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                            isQtyExceeded
                              ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                              : isPending
                              ? 'bg-amber-950/40 border-amber-800 text-amber-200'
                              : isPriceMismatch
                              ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                              : 'bg-slate-950 border-slate-800 text-slate-300'
                          }`}
                        >
                          <AlertOctagon className={`w-4 h-4 shrink-0 mt-0.5 ${
                            isQtyExceeded || isPriceMismatch ? 'text-rose-400' : 'text-amber-400'
                          }`} />
                          <div>
                            <span className="font-semibold">{reason}</span>
                            {isQtyExceeded && (
                              <p className="text-[10px] text-rose-300/80 mt-0.5">
                                Invoice billed for more quantity than recorded as physically received in warehouse Goods Receipt Notes.
                              </p>
                            )}
                            {isPending && (
                              <p className="text-[10px] text-amber-300/80 mt-0.5">
                                Goods receipt indicates partial shipment from supplier. Balance pending delivery.
                              </p>
                            )}
                            {isPriceMismatch && (
                              <p className="text-[10px] text-rose-300/80 mt-0.5">
                                Unit price exceeds authorized baseline price. Requires Finance Manager price change approval.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : matchResult?.status === 'MATCHED' ? (
                  <div className="p-3 bg-emerald-950/30 border border-emerald-800 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>All line items, quantities, approved unit prices, and tax rates reconciled within tolerance.</span>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 py-2">
                    No matching run recorded yet. Click "Re-Run Pipeline" above to run tolerance matching.
                  </div>
                )}
              </div>
            </>
          )}
          </>
          )}

          {/* TAB 2: ISSUES & INVESTIGATIONS */}
          {activeTab === 'issues' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">Active Department Investigations</h4>
                  <p className="text-xs text-slate-400">Investigations auto-created from pipeline flags. Must all be REVALIDATED before payment release.</p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {investigations.length} Active Records
                </span>
              </div>

              {investigations.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-xl border border-slate-800">
                  No open issues or investigations recorded for this invoice.
                </div>
              ) : (
                <div className="space-y-3">
                  {investigations.map((inv) => (
                    <div key={inv.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.severity === 'HIGH' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {inv.severity}
                          </span>
                          <span className="font-semibold text-white text-sm">{inv.title}</span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          inv.status === 'REVALIDATED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : inv.status === 'RESOLVED'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : inv.status === 'REOPENED'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {inv.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">{inv.description}</p>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-2 border-t border-slate-800">
                        <div>Department: <strong className="text-slate-200">{inv.department}</strong></div>
                        <div>Assigned To: <strong className="text-slate-200">{inv.assigned_user_name || 'Unassigned'}</strong></div>
                        <div>Issue Type: <span className="font-mono text-indigo-400">{inv.issue_type}</span></div>
                      </div>

                      {inv.revalidation_result && (
                        <div className={`p-2.5 rounded-lg text-xs ${
                          inv.revalidation_result.passed
                            ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800'
                            : 'bg-rose-950/40 text-rose-300 border border-rose-800'
                        }`}>
                          Revalidation: {inv.revalidation_result.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AI COPILOT */}
          {activeTab === 'copilot' && (
            <CopilotChatPanel
              invoiceId={invoice?.id}
              invoiceNumber={invoice?.invoice_number}
              embedded={true}
            />
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-500">
          <span className="font-mono">FINSHIELD AI &bull; Accounts Payable Risk &amp; GST Compliance</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThreeWayMatchModal;
