import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Save
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Invoice } from '../types/auth';

interface Props {
  invoiceId: string;
  onClose: () => void;
  onVerified: () => void;
}

export const InvoiceVerificationModal: React.FC<Props> = ({ invoiceId, onClose, onVerified }) => {
  const { user, authFetch } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form edit states
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [poReference, setPoReference] = useState('');
  const [supplierGstin, setSupplierGstin] = useState('');
  const [subtotal, setSubtotal] = useState<number | string>(0);
  const [cgst, setCgst] = useState<number | string>(0);
  const [sgst, setSgst] = useState<number | string>(0);
  const [igst, setIgst] = useState<number | string>(0);
  const [total, setTotal] = useState<number | string>(0);
  const [notes, setNotes] = useState('');

  const canVerify = user?.role === 'AP Employee' || user?.role === 'Admin';

  const fetchInvoice = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/invoices/${invoiceId}`);
      const data = await res.json();
      if (res.ok && data.invoice) {
        const inv = data.invoice;
        setInvoice(inv);
        setInvoiceNumber(inv.invoice_number || '');
        setInvoiceDate(inv.invoice_date ? new Date(inv.invoice_date).toISOString().slice(0, 10) : '');
        setPoReference(inv.po_number || inv.po_reference || '');
        setSupplierGstin(inv.supplier_gstin || '');
        setSubtotal(inv.subtotal || 0);
        setCgst(inv.cgst || 0);
        setSgst(inv.sgst || 0);
        setIgst(inv.igst || 0);
        setTotal(inv.total || 0);
      } else {
        setError(data.message || 'Failed to load invoice');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoice();
  }, [invoiceId]);

  const handleConfirmVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canVerify) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await authFetch(`/api/invoices/${invoiceId}/verify`, {
        method: 'PUT',
        body: JSON.stringify({
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          po_reference: poReference,
          supplier_gstin: supplierGstin,
          subtotal: Number(subtotal),
          cgst: Number(cgst),
          sgst: Number(sgst),
          igst: Number(igst),
          total: Number(total),
          notes: notes || 'Verified and confirmed by AP Employee'
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess('Invoice verified successfully! Status updated to VERIFIED.');
        setTimeout(() => {
          onVerified();
        }, 1200);
      } else {
        setError(data.message || 'Verification update failed.');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setSaving(false);
    }
  };

  const getConfidenceBadge = (fieldKey: string) => {
    if (!invoice?.extraction_confidence) return null;
    const score = invoice.extraction_confidence[fieldKey];
    if (score === undefined) return null;

    if (score === 0) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-300 bg-rose-950/80 border border-rose-800 px-1.5 py-0.5 rounded">
          MISSING (0%)
        </span>
      );
    }
    if (score < 0.80) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-950/80 border border-amber-800 px-1.5 py-0.5 rounded">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          {Math.round(score * 100)}% Low Confidence
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.5 rounded">
        {Math.round(score * 100)}% Confidence
      </span>
    );
  };

  const isLowConfidenceOrMissing = (fieldKey: string) => {
    if (!invoice?.extraction_confidence) return false;
    const score = invoice.extraction_confidence[fieldKey];
    return score !== undefined && score < 0.80;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl text-xs text-slate-300 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
          Loading document and extraction details...
        </div>
      </div>
    );
  }

  if (!invoice) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-7xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Invoice Verification: {invoice.invoice_number}
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                    invoice.status === 'VERIFIED'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : invoice.status === 'NEEDS_VERIFICATION'
                      ? 'bg-amber-950 text-amber-300 border-amber-800'
                      : 'bg-sky-950 text-sky-300 border-sky-800'
                  }`}
                >
                  {invoice.status}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Extracted via <strong className="text-slate-300 font-mono">{invoice.extraction_source || 'FALLBACK'}</strong> &bull; Raw ID: {invoice.id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={`/api/invoices/${invoice.id}/file`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition"
            >
              Open File <ExternalLink className="w-3 h-3" />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Split Screen Container */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800 overflow-hidden">
          {/* Left Column: Original Document Viewer */}
          <div className="h-full flex flex-col bg-slate-900/40 p-4 overflow-hidden">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Original Scanned / Uploaded Document</span>
              <span className="text-[10px] text-slate-500 font-mono">Live Document Preview</span>
            </div>
            <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden relative shadow-inner">
              <iframe
                src={`/api/invoices/${invoice.id}/file`}
                title="Invoice Document Preview"
                className="w-full h-full border-0"
              />
            </div>
          </div>

          {/* Right Column: Extracted Fields & Human Verification Form */}
          <div className="h-full flex flex-col p-6 overflow-y-auto space-y-5 bg-slate-950">
            {/* AI Warning Banner */}
            <div className="p-3.5 bg-sky-950/40 border border-sky-800/80 rounded-xl flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300">
                <strong className="text-white block font-semibold mb-0.5">
                  AI-Extracted Metadata &bull; Human Verification Required
                </strong>
                Please inspect the highlighted fields against the original source document on the left.
                Fields below 80% confidence or missing are flagged in yellow or red.
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {!canVerify && (
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-amber-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span>View-Only Mode: You are logged in as <strong>{user?.role}</strong>. Only <strong>AP Employees</strong> have permission to confirm verification.</span>
              </div>
            )}

            <form onSubmit={handleConfirmVerification} className="space-y-4 text-xs">
              {/* Row 1: Supplier & GSTIN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`p-2.5 rounded-xl border ${isLowConfidenceOrMissing('supplier_name') ? 'bg-amber-950/20 border-amber-800' : 'bg-slate-900/60 border-slate-800'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-slate-400">Supplier Name</label>
                    {getConfidenceBadge('supplier_name')}
                  </div>
                  <input
                    type="text"
                    disabled={!canVerify}
                    value={invoice.supplier_name || 'TimberCraft Woodworks (Supplier A)'}
                    readOnly
                    className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-white disabled:opacity-75"
                  />
                </div>

                <div className={`p-2.5 rounded-xl border ${isLowConfidenceOrMissing('supplier_gstin') ? 'bg-amber-950/20 border-amber-800' : 'bg-slate-900/60 border-slate-800'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-slate-400">Supplier GSTIN</label>
                    {getConfidenceBadge('supplier_gstin')}
                  </div>
                  <input
                    type="text"
                    disabled={!canVerify}
                    value={supplierGstin}
                    onChange={(e) => setSupplierGstin(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono uppercase"
                  />
                </div>
              </div>

              {/* Row 2: Invoice Number & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`p-2.5 rounded-xl border ${isLowConfidenceOrMissing('invoice_number') ? 'bg-amber-950/20 border-amber-800' : 'bg-slate-900/60 border-slate-800'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-slate-400">Invoice Number</label>
                    {getConfidenceBadge('invoice_number')}
                  </div>
                  <input
                    type="text"
                    disabled={!canVerify}
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>

                <div className={`p-2.5 rounded-xl border ${isLowConfidenceOrMissing('invoice_date') ? 'bg-amber-950/20 border-amber-800' : 'bg-slate-900/60 border-slate-800'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-slate-400">Invoice Date</label>
                    {getConfidenceBadge('invoice_date')}
                  </div>
                  <input
                    type="date"
                    disabled={!canVerify}
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
              </div>

              {/* Row 3: PO Reference (High Risk if missing) */}
              <div className={`p-3 rounded-xl border ${isLowConfidenceOrMissing('po_reference') || !poReference ? 'bg-amber-950/30 border-amber-600 shadow-md shadow-amber-950/30' : 'bg-slate-900/60 border-slate-800'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[11px] font-bold text-amber-300">Associated PO Reference</label>
                    <span className="text-[10px] text-slate-400">(Required for 3-way match)</span>
                  </div>
                  {getConfidenceBadge('po_reference')}
                </div>
                <input
                  type="text"
                  disabled={!canVerify}
                  value={poReference}
                  placeholder="e.g. PO-101"
                  onChange={(e) => setPoReference(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono font-bold"
                />
              </div>

              {/* Row 4: Financial Breakdown */}
              <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3">
                <div className="text-xs font-semibold text-slate-300">Financial Breakdown (INR)</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Subtotal</label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canVerify}
                      value={subtotal}
                      onChange={(e) => setSubtotal(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">CGST (9%)</label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canVerify}
                      value={cgst}
                      onChange={(e) => setCgst(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">SGST (9%)</label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canVerify}
                      value={sgst}
                      onChange={(e) => setSgst(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Total Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canVerify}
                      value={total}
                      onChange={(e) => setTotal(e.target.value)}
                      className="w-full bg-slate-900 border border-emerald-600 rounded p-1.5 text-emerald-400 font-mono font-bold text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <div className="text-xs font-semibold text-slate-300 mb-2">Extracted Line Items</div>
                {invoice.line_items && invoice.line_items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[10px] uppercase text-slate-500 bg-slate-900">
                        <tr>
                          <th className="p-1.5">Description</th>
                          <th className="p-1.5">Quantity</th>
                          <th className="p-1.5">Unit Price</th>
                          <th className="p-1.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300 font-mono text-[11px]">
                        {invoice.line_items.map((line, idx) => (
                          <tr key={idx}>
                            <td className="p-1.5 font-sans">{line.item_name}</td>
                            <td className="p-1.5">{line.quantity}</td>
                            <td className="p-1.5">Rs {line.unit_price}</td>
                            <td className="p-1.5 text-right font-bold text-white">Rs {line.total_price}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 py-2">No individual line items parsed.</div>
                )}
              </div>

              {/* Verification Notes */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Audit Verification Notes</label>
                <input
                  type="text"
                  disabled={!canVerify}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Confirmed with PO and matched physical paper invoice"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                />
              </div>

              {/* Action Buttons */}
              {canVerify && (
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-medium border border-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-sky-600/20 transition disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Confirming...' : 'Confirm & Mark Verified'}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceVerificationModal;
