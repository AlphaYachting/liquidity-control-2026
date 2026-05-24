import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Clock, ChevronDown, ChevronRight, AlertTriangle, TrendingUp } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function fmtH(minutes) {
  if (!minutes) return '—';
  const h = (minutes / 60).toFixed(1);
  return `${h}h`;
}

function BudgetBar({ pct }) {
  const capped = Math.min(pct, 150);
  const color =
    pct >= 100 ? 'bg-red-500' :
    pct >= 80  ? 'bg-amber-500' :
    pct >= 60  ? 'bg-yellow-400' :
                 'bg-emerald-500';
  return (
    <div className="relative w-full h-3 bg-muted rounded-full overflow-hidden">
      {/* 100% marker */}
      <div className="absolute top-0 bottom-0 w-px bg-border z-10" style={{ left: `${(100 / 150) * 100}%` }} />
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${(capped / 150) * 100}%` }}
      />
    </div>
  );
}

export default function AworkCostIndex() {
  const [expanded, setExpanded] = useState({});
  const [sortBy, setSortBy] = useState('budget_pct'); // 'budget_pct' | 'tracked' | 'name'
  const [filterOverrun, setFilterOverrun] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const { data: snapshots = [], isLoading: sLoading } = useQuery({
    queryKey: ['aworkSnapshots'], queryFn: () => base44.entities.AworkProjectSnapshot.list()
  });
  const { data: timeEntries = [], isLoading: tLoading } = useQuery({
    queryKey: ['aworkTimeEntries'], queryFn: () => base44.entities.AworkTimeEntry.list('-entry_date', 5000)
  });

  const isLoading = sLoading || tLoading;

  // Group time entries by awork_project_id → then by user_name
  // AworkTimeEntry hat korrekte Einzeleinträge; Snapshot tracked_duration_minutes = offizielle awork-Summe
  const timeByProject = useMemo(() => {
    const map = {};
    timeEntries.forEach(e => {
      const pid = e.awork_project_id;
      if (!pid) return;
      if (!map[pid]) map[pid] = { byUser: {} };
      const user = e.user_name || 'Unbekannt';
      map[pid].byUser[user] = (map[pid].byUser[user] || 0) + (e.duration_minutes || 0);
    });
    return map;
  }, [timeEntries]);

  // Aktive Status-Werte in awork (Snapshots speichern project_status als String aus awork)
  const INACTIVE_STATUSES = ['done', 'archived', 'abgeschlossen', 'completed', 'cancelled', 'abgebrochen'];

  const projects = useMemo(() => {
    return snapshots
      .filter(s => {
        if (s.is_archived) return false;
        // Standardfilter: nur laufende Projekte
        if (!showAll) {
          const status = (s.project_status || '').toLowerCase();
          if (INACTIVE_STATUSES.some(x => status.includes(x))) return false;
        }
        return true;
      })
      .map(s => {
        // Stunden: Snapshot-Wert ist die offizielle awork-Gesamtsumme (korrekt)
        const trackedMin = s.tracked_duration_minutes ?? 0;
        const budgetMin = s.time_budget_minutes ?? 0;
        const budgetPct = budgetMin > 0 ? Math.round((trackedMin / budgetMin) * 100) : null;

        // Mitarbeiter-Verteilung aus den synced TimeEntries
        const byUser = timeByProject[s.awork_project_id]?.byUser ?? {};
        const topUsers = Object.entries(byUser)
          .map(([name, minutes]) => ({ name, minutes }))
          .sort((a, b) => b.minutes - a.minutes);

        return {
          ...s,
          trackedMin,
          budgetMin,
          budgetPct,
          topUsers,
          isOverrun: budgetPct !== null && budgetPct >= 100,
        };
      });
  }, [snapshots, timeByProject, showAll]);

  const sorted = useMemo(() => {
    let list = filterOverrun ? projects.filter(p => p.isOverrun) : projects;
    if (sortBy === 'budget_pct') {
      list = [...list].sort((a, b) => {
        if (a.budgetPct === null && b.budgetPct === null) return 0;
        if (a.budgetPct === null) return 1;
        if (b.budgetPct === null) return -1;
        return b.budgetPct - a.budgetPct;
      });
    } else if (sortBy === 'tracked') {
      list = [...list].sort((a, b) => b.trackedMin - a.trackedMin);
    } else {
      list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
    }
    return list;
  }, [projects, sortBy, filterOverrun]);

  const overrunCount = projects.filter(p => p.isOverrun).length;
  const warnCount = projects.filter(p => p.budgetPct !== null && p.budgetPct >= 80 && p.budgetPct < 100).length;
  const totalTrackedH = (projects.reduce((s, p) => s + p.trackedMin, 0) / 60).toFixed(0);
  const totalBudgetH = (projects.reduce((s, p) => s + p.budgetMin, 0) / 60).toFixed(0);

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-24" />
      <Skeleton className="h-64" />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="awork Kostenindex"
        subtitle={`${projects.length} Projekte · ${overrunCount} überziehen Budget · ${warnCount} in Warnzone`}
        icon={Clock}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-blue-500">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Projekte gesamt</p>
          <p className="text-2xl font-bold mt-1">{projects.length}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-emerald-500">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Erfasste Stunden</p>
          <p className="text-2xl font-bold mt-1">{totalTrackedH}h</p>
          <p className="text-xs text-muted-foreground">von {totalBudgetH}h Budget</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-amber-500">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">In Warnzone (≥80%)</p>
          <p className="text-2xl font-bold mt-1 text-amber-600">{warnCount}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-red-500">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Budget überzogen</p>
          <p className="text-2xl font-bold mt-1 text-red-600">{overrunCount}</p>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 border rounded-lg p-1">
          {[
            { key: 'budget_pct', label: 'Budget %' },
            { key: 'tracked', label: 'Stunden' },
            { key: 'name', label: 'Name' },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${sortBy === s.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFilterOverrun(f => !f)}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${filterOverrun ? 'bg-red-50 border-red-300 text-red-700 font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}
        >
          <AlertTriangle className="w-3 h-3" />
          Nur Überzieher
        </button>
        <button
          onClick={() => setShowAll(f => !f)}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${showAll ? 'bg-muted border-border font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}
        >
          {showAll ? 'Nur laufende' : 'Alle anzeigen'}
        </button>
      </div>

      {/* Project list */}
      <div className="space-y-2">
        {sorted.map((p) => {
          const isOpen = expanded[p.awork_project_id];
          const pct = p.budgetPct;
          const pctLabel = pct !== null ? `${pct}%` : 'kein Budget';
          const pctColor =
            pct === null ? 'text-muted-foreground' :
            pct >= 100   ? 'text-red-600 font-bold' :
            pct >= 80    ? 'text-amber-600 font-semibold' :
                           'text-emerald-600';

          return (
            <Card key={p.awork_project_id} className="overflow-hidden">
              <button
                className="w-full p-4 flex items-center gap-4 text-left hover:bg-muted/20 transition-colors"
                onClick={() => setExpanded(e => ({ ...e, [p.awork_project_id]: !e[p.awork_project_id] }))}
              >
                {isOpen
                  ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                }

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{p.name}</span>
                    {p.company_name && <span className="text-xs text-muted-foreground">· {p.company_name}</span>}
                    {p.isOverrun && (
                      <span className="flex-shrink-0 text-xs bg-red-100 text-red-700 border border-red-200 rounded px-1.5 py-0.5 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Überzogen
                      </span>
                    )}
                    {!p.isOverrun && pct !== null && pct >= 80 && (
                      <span className="flex-shrink-0 text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-medium">
                        Warnzone
                      </span>
                    )}
                  </div>
                  {p.budgetMin > 0 && <BudgetBar pct={pct ?? 0} />}
                </div>

                <div className="grid grid-cols-3 gap-4 flex-shrink-0 text-right ml-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Erfasst</p>
                    <p className="text-sm font-semibold">{fmtH(p.trackedMin)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Budget</p>
                    <p className="text-sm font-medium">{p.budgetMin > 0 ? fmtH(p.budgetMin) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Auslastung</p>
                    <p className={`text-sm ${pctColor}`}>{pctLabel}</p>
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t px-4 pb-4 pt-3 bg-muted/20">
                  {p.topUsers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Keine Zeiteinträge vorhanden.</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Stunden nach Mitarbeiter</p>
                      {p.topUsers.map((u, i) => {
                        const userPct = p.trackedMin > 0 ? Math.round((u.minutes / p.trackedMin) * 100) : 0;
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-xs w-32 truncate font-medium">{u.name}</span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary/70 rounded-full"
                                style={{ width: `${userPct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-12 text-right">{fmtH(u.minutes)}</span>
                            <span className="text-xs text-muted-foreground w-8 text-right">{userPct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {p.project_status && (
                    <p className="text-xs text-muted-foreground mt-3">Status: <span className="font-medium">{p.project_status}</span></p>
                  )}
                </div>
              )}
            </Card>
          );
        })}

        {sorted.length === 0 && (
          <Card className="p-12 text-center">
            <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Keine Projekte gefunden.</p>
          </Card>
        )}
      </div>
    </div>
  );
}