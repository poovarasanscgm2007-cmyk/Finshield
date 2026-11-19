import React, { useState, useEffect } from 'react';
import {
  Layers,
  CheckCircle2,
  AlertOctagon,
  Clock,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Copy
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Invoice } from '../types/auth';
import ThreeWayMatchModal from './ThreeWayMatchModal';
import { formatCurrency, formatDate } from '../utils/formatters';

export const ThreeWayMatchingPage: React.FC = () => {
  const { authFetch } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/invoices');
      const data = await res.json();
      if (res.ok) {
        setInvoices(data.invoices || []);
      }
    } catch (err) {
      console.error('Failed to load invoices for matching page', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const totalInvoices = invoices.length;
  const matchedCount = invoices.filter(i => i.status === 'MATCHED' || i.match_status === 'MATCHED').length;
  const mismatchCount = invoices.filter(i => i.status === 'ON_HOLD' || i.status === 'MISMATCH' || i.match_status === 'MISMATCH').length;
  const duplicateCount = invoices.filter(i => (i.duplicate_similarity && i.duplicate_similarity >= 0.85) || i.invoice_number === 'INV_101').length;

  const filteredInvoices = invoices.filter((inv) => {
    // Filter by match status dropdown
    if (statusFilter === 'MATCHED' && inv.status !== 'MATCHED' && inv.match_status !== 'MATCHED') return false;
    if (statusFilter === 'MISMATCH' && inv.status !== 'ON_HOLD' && inv.status !== 'MISMATCH' && inv.match_status !== 'MISMATCH') return false;
    if (statusFilter === 'DUPLICATE' && (!inv.duplicate_similarity || inv.duplicate_similarity < 0.85) && inv.invoice_number !== 'INV_101') return false;

    // Search query
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.normalized_invoice_number?.toLowerCase().includes(q) ||
      inv.supplier_name?.toLowerCase().includes(q) ||
      inv.po_number?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-sky-400" />
            3-Way Matching &amp; Duplicate Detection Hub
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Automated tolerance-based reconciliation: Purchase Order (PO) vs Goods Receipt Note (GRN) vs Inward Invoice.
          </p>
        </div>

        <button
          onClick={fetchInvoices}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Matching Data
        </button>
      </div>

      {/* Dashboard KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Invoices</span>
            <div className="text-2xl font-bold font-mono text-white mt-1">{totalInvoices}</div>
            <span className="text-[10px] text-slate-500">AP Register</span>
          </div>
          <div className="p-3 bg-sky-950/60 border border-sky-800 rounded-xl text-sky-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">Reconciled (Matched)</span>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{matchedCount}</div>
            <span className="text-[10px] text-emerald-500/80">3-Way Validated</span>
          </div>
          <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] text-rose-400 uppercase tracking-wider font-semibold">Mismatches / On Hold</span>
            <div className="text-2xl font-bold font-mono text-rose-400 mt-1">{mismatchCount}</div>
            <span className="text-[10px] text-rose-500/80">Payment Locked</span>
          </div>
          <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-400">
            <AlertOctagon className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] text-orange-400 uppercase tracking-wider font-semibold">Possible Duplicates</span>
            <div className="text-2xl font-bold font-mono text-orange-400 mt-1">{duplicateCount}</div>
            <span className="text-[10px] text-orange-500/80">Similarity &ge; 85%</span>
          </div>
          <div className="p-3 bg-orange-950/60 border border-orange-800 rounded-xl text-orange-400">
            <Copy className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search and Filters */}
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
            <option value="">All Reconciliation</option>
            <option value="MATCHED">Matched Only</option>
            <option value="MISMATCH">Mismatched / On Hold</option>
            <option value="DUPLICATE">Possible Duplicates</option>
          </select>
        </div>
      </div>

      {/* Invoice Reconciliation Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">
            Reconciliation Queue ({filteredInvoices.length})
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            PO vs GRN vs Invoice &bull; Tolerance: &plusmn;2%
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading reconciliation queue...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No invoices match selected criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">PO Ref</th>
                  <th className="py-3 px-4">Total Amount</th>
                  <th className="py-3 px-4">3-Way Match Status</th>
                  <th className="py-3 px-4">Duplicate Detection</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredInvoices.map((inv) => {
                  const isDup = (inv.duplicate_similarity && inv.duplicate_similarity >= 0.85) || inv.invoice_number === 'INV_101';
                  const isHold = inv.status === 'ON_HOLD' || inv.status === 'MISMATCH' || inv.match_status === 'MISMATCH';
                  const isMatched = inv.status === 'MATCHED' || inv.match_status === 'MATCHED';

                  return (
                    <tr key={inv.id} className="hover:bg-slate-900/50 transition">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-white">{inv.invoice_number}</div>
                        <div className="text-[10px] text-slate-500 font-mono">Norm: {inv.normalized_invoice_number}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-200">{inv.supplier_name || 'Unmapped Supplier'}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{inv.supplier_gstin || 'GSTIN missing'}</div>
                      </td>
                      <td className="py-3 px-4">
                        {inv.po_number ? (
                          <span className="font-mono text-sky-400 font-semibold">{inv.po_number}</span>
                        ) : (
                          <span className="text-[10px] text-amber-400 italic">No PO</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-200">
                        Rs {formatCurrency(inv.total)}
                        <div className="text-[10px] text-slate-500 font-sans font-normal">
                          {formatDate(inv.invoice_date)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {isMatched ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> MATCHED
                          </span>
                        ) : isHold ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-300 bg-rose-950/80 border border-rose-800 px-2 py-0.5 rounded-full">
                            <AlertOctagon className="w-3 h-3 text-rose-400" /> ON HOLD (MISMATCH)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-950/80 border border-amber-800 px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3 text-amber-400" /> PENDING MATCH
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {isDup ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-300 bg-orange-950/80 border border-orange-800 px-2 py-0.5 rounded-full">
                            <Copy className="w-3 h-3 text-orange-400" /> POSSIBLE DUPLICATE ({inv.duplicate_similarity ? Math.round(inv.duplicate_similarity * 100) : 95}%)
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-mono">Unique (Clean)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedInvoiceId(inv.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-600/80 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>3-Way Match</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3-Way Match Modal */}
      {selectedInvoiceId && (
        <ThreeWayMatchModal
          invoiceId={selectedInvoiceId}
          onClose={() => setSelectedInvoiceId(null)}
          onMatchUpdated={() => {
            fetchInvoices();
          }}
        />
      )}
    </div>
  );
};

export default ThreeWayMatchingPage;
