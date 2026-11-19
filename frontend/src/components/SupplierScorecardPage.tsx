import React, { useState, useEffect } from 'react';
import {
  Award,
  RefreshCw,
  Search,
  Building,
  Info,
  ExternalLink,
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { User, SupplierScorecard } from '../types/auth';
import { safeArray, formatCurrency, safeNumber } from '../utils/formatters';

interface SupplierScorecardPageProps {
  currentUser: User;
  token: string;
  initialSupplierId?: string | null;
  onNavigateToInvoice?: (invoiceId: string) => void;
  onNavigateToGraph?: () => void;
}

export const SupplierScorecardPage: React.FC<SupplierScorecardPageProps> = ({
  token,
  initialSupplierId,
  onNavigateToInvoice,
  onNavigateToGraph
}) => {
  const [scorecards, setScorecards] = useState<SupplierScorecard[]>([]);
  const [selectedScorecard, setSelectedScorecard] = useState<SupplierScorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchScorecards();
  }, []);

  useEffect(() => {
    if (initialSupplierId && scorecards.length > 0) {
      const found = scorecards.find(s => s.supplier_id === initialSupplierId);
      if (found) setSelectedScorecard(found);
    }
  }, [initialSupplierId, scorecards]);

  const fetchScorecards = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/suppliers/scorecards', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.scorecards)) {
        setScorecards(data.scorecards);
        if (data.scorecards.length > 0 && !selectedScorecard) {
          setSelectedScorecard(data.scorecards[0]);
        }
      } else {
        throw new Error(data.message || 'Failed to retrieve supplier scorecards');
      }
    } catch (err: any) {
      setError(err.message || 'Error communicating with server');
    } finally {
      setLoading(false);
    }
  };

  const filteredScorecards = scorecards.filter(sc => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      sc.supplier_name.toLowerCase().includes(q) ||
      sc.gstin.toLowerCase().includes(q) ||
      sc.pan.toLowerCase().includes(q)
    );
  });

  const getGradeBadge = (grade: string) => {
    switch (grade) {
      case 'A': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'B': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'C': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'D': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'F': default: return 'bg-red-100 text-red-800 border-red-300';
    }
  };

  const getBarColor = (score: number) => {
    if (score >= 90) return '#10B981';
    if (score >= 75) return '#3B82F6';
    if (score >= 60) return '#F59E0B';
    if (score >= 40) return '#F97316';
    return '#EF4444';
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Supplier Performance Scorecards</h1>
              <p className="text-sm text-slate-500">
                Transparent, empirical operational ratings derived from invoice matching accuracy, delivery fulfillment, and billing history.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {onNavigateToGraph && (
              <button
                onClick={onNavigateToGraph}
                className="px-3 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center space-x-1.5 transition"
              >
                <span>Relationship Graph</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={fetchScorecards}
              disabled={loading}
              className="px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg flex items-center space-x-2 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Disclaimer Note */}
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start space-x-3 text-xs text-slate-600">
          <Info className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
          <div>
            <strong className="text-slate-800">Operational Performance Metric:</strong> All ratings represent empirical vendor fulfillment consistency and contract adherence. This is <span className="font-semibold text-slate-800">NOT a fraud verdict</span>. Weights and formulas are completely inspectable.
          </div>
        </div>
      </div>

      {/* Main Grid: Suppliers Table + Scorecard Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Table of Suppliers (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Vendors &amp; Ratings</h2>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search vendor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500 w-40"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <p className="text-xs">Computing empirical scorecards...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
              {error}
            </div>
          ) : filteredScorecards.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">No suppliers found.</div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[640px]">
              {filteredScorecards.map((sc) => {
                const isSelected = selectedScorecard?.supplier_id === sc.supplier_id;
                return (
                  <div
                    key={sc.supplier_id}
                    onClick={() => setSelectedScorecard(sc)}
                    className={`p-3.5 rounded-lg cursor-pointer transition ${
                      isSelected ? 'bg-indigo-50/70 border border-indigo-200' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <Building className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                        <span className="text-xs font-bold text-slate-900 truncate">{sc.supplier_name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded border text-[11px] font-black ${getGradeBadge(sc.overall_grade)}`}>
                        Grade {sc.overall_grade}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>GSTIN: <span className="font-mono text-slate-700">{sc.gstin}</span></span>
                      <span className="font-bold text-slate-800">{sc.overall_score}/100</span>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Invoices: {sc.summary.total_invoices}</span>
                      <span className="text-slate-600 font-medium">{sc.rating_label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Scorecard Deep-Dive (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col space-y-6">
          {selectedScorecard ? (
            <>
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-base font-bold text-slate-900">{selectedScorecard.supplier_name}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    GSTIN: <span className="font-mono text-slate-700">{selectedScorecard.gstin}</span> | PAN: <span className="font-mono text-slate-700">{selectedScorecard.pan}</span>
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <span className="text-xs text-slate-400 uppercase font-semibold block">Performance Score</span>
                    <span className="text-2xl font-black text-slate-900">{selectedScorecard.overall_score}<span className="text-sm font-normal text-slate-400">/100</span></span>
                  </div>
                  <div className={`px-3 py-1.5 rounded-lg border text-sm font-black ${getGradeBadge(selectedScorecard.overall_grade)}`}>
                    Grade {selectedScorecard.overall_grade}
                  </div>
                </div>
              </div>

              {/* Chart: Metrics Comparison */}
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center">
                  <TrendingUp className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                  Metric Scores Breakdown (vs 100 benchmark)
                </h3>
                <div className="h-44 w-full bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={safeArray(selectedScorecard.metrics).map((m: any) => ({
                        name: (m.name || 'Metric').split(' ')[0],
                        score: safeNumber(m.score, 0),
                        fullName: m.name || 'Metric'
                      }))}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(val: any, _name: any, item: any) => [`${val}/100`, item.payload.fullName]}
                        contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                      />
                      <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                        {safeArray(selectedScorecard.metrics).map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={getBarColor(entry.score)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Transparent Metric Calculations Table */}
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Transparent Evaluation Formulas &amp; Inputs
                </h3>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-2.5">Metric</th>
                        <th className="p-2.5">Score</th>
                        <th className="p-2.5">Weight</th>
                        <th className="p-2.5">Formula</th>
                        <th className="p-2.5">Empirical Inputs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {safeArray(selectedScorecard.metrics).map((m: any) => (
                        <tr key={m.key} className="hover:bg-slate-50/50">
                          <td className="p-2.5">
                            <span className="font-semibold text-slate-900 block">{m.name}</span>
                            <span className="text-[10px] text-slate-400">{m.category}</span>
                          </td>
                          <td className="p-2.5">
                            <span className={`px-1.5 py-0.5 rounded font-bold ${getGradeBadge(m.grade)}`}>
                              {m.score}
                            </span>
                          </td>
                          <td className="p-2.5 font-medium text-slate-600">{m.weight}%</td>
                          <td className="p-2.5 font-mono text-[11px] text-slate-600">{m.formula}</td>
                          <td className="p-2.5 text-[11px] text-slate-500 font-mono">
                            {JSON.stringify(m.inputs || {}).replace(/["{}]/g, '').replace(/,/g, ', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Evidence Invoices Section */}
              {selectedScorecard.evidence_invoices && selectedScorecard.evidence_invoices.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Linked Invoices Evidence</span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      {selectedScorecard.evidence_invoices.length} records evaluated
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {safeArray(selectedScorecard.evidence_invoices).map((inv: any) => (
                      <div
                        key={inv.id}
                        className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-slate-800">{inv.invoice_number}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                              inv.status === 'ON_HOLD' ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {inv.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">₹{formatCurrency(inv.total)}</p>
                        </div>
                        {onNavigateToInvoice && (
                          <button
                            onClick={() => onNavigateToInvoice(inv.id)}
                            className="p-1 hover:bg-slate-200 rounded text-indigo-600"
                            title="Inspect Invoice"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-24 text-center text-xs text-slate-400">
              Select a vendor from the list to display their detailed scorecard.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
