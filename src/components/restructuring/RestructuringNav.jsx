import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, CalendarRange, TrendingUp, Receipt,
  ClipboardList, Clock, Scale, SlidersHorizontal, ListTree, ShieldCheck, GitCompareArrows,
} from 'lucide-react';

const items = [
  { path: '/restructuring', label: 'Cockpit', icon: LayoutDashboard, exact: true },
  { path: '/restructuring/liquidity', label: '13-Wochen-Vorschau', icon: CalendarRange },
  { path: '/restructuring/plan', label: 'Geldflussplanung', icon: ListTree },
  { path: '/restructuring/soll-ist', label: 'Soll-Ist-Cockpit', icon: GitCompareArrows },
  { path: '/restructuring/forecast', label: 'Umsatz-Forecast', icon: TrendingUp },
  { path: '/restructuring/aging', label: 'Forderungsspiegel', icon: Receipt },
  { path: '/restructuring/backlog', label: 'Auftragsbestand', icon: ClipboardList },
  { path: '/restructuring/wip', label: 'WIP / Unfertige Leistungen', icon: Clock },
  { path: '/restructuring/fortfuehrung', label: 'Fortführungsnachweis', icon: ShieldCheck },
  { path: '/restructuring/coverage', label: 'Deckungsrechnung (betriebswirtschaftlich)', icon: Scale },
  { path: '/restructuring/setup', label: 'Eingaben & Annahmen', icon: SlidersHorizontal },
];

export default function RestructuringNav() {
  const { pathname } = useLocation();
  const isActive = (item) => (item.exact ? pathname === item.path : pathname.startsWith(item.path));
  return (
    <div className="border-b bg-card sticky top-0 z-10">
      <div className="flex gap-1 px-2 overflow-x-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}