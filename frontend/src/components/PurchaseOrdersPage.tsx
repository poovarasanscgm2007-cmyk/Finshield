import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Edit3
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PurchaseOrder } from '../types/auth';

export const PurchaseOrdersPage: React.FC = () => {
  const { authFetch } = useAuth();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPoDetails, setSelectedPoDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

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
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      {selectedPoDetails.po_number} Details
                    </h3>
                    <p className="text-xs text-slate-400">
                      Supplier: <strong className="text-slate-200">{selectedPoDetails.supplier_name}</strong> &bull; GSTIN: {selectedPoDetails.supplier_gstin}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Total Authorized Amount</div>
                    <div className="text-lg font-bold text-emerald-400">
                      Rs {Number(selectedPoDetails.total_amount).toLocaleString('en-IN')}
                    </div>
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
                                UNAPPROVED MODIFICATION
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
    </div>
  );
};

export default PurchaseOrdersPage;
