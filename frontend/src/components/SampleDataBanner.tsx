import React from 'react';
import { AlertTriangle, Database } from 'lucide-react';

export const SampleDataBanner: React.FC = () => {
  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 text-xs md:text-sm font-medium border-b border-amber-600 shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-2 mx-auto">
        <AlertTriangle className="w-4 h-4 text-amber-900 shrink-0" />
        <span>
          <strong className="font-bold tracking-wide uppercase mr-1.5">[Sample Data Mode]</strong>
          All records, suppliers, POs, GRNs, GSTINs, and invoices displayed are strictly synthetic sample data for prototype demonstration.
        </span>
        <span className="hidden sm:inline-flex items-center gap-1 bg-amber-600/30 px-2 py-0.5 rounded text-xs text-amber-900 font-semibold border border-amber-600/40">
          <Database className="w-3 h-3" /> is_sample_data: true
        </span>
      </div>
    </div>
  );
};

export default SampleDataBanner;
