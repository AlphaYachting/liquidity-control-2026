import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Megaphone, Shield, Wrench,
  CreditCard, AlertTriangle, FileText, TrendingUp, Settings,
  Upload, ChevronLeft, ChevronRight, BarChart3, Menu, X, CheckSquare,
  ClipboardList, GitMerge, CalendarCheck, Zap, Map, BrainCircuit, PieChart,
  CalendarDays, Users, BarChart2, Clock, DatabaseZap, RefreshCw, Trash2, RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/projects', label: 'Projekt-Cockpit', icon: FolderKanban },
  { path: '/next-month-forecast', label: 'Abrechnungsforecast', icon: CalendarCheck },
  { path: '/invoice-ready', label: 'Abrechnungsanweisungen', icon: CheckSquare },
  { path: '/customer-risk', label: 'Kundenrisiko', icon: Users },
  { path: '/awork-cost-index', label: 'awork Kostenindex', icon: Clock },
  { path: '/confirmed-orders', label: 'Auftragsabwicklung', icon: ClipboardList, description: 'Aufträge erfassen, Dokumente prüfen' },
  { path: '/invoice-matching', label: 'Rechnungszuordnung', icon: GitMerge },
  { path: '/online-marketing', label: 'Online-Marketing', icon: Megaphone },
  { path: '/maintenance', label: 'Wartungsverträge', icon: Shield },
  { path: '/production', label: 'Produktion & Support', icon: Wrench },
  { path: '/tools', label: 'Toolkosten', icon: CreditCard },
  { path: '/receivables', label: 'Offene Forderungen', icon: AlertTriangle },
  { path: '/payables', label: 'Eingangsrechnungen', icon: FileText },
  { path: '/revenue-analysis', label: 'Umsatzbewertung', icon: PieChart },
  { path: '/escalation-alerts', label: 'Eskalations-Alerts', icon: AlertTriangle },
  { path: '/weekly-cashflow', label: 'Wöchentl. Cashflow', icon: CalendarDays },
  { path: '/variance-analysis', label: 'Abweichungsanalyse', icon: BarChart2 },
  { path: '/forecast', label: 'Forecast & Szenarien', icon: TrendingUp },
  { path: '/cashflow-advisor', label: 'Cashflow Berater', icon: BrainCircuit },
  { path: '/billing-reset', label: 'Verrechnungsdaten Reset', icon: RefreshCw },
  { path: '/operational-reset', label: 'Operational Reset', icon: Trash2 },
  { path: '/sevdesk-reimport', label: 'sevDesk Re-Import', icon: RotateCcw },
  { path: '/master-import', label: 'Master-Datenimport', icon: DatabaseZap },
  { path: '/import', label: 'Import Center', icon: Upload },
  { path: '/settings', label: 'Settings', icon: Settings },
  { path: '/awork-settings', label: 'awork Integration', icon: Zap },
  { path: '/awork-mapping', label: 'awork Mapping', icon: Map },
  { path: '/sevdesk-settings', label: 'sevDesk Integration', icon: BarChart3 },
];

export default function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const navContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <span className="text-sidebar-primary-foreground font-bold text-sm">R</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-sidebar-foreground">Rittler & Co</h1>
              <p className="text-xs text-sidebar-foreground/50">Liquidity Control 2026</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent hidden md:flex"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground/60 hover:text-sidebar-foreground md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200
                ${active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/20'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                }
                ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="p-4 border-t border-sidebar-border">
          <p className="text-xs text-sidebar-foreground/40">v1.0 · Planungsjahr 2026</p>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 md:hidden bg-card shadow-md"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="w-5 h-5" />
      </Button>

      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`
        fixed md:sticky top-0 left-0 h-screen bg-sidebar z-50 transition-all duration-300 flex-shrink-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${collapsed ? 'w-16' : 'w-64'}
      `}>
        {navContent}
      </aside>
    </>
  );
}