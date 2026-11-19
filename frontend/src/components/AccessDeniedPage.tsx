import React from 'react';
import { ShieldX, ArrowLeft } from 'lucide-react';

interface AccessDeniedPageProps {
  requiredRoles?: string[];
  currentRole?: string;
  onGoBack?: () => void;
}

export const AccessDeniedPage: React.FC<AccessDeniedPageProps> = ({
  requiredRoles,
  currentRole,
  onGoBack
}) => {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6 bg-slate-950 border border-slate-800 rounded-2xl shadow-xl">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-950/70 border border-rose-800 flex items-center justify-center mx-auto text-rose-400 shadow-inner">
          <ShieldX className="w-7 h-7" />
        </div>

        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-white">Access Denied (RBAC Protected)</h3>
          <p className="text-xs text-slate-400">
            Your current assigned role ({currentRole || 'Unknown'}) does not have permission to view or manage this module.
          </p>
        </div>

        {requiredRoles && requiredRoles.length > 0 && (
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300">
            <span className="text-slate-500 block text-[11px] uppercase font-semibold mb-1">
              Authorized Roles:
            </span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {requiredRoles.map((role) => (
                <span
                  key={role}
                  className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-sky-300 font-mono text-[11px]"
                >
                  {role}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 pt-2">
          {onGoBack && (
            <button
              onClick={onGoBack}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition shadow"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Return to Previous Screen
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccessDeniedPage;
