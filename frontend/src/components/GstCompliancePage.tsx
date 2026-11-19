import React, { useState, useEffect } from 'react';
import {
  BadgeAlert,
  RefreshCw,
  AlertTriangle,
  FileText,
  Building2,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Invoice } from '../types/auth';
import ThreeWayMatchModal from './ThreeWayMatchModal';
import { formatCurrency } from '../utils/formatters';

export const GstCompliancePage: React.FC = () => {
  const { authFetch } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [totalItcAtRisk, setTotalItcAtRisk] = useState<number>(0);

  const fetchGstData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [invRes, riskRes] = await Promise.all([
        authFetch('/api/invoices'),
        authFetch('/api/risk/high')
      ]);

      const invData = await invRes.json();
      const riskData = await riskRes.json();

      if (invRes.ok && Array.isArray(invData.invoices)) {
        setInvoices(invData.invoices);
      }
      if (riskRes.ok && riskData.total_itc_at_risk_inr !== undefined) {
        setTotalItcAtRisk(Number(riskData.total_itc_at_risk_inr));
      }
    } catch (err: any) {
      console.error('Failed to load GST data:', err);
      setError(err.message || 'Failed to fetch GST compliance data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGstData();
  }, []);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Banner */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-950 border border-amber-800 rounded-xl text-amber-400">
              <BadgeAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                GST Compliance &amp; GSTR-2B Reconciliation
                <span className="text-[10px] bg-slate-800 text-amber-300 font-mono px-2 py-0.5 rounded border border-slate-700">
                  ITC Shield
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Automated 15-digit GSTIN checksum validation, intra- vs inter-state tax rate verification, and GSTR-2B purchase reconciliation.
              </p>
            </div>
          </div>

          <button
            onClick={fetchGstData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Reconciliation
          </button>
        </div>

        {/* GST KPI Cards */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-rose-900/60 rounded-xl p-4">
            <div className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">
              Total Input Tax Credit (ITC) At Risk
            </div>
            <div className="text-2xl font-bold font-mono text-rose-300 mt-1">
              ₹ {totalItcAtRisk.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-rose-400/80 mt-1">
              Inward invoices missing in government auto-drafted GSTR-2B
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Buyer Place of Supply Baseline
            </div>
            <div className="text-xl font-bold font-mono text-white mt-1">
              State 27 (Maharashtra)
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Intra-state (27): CGST+SGST | Inter-state: IGST 18%
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              GSTIN Checksum Standard
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
              Official Mod-36 Luhn
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Position 15 calculated against alphanumeric weights
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Invoices GST Compliance Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Inward Invoice Tax Verification Register ({invoices.length})
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            Click invoice to view comprehensive GST breakdown &amp; 3-way match
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400 font-mono">
            Loading GST records...
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            No invoices available for GST reconciliation.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Supplier &amp; GSTIN</th>
                  <th className="py-3 px-4 text-right">Taxable Subtotal</th>
                  <th className="py-3 px-4 text-right">CGST / SGST</th>
                  <th className="py-3 px-4 text-right">IGST</th>
                  <th className="py-3 px-4 text-center">GSTR-2B Status</th>
                  <th className="py-3 px-4 text-right">ITC at Risk</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300 text-xs font-mono">
                {invoices.map((inv) => {
                  const itcRisk = parseFloat(String(inv.itc_at_risk || 0));
                  const isMissingGstr2b = itcRisk > 0;

                  return (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedInvoiceId(inv.id)}
                      className="hover:bg-slate-900/40 transition cursor-pointer"
                    >
                      <td className="py-3.5 px-4 font-bold text-white flex items-center gap-1.5 font-sans">
                        <FileText className="w-3.5 h-3.5 text-sky-400" />
                        <span>{inv.invoice_number}</span>
                      </td>

                      <td className="py-3.5 px-4 font-sans">
                        <div className="text-slate-200 font-medium flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>{inv.supplier_name || 'N/A'}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {inv.supplier_gstin || 'No GSTIN'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
                        ₹ {formatCurrency(inv.subtotal || 0)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                        ₹ {formatCurrency(Number(inv.cgst || 0) + Number(inv.sgst || 0))}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                        ₹ {formatCurrency(inv.igst || 0)}
                      </td>

                      <td className="py-3.5 px-4 text-center font-sans">
                        {isMissingGstr2b ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-300 bg-rose-950/80 border border-rose-800 px-2 py-0.5 rounded-full">
                            Missing in 2B
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded-full">
                            Reconciled
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold">
                        {itcRisk > 0 ? (
                          <span className="text-rose-400">₹ {formatCurrency(itcRisk)}</span>
                        ) : (
                          <span className="text-emerald-400">₹ 0.00</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-sans">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedInvoiceId(inv.id);
                          }}
                          className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 text-xs font-semibold"
                        >
                          <span>Inspect</span>
                          <ExternalLink className="w-3 h-3" />
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

      {selectedInvoiceId && (
        <ThreeWayMatchModal
          invoiceId={selectedInvoiceId}
          onClose={() => {
            setSelectedInvoiceId(null);
            fetchGstData();
          }}
          onMatchUpdated={fetchGstData}
        />
      )}
    </div>
  );
};

export default GstCompliancePage;
