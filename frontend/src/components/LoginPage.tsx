import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, AlertCircle, ArrowRight, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const DEMO_USERS = [
  {
    role: 'Admin',
    name: 'Admin User',
    email: 'admin@finshield.sample',
    pass: 'Admin@123',
    desc: 'Audit logs, risk config & user management'
  },
  {
    role: 'Finance Manager',
    name: 'Finance Manager',
    email: 'finance@finshield.sample',
    pass: 'Finance@123',
    desc: 'Approves PO changes, payments & audits'
  },
  {
    role: 'AP Employee',
    name: 'AP Specialist',
    email: 'ap@finshield.sample',
    pass: 'Ap@12345',
    desc: 'Invoice upload, 3-way matching & checks'
  },
  {
    role: 'Procurement Employee',
    name: 'Employee 102 (Procurement)',
    email: 'emp102@finshield.sample',
    pass: 'Emp102@123',
    desc: 'POs management & proposes price changes'
  },
  {
    role: 'Warehouse Employee',
    name: 'Warehouse Supervisor',
    email: 'warehouse@finshield.sample',
    pass: 'Warehouse@123',
    desc: 'GRN intake & quantity reconciliation'
  }
];

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await login(email, password);
    if (!res.success) {
      setError(res.message || 'Authentication failed');
    }
    setSubmitting(false);
  };

  const handleSelectDemoUser = (demo: typeof DEMO_USERS[0]) => {
    setEmail(demo.email);
    setPassword(demo.pass);
    setError(null);
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-8 max-w-6xl mx-auto w-full">
      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 mb-3">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Sign in to FINSHIELD AI</h2>
          <p className="text-xs text-slate-400 mt-1">
            Role-Based Access &bull; Maker-Checker &bull; Hash-Chained Audit Trail
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. finance@finshield.sample"
                required
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs rounded-lg transition shadow-md shadow-sky-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? 'Authenticating...' : 'Sign In'}
            {!submitting && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </form>

        {/* Demo Logins Helper Panel (Golden Rule 4) */}
        <div className="mt-6 pt-5 border-t border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-amber-400" />
              Demo Accounts (Quick Sign-In)
            </span>
            <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">
              Click to autofill
            </span>
          </div>

          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {DEMO_USERS.map((demo) => (
              <button
                key={demo.role}
                type="button"
                onClick={() => handleSelectDemoUser(demo)}
                className="w-full text-left p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between group"
              >
                <div>
                  <div className="text-xs font-medium text-white flex items-center gap-1.5">
                    {demo.role}
                    {demo.role.includes('Employee 102') && (
                      <span className="text-[9px] bg-sky-950 text-sky-400 border border-sky-800 px-1 rounded">Planted</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">{demo.email}</div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 font-mono group-hover:text-sky-400 transition">
                    {demo.pass}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
