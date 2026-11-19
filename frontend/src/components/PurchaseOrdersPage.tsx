import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Edit3,
  X,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PurchaseOrder } from '../types/auth';

export const PurchaseOrdersPage: React.FC = () => {
  const { authFetch, user } = useAuth();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPoDetails, setSelectedPoDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Price Modification Modal State
  const [isPriceModalOpen, setIsPriceModalOpen] = useState<boolean>(false);
  const [newUnitPrice, setNewUnitPrice] = useState<string>('');
  const [changeReason, setChangeReason] = useState<string>('Vendor cost renegotiation');
  const [submittingPrice, setSubmittingPrice] = useState<boolean>(false);
  const [priceModalError, setPriceModalError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const canRequestPriceChange =
    user?.role === 'Procurement Employee' || user?.role === 'Admin';

  const fetchPOs = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/purchase-orders');
      const data = await res.json();
      if (res.ok) {
        setPurchaseOrders(data.purchaseOrders || []);
        if (data.purchaseOrders?.length > 0) {
          fetchPoDetails(data.purchaseOrders[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load purchase orders', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPoDetails = async (id: string) => {
    try {
      const res = await authFetch(`/api/purchase-orders/${id}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedPoDetails(data.purchaseOrder);
      }
    } catch (err) {
      console.error('Failed to load PO details', err);
    }
  };

  useEffect(() => {
    fetchPOs();
  }, []);

  const handleOpenPriceModal = () => {
    if (!selectedPoDetails) return;
    const currentPrice = selectedPoDetails.lines?.[0]?.unit_price || '500';
    setNewUnitPrice(String(Number(currentPrice) + 200));
    setChangeReason('Vendor raw material cost renegotiation');
    setPriceModalError(null);
    setIsPriceModalOpen(true);
  };

  const handleSubmitPriceChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPoDetails || !newUnitPrice || Number(newUnitPrice) <= 0) {
      setPriceModalError('Please enter a valid positive unit price.');
      return;
    }

    setSubmittingPrice(true);
    setPriceModalError(null);

    try {
      const res = await authFetch(`/api/purchase-orders/${selectedPoDetails.id}/price`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newUnitPrice: Number(newUnitPrice),
          reason: changeReason
        })
      });

      const data = await res.json();
      if (res.ok || res.status === 202) {
        setIsPriceModalOpen(false);
        setActionSuccessMessage(
          `Price modification request submitted under Maker-Checker governance. Status is PENDING Finance Manager approval.`
        );
        await fetchPoDetails(selectedPoDetails.id);
        setTimeout(() => setActionSuccessMessage(null), 7000);
      } else {
        setPriceModalError(data.message || 'Failed to submit price change request.');
      }
    } catch (err: any) {
      setPriceModalError(err.message || 'Error communicating with backend.');
    } finally {
      setSubmittingPrice(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-amber-400" />
            Purchase Orders &amp; Change Audit
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Tracks baseline price, quantity, and every modification record under Maker-Checker oversight.
          </p>
        </div>
        <button
          onClick={fetchPOs}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Success Notification Banner */}
      {actionSuccessMessage && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
          <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: PO List */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2">
            Registered Orders ({purchaseOrders.length})
          </div>

          {loading ? (
            <div className="text-xs text-slate-500 p-4">Loading purchase orders...</div>
          ) : (
            <div className="space-y-2">
              {purchaseOrders.map((po) => {
                const isSelected = selectedPoDetails?.id === po.id;
                return (
                  <button
                    key={po.id}
                    onClick={() => fetchPoDetails(po.id)}
                    className={`w-full text-left p-3 rounded-xl border transition ${
                      isSelected
                        ? 'bg-sky-950/60 border-sky-600 text-white'
                        : 'bg-slate-900 border-slate-800/80 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-sky-400">{po.po_number}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                        {po.status}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-slate-200 mt-1">{po.supplier_name}</div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                      <span>Total: Rs {Number(po.total_amount).toLocaleString('en-IN')}</span>
                      <span>{new Date(po.order_date).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: PO Detail & Change History */}
        <div className="lg:col-span-2 space-y-6">
          {selectedPoDetails ? (
            <>
              {/* Overview Card */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      {selectedPoDetails.po_number} Details
                    </h3>
                    <p className="text-xs text-slate-400">
                      Supplier: <strong className="text-slate-200">{selectedPoDetails.supplier_name}</strong> &bull; GSTIN: {selectedPoDetails.supplier_gstin}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400">Total Authorized Amount</div>
                      <div className="text-base font-bold text-emerald-400">
                        Rs {Number(selectedPoDetails.total_amount).toLocaleString('en-IN')}
                      </div>
                    </div>
                    {canRequestPriceChange && (
                      <button
                        onClick={handleOpenPriceModal}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow"
                        title="Propose unit price modification under Maker-Checker governance"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Modify Price
                      </button>
                    )}
                  </div>
                </div>

                {/* Line Items */}
                <div className="mt-4">
                  <div className="text-xs font-semibold text-slate-300 mb-2">Order Line Items</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase">
                        <tr>
                          <th className="p-2">Item Description</th>
                          <th className="p-2">Quantity</th>
                          <th className="p-2">Unit Price</th>
                          <th className="p-2 text-right">Total Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {selectedPoDetails.lines?.map((line: any) => (
                          <tr key={line.id}>
                            <td className="p-2 font-medium">{line.item_name}</td>
                            <td className="p-2 font-mono">{line.quantity}</td>
                            <td className="p-2 font-mono">Rs {line.unit_price}</td>
                            <td className="p-2 text-right font-mono font-bold text-white">Rs {line.total_price}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* PO Change History Audit Card */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-amber-400" />
                    Modification Audit Trail (po_change_history)
                  </h3>
                  <span className="text-[10px] text-amber-400 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded">
                    Unapproved changes flagged for risk
                  </span>
                </div>

                {selectedPoDetails.changeHistory?.length === 0 ? (
                  <div className="text-xs text-slate-500 py-3">No recorded modifications for this order.</div>
                ) : (
                  <div className="space-y-3 mt-3">
                    {selectedPoDetails.changeHistory?.map((hist: any) => {
                      const isUnapproved = !hist.approval_id;
                      return (
                        <div
                          key={hist.id}
                          className={`p-3 rounded-xl border text-xs ${
                            isUnapproved
                              ? 'bg-amber-950/40 border-amber-800/80 text-amber-200'
                              : 'bg-slate-900 border-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white">
                              Field Modified: <code className="text-sky-400 font-mono">{hist.field}</code>
                            </span>
                            {isUnapproved ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-900/60 border border-amber-700 px-2 py-0.5 rounded-full">
                                <AlertTriangle className="w-3 h-3 text-amber-400" />
                                UNAUTHORIZED MODIFICATION
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                APPROVED ({hist.approval_status})
                              </span>
                            )}
                          </div>
                          <div className="mt-2 text-xs flex items-center gap-4">
                            <div>
                              Old: <span className="line-through text-rose-400 font-mono">Rs {hist.old_value}</span>
                            </div>
                            <div>&rarr;</div>
                            <div>
                              New: <span className="font-bold text-emerald-400 font-mono">Rs {hist.new_value}</span>
                            </div>
                          </div>
                          <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-1.5">
                            <span>Modified by: <strong className="text-slate-300">{hist.changed_by_name || hist.changed_by}</strong></span>
                            <span>{new Date(hist.changed_at).toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500 bg-slate-950 border border-slate-800 rounded-2xl">
              Select a purchase order to view details.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Request PO Price Change */}
      {isPriceModalOpen && selectedPoDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">
                  Propose Price Modification: {selectedPoDetails.po_number}
                </h3>
              </div>
              <button
                onClick={() => setIsPriceModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitPriceChange} className="p-4 space-y-4 text-xs">
              {priceModalError && (
                <div className="p-2.5 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{priceModalError}</span>
                </div>
              )}

              <div className="p-3 bg-sky-950/40 border border-sky-800/60 rounded-xl space-y-1">
                <div className="text-[11px] font-semibold text-sky-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Maker-Checker Governance Notice
                </div>
                <p className="text-[10px] text-slate-300 leading-relaxed">
                  Price changes do not take effect immediately. Submitting this form creates an approval request.
                  A separate <strong>Finance Manager</strong> must review and approve before the baseline contract price is updated.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Item Description
                </label>
                <input
                  type="text"
                  disabled
                  value={selectedPoDetails.lines?.[0]?.item_name || 'Teak Wood 100kg'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-400 font-medium cursor-not-allowed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Current Approved Price
                  </label>
                  <input
                    type="text"
                    disabled
                    value={`Rs ${selectedPoDetails.lines?.[0]?.unit_price || '500'}`}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-400 font-mono cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                    Proposed New Price (Rs) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={newUnitPrice}
                    onChange={(e) => setNewUnitPrice(e.target.value)}
                    placeholder="e.g. 700"
                    className="w-full bg-slate-950 border border-amber-600/60 rounded-lg px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-amber-400"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Business Justification / Renegotiation Reason *
                </label>
                <textarea
                  rows={2}
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="Explain why the contract price was renegotiated..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPriceModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPrice}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold shadow-md transition disabled:opacity-50"
                >
                  {submittingPrice ? 'Submitting...' : 'Submit Modification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrdersPage;
