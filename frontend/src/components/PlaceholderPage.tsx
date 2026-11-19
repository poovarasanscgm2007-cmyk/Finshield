import React from 'react';
import { Construction, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface PlaceholderProps {
  title: string;
  phase: string;
  description: string;
  upcomingFeatures: string[];
  onBack: () => void;
}

export const PlaceholderPage: React.FC<PlaceholderProps> = ({
  title,
  phase,
  description,
  upcomingFeatures,
  onBack
}) => {
  const { user } = useAuth();

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 max-w-4xl mx-auto shadow-xl space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <span className="text-xs bg-sky-950 text-sky-400 border border-sky-800 px-2.5 py-0.5 rounded-full font-medium">
          {phase}
        </span>
      </div>

      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
          <Construction className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="text-xs text-slate-400 mt-1">{description}</p>
        </div>
      </div>

      <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800/80">
        <div className="text-xs font-semibold text-slate-200 mb-2">
          Scheduled Capabilities for this Module:
        </div>
        <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
          {upcomingFeatures.map((feat, idx) => (
            <li key={idx}>{feat}</li>
          ))}
        </ul>
      </div>

      <div className="text-[11px] text-slate-500 border-t border-slate-800 pt-3">
        Active User: <strong className="text-slate-400">{user?.name}</strong> ({user?.role}) &bull; Implementation strictly deferred to Phase 3/4/5 as per prompt guidelines.
      </div>
    </div>
  );
};

export default PlaceholderPage;
