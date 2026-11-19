import React, { useState, useEffect } from 'react';
import {
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  User as UserIcon,
  MessageSquare,
  RefreshCw,
  Send,
  Eye,
  Check,
  Lock
} from 'lucide-react';
import { Investigation, User } from '../types/auth';
import { safeArray, formatDateTime, safeJsonParse } from '../utils/formatters';

interface InvestigationCenterPageProps {
  currentUser: User | null;
  onOpenInvoice?: (invoiceNumber: string) => void;
}

export const InvestigationCenterPage: React.FC<InvestigationCenterPageProps> = ({
  currentUser,
  onOpenInvoice
}) => {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvestigation, setSelectedInvestigation] = useState<Investigation | null>(null);
  const [newComment, setNewComment] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchInvestigations = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/investigations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInvestigations(data.investigations || []);
        if (selectedInvestigation) {
          const updated = (data.investigations || []).find((i: Investigation) => i.id === selectedInvestigation.id);
          if (updated) setSelectedInvestigation(updated);
        }
      }
    } catch (err) {
      console.error('Failed to load investigations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvestigations();
  }, []);

  const handleUpdateStatus = async (status: string, notes?: string) => {
    if (!selectedInvestigation) return;
    try {
      setActionLoading(true);
      setActionMessage(null);
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/investigations/${selectedInvestigation.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status,
          comment: notes || (status === 'IN_PROGRESS' ? 'Investigation started by department lead' : 'Status update'),
          resolution_notes: notes
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update investigation');
      }

      setActionMessage({
        text: `Status updated to ${data.investigation.status}. ${
          data.revalidation ? `Revalidation verdict: ${data.revalidation.passed ? 'PASSED (Issue cleared)' : 'PERSISTS (Reopened)'}` : ''
        }`,
        type: data.revalidation && !data.revalidation.passed ? 'error' : 'success'
      });

      setResolutionNotes('');
      fetchInvestigations();
    } catch (err: any) {
      setActionMessage({ text: err.message, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvestigation || !newComment.trim()) return;

    try {
      setActionLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/investigations/${selectedInvestigation.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ comment: newComment.trim() })
      });

      if (res.ok) {
        setNewComment('');
        fetchInvestigations();
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Filter investigations
  const filtered = investigations.filter((inv) => {
    if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
    if (departmentFilter !== 'ALL' && inv.department !== departmentFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchInv = inv.invoice_number?.toLowerCase().includes(q);
      const matchTitle = inv.title.toLowerCase().includes(q);
      const matchSup = inv.supplier_name?.toLowerCase().includes(q);
      if (!matchInv && !matchTitle && !matchSup) return false;
    }
    return true;
  });

  const canUserUpdate = (inv: Investigation): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'Finance Manager' || currentUser.role === 'Admin') return true;
    if (currentUser.role === 'Warehouse Employee' && inv.department === 'Warehouse') return true;
    if (currentUser.role === 'Procurement Employee' && inv.department === 'Procurement/Finance') return true;
    if (currentUser.role === 'AP Employee' && inv.department === 'AP/Finance') return true;
    return false;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Investigation Center</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Department Workflow
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Track flagged risks, collaborate across departments, and trigger automatic revalidation
          </p>
        </div>

        <button
          onClick={fetchInvestigations}
          disabled={loading}
          className="self-start md:self-auto inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by invoice, title..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Statuses ({investigations.length})</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="REVALIDATED">Revalidated (Cleared)</option>
            <option value="REOPENED">Reopened (Persistent)</option>
          </select>
        </div>

        <div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Departments</option>
            <option value="Warehouse">Warehouse</option>
            <option value="Procurement/Finance">Procurement / Finance</option>
            <option value="AP/Finance">AP / Finance</option>
            <option value="Finance/Compliance">Finance / Compliance</option>
          </select>
        </div>

        <div className="text-right flex items-center justify-end text-xs text-slate-400">
          Showing <span className="font-semibold text-white mx-1">{filtered.length}</span> of {investigations.length} items
        </div>
      </div>

      {/* Investigations Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Issue & Investigation Title</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Assigned To</th>
                <th className="py-3 px-4">Invoice Ref</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No investigations match your filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => setSelectedInvestigation(inv)}
                    className="hover:bg-slate-800/40 cursor-pointer transition duration-150"
                  >
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          inv.severity === 'HIGH'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : inv.severity === 'MEDIUM'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {inv.severity}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{inv.title}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">{inv.issue_type}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700/80">
                        {inv.department}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-1.5 text-slate-300">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate max-w-[130px]">{inv.assigned_user_name || 'Unassigned'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-indigo-400 font-semibold">{inv.invoice_number || 'N/A'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          inv.status === 'REVALIDATED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : inv.status === 'RESOLVED'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : inv.status === 'IN_PROGRESS'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : inv.status === 'REOPENED'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {inv.status === 'REVALIDATED' && <CheckCircle2 className="w-3 h-3" />}
                        {inv.status === 'REOPENED' && <AlertTriangle className="w-3 h-3" />}
                        {inv.status === 'IN_PROGRESS' && <Clock className="w-3 h-3" />}
                        <span>{inv.status}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedInvestigation(inv);
                        }}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium transition"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Investigation Detail Modal / Drawer */}
      {selectedInvestigation && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60 sticky top-0 z-10">
              <div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      selectedInvestigation.severity === 'HIGH'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {selectedInvestigation.severity} PRIORITY
                  </span>
                  <span className="font-mono text-xs text-indigo-400">{selectedInvestigation.issue_type}</span>
                </div>
                <h2 className="text-lg font-bold text-white mt-1">{selectedInvestigation.title}</h2>
              </div>
              <button
                onClick={() => setSelectedInvestigation(null)}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left Column (2 cols) */}
              <div className="md:col-span-2 space-y-5">
                {/* Status Notice */}
                {actionMessage && (
                  <div
                    className={`p-3 rounded-lg text-xs font-medium ${
                      actionMessage.type === 'success'
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950/80 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {actionMessage.text}
                  </div>
                )}

                {/* Description */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Issue Description
                  </h4>
                  <p className="text-sm text-slate-200 bg-slate-950 p-3.5 rounded-xl border border-slate-800 leading-relaxed">
                    {selectedInvestigation.description}
                  </p>
                </div>

                {/* Evidence Inspector */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Database Evidence Breakdown</span>
                  </h4>
                  <div className="bg-slate-950 rounded-xl p-3.5 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto max-h-56">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(safeJsonParse(selectedInvestigation.evidence, {}), null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Revalidation Status Banner */}
                {selectedInvestigation.revalidation_result && (
                  <div
                    className={`p-4 rounded-xl border ${
                      selectedInvestigation.revalidation_result.passed
                        ? 'bg-emerald-950/30 border-emerald-800/80 text-emerald-200'
                        : 'bg-rose-950/30 border-rose-800/80 text-rose-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2 font-semibold text-xs mb-1">
                      {selectedInvestigation.revalidation_result.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                      )}
                      <span>
                        Revalidation Result: {selectedInvestigation.revalidation_result.passed ? 'PASSED' : 'FAILED'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">{selectedInvestigation.revalidation_result.reason}</p>
                    <div className="text-[10px] text-slate-400 mt-2 font-mono">
                      Validated at: {formatDateTime(selectedInvestigation.revalidation_result.revalidated_at)}
                    </div>
                  </div>
                )}

                {/* Comments / Audit Trail Thread */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Department Activity & Comments</span>
                  </h4>
                  <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                    {safeArray(selectedInvestigation.comments).map((comm) => (
                      <div key={comm.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                          <span className="font-semibold text-slate-200">
                            {comm.user_name || 'System User'} ({comm.user_role || 'Staff'})
                          </span>
                          <span>{formatDateTime(comm.created_at)}</span>
                        </div>
                        <p className="text-slate-300">{comm.text}</p>
                      </div>
                    ))}
                  </div>

                  {/* Add Comment Input */}
                  <form onSubmit={handleAddComment} className="mt-3 flex items-center space-x-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add an internal note or audit observation..."
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={actionLoading || !newComment.trim()}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center space-x-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>Post</span>
                    </button>
                  </form>
                </div>
              </div>

              {/* Right Column (1 col): Metadata & Resolution Actions */}
              <div className="space-y-5 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Assignment Metadata
                  </h4>
                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Assigned Department:</span>
                      <span className="font-semibold text-slate-200">{selectedInvestigation.department}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Assigned Specialist:</span>
                      <span className="font-semibold text-slate-200">
                        {selectedInvestigation.assigned_user_name || 'Unassigned'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Associated Invoice:</span>
                      <button
                        onClick={() => {
                          if (selectedInvestigation.invoice_number && onOpenInvoice) {
                            onOpenInvoice(selectedInvestigation.invoice_number);
                          }
                        }}
                        className="font-mono text-indigo-400 font-bold hover:underline"
                      >
                        {selectedInvestigation.invoice_number || 'None'}
                      </button>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Current Status:</span>
                      <span className="font-bold text-white uppercase">{selectedInvestigation.status}</span>
                    </div>
                  </div>
                </div>

                <hr className="border-slate-800" />

                {/* Resolution Workflow Actions */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
                    Resolution Actions
                  </h4>

                  {!canUserUpdate(selectedInvestigation) ? (
                    <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-lg text-[11px] text-amber-300 flex items-start space-x-2">
                      <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        RBAC Restricted: Your role ({currentUser?.role}) cannot resolve investigations assigned to{' '}
                        <strong>{selectedInvestigation.department}</strong>.
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedInvestigation.status === 'OPEN' && (
                        <button
                          onClick={() => handleUpdateStatus('IN_PROGRESS')}
                          disabled={actionLoading}
                          className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
                        >
                          Mark as IN_PROGRESS
                        </button>
                      )}

                      {(selectedInvestigation.status === 'OPEN' ||
                        selectedInvestigation.status === 'IN_PROGRESS' ||
                        selectedInvestigation.status === 'REOPENED') && (
                        <div className="space-y-2">
                          <textarea
                            value={resolutionNotes}
                            onChange={(e) => setResolutionNotes(e.target.value)}
                            placeholder="Enter resolution notes (e.g. Added corrected GRN-102 of 20 kg)..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                            rows={3}
                          />
                          <button
                            onClick={() => handleUpdateStatus('RESOLVED', resolutionNotes)}
                            disabled={actionLoading}
                            className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm transition"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Mark RESOLVED & Revalidate</span>
                          </button>
                        </div>
                      )}

                      {selectedInvestigation.status === 'REVALIDATED' && (
                        <div className="p-3 bg-emerald-950/30 border border-emerald-800/60 rounded-lg text-xs text-emerald-300">
                          ✓ Issue has been successfully revalidated by the automated matching pipeline.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
