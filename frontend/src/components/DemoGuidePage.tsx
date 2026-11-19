import React, { useState } from 'react';
import {
  Compass,
  RotateCcw,
  UserCheck,
  CheckCircle,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { User, UserRole } from '../types/auth';

interface DemoGuidePageProps {
  currentUser: User;
  token: string;
  onQuickLogin: (email: string, password: string) => Promise<void>;
  onNavigate: (tab: string) => void;
  onResetDemo: () => Promise<void>;
}

interface DemoStep {
  step: number;
  title: string;
  role: UserRole;
  targetTab: string;
  actionText: string;
  description: string;
  plantedIssue: string;
  expectedResult: string;
}

export const DemoGuidePage: React.FC<DemoGuidePageProps> = ({
  currentUser,
  onQuickLogin,
  onNavigate,
  onResetDemo
}) => {
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<string | null>(null);

  const demoRoles = [
    { name: 'AP Employee', email: 'ap@finshield.sample', pass: 'AP@123', color: 'bg-blue-600 hover:bg-blue-700' },
    { name: 'Procurement Employee', email: 'emp102@finshield.sample', pass: 'Emp102@123', color: 'bg-purple-600 hover:bg-purple-700' },
    { name: 'Warehouse Employee', email: 'warehouse@finshield.sample', pass: 'Warehouse@123', color: 'bg-amber-600 hover:bg-amber-700' },
    { name: 'Finance Manager', email: 'finance@finshield.sample', pass: 'Finance@123', color: 'bg-emerald-600 hover:bg-emerald-700' },
    { name: 'Admin', email: 'admin@finshield.sample', pass: 'Admin@123', color: 'bg-slate-800 hover:bg-slate-900' }
  ];

  const demoSteps: DemoStep[] = [
    {
      step: 1,
      title: 'Role-Based Authentication & Guard Controls',
      role: 'Admin',
      targetTab: 'dashboard',
      actionText: 'View Executive Dashboard',
      description: 'Switch between the 5 distinct roles to experience fine-grained RBAC and maker-checker separation.',
      plantedIssue: 'None (Security Foundation)',
      expectedResult: 'Navigation adjusts per role; Admin cannot approve payments; Warehouse cannot alter prices.'
    },
    {
      step: 2,
      title: 'Invoice Upload & AI/OCR Extraction',
      role: 'AP Employee',
      targetTab: 'invoices',
      actionText: 'Open Invoices Vault',
      description: 'Upload sample-data/invoices/INV-101.pdf or inspect seeded INV-101 parsed via OCR with field confidence scores.',
      plantedIssue: 'Unverified invoice waiting for human review',
      expectedResult: 'Extraction status EXTRACTED with confidence scores (0.92 to 0.99) for all line items and tax.'
    },
    {
      step: 3,
      title: 'Human Verification Gate',
      role: 'AP Employee',
      targetTab: 'invoices',
      actionText: 'Verify Invoice INV-101',
      description: 'AP Employee confirms extracted values. Verification automatically triggers the end-to-end risk pipeline.',
      plantedIssue: 'Human-in-the-loop requirement',
      expectedResult: 'Status becomes VERIFIED; 3-way match, duplicate detection, GST check, and risk score auto-execute.'
    },
    {
      step: 4,
      title: '3-Way Matching: Quantity & Price Reconciliation',
      role: 'AP Employee',
      targetTab: 'matching',
      actionText: 'Inspect 3-Way Match',
      description: 'Reconciles PO-101 (100 kg @ ₹500), GRN-101 (80 kg received), and INV-101 (100 kg billed @ ₹500).',
      plantedIssue: 'Invoice billed 100 kg but warehouse received only 80 kg (20 kg shortfall)',
      expectedResult: 'Status sets to ON_HOLD with exact text: "Invoice qty 100 exceeds received qty 80 by 20". Payment locked.'
    },
    {
      step: 5,
      title: 'Duplicate Invoice Detection Engine',
      role: 'AP Employee',
      targetTab: 'matching',
      actionText: 'Check Duplicate Signals',
      description: 'Normalized invoice number algorithm strips punctuation (INV_101 vs INV-101) and compares amounts & IRN.',
      plantedIssue: 'Planted duplicate invoice INV_101 submitted for same supplier and total',
      expectedResult: 'Similarity score >= 85% (100% match) flagged as "POSSIBLE DUPLICATE". Never auto-rejected.'
    },
    {
      step: 6,
      title: 'PO Change Monitoring & Maker-Checker Block',
      role: 'Procurement Employee',
      targetTab: 'purchase-orders',
      actionText: 'Inspect PO-101 Changes',
      description: 'Employee 102 altered unit_price from ₹500 to ₹700 without authorization, then attempts self-approval.',
      plantedIssue: 'PO-101 unauthorized price alteration; approval_id is NULL',
      expectedResult: 'System blocks self-approval with HTTP 403 (Maker-Checker Violation). Logged to audit log.'
    },
    {
      step: 7,
      title: 'GST & GSTR-2B Tax Reconciliation',
      role: 'Finance Manager',
      targetTab: 'gst-compliance',
      actionText: 'Inspect GST Compliance',
      description: 'Validates 15-character GSTIN checksum via Mod-36 Luhn formula and checks auto-drafted GSTR-2B records.',
      plantedIssue: 'INV-101 missing from GSTR-2B register',
      expectedResult: 'Flags "ITC at risk" with exact INR exposure of ₹9,000 (18% GST). Vendor filing verified.'
    },
    {
      step: 8,
      title: 'Historical Overbilling & Surcharge Detection',
      role: 'Finance Manager',
      targetTab: 'scorecards',
      actionText: 'Inspect Supplier A History',
      description: 'Scans 9 historical invoices for TimberCraft Woodworks (Supplier A) to uncover repeated extra charges.',
      plantedIssue: 'Persistent uncontracted freight, handling, and unloading surcharges (₹500, ₹700, ₹1000)',
      expectedResult: 'Flagged HISTORICAL_OVERBILLING; extra charges highlighted with exact past invoice references.'
    },
    {
      step: 9,
      title: 'Supplier Relationship Graph (Verification Indicator)',
      role: 'Finance Manager',
      targetTab: 'supplier-graph',
      actionText: 'Explore Relationship Graph',
      description: 'Force-directed graph maps relational links between vendors (shared banks, addresses, phones, PANs).',
      plantedIssue: 'Supplier A and Supplier B share identical bank identifier (HDFC0001234-9876543210)',
      expectedResult: 'Red SHARED_BANK edge rendered; auto-creates Finance/Compliance investigation without duplicates.'
    },
    {
      step: 10,
      title: 'Departmental Investigations, Revalidation & Final Payment Gate',
      role: 'Finance Manager',
      targetTab: 'investigations',
      actionText: 'Open Investigation Center',
      description: 'Auto-assigned issues routed to Warehouse, Procurement, AP, and Finance. Warehouse logs supplementary delivery GRN-102 (20 kg).',
      plantedIssue: 'All 4 planted issues active on INV-101',
      expectedResult: 'Revalidation clears quantity mismatch (`REVALIDATED`), other issues keep payment ON_HOLD. Final release requires human Finance sign-off.'
    }
  ];

  const handleRoleClick = async (email: string, pass: string) => {
    setLoginLoading(email);
    try {
      await onQuickLogin(email, pass);
    } catch (err: any) {
      alert(`Login failed: ${err.message}`);
    } finally {
      setLoginLoading(null);
    }
  };

  const handleResetClick = async () => {
    if (!window.confirm('Reset database to pristine Section 6 demo scenario? This restores all original demo records.')) return;
    setResetting(true);
    setResetMessage(null);
    try {
      await onResetDemo();
      setResetMessage('Database restored to pristine Section 6 seed state! Ready for presentation.');
      setTimeout(() => setResetMessage(null), 4000);
    } catch (err: any) {
      setResetMessage(`Reset failed: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Interactive Demo Presentation Guide</h1>
              <p className="text-sm text-slate-500">
                10-step guided tour validating all core capabilities of FINSHIELD AI matching PROJECT_SPEC.md Section 6.
              </p>
            </div>
          </div>
          <button
            onClick={handleResetClick}
            disabled={resetting}
            className="px-4 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm flex items-center space-x-2 transition"
          >
            <RotateCcw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
            <span>{resetting ? 'Resetting Database...' : 'Reset Demo Data'}</span>
          </button>
        </div>

        {resetMessage && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{resetMessage}</span>
          </div>
        )}

        {/* Quick-Login Bar for 5 Roles */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <UserCheck className="w-4 h-4 text-slate-600" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Quick-Switch User Role (Active: <span className="text-indigo-600">{currentUser.role}</span>)
              </span>
            </div>
            <span className="text-[11px] text-slate-400">One-click instant authentication</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
            {demoRoles.map((r) => {
              const isCurrent = currentUser.role === r.name;
              return (
                <button
                  key={r.name}
                  onClick={() => handleRoleClick(r.email, r.pass)}
                  disabled={loginLoading !== null}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg text-white transition flex flex-col items-center justify-center space-y-0.5 ${r.color} ${
                    isCurrent ? 'ring-2 ring-offset-2 ring-indigo-500 shadow-md' : 'opacity-90'
                  }`}
                >
                  <span className="truncate w-full text-center">{r.name}</span>
                  <span className="text-[10px] font-normal opacity-80">{r.email.split('@')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 10 Demo Steps Accordion / Card List */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span>The 10-Step Demo Journey (Section 6 Demo Scenario)</span>
        </h2>

        <div className="grid grid-cols-1 gap-4">
          {demoSteps.map((s) => (
            <div
              key={s.step}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:border-indigo-300 transition"
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start space-x-3.5">
                  <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                    {s.step}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2.5 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900">{s.title}</h3>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded">
                        Role: {s.role}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{s.description}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 flex-shrink-0">
                  <button
                    onClick={() => onNavigate(s.targetTab)}
                    className="px-3.5 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center space-x-1.5 transition shadow-sm"
                  >
                    <span>{s.actionText}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Planted Issue & Expected Result Boxes */}
              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-red-50/70 border border-red-200/80 rounded-lg text-red-900">
                  <span className="font-bold text-red-800 uppercase text-[10px] block mb-1">Planted Scenario Issue:</span>
                  <p className="text-xs text-red-950">{s.plantedIssue}</p>
                </div>
                <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-lg text-emerald-900">
                  <span className="font-bold text-emerald-800 uppercase text-[10px] block mb-1">Expected System Result:</span>
                  <p className="text-xs text-emerald-950">{s.expectedResult}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
