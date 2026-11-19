import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Info
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { RiskRuleConfig } from '../types/auth';
import { safeArray } from '../utils/formatters';

export const AdminRiskConfigPage: React.FC = () => {
  const { authFetch, user } = useAuth();
  const [rules, setRules] = useState<RiskRuleConfig[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editedRules, setEditedRules] = useState<Record<string, { weight: number; threshold: number; is_active: boolean }>>({});

  const isAdmin = user?.role === 'Admin';

  const fetchRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/risk/config');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load risk rules');
      setRules(data.rules || []);

      const initialMap: Record<string, { weight: number; threshold: number; is_active: boolean }> = {};
      for (const r of data.rules || []) {
        initialMap[r.rule_code] = {
          weight: Number(r.weight),
          threshold: Number(r.threshold),
          is_active: r.is_active
        };
      }
      setEditedRules(initialMap);
    } catch (err: any) {
      console.error('Error fetching risk rules:', err);
      setError(err.message || 'Failed to fetch rules configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleFieldChange = (ruleCode: string, field: 'weight' | 'threshold' | 'is_active', val: any) => {
    setEditedRules(prev => ({
      ...prev,
      [ruleCode]: {
        ...prev[ruleCode],
        [field]: field === 'is_active' ? Boolean(val) : parseFloat(val) || 0
      }
    }));
  };

  const handleSaveRule = async (ruleCode: string) => {
    if (!isAdmin) {
      setError('Forbidden: Only Admin users can modify risk engine weights and thresholds.');
      return;
    }

    setSavingCode(ruleCode);
    setError(null);
    setSuccessMessage(null);

    const edits = editedRules[ruleCode];
    if (!edits) return;

    try {
      const res = await authFetch(`/api/risk/config/${ruleCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weight: edits.weight,
          threshold: edits.threshold,
          is_active: edits.is_active
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update rule');

      setSuccessMessage(`Rule ${ruleCode} updated successfully and recorded in hash-chained audit log.`);
      await fetchRules();
    } catch (err: any) {
      console.error('Failed to save rule:', err);
      setError(err.message || 'Rule update failed');
    } finally {
      setSavingCode(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-950 border border-sky-800 rounded-xl text-sky-400">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Risk Engine &amp; Threshold Configuration
                <span className="text-[10px] bg-slate-800 text-sky-300 font-mono px-2 py-0.5 rounded border border-slate-700">
                  Admin Control
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Configure deterministic risk rule weights (0–100 scale contribution) and detection thresholds.
              </p>
            </div>
          </div>

          <button
            onClick={fetchRules}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Rules
          </button>
        </div>

        {/* Explainability & Golden Rule 3 Banner */}
        <div className="mt-5 p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-start gap-3 text-xs text-slate-300">
          <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-white">Golden Rule #3: Explainable Risk Score = Investigation Priority, NOT Fraud Verdict.</span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Every score is computed as a weighted sum of explainable indicators. Tuning weights updates how scores are mapped to LOW, MEDIUM, and HIGH investigation priority without hardcoding. All modifications are permanently written to the hash-chained audit log.
            </p>
          </div>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="mt-4 p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}
      </div>

      {/* Rules Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Active Risk Calculation Rules ({rules.length})
          </span>
          {!isAdmin && (
            <span className="text-[11px] text-amber-400 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Read-Only Mode (Admin role required to modify)
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400 font-mono">
            Loading rules configuration...
          </div>
        ) : rules.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            No risk rules found in database.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-semibold">
                <tr>
                  <th className="py-3 px-4">Rule Code &amp; Name</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-center w-36">Weight (Points)</th>
                  <th className="py-3 px-4 text-center w-36">Threshold</th>
                  <th className="py-3 px-4 text-center w-28">Status</th>
                  <th className="py-3 px-4 text-right w-28">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300 text-xs font-mono">
                {safeArray(rules).map((rule) => {
                  const currentEdit = editedRules[rule.rule_code] || {
                    weight: Number(rule.weight),
                    threshold: Number(rule.threshold),
                    is_active: rule.is_active
                  };
                  const isModified =
                    currentEdit.weight !== Number(rule.weight) ||
                    currentEdit.threshold !== Number(rule.threshold) ||
                    currentEdit.is_active !== rule.is_active;

                  return (
                    <tr key={rule.rule_code} className="hover:bg-slate-900/40 transition">
                      <td className="py-3.5 px-4 font-sans">
                        <div className="font-bold text-white font-mono text-[11px] text-sky-400">
                          {rule.rule_code}
                        </div>
                        <div className="text-xs text-slate-300 font-medium mt-0.5">
                          {rule.rule_name}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-sans text-slate-400 text-[11px] max-w-xs">
                        {rule.description}
                      </td>

                      {/* Weight Input */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            disabled={!isAdmin}
                            value={currentEdit.weight}
                            onChange={(e) => handleFieldChange(rule.rule_code, 'weight', e.target.value)}
                            className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-center text-xs text-white font-bold focus:border-sky-500 focus:outline-none disabled:opacity-50"
                          />
                          <span className="text-[10px] text-slate-500 font-sans">pts</span>
                        </div>
                      </td>

                      {/* Threshold Input */}
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="number"
                          step="0.1"
                          disabled={!isAdmin}
                          value={currentEdit.threshold}
                          onChange={(e) => handleFieldChange(rule.rule_code, 'threshold', e.target.value)}
                          className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-center text-xs text-white font-bold focus:border-sky-500 focus:outline-none disabled:opacity-50"
                        />
                      </td>

                      {/* Active Status */}
                      <td className="py-3.5 px-4 text-center">
                        <label className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={currentEdit.is_active}
                            disabled={!isAdmin}
                            onChange={(e) => handleFieldChange(rule.rule_code, 'is_active', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-sky-600 relative"></div>
                        </label>
                      </td>

                      {/* Save Button */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleSaveRule(rule.rule_code)}
                          disabled={!isAdmin || savingCode === rule.rule_code || !isModified}
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded text-[11px] font-sans font-semibold transition ${
                            isModified
                              ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-md'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <Save className="w-3 h-3" />
                          <span>{savingCode === rule.rule_code ? 'Saving...' : 'Save'}</span>
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
    </div>
  );
};

export default AdminRiskConfigPage;
