import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Send,
  User,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Approval } from '../types/auth';

export const ApprovalsPage: React.FC = () => {
  const { user, authFetch } = useAuth();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // New PO price change test form state
  const [poNumber, setPoNumber] = useState('PO-101');
  const [newPrice, setNewPrice] = useState('750.00');
  const [changeReason, setChangeReason] = useState('Testing maker-checker workflow');
  const [submittingPoChange, setSubmittingPoChange] = useState(false);

  const fetchApprovals = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await authFetch('/api/approvals');
      const data = await res.json();
      if (res.ok) {
        setApprovals(data.approvals || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch approvals', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const handleApprove = async (approval: Approval) => {
    setActionError(null);
    setActionSuccess(null);
    setActioningId(approval.id);

    try {
      const res = await authFetch(`/api/approvals/${approval.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Approved via FINSHIELD GUARD dashboard' })
      });

      const data = await res.json();
      if (res.ok) {
        setActionSuccess(`Approval granted for ${approval.entity_type} (#${approval.entity_id})`);
        fetchApprovals();
      } else {
        setActionError(data.message || 'Approval rejected by authorization policy');
      }
    } catch (err: any) {
      setActionError(err.message || 'Action failed');
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (approval: Approval) => {
    const reason = prompt('Please enter rejection reason:', 'Discrepancy exceeds authorized budget threshold');
    if (!reason) return;

    setActionError(null);
    setActionSuccess(null);
    setActioningId(approval.id);

    try {
      const res = await authFetch(`/api/approvals/${approval.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });

      const data = await res.json();
      if (res.ok) {
        setActionSuccess(`Approval rejected for ${approval.entity_type} (#${approval.entity_id})`);
        fetchApprovals();
      } else {
        setActionError(data.message || 'Rejection failed');
      }
    } catch (err: any) {
      setActionError(err.message || 'Action failed');
    } finally {
      setActioningId(null);
    }
  };

  const handleSubmitPoPriceChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);
    setSubmittingPoChange(true);

    try {
      const res = await authFetch(`/api/purchase-orders/${poNumber}/price`, {
        method: 'PUT',
        body: JSON.stringify({
          newUnitPrice: parseFloat(newPrice),
          reason: changeReason
        })
      });

      const data = await res.json();
      if (res.ok || res.status === 202) {
        setActionSuccess(`Price change request submitted under Maker-Checker controls! Approval ID: ${data.approval?.id || 'Created'}`);
        fetchApprovals();
      } else {
        setActionError(data.message || 'Failed to submit price change request.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Submission failed');
    } finally {
      setSubmittingPoChange(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-sky-400" />
            Maker-Checker Approval Queue
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Golden Rule 2 &amp; 8: Maker cannot approve own request. High-risk price modifications require Finance Manager sign-off.
          </p>
        </div>
        <button
          onClick={fetchApprovals}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Queue
        </button>
      </div>

      {/* Maker-Checker Alert / Action Notifications */}
      {actionError && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs shadow-lg flex items-start gap-3 animate-shake">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold block text-sm text-rose-300 mb-0.5">
              Authorization / Maker-Checker Policy Blocked:
            </strong>
            <span>{actionError}</span>
          </div>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs shadow-lg flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Interactive Trigger: Propose PO Price Change */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Send className="w-4 h-4 text-amber-400" />
            Propose PO Price Change (Test Maker-Checker)
          </h3>
          <span className="text-[10px] text-slate-400">
            Allowed Roles: <code className="text-amber-400">Procurement Employee</code>, <code className="text-slate-300">Admin</code>
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Submitting a price change creates a pending approval and audit record. The requester is permanently blocked from approving their own request.
        </p>
        <form onSubmit={handleSubmitPoPriceChange} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Target PO Number</label>
            <input
              type="text"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">New Unit Price (Rs)</label>
            <input
              type="number"
              step="0.01"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Justification Reason</label>
            <input
              type="text"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submittingPoChange}
              className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg transition disabled:opacity-50"
            >
              {submittingPoChange ? 'Submitting...' : 'Submit Price Change'}
            </button>
          </div>
        </form>
      </div>

      {/* Approvals Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">
            Pending &amp; Finalized Requests ({approvals.length})
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            Maker ≠ Checker Enforced
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading approval queue...</div>
        ) : approvals.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No approval requests currently in queue.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Entity Type</th>
                  <th className="py-3 px-4">Requester (Maker)</th>
                  <th className="py-3 px-4">Details / Payload</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions (Checker)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {approvals.map((app) => {
                  const isPending = app.status === 'PENDING';
                  const isRequester = user?.id === app.requested_by;
                  const payload = typeof app.payload === 'string' ? JSON.parse(app.payload) : app.payload;

                  return (
                    <tr key={app.id} className="hover:bg-slate-900/50 transition">
                      <td className="py-3 px-4 font-mono font-medium text-slate-200">
                        {app.entity_type}
                        <div className="text-[10px] text-slate-500">{app.entity_id}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-medium text-white">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {app.requester_name || app.requested_by}
                          {isRequester && (
                            <span className="text-[9px] bg-sky-950 text-sky-400 border border-sky-800 px-1 rounded">You</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">{app.requester_role}</div>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        {payload?.old_unit_price !== undefined ? (
                          <div className="space-y-0.5">
                            <div>
                              Price: <span className="line-through text-rose-400">Rs {payload.old_unit_price}</span> &rarr;{' '}
                              <span className="text-emerald-400 font-bold">Rs {payload.new_unit_price}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 italic truncate">
                              &quot;{payload.reason || app.notes}&quot;
                            </div>
                          </div>
                        ) : (
                          <pre className="text-[10px] font-mono text-slate-400 truncate">
                            {JSON.stringify(payload)}
                          </pre>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {app.status === 'PENDING' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3" /> PENDING
                          </span>
                        ) : app.status === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> APPROVED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400 bg-rose-950/60 border border-rose-800 px-2 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" /> REJECTED
                          </span>
                        )}
                        {app.approver_name && (
                          <div className="text-[9px] text-slate-500 mt-0.5">By: {app.approver_name}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {new Date(app.requested_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isPending ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => handleApprove(app)}
                              disabled={actioningId === app.id}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                                isRequester
                                  ? 'bg-slate-800 text-slate-400 hover:bg-slate-700 cursor-not-allowed border border-slate-700'
                                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/20'
                              }`}
                              title={isRequester ? 'You cannot approve your own request (Maker-Checker violation)' : 'Approve'}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(app)}
                              disabled={actioningId === app.id}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                                isRequester
                                  ? 'bg-slate-800 text-slate-400 hover:bg-slate-700 cursor-not-allowed border border-slate-700'
                                  : 'bg-rose-900/80 hover:bg-rose-800 text-rose-200 border border-rose-700'
                              }`}
                              title={isRequester ? 'You cannot action your own request' : 'Reject'}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-mono">Finalized</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApprovalsPage;
