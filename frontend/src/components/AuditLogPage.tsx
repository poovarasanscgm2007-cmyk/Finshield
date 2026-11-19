import React, { useState, useEffect } from 'react';
import {
  ScrollText,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Search,
  Hash,
  User,
  Key
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuditEntry } from '../types/auth';

export const AuditLogPage: React.FC = () => {
  const { authFetch } = useAuth();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    totalEntries?: number;
    brokenAtId?: string;
    message?: string;
  } | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.append('action', actionFilter);
      if (entityFilter) params.append('entity', entityFilter);
      params.append('limit', '50');

      const res = await authFetch(`/api/audit-log?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setLogs(data.entries || []);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const res = await authFetch('/api/audit-log/verify');
      const data = await res.json();
      setVerificationResult(data);
    } catch (err: any) {
      setVerificationResult({
        valid: false,
        message: err.message || 'Verification network call failed'
      });
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, entityFilter]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-indigo-400" />
            FINSHIELD GUARD: Cryptographic Audit Log
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Golden Rule 5: Every sensitive event is immutably appended and cryptographically hash-chained via SHA-256. Table is write-only.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
          >
            <Key className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
            {verifying ? 'Verifying Chain...' : 'Verify Hash Chain'}
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Verification Result Banner */}
      {verificationResult && (
        <div
          className={`p-4 rounded-xl border shadow-xl flex items-start gap-3 transition ${
            verificationResult.valid
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
              : 'bg-rose-950/80 border-rose-800 text-rose-200'
          }`}
        >
          {verificationResult.valid ? (
            <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
          ) : (
            <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />
          )}
          <div>
            <div className="text-sm font-bold flex items-center gap-2">
              {verificationResult.valid ? 'Cryptographic Hash Chain Verified Intact' : 'CRITICAL: Cryptographic Tampering Detected!'}
            </div>
            <div className="text-xs mt-1 text-slate-300">
              {verificationResult.message}
            </div>
            {verificationResult.totalEntries !== undefined && (
              <div className="text-[10px] font-mono text-slate-400 mt-1">
                Verified: {verificationResult.totalEntries} sequential SHA-256 block links from Genesis block
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Filter by action (e.g. LOGIN_SUCCESS, PO_CHANGE_REQUESTED)..."
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="w-full sm:w-48">
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Entities</option>
            <option value="USER">USER</option>
            <option value="PURCHASE_ORDER">PURCHASE_ORDER</option>
            <option value="PURCHASE_ORDER_PRICE_CHANGE">PURCHASE_ORDER_PRICE_CHANGE</option>
            <option value="ROUTE">ROUTE</option>
            <option value="SYSTEM">SYSTEM</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">
            Append-Only Audit Trail ({logs.length} entries shown)
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            Table Constraint: UPDATE/DELETE Forbidden
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading audit log entries...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No audit records found matching criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Entity</th>
                  <th className="py-3 px-4">Payload Details</th>
                  <th className="py-3 px-4">Cryptographic Hash Link</th>
                  <th className="py-3 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {logs.map((entry) => {
                  const isViolation = entry.action.includes('VIOLATION') || entry.action.includes('DENIED') || entry.action.includes('FAILURE');
                  const payload = typeof entry.payload === 'string' ? JSON.parse(entry.payload) : entry.payload;

                  return (
                    <tr key={entry.id} className="hover:bg-slate-900/50 transition font-mono text-[11px]">
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            isViolation
                              ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                              : entry.action.includes('SUCCESS') || entry.action.includes('GRANTED')
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                              : 'bg-indigo-950/80 text-indigo-300 border-indigo-800'
                          }`}
                        >
                          {entry.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-sans">
                        <div className="text-white text-xs flex items-center gap-1 font-medium">
                          <User className="w-3 h-3 text-slate-400" />
                          {entry.actor_name || (entry.actor_id ? entry.actor_id.substring(0, 8) + '...' : 'System / Unauth')}
                        </div>
                        {entry.actor_role && (
                          <div className="text-[10px] text-slate-500 font-mono">{entry.actor_role}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        <div>{entry.entity}</div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{entry.entity_id}</div>
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-[10px] text-slate-400 font-mono">
                        {JSON.stringify(payload)}
                      </td>
                      <td className="py-3 px-4 text-[10px] text-slate-400">
                        <div className="flex items-center gap-1">
                          <Hash className="w-3 h-3 text-slate-500" />
                          <span className="text-slate-300 font-semibold" title={entry.hash}>
                            {entry.hash.substring(0, 10)}...
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-500" title={entry.prev_hash}>
                          prev: {entry.prev_hash.substring(0, 10)}...
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400 font-sans text-[11px]">
                        {new Date(entry.created_at).toLocaleTimeString()}
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

export default AuditLogPage;
