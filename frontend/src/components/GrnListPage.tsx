import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Calendar,
  User,
  FileSpreadsheet,
  AlertCircle,
  PackageCheck,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PurchaseOrder } from '../types/auth';

interface GrnLine {
  id: string;
  grn_id: string;
  item_name: string;
  quantity_received: number;
}

interface Grn {
  id: string;
  grn_number: string;
  po_id: string;
  received_date: string;
  received_by?: string;
  created_at: string;
  lines: GrnLine[];
}

export const GrnListPage: React.FC = () => {
  const { authFetch, user } = useAuth();
  const [grns, setGrns] = useState<Grn[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Intake Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalPoId, setModalPoId] = useState<string>('');
  const [modalGrnNumber, setModalGrnNumber] = useState<string>('');
  const [modalReceivedDate, setModalReceivedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [modalItemName, setModalItemName] = useState<string>('Teak Wood 100kg');
  const [modalQuantity, setModalQuantity] = useState<number>(20);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const canRecordGrn = user?.role === 'Warehouse Employee' || user?.role === 'Admin';

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [grnRes, poRes] = await Promise.all([
        authFetch('/api/grns'),
        authFetch('/api/purchase-orders')
      ]);

      if (grnRes.ok) {
        const grnData = await grnRes.json();
        setGrns(grnData.grns || []);
      } else {
        const errData = await grnRes.json();
        setError(errData.message || 'Failed to load goods receipt notes');
      }

      if (poRes.ok) {
        const poData = await poRes.json();
        setPurchaseOrders(poData.purchaseOrders || []);
        if (poData.purchaseOrders?.length > 0 && !modalPoId) {
          setModalPoId(poData.purchaseOrders[0].id);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error loading GRNs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenModal = () => {
    setModalGrnNumber(`GRN-${Math.floor(100 + Math.random() * 900)}`);
    setModalReceivedDate(new Date().toISOString().split('T')[0]);
    if (purchaseOrders.length > 0) {
      setModalPoId(purchaseOrders[0].id);
    }
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleCreateGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalPoId || !modalGrnNumber.trim() || modalQuantity <= 0) {
      setModalError('Please fill all required fields with valid quantities.');
      return;
    }

    setSubmitting(true);
    setModalError(null);

    try {
      const res = await authFetch('/api/grns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          po_id: modalPoId,
          grn_number: modalGrnNumber.trim(),
          received_date: modalReceivedDate,
          items: [
            {
              item_name: modalItemName.trim() || 'Received Item',
              quantity_received: Number(modalQuantity)
            }
          ]
        })
      });

      const data = await res.json();
      if (res.ok) {
        setIsModalOpen(false);
        setSuccessBanner(`Goods Receipt Note ${modalGrnNumber} recorded successfully! Linked to PO.`);
        await fetchData();
        setTimeout(() => setSuccessBanner(null), 6000);
      } else {
        setModalError(data.message || 'Failed to record Goods Receipt Note.');
      }
    } catch (err: any) {
      setModalError(err.message || 'Error communicating with backend.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter GRNs by search
  const filteredGrns = grns.filter((grn) => {
    const q = searchQuery.toLowerCase();
    const po = purchaseOrders.find((p) => p.id === grn.po_id);
    const poNum = po?.po_number?.toLowerCase() || '';
    const grnNum = grn.grn_number?.toLowerCase() || '';
    const items = grn.lines?.map((l) => l.item_name.toLowerCase()).join(' ') || '';
    return grnNum.includes(q) || poNum.includes(q) || items.includes(q);
  });

  const totalReceivedQty = grns.reduce(
    (acc, grn) => acc + (grn.lines?.reduce((lAcc, l) => lAcc + Number(l.quantity_received), 0) || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Boxes className="w-5 h-5 text-amber-400" />
            Goods Receipt Notes (Warehouse Intake)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Physical receiving logs, multiple delivery tracking, and quantity reconciliation with Purchase Orders.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {canRecordGrn && (
            <button
              onClick={handleOpenModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md transition"
            >
              <Plus className="w-4 h-4" />
              Record Intake (GRN)
            </button>
          )}
        </div>
      </div>

      {/* Success Notification */}
      {successBanner && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total GRN Records</span>
            <div className="text-2xl font-bold font-mono text-white mt-1">{grns.length}</div>
            <span className="text-[10px] text-slate-500">Warehouse Deliveries</span>
          </div>
          <div className="p-3 bg-amber-950/60 border border-amber-800 rounded-xl text-amber-400">
            <Boxes className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Units Received</span>
            <div className="text-2xl font-bold font-mono text-white mt-1">{totalReceivedQty.toLocaleString()}</div>
            <span className="text-[10px] text-slate-500">Physical Stock Count</span>
          </div>
          <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl text-emerald-400">
            <PackageCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Linked Purchase Orders</span>
            <div className="text-2xl font-bold font-mono text-white mt-1">{purchaseOrders.length}</div>
            <span className="text-[10px] text-slate-500">Active Supply Contracts</span>
          </div>
          <div className="p-3 bg-sky-950/60 border border-sky-800 rounded-xl text-sky-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-500 ml-1" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter by GRN number, PO reference, or received item name..."
          className="bg-transparent border-none text-xs text-white placeholder-slate-500 focus:outline-none w-full"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-slate-300 text-xs">
            Clear
          </button>
        )}
      </div>

      {/* Main Content / Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400" />
            <p className="text-xs">Loading warehouse receiving logs...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-400 space-y-2">
            <AlertCircle className="w-6 h-6 mx-auto" />
            <p className="text-xs font-semibold">{error}</p>
          </div>
        ) : filteredGrns.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <Boxes className="w-8 h-8 mx-auto text-slate-600" />
            <div className="text-sm font-semibold text-slate-400">No Goods Receipt Notes Found</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery
                ? 'No records match your search filter.'
                : 'No delivery receipts have been logged in the warehouse register yet.'}
            </p>
            {canRecordGrn && (
              <button
                onClick={handleOpenModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Record First Intake
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                <tr>
                  <th className="py-3 px-4">GRN Number</th>
                  <th className="py-3 px-4">Linked PO</th>
                  <th className="py-3 px-4">Receipt Date</th>
                  <th className="py-3 px-4">Line Items Received</th>
                  <th className="py-3 px-4 text-right">Physical Total</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredGrns.map((grn) => {
                  const linkedPo = purchaseOrders.find((p) => p.id === grn.po_id);
                  const grnTotalUnits = grn.lines?.reduce(
                    (acc, l) => acc + Number(l.quantity_received),
                    0
                  ) || 0;

                  return (
                    <tr key={grn.id} className="hover:bg-slate-900/50 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-amber-400 text-sm">
                          {grn.grn_number}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3" />
                          Warehouse Gate 1
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {linkedPo ? (
                          <div>
                            <span className="font-mono font-semibold text-sky-400">
                              {linkedPo.po_number}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {linkedPo.supplier_name || 'Vendor Order'}
                            </div>
                          </div>
                        ) : (
                          <span className="font-mono text-slate-500">{grn.po_id}</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span>{grn.received_date || 'N/A'}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {grn.lines && grn.lines.length > 0 ? (
                            grn.lines.map((line, idx) => (
                              <div
                                key={line.id || idx}
                                className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md text-[11px] text-slate-200 mr-2"
                              >
                                <span>{line.item_name}</span>
                                <span className="font-mono font-bold text-amber-400">
                                  {Number(line.quantity_received).toLocaleString()} units
                                </span>
                              </div>
                            ))
                          ) : (
                            <span className="text-slate-500 italic">No line items</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white text-sm">
                        {grnTotalUnits.toLocaleString()} units
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> VERIFIED
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Record Goods Receipt Note */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Record Goods Receipt Note (GRN)</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGrn} className="p-4 space-y-4 text-xs">
              {modalError && (
                <div className="p-2.5 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Target Purchase Order *
                </label>
                <select
                  value={modalPoId}
                  onChange={(e) => setModalPoId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  required
                >
                  {purchaseOrders.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.po_number} ({po.supplier_name || 'Vendor'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    GRN Number *
                  </label>
                  <input
                    type="text"
                    value={modalGrnNumber}
                    onChange={(e) => setModalGrnNumber(e.target.value)}
                    placeholder="e.g. GRN-102"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Receipt Date *
                  </label>
                  <input
                    type="date"
                    value={modalReceivedDate}
                    onChange={(e) => setModalReceivedDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Item Description *
                </label>
                <input
                  type="text"
                  value={modalItemName}
                  onChange={(e) => setModalItemName(e.target.value)}
                  placeholder="e.g. Teak Wood 100kg"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Physical Quantity Received (Units/Kg) *
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={modalQuantity}
                  onChange={(e) => setModalQuantity(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Supports partial shipments. 3-way matching engine sums quantities across all GRNs for the PO.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold shadow-md transition disabled:opacity-50"
                >
                  {submitting ? 'Recording...' : 'Record Goods Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GrnListPage;
