import React from 'react';
import { ShieldCheck, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types/auth';

const ROLE_BADGES: Record<UserRole, { bg: string; text: string; border: string }> = {
  'Admin': { bg: 'bg-purple-950/80', text: 'text-purple-300', border: 'border-purple-800' },
  'Finance Manager': { bg: 'bg-emerald-950/80', text: 'text-emerald-300', border: 'border-emerald-800' },
  'AP Employee': { bg: 'bg-sky-950/80', text: 'text-sky-300', border: 'border-sky-800' },
  'Procurement Employee': { bg: 'bg-amber-950/80', text: 'text-amber-300', border: 'border-amber-800' },
  'Warehouse Employee': { bg: 'bg-teal-950/80', text: 'text-teal-300', border: 'border-teal-800' },
};

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  if (!user) return null;

  const badge = ROLE_BADGES[user.role] || { bg: 'bg-slate-800', text: 'text-slate-200', border: 'border-slate-700' };

  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur px-6 py-3.5 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/20">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
            FINSHIELD AI
            <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 font-medium px-1.5 py-0.5 rounded">
              RBAC &bull; Maker-Checker Active
            </span>
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* User Role Card */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 border border-slate-700">
            <UserIcon className="w-4 h-4" />
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-white leading-tight">{user.name}</div>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <span className={`inline-block text-[10px] font-medium px-2 py-0.2 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
                {user.role}
              </span>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={logout}
          title="Sign out"
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

export default Header;
