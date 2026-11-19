import React from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  FileSpreadsheet,
  FileText,
  Boxes,
  ScrollText,
  BadgeAlert,
  Sliders,
  Bot,
  ShieldAlert,
  Share2,
  Award,
  Compass
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types/auth';

export type NavTab =
  | 'dashboard'
  | 'demo-guide'
  | 'investigations'
  | 'supplier-graph'
  | 'scorecards'
  | 'approvals'
  | 'purchase-orders'
  | 'audit-log'
  | 'invoices'
  | 'matching'
  | 'grns'
  | 'gst'
  | 'risk-config'
  | 'copilot';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

interface NavItem {
  id: NavTab;
  label: string;
  icon: React.ElementType;
  badge?: string;
  allowedRoles: UserRole[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard & KPIs',
    icon: LayoutDashboard,
    allowedRoles: ['AP Employee', 'Procurement Employee', 'Warehouse Employee', 'Finance Manager', 'Admin']
  },
  {
    id: 'demo-guide',
    label: 'Demo Guide & Steps',
    icon: Compass,
    badge: '10 Steps',
    allowedRoles: ['AP Employee', 'Procurement Employee', 'Warehouse Employee', 'Finance Manager', 'Admin']
  },
  {
    id: 'investigations',
    label: 'Investigation Center',
    icon: ShieldAlert,
    badge: 'Workflow',
    allowedRoles: ['AP Employee', 'Procurement Employee', 'Warehouse Employee', 'Finance Manager', 'Admin']
  },
  {
    id: 'supplier-graph',
    label: 'Supplier Graph',
    icon: Share2,
    badge: 'Live',
    allowedRoles: ['AP Employee', 'Procurement Employee', 'Warehouse Employee', 'Finance Manager', 'Admin']
  },
  {
    id: 'scorecards',
    label: 'Supplier Scorecards',
    icon: Award,
    badge: 'Empirical',
    allowedRoles: ['AP Employee', 'Procurement Employee', 'Warehouse Employee', 'Finance Manager', 'Admin']
  },
  {
    id: 'approvals',
    label: 'Maker-Checker Approvals',
    icon: CheckSquare,
    badge: 'Live',
    allowedRoles: ['AP Employee', 'Procurement Employee', 'Warehouse Employee', 'Finance Manager', 'Admin']
  },
  {
    id: 'purchase-orders',
    label: 'Purchase Orders',
    icon: FileSpreadsheet,
    allowedRoles: ['Procurement Employee', 'Finance Manager', 'Admin']
  },
  {
    id: 'audit-log',
    label: 'Hash-Chained Audit Log',
    icon: ScrollText,
    badge: 'Crypto',
    allowedRoles: ['Finance Manager', 'Admin']
  },
  {
    id: 'invoices',
    label: 'Invoices & OCR',
    icon: FileText,
    badge: 'Live',
    allowedRoles: ['AP Employee', 'Finance Manager', 'Admin']
  },
  {
    id: 'matching',
    label: '3-Way Matching',
    icon: CheckSquare,
    badge: 'Auto',
    allowedRoles: ['AP Employee', 'Finance Manager', 'Admin']
  },
  {
    id: 'grns',
    label: 'Goods Receipt (GRN)',
    icon: Boxes,
    badge: 'Intake',
    allowedRoles: ['Warehouse Employee', 'Finance Manager', 'Admin']
  },
  {
    id: 'gst',
    label: 'GST & ITC Risk',
    icon: BadgeAlert,
    badge: 'Live',
    allowedRoles: ['AP Employee', 'Finance Manager', 'Admin']
  },
  {
    id: 'risk-config',
    label: 'Risk Rules Engine',
    icon: Sliders,
    badge: 'Admin',
    allowedRoles: ['Finance Manager', 'Admin']
  },
  {
    id: 'copilot',
    label: 'AI Copilot Assistant',
    icon: Bot,
    badge: 'Live',
    allowedRoles: ['AP Employee', 'Procurement Employee', 'Warehouse Employee', 'Finance Manager', 'Admin']
  }
];

export function isTabAllowed(tab: NavTab, role: UserRole): boolean {
  const item = NAV_ITEMS.find((n) => n.id === tab);
  if (!item) return true;
  return item.allowedRoles.includes(role);
}

export function getTabAllowedRoles(tab: NavTab): UserRole[] {
  const item = NAV_ITEMS.find((n) => n.id === tab);
  return item ? item.allowedRoles : [];
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const { user } = useAuth();
  if (!user) return null;

  const allowedNav = NAV_ITEMS.filter((item) => item.allowedRoles.includes(user.role));

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col justify-between p-4 shrink-0">
      <div className="space-y-6">
        <div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
            Navigation Menu ({user.role})
          </div>
          <nav className="space-y-1">
            {allowedNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                        isActive
                          ? 'bg-sky-700/80 text-white'
                          : item.badge === 'Live' || item.badge === 'Crypto'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
        <div className="text-[11px] font-semibold text-slate-300">FINSHIELD AI</div>
        <div className="text-[10px] text-slate-400 mt-0.5">
          AP Risk &bull; GST Compliance &bull; Maker-Checker
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
