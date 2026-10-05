import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUnlinkedOrdersCount } from '@/hooks/useUnlinkedOrdersCount';
import { usePendingDunningCount } from '@/hooks/usePendingDunningCount';
import { usePosteingang } from '@/hooks/usePosteingang';
import { useEscalationAlertCount } from '@/hooks/useEscalationAlertCount';
import { useZugriff } from '@/lib/useZugriff';
import { useAuth } from '@/lib/AuthContext';
import { NAV_GRUPPEN } from '@/lib/navigation';
import { useQuery } from '@tanstack/react-query';
import { istInhaber, NEU_KEY, ladeNeue } from '@/lib/rueckmeldung/rueckmeldung';

// Welche einklappbaren Gruppen die Person offen hat — bleibt im Browser gemerkt.
const SPEICHER = 'nav-gruppen-offen';
function ladeOffen() {
  try { return JSON.parse(window.localStorage.getItem(SPEICHER) || '{}') || {}; } catch (e) { return {}; }
}
function merkeOffen(offen) {
  try { window.localStorage.setItem(SPEICHER, JSON.stringify(offen)); } catch (e) { /* ohne Speicher gilt der Standard */ }
}

export default function Sidebar() {
  const location = useLocation();
  const zugriff = useZugriff();
  const { user } = useAuth();
  // Die Zähler laden erst kurz nach dem Start: die geöffnete Seite bekommt den
  // Server zuerst. Und nur, wenn die Person den zugehörigen Punkt auch sieht.
  const [zaehlerBereit, setZaehlerBereit] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setZaehlerBereit(true), 4000);
    return () => clearTimeout(t);
  }, []);
  const bereit = zaehlerBereit && !zugriff.isLoading;
  const unlinkedCount = useUnlinkedOrdersCount({ enabled: bereit && zugriff.darf('geld') });
  const pendingDunningCount = usePendingDunningCount({ enabled: bereit && zugriff.darf('geld') });
  // Ein Zähler für den einen Posteingang — dieselbe Quelle wie die Liste
  const posteingang = usePosteingang({ enabled: bereit && zugriff.darf(['leitung', 'support']) });
  const escalationCount = useEscalationAlertCount({ enabled: bereit && zugriff.darf('leitung') });
  // Neue Rückmeldungen der Kollegen — nur für den Inhaber, dieselbe Abfrage wie am Knopf in der Kopfleiste
  const { data: rueck } = useQuery({
    queryKey: NEU_KEY, queryFn: ladeNeue, enabled: bereit && istInhaber(user),
    refetchInterval: 2 * 60 * 1000, staleTime: 60 * 1000,
  });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [offen, setOffen] = useState(ladeOffen);

  const supportUeberfaellig = (posteingang.eintraege || [])
    .filter((e) => e.sichtbar && e.klasse === 'support' && e.ueberfaellig).length;

  // anzahl = dunkler Zähler (rot, wenn etwas überfällig ist), alarm = roter Zähler
  const zaehler = {
    posteingang: { anzahl: posteingang.gesamt || 0, ueberfaellig: posteingang.ueberfaellig || 0 },
    support: { anzahl: posteingang.zahlen?.support || 0, ueberfaellig: supportUeberfaellig },
    auftraege: { anzahl: unlinkedCount || 0 },
    mahnungen: { anzahl: pendingDunningCount || 0 },
    eskalationen: { alarm: escalationCount || 0 },
    rueckmeldungen: {
      anzahl: rueck?.anzahl || 0,
      ueberfaellig: rueck?.blockiert || 0,
      titel: rueck?.blockiert ? `${rueck.blockiert} Fehler blockiert jemanden` : 'Neue Rückmeldungen',
    },
  };

  const filter = new URLSearchParams(location.search).get('filter');
  const isActive = (path) => {
    const p = location.pathname;
    // Posteingang und Support-Eingang sind dieselbe Seite mit anderem Filter
    if (path === '/crm/inbox?filter=support') return p === '/crm/inbox' && filter === 'support';
    if (path === '/crm/inbox') return p === '/crm/inbox' && filter !== 'support';
    if (path === '/sprint') return p === '/sprint';
    if (path === '/sprint/projekte') return /^\/sprint\/(projekte|katalog|neu|sprints|milestones)/.test(p);
    // Angebote und Deal-Details haben keinen eigenen Punkt — sie gehören zur Pipeline
    if (path === '/crm') return p === '/crm' || p.startsWith('/crm/deals') || p.startsWith('/crm/quotes');
    return p === path || p.startsWith(path + '/');
  };

  const renderNavLink = (item) => {
    const Icon = item.icon;
    const active = isActive(item.path);
    const z = zaehler[item.zaehler] || {};
    const badgeCount = z.anzahl || 0;
    const alertCount = z.alarm || 0;
    // überfällige Anfragen färben den Zähler rot statt dunkel
    const badgeOverdue = (z.ueberfaellig || 0) > 0;
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
          ${active
            ? 'bg-sidebar-accent text-sidebar-foreground font-semibold shadow-[inset_3px_0_0_hsl(var(--primary))]'
            : 'text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent'
          }
          ${collapsed ? 'justify-center' : ''}`}
        title={collapsed ? item.label : undefined}
      >
        <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-sidebar-foreground' : 'text-muted-foreground'}`} />
        {!collapsed && <span className="truncate flex-1">{item.label}</span>}
        {(badgeCount > 0 || alertCount > 0) && (
          collapsed ? (
            <span className={`absolute ml-6 -mt-4 w-2 h-2 rounded-full ${alertCount > 0 || badgeOverdue ? 'bg-status-critical' : 'bg-foreground'}`} />
          ) : (
            <span className="flex-shrink-0 flex items-center gap-1">
              {badgeCount > 0 && (
                <span
                  className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center ${badgeOverdue ? 'bg-status-critical text-white' : 'bg-foreground text-background'}`}
                  title={z.titel || (badgeOverdue ? `${z.ueberfaellig} überfällig (älter als 48 Stunden)` : undefined)}
                >
                  {badgeCount}
                </span>
              )}
              {alertCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-status-critical text-white text-[11px] font-semibold flex items-center justify-center" title="Kunden-Eskalationen">
                  {alertCount}
                </span>
              )}
            </span>
          )
        )}
      </Link>
    );
  };

  const umschalten = (key, istOffen) => {
    const neu = { ...offen, [key]: !istOffen };
    setOffen(neu);
    merkeOffen(neu);
  };

  const renderSectionHeader = (gruppe, istOffen) => {
    if (collapsed) {
      return (
        <div className="pt-4 pb-1 px-0">
          {gruppe.einklappbar ? (
            <button
              type="button"
              onClick={() => umschalten(gruppe.key, istOffen)}
              title={`${gruppe.titel} ${istOffen ? 'einklappen' : 'aufklappen'}`}
              className="w-full flex items-center justify-center py-1 text-muted-foreground hover:text-sidebar-foreground border-t border-sidebar-border/60"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${istOffen ? 'rotate-180' : ''}`} />
            </button>
          ) : (
            <div className="h-px bg-sidebar-border/60 mx-2" />
          )}
        </div>
      );
    }
    const titel = (
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {gruppe.titel}
      </span>
    );
    return (
      <div className="pt-4 pb-1 px-3">
        {gruppe.einklappbar ? (
          <button
            type="button"
            onClick={() => umschalten(gruppe.key, istOffen)}
            aria-expanded={istOffen}
            className="w-full flex items-center justify-between gap-2 hover:[&>span]:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {titel}
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${istOffen ? 'rotate-180' : ''}`} />
          </button>
        ) : titel}
      </div>
    );
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
              <p className="text-xs text-muted-foreground">Agency Manager</p>
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
        {NAV_GRUPPEN.map((gruppe) => {
          // Nur was die Person sehen darf; eine leere Gruppe erscheint gar nicht.
          const items = gruppe.items.filter((i) => zugriff.darf(i.regel)
            && (!i.nurEmail || (user?.email || '').toLowerCase() === i.nurEmail));
          if (items.length === 0) return null;
          // Liegt die geöffnete Seite in der Gruppe, ist sie immer aufgeklappt.
          const istOffen = !gruppe.einklappbar || !!offen[gruppe.key] || items.some((i) => isActive(i.path));
          return (
            <React.Fragment key={gruppe.key}>
              {gruppe.titel && renderSectionHeader(gruppe, istOffen)}
              {istOffen && items.map(renderNavLink)}
            </React.Fragment>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="p-4 border-t border-sidebar-border">
          <p className="text-xs text-muted-foreground">v1.0 · Planungsjahr 2026</p>
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
        fixed md:sticky top-0 left-0 h-screen bg-sidebar border-r border-sidebar-border z-50 transition-all duration-300 flex-shrink-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${collapsed ? 'w-16' : 'w-64'}
      `}>
        {navContent}
      </aside>
    </>
  );
}