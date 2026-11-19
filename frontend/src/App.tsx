import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './components/LoginPage';
import Header from './components/Header';
import Sidebar, { NavTab } from './components/Sidebar';
import ApprovalsPage from './components/ApprovalsPage';
import AuditLogPage from './components/AuditLogPage';
import PurchaseOrdersPage from './components/PurchaseOrdersPage';
import InvoiceListPage from './components/InvoiceListPage';
import ThreeWayMatchingPage from './components/ThreeWayMatchingPage';
import GrnListPage from './components/GrnListPage';
import GstCompliancePage from './components/GstCompliancePage';
import AdminRiskConfigPage from './components/AdminRiskConfigPage';
import { InvestigationCenterPage } from './components/InvestigationCenterPage';
import { CopilotChatPanel } from './components/CopilotChatPanel';
import { SupplierGraphPage } from './components/SupplierGraphPage';
import { SupplierScorecardPage } from './components/SupplierScorecardPage';
import { DemoGuidePage } from './components/DemoGuidePage';
import ThreeWayMatchModal from './components/ThreeWayMatchModal';
import {
  Server,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Layers,
  Lock,
  ScrollText,
  ShieldAlert,
  Bot,
  AlertTriangle,
  ArrowRight,
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
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { DashboardStats } from './types/auth';

interface HealthData {
  status: string;
  service: string;
  version: string;
  phase: string;
  timestamp: string;
  database: string;
  environment: string;
}

const RISK_COLORS: Record<string, string> = {
  LOW: '#10b981',
  MEDIUM: '#f59e0b',
  HIGH: '#ef4444'
};

const AppContent: React.FC = () => {
  const { user, token, loading: authLoading, authFetch, login } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  const fetchHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    const start = performance.now();
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      setLatencyMs(Math.round(performance.now() - start));
      if (response.ok) {
        setHealth(data);
      } else {
        setHealthError(data.message || 'Health check returned non-200 status');
      }
    } catch (err: any) {
      setLatencyMs(Math.round(performance.now() - start));
      setHealthError(err.message || 'Failed to connect to backend API server at /api/health');
    } finally {
      setHealthLoading(false);
    }
  };

  const fetchDashboardStats = async () => {
    if (!user) return;
    setStatsLoading(true);
    try {
      const res = await authFetch('/api/dashboard/stats');
      if (res.ok) {
        const data = await res.json();
        setDashboardStats(data);
      }
    } catch (err) {
      console.warn('Failed to load dashboard stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    if (user) {
      fetchDashboardStats();
    }
  }, [user]);

  const handleOpenInvoiceByNumber = async (invoiceNumber: string) => {
    try {
      const res = await authFetch(`/api/invoices`);
      if (res.ok) {
        const data = await res.json();
        const found = (data.invoices || []).find(
          (i: any) => i.invoice_number === invoiceNumber || i.id === invoiceNumber
        );
        if (found) {
          setSelectedInvoiceId(found.id);
        }
      }
    } catch (err) {
      console.error('Failed to lookup invoice by number:', err);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-indigo-400" />
        Initializing FINSHIELD AI Platform...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />

        <main className="flex-1 overflow-y-auto p-6 bg-slate-950/50">
          {currentTab === 'dashboard' && (
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Header section */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-bold text-white tracking-tight">Executive Risk &amp; Compliance Dashboard</h2>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Live Analytics
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Continuous monitoring of AP discrepancies, GSTR-2B compliance, and departmental investigation queues
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsCopilotOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition"
                  >
                    <Bot className="w-4 h-4" />
                    <span>Ask Copilot</span>
                  </button>
                  <button
                    onClick={() => {
                      fetchHealth();
                      fetchDashboardStats();
                    }}
                    disabled={statsLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${statsLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* 7 KPI Metric Cards */}
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Accounts Payable &amp; GST Risk KPIs
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  <button
                    onClick={() => setCurrentTab('invoices')}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 text-left transition"
                  >
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Invoices</span>
                    <div className="text-xl font-bold font-mono text-white mt-1">
                      {dashboardStats?.cards.total_invoices ?? 0}
                    </div>
                    <span className="text-[9px] text-slate-500">AP Register</span>
                  </button>

                  <button
                    onClick={() => setCurrentTab('matching')}
                    className="bg-slate-900 border border-slate-800 hover:border-emerald-700/60 rounded-xl p-3.5 text-left transition"
                  >
                    <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">Matched</span>
                    <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                      {dashboardStats?.cards.matched_invoices ?? 0}
                    </div>
                    <span className="text-[9px] text-emerald-500/80">3-Way Clean</span>
                  </button>

                  <button
                    onClick={() => setCurrentTab('matching')}
                    className="bg-slate-900 border border-slate-800 hover:border-rose-700/60 rounded-xl p-3.5 text-left transition"
                  >
                    <span className="text-[10px] text-rose-400 uppercase tracking-wider font-semibold">On Hold</span>
                    <div className="text-xl font-bold font-mono text-rose-400 mt-1">
                      {dashboardStats?.cards.mismatched_invoices ?? 0}
                    </div>
                    <span className="text-[9px] text-rose-500/80">Payment Locked</span>
                  </button>

                  <button
                    onClick={() => setCurrentTab('matching')}
                    className="bg-slate-900 border border-slate-800 hover:border-orange-700/60 rounded-xl p-3.5 text-left transition"
                  >
                    <span className="text-[10px] text-orange-400 uppercase tracking-wider font-semibold">Possible Dups</span>
                    <div className="text-xl font-bold font-mono text-orange-400 mt-1">
                      {dashboardStats?.cards.possible_duplicates ?? 0}
                    </div>
                    <span className="text-[9px] text-orange-500/80">Similarity &ge; 85%</span>
                  </button>

                  <button
                    onClick={() => setCurrentTab('invoices')}
                    className="bg-slate-900 border border-rose-900/60 hover:border-rose-600 rounded-xl p-3.5 text-left transition bg-rose-950/20"
                  >
                    <span className="text-[10px] text-rose-400 uppercase tracking-wider font-semibold">High-Risk</span>
                    <div className="text-xl font-bold font-mono text-rose-300 mt-1">
                      {dashboardStats?.cards.high_risk_invoices ?? 0}
                    </div>
                    <span className="text-[9px] text-rose-400/80">Investigation Priority</span>
                  </button>

                  <button
                    onClick={() => setCurrentTab('investigations')}
                    className="bg-slate-900 border border-indigo-900/60 hover:border-indigo-600 rounded-xl p-3.5 text-left transition bg-indigo-950/20"
                  >
                    <span className="text-[10px] text-indigo-400 uppercase tracking-wider font-semibold">Investigations</span>
                    <div className="text-xl font-bold font-mono text-indigo-300 mt-1">
                      {dashboardStats?.cards.pending_investigations ?? 0}
                    </div>
                    <span className="text-[9px] text-indigo-400/80">Active Queue</span>
                  </button>

                  <button
                    onClick={() => setCurrentTab('gst')}
                    className="bg-slate-900 border border-amber-900/60 hover:border-amber-600 rounded-xl p-3.5 text-left transition bg-amber-950/20"
                  >
                    <span className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold">ITC at Risk</span>
                    <div className="text-xl font-bold font-mono text-amber-300 mt-1">
                      ₹ {((dashboardStats?.cards.total_itc_at_risk ?? 9000)).toLocaleString('en-IN')}
                    </div>
                    <span className="text-[9px] text-amber-400/80">Missing in 2B</span>
                  </button>
                </div>
              </div>

              {/* Recharts Data Visualizations Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Chart 1: Invoices by Status */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      Invoices by Pipeline Status
                    </h3>
                    <p className="text-[11px] text-slate-400 mb-3">Distribution across processing stages</p>
                  </div>
                  <div className="h-56 w-full">
                    {dashboardStats?.charts.invoices_by_status && (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dashboardStats.charts.invoices_by_status}>
                          <XAxis dataKey="status" stroke="#64748b" fontSize={10} tickLine={false} />
                          <YAxis stroke="#64748b" fontSize={10} tickLine={false} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                          />
                          <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Chart 2: Risk Level Distribution */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
                      Risk Level Distribution
                    </h3>
                    <p className="text-[11px] text-slate-400 mb-3">Investigation priority segmentation</p>
                  </div>
                  <div className="h-56 w-full flex items-center justify-center">
                    {dashboardStats?.charts.risk_distribution && (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={dashboardStats.charts.risk_distribution}
                            dataKey="count"
                            nameKey="level"
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={75}
                            paddingAngle={4}
                          >
                            {dashboardStats.charts.risk_distribution.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={RISK_COLORS[entry.level] || '#64748b'}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Chart 3: Investigations by Department */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
                      Investigations by Department
                    </h3>
                    <p className="text-[11px] text-slate-400 mb-3">Workload distribution across teams</p>
                  </div>
                  <div className="h-56 w-full">
                    {dashboardStats?.charts.investigations_by_department && (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={dashboardStats.charts.investigations_by_department}
                          layout="vertical"
                        >
                          <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} allowDecimals={false} />
                          <YAxis dataKey="department" type="category" stroke="#64748b" fontSize={9} tickLine={false} width={100} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                          />
                          <Bar dataKey="count" fill="#38bdf8" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Recent Alerts & Risk Flags Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      Recent Risk Alerts &amp; Discrepancy Flags
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Click any alert to inspect full 3-way matching and evidence details</p>
                  </div>
                  <button
                    onClick={() => setCurrentTab('investigations')}
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    <span>View All in Investigation Center</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2">
                  {dashboardStats?.recent_alerts && dashboardStats.recent_alerts.length > 0 ? (
                    dashboardStats.recent_alerts.map((alert) => (
                      <div
                        key={alert.id}
                        onClick={() => handleOpenInvoiceByNumber(alert.invoice_number)}
                        className="p-3 bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800/80 rounded-xl flex items-center justify-between cursor-pointer transition"
                      >
                        <div className="flex items-center space-x-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              alert.severity === 'HIGH'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {alert.severity}
                          </span>
                          <div>
                            <span className="text-xs font-semibold text-white">{alert.title}</span>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-indigo-400 font-bold">{alert.invoice_number}</span>
                              <span>&bull;</span>
                              <span>Department: <strong>{alert.department}</strong></span>
                              <span>&bull;</span>
                              <span className="font-mono">{alert.issue_type}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 uppercase">
                            {alert.status}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-xs text-slate-500 font-mono">
                      No active alerts. All invoices and GST returns verified.
                    </div>
                  )}
                </div>
              </div>

              {/* Status Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                      <Server className="w-4 h-4 text-sky-400" />
                      Backend Express API
                    </span>
                    {healthLoading ? (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full font-medium">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Checking
                      </span>
                    ) : health ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-full font-medium">
                        <CheckCircle2 className="w-3 h-3" /> Online
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-rose-400 bg-rose-950/60 border border-rose-800 px-2 py-0.5 rounded-full font-medium" title={healthError || 'Offline'}>
                        <XCircle className="w-3 h-3" /> Offline
                      </span>
                    )}
                  </div>
                  <div className="mt-3">
                    <div className="text-sm font-semibold text-white">
                      {health ? health.service : 'Checking API...'}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Latency: {latencyMs !== null ? `${latencyMs} ms` : 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-purple-400" />
                      Authenticated Session
                    </span>
                    <span className="text-xs text-purple-400 bg-purple-950/60 border border-purple-800 px-2 py-0.5 rounded-full font-medium">
                      JWT Valid
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-sm font-semibold text-white">
                      Role: {user.role}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      User: {user.name} ({user.email})
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                      <ScrollText className="w-4 h-4 text-indigo-400" />
                      FINSHIELD GUARD
                    </span>
                    <span className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-full font-medium">
                      Append-Only
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-sm font-semibold text-white">
                      Cryptographic Hash Chain
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Table: audit_log (SHA-256)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentTab === 'demo-guide' && (
            <DemoGuidePage
              currentUser={user}
              token={token || ''}
              onQuickLogin={async (email, pass) => {
                const res = await login(email, pass);
                if (!res.success) throw new Error(res.message);
              }}
              onNavigate={(tab) => setCurrentTab(tab as NavTab)}
              onResetDemo={async () => {
                await authFetch('/api/demo/reset', { method: 'POST' });
                await fetchDashboardStats();
              }}
            />
          )}

          {currentTab === 'investigations' && (
            <InvestigationCenterPage
              currentUser={user}
              onOpenInvoice={(num) => handleOpenInvoiceByNumber(num)}
            />
          )}

          {currentTab === 'supplier-graph' && (
            <SupplierGraphPage
              currentUser={user}
              token={token || ''}
              onNavigateToInvestigations={() => setCurrentTab('investigations')}
              onNavigateToScorecard={(id) => {
                setSelectedSupplierId(id);
                setCurrentTab('scorecards');
              }}
            />
          )}

          {currentTab === 'scorecards' && (
            <SupplierScorecardPage
              currentUser={user}
              token={token || ''}
              initialSupplierId={selectedSupplierId}
              onNavigateToInvoice={(invId) => setSelectedInvoiceId(invId)}
              onNavigateToGraph={() => setCurrentTab('supplier-graph')}
            />
          )}

          {currentTab === 'approvals' && <ApprovalsPage />}
          {currentTab === 'purchase-orders' && <PurchaseOrdersPage />}
          {currentTab === 'audit-log' && <AuditLogPage />}
          {currentTab === 'invoices' && <InvoiceListPage />}
          {currentTab === 'matching' && <ThreeWayMatchingPage />}
          {currentTab === 'grns' && <GrnListPage />}
          {currentTab === 'gst' && <GstCompliancePage />}
          {currentTab === 'risk-config' && <AdminRiskConfigPage />}

          {currentTab === 'copilot' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-white">AI Copilot Investigation Desk</h1>
                  <p className="text-xs text-slate-400">Natural language analysis grounded strictly in database facts</p>
                </div>
              </div>
              <CopilotChatPanel embedded={true} />
            </div>
          )}
        </main>
      </div>

      {/* Floating AI Copilot Toggle Button (Visible on all tabs when not in Copilot tab) */}
      {currentTab !== 'copilot' && (
        <>
          <button
            onClick={() => setIsCopilotOpen(!isCopilotOpen)}
            className="fixed bottom-6 right-6 z-40 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white p-3.5 rounded-full shadow-2xl flex items-center justify-center border border-indigo-400/30 hover:scale-105 transition duration-150"
            title="Ask FINSHIELD Copilot"
          >
            <Bot className="w-5 h-5" />
          </button>

          <CopilotChatPanel
            isOpen={isCopilotOpen}
            onClose={() => setIsCopilotOpen(false)}
            onOpenInvoice={(num) => handleOpenInvoiceByNumber(num)}
          />
        </>
      )}

      {/* 3-Way Match Modal */}
      {selectedInvoiceId && (
        <ThreeWayMatchModal
          invoiceId={selectedInvoiceId}
          onClose={() => setSelectedInvoiceId(null)}
          onMatchUpdated={() => fetchDashboardStats()}
        />
      )}

      <footer className="border-t border-slate-800 bg-slate-950 px-6 py-3 text-center text-xs text-slate-500">
        FINSHIELD AI &bull; Accounts Payable Risk &amp; GST Compliance Platform &bull; Phase 6 Active (Investigation Workflow, AI Copilot &amp; Dashboard Completion)
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
