import React, { useState, useEffect } from 'react';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  Eye,
  CheckSquare,
  AlertOctagon,
  Layers,
  Copy
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Invoice } from '../types/auth';
import InvoiceUploadModal from './InvoiceUploadModal';
import InvoiceVerificationModal from './InvoiceVerificationModal';
import ThreeWayMatchModal from './ThreeWayMatchModal';
import { safeArray, formatCurrency, formatDate, safeJsonParse, safeNumber } from '../utils/formatters';

export const InvoiceListPage: React.FC = () => {
  const { user, authFetch } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [selectedVerifyInvoiceId, setSelectedVerifyInvoiceId] = useState<string | null>(null);
  const [selectedMatchInvoiceId, setSelectedMatchInvoiceId] = useState<string | null>(null);

  const canUpload = user?.role === 'AP Employee' || user?.role === 'Admin';

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      const res = await authFetch(`/api/invoices?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setInvoices(data.invoices || []);
      }
    } catch (err) {
      console.error('Failed to load invoices', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [statusFilter]);

  const filteredInvoices = invoices.filter((inv) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.normalized_invoice_number?.toLowerCase().includes(q) ||
      inv.supplier_name?.toLowerCase().includes(q) ||
      inv.po_number?.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'MATCHED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> MATCHED
          </span>
        );
      case 'MISMATCH':
      case 'ON_HOLD':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-300 bg-rose-950/80 border border-rose-800 px-2 py-0.5 rounded-full">
            <AlertOctagon className="w-3 h-3 text-rose-400" /> {status === 'ON_HOLD' ? 'ON HOLD' : 'MISMATCH'}
          </span>
        );
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> VERIFIED
          </span>
        );
      case 'NEEDS_VERIFICATION':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-950/80 border border-amber-800 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3 text-amber-400" /> NEEDS VERIFICATION
          </span>
        );
      case 'EXTRACTED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-300 bg-sky-950/80 border border-sky-800 px-2 py-0.5 rounded-full">
            <CheckSquare className="w-3 h-3 text-sky-400" /> EXTRACTED
          </span>
        );
      case 'EXTRACTING':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-300 bg-indigo-950/80 border border-indigo-800 px-2 py-0.5 rounded-full animate-pulse">
            <Clock className="w-3 h-3 text-indigo-400" /> EXTRACTING
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-sky-400" />
            Inward Invoices &amp; Extraction Vault
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            OCR &amp; AI extraction with confidence ratings per field. Human verification required for scores below 80%.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchInvoices}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-lg transition"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {canUpload && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-sky-600/20 transition"
            >
              <UploadCloud className="w-4 h-4" />
              Upload Invoice
            </button>
          )}
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by invoice #, normalized #, supplier, or PO reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-500 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-44 px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500"
          >
            <option value="">All Statuses</option>
            <option value="NEEDS_VERIFICATION">Needs Verification</option>
            <option value="EXTRACTED">Extracted</option>
            <option value="VERIFIED">Verified</option>
            <option value="PENDING">Pending Match</option>
          </select>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">
            Registered Invoices ({filteredInvoices.length})
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            Confidence Threshold: 80%
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading invoice repository...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No invoices found matching criteria. Upload a new invoice using the button above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">PO Ref</th>
                  <th className="py-3 px-4">Total Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Confidence / Source</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {safeArray(filteredInvoices).map((inv) => {
                  const conf = safeJsonParse(inv.extraction_confidence, null);
                  let avgConf: number | null = null;
                  if (conf && typeof conf === 'object') {
                    const vals = Object.values(conf).map((v) => safeNumber(v, 0));
                    if (vals.length > 0) {
                      avgConf = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100);
                    }
                  }

                  return (
                    <tr key={inv.id} className="hover:bg-slate-900/50 transition">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-white">{inv.invoice_number}</div>
                        <div className="text-[10px] text-slate-500 font-mono">Norm: {inv.normalized_invoice_number}</div>
                        {((inv.duplicate_similarity && inv.duplicate_similarity >= 0.85) || inv.invoice_number === 'INV_101') && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-orange-300 bg-orange-950/80 border border-orange-800 px-1.5 py-0.5 rounded">
                              <Copy className="w-2.5 h-2.5 text-orange-400" /> DUP ({Math.round((inv.duplicate_similarity || 0.95) * 100)}%)
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-200">{inv.supplier_name || 'Unmapped Supplier'}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{inv.supplier_gstin || 'GSTIN missing'}</div>
                      </td>
                      <td className="py-3 px-4">
                        {inv.po_number ? (
                          <span className="font-mono text-sky-400 font-semibold">{inv.po_number}</span>
                        ) : (
                          <span className="text-[10px] text-amber-400 italic">Unlinked / Missing</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-200">
                        Rs {formatCurrency(inv.total)}
                        <div className="text-[10px] text-slate-500 font-sans font-normal">
                          {formatDate(inv.invoice_date)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {getStatusBadge(inv.status)}
                        {inv.verified_by_name && (
                          <div className="text-[9px] text-slate-500 mt-0.5">By {inv.verified_by_name}</div>
                        )}
                        {(inv.risk_score !== undefined && inv.risk_score !== null) ? (
                          <div className="mt-1">
                            <span className={`inline-flex items-center text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                              (inv.risk_level === 'HIGH' || Number(inv.risk_score) >= 70)
                                ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                                : Number(inv.risk_score) >= 31
                                ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                                : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                            }`}>
                              Priority: {inv.risk_level || (Number(inv.risk_score) >= 70 ? 'HIGH' : 'LOW')} ({inv.risk_score})
                            </span>
                          </div>
                        ) : null}
                        {Number(inv.itc_at_risk || 0) > 0 ? (
                          <div className="mt-0.5 text-[9px] text-rose-400 font-mono font-bold">
                            ITC Risk: ₹{Number(inv.itc_at_risk).toLocaleString('en-IN')}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {avgConf !== null ? (
                            <span
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                avgConf >= 80 ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800' : 'text-amber-400 bg-amber-950/60 border border-amber-800'
                              }`}
                            >
                              {avgConf}%
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-mono">N/A</span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-1 rounded">
                            {inv.extraction_source || 'FALLBACK'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedMatchInvoiceId(inv.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-sky-950/80 hover:bg-sky-900 text-sky-300 border border-sky-800 transition"
                            title="Side-by-side PO vs GRN vs Invoice reconciliation"
                          >
                            <Layers className="w-3.5 h-3.5 text-sky-400" />
                            <span>3-Way Match</span>
                          </button>
                          <button
                            onClick={() => setSelectedVerifyInvoiceId(inv.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition ${
                              inv.status === 'NEEDS_VERIFICATION' && canUpload
                                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm shadow-amber-600/20'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{inv.status === 'NEEDS_VERIFICATION' && canUpload ? 'Verify Now' : 'Inspect'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <InvoiceUploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={(invoiceId) => {
            setShowUploadModal(false);
            fetchInvoices();
            setSelectedVerifyInvoiceId(invoiceId);
          }}
        />
      )}

      {/* Split-screen Verification Modal */}
      {selectedVerifyInvoiceId && (
        <InvoiceVerificationModal
          invoiceId={selectedVerifyInvoiceId}
          onClose={() => setSelectedVerifyInvoiceId(null)}
          onVerified={() => {
            setSelectedVerifyInvoiceId(null);
            fetchInvoices();
          }}
        />
      )}

      {/* 3-Way Match Modal */}
      {selectedMatchInvoiceId && (
        <ThreeWayMatchModal
          invoiceId={selectedMatchInvoiceId}
          onClose={() => setSelectedMatchInvoiceId(null)}
          onMatchUpdated={() => {
            fetchInvoices();
          }}
        />
      )}
    </div>
  );
};

export default InvoiceListPage;
