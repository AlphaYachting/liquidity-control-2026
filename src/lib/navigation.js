import {
  LayoutDashboard, FolderKanban, Megaphone, Shield, Wrench, Server,
  CreditCard, AlertTriangle, FileText, TrendingUp, Settings,
  Upload, BarChart3, CheckSquare, ClipboardList, ClipboardCheck, GitMerge, CalendarCheck,
  Zap, Map, BrainCircuit, PieChart, CalendarDays, Users, BarChart2, Clock, DatabaseZap,
  RefreshCw, Trash2, RotateCcw, Scale, KanbanSquare, Inbox, History, Presentation, Mail,
  Sun, Siren, CalendarRange, Gauge, Layers, LifeBuoy, Sparkles, SlidersHorizontal, Timer,
  Receipt, ServerCog,
} from 'lucide-react';

// Die EINE Liste aller Navigationspunkte. Die Sidebar rendert ausschließlich hieraus.
// regel: Recht aus useZugriff (Name oder Liste — bei einer Liste genügt eines davon).
// zaehler: Schlüssel des Zählers, den die Sidebar an diesem Punkt zeigt.
// einklappbar: Gruppe startet eingeklappt, die Person kann sie auf- und zuklappen.
export const NAV_GRUPPEN = [
  {
    key: 'tag',
    titel: null,
    items: [
      { path: '/sprint', label: 'Mein Tag', icon: Sun, regel: 'alle' },
      { path: '/zeiten', label: 'Meine Zeiten', icon: Timer, regel: 'alle' },
      { path: '/freigaben', label: 'Freigaben', icon: ClipboardCheck, regel: ['leitung', 'geld'] },
    ],
  },
  {
    key: 'projekte',
    titel: 'Projekte',
    items: [
      { path: '/sprint/projekte', label: 'Projekte', icon: Layers, regel: 'alle' },
      { path: '/sprint/uebersicht', label: 'Wochenübersicht', icon: Gauge, regel: 'leitung' },
      { path: '/sprint/planung', label: 'Wochenplanung', icon: CalendarRange, regel: 'leitung' },
      { path: '/projects', label: 'Projekt-Cockpit', icon: FolderKanban, regel: 'geld' },
      { path: '/sprint/steuerung', label: 'Steuerung', icon: SlidersHorizontal, regel: 'fuehrung' },
      { path: '/sprint/auslastung', label: 'Auslastungsforecast', icon: BarChart3, regel: 'admin' },
    ],
  },
  {
    key: 'kunden',
    titel: 'Kunden & Vertrieb',
    items: [
      { path: '/crm/inbox', label: 'Posteingang', icon: Inbox, regel: 'leitung', zaehler: 'posteingang' },
      { path: '/crm/inbox?filter=support', label: 'Support-Eingang', icon: LifeBuoy, regel: 'support', zaehler: 'support' },
      { path: '/crm/emails', label: 'E-Mail-Zentrale', icon: Mail, regel: 'leitung' },
      { path: '/crm/escalations', label: 'Kunden-Eskalationen', icon: Siren, regel: 'leitung', zaehler: 'eskalationen' },
      { path: '/crm', label: 'Pipeline', icon: KanbanSquare, regel: 'sales' },
      { path: '/crm/proposals', label: 'Angebots-Studio', icon: Presentation, regel: 'sales' },
    ],
  },
  {
    key: 'verrechnung',
    titel: 'Verrechnung',
    items: [
      { path: '/next-month-forecast', label: 'Abrechnungsforecast', icon: CalendarCheck, regel: ['leitung', 'geld'] },
      { path: '/invoice-ready', label: 'Abrechnungsanweisungen', icon: CheckSquare, regel: ['leitung', 'geld'] },
      { path: '/confirmed-orders', label: 'Auftragsabwicklung', icon: ClipboardList, regel: 'geld', zaehler: 'auftraege' },
      { path: '/support-billing', label: 'Support-Abrechnung', icon: Receipt, regel: 'geld' },
      { path: '/receivables', label: 'Offene Forderungen', icon: AlertTriangle, regel: 'geld', zaehler: 'mahnungen' },
      { path: '/payables', label: 'Eingangsrechnungen', icon: FileText, regel: 'geld' },
    ],
  },
  {
    key: 'finanzen',
    titel: 'Finanzen & Auswertung',
    einklappbar: true,
    items: [
      { path: '/dashboard', label: 'Finanz-Dashboard', icon: LayoutDashboard, regel: 'fuehrung' },
      { path: '/weekly-cashflow', label: 'Wöchentl. Cashflow', icon: CalendarDays, regel: 'fuehrung' },
      { path: '/forecast', label: 'Forecast & Szenarien', icon: TrendingUp, regel: 'fuehrung' },
      { path: '/variance-analysis', label: 'Abweichungsanalyse', icon: BarChart2, regel: 'fuehrung' },
      { path: '/revenue-analysis', label: 'Umsatzbewertung', icon: PieChart, regel: 'fuehrung' },
      { path: '/customer-risk', label: 'Kundenrisiko', icon: Users, regel: 'fuehrung' },
      { path: '/escalation-alerts', label: 'Projekt-Risiko', icon: AlertTriangle, regel: 'fuehrung' },
      { path: '/cashflow-advisor', label: 'KI-Finanzanalyse', icon: Sparkles, regel: 'fuehrung' },
      { path: '/sprint/intelligence', label: 'Projekt-Intelligence', icon: BrainCircuit, regel: 'fuehrung' },
      { path: '/online-marketing', label: 'Online-Marketing', icon: Megaphone, regel: 'fuehrung' },
      { path: '/maintenance', label: 'Wartungsverträge', icon: Shield, regel: 'fuehrung' },
      { path: '/hosting', label: 'Hosting & Domains', icon: Server, regel: 'fuehrung' },
      { path: '/production', label: 'Planumsatz Produktion', icon: Wrench, regel: 'fuehrung' },
      { path: '/tools', label: 'Toolkosten', icon: CreditCard, regel: 'fuehrung' },
    ],
  },
  {
    key: 'admin',
    titel: 'Administration',
    einklappbar: true,
    items: [
      { path: '/settings', label: 'Einstellungen', icon: Settings, regel: 'admin' },
      { path: '/audit-trail', label: 'Änderungsprotokoll', icon: History, regel: 'admin' },
      { path: '/restructuring', label: 'Sanierungs-Reporting', icon: Scale, regel: 'admin' },
      { path: '/invoice-matching', label: 'Rechnungszuordnung', icon: GitMerge, regel: 'admin' },
      { path: '/import', label: 'Import Center', icon: Upload, regel: 'admin' },
      { path: '/master-import', label: 'Master-Datenimport', icon: DatabaseZap, regel: 'admin' },
      { path: '/sevdesk-settings', label: 'sevDesk Integration', icon: BarChart3, regel: 'admin' },
      { path: '/sevdesk-reimport', label: 'sevDesk Re-Import', icon: RotateCcw, regel: 'admin' },
      { path: '/awork-settings', label: 'awork Integration', icon: Zap, regel: 'admin' },
      { path: '/awork-mapping', label: 'awork Mapping', icon: Map, regel: 'admin' },
      { path: '/awork-cost-index', label: 'awork Kostenindex', icon: Clock, regel: 'admin' },
      { path: '/system/maintenance', label: 'Systempflege', icon: ServerCog, regel: 'admin' },
      { path: '/billing-reset', label: 'Verrechnungsdaten Reset', icon: RefreshCw, regel: 'admin' },
      { path: '/operational-reset', label: 'Operational Reset', icon: Trash2, regel: 'admin' },
    ],
  },
];

export const NAV_ITEMS = NAV_GRUPPEN.flatMap((g) => g.items.map((i) => ({ ...i, gruppe: g.titel || 'Tagesarbeit' })));