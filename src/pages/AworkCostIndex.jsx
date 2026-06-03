import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Clock, ChevronDown, ChevronRight, AlertTriangle, TrendingUp, ExternalLink } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function fmtH(hours) {
  if (hours === null || hours === undefined) return '—';
  return `${Number(hours).toFixed(1)}h`;
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

const BUDGET_CATEGORY_OPTIONS = [
  { value: 'fixed_budget_project', label: 'Fixpreis-Projekt' },
  { value: 'ongoing_support', label: 'Laufende Umsetzung / OM' },
  { value: 'maintenance_contract', label: 'Wartungsvertrag' },
  { value: 'internal', label: 'Intern' },
  { value: 'support_request', label: 'Support-Anfrage' },
  { value: 'no_budget', label: 'Kein Budget' },
];

// Heuristic: detect likely non-budget-relevant projects by name keywords
// Explicit exclusion patterns based on PM feedback
const NON_BUDGET_PATTERNS = [
  // Internal / admin
  { pattern: /rittler.*(admin|tätigkeiten|tätig|intern|referenzen|meeting|supportanfragen)/i, category: 'internal' },
  { pattern: /rittler.*(online.?marketing)/i, category: 'ongoing_support' },
  { pattern: /^rittler$/i, category: 'internal' },
  // OM / ongoing
  { pattern: /online.?marketing/i, category: 'ongoing_support' },
  { pattern: /\bom\b/i, category: 'ongoing_support' },
  { pattern: /laufende.?betreuung/i, category: 'ongoing_support' },
  // Maintenance / Wartung
  { pattern: /wartung/i, category: 'maintenance_contract' },
  { pattern: /maintenance/i, category: 'maintenance_contract' },
  // Support
  { pattern: /supportanfragen?/i, category: 'support_request' },
  // Generic internal
  { pattern: /\bintern\b/i, category: 'internal' },
];

function detectBudgetCategory(name = '', projectType = '') {
  const combined = `${name} ${projectType || ''}`;
  for (const { pattern, category } of NON_BUDGET_PATTERNS) {
    if (pattern.test(combined)) return category;
  }
  // Fallback type-based check
  const t = (projectType || '').toLowerCase();
  if (t.includes('online marketing')) return 'ongoing_support';
  if (t.includes('maintenance')) return 'maintenance_contract';
  return 'fixed_budget_project';
}

export default function AworkCostIndex() {
  const [expanded, setExpanded] = useState({});
  const [sortBy, setSortBy] = useState('budget_pct'); // 'budget_pct' | 'tracked' | 'name'
  const [filterOverrun, setFilterOverrun] = useState(false);
  const [filterNoBudget, setFilterNoBudget] = useState(false);
  const [filterPM, setFilterPM] = useState('');
  const [filterCategory, setFilterCategory] = useState('fixed_budget_project');
  const [showNonBudget, setShowNonBudget] = useState(false);

  const { data: snapshots = [], isLoading: sLoading } = useQuery({
    queryKey: ['aworkSnapshots'], queryFn: () => base44.entities.AworkProjectSnapshot.list()
  });
  const { data: timeEntries = [], isLoading: tLoading } = useQuery({
    queryKey: ['aworkTimeEntries'], queryFn: () => base44.entities.AworkTimeEntry.list('-entry_date', 10000)
  });
  const { data: liquidityProjects = [] } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
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
      // duration_minutes enthält laut awork-API Sekunden (trotz Feldname) → ÷3600
      map[pid].byUser[user] = (map[pid].byUser[user] || 0) + (e.duration_minutes || 0) / 3600;
    });
    return map;
  }, [timeEntries]);

  const projects = useMemo(() => {
    const INACTIVE_KEYWORDS = ['done', 'archived', 'abgeschlossen', 'completed', 'cancelled',
      'abgebrochen', 'geblockt', 'blocked', 'stuck', 'closed', 'fertig', 'beendet', 'inaktiv'];
    const isActiveStatus = (snap) => {
      // Prefer raw_payload.projectStatus.type for reliable check
      try {
        if (snap.raw_payload) {
          const raw = typeof snap.raw_payload === 'string' ? JSON.parse(snap.raw_payload) : snap.raw_payload;
          if (raw.projectStatus?.type === 'closed') return false;
        }
      } catch (_) {}
      const s = (snap.project_status || '').toLowerCase();
      return !INACTIVE_KEYWORDS.some(kw => s.includes(kw));
    };

    // Deduplicate: keep only the most recently synced snapshot per awork_project_id
    const byProjectId = {};
    for (const s of snapshots) {
      if (s.is_archived) continue;
      const existing = byProjectId[s.awork_project_id];
      if (!existing || s.last_synced_at > existing.last_synced_at) {
        byProjectId[s.awork_project_id] = s;
      }
    }
    const deduped = Object.values(byProjectId);

    // Filter: only active/ongoing projects
    return deduped
      .filter(s => isActiveStatus(s))
      .map(s => {
        // DB-Felder sollten Minuten enthalten (Sync: Sekunden÷60).
        // Alte Einträge (vor Fix) können aber noch Sekunden enthalten → Heuristik:
        // Wenn tracked_duration_minutes > 50000 und kein raw_payload-Parsing möglich,
        // dann wahrscheinlich Sekunden → ÷3600 statt ÷60.
        // raw_payload (jetzt ohne HTML) überschreibt den Fallback immer korrekt.
        const rawTracked = s.tracked_duration_minutes ?? 0;
        const rawBudget = s.time_budget_minutes ?? 0;
        // Heuristik: >50000 "Minuten" wären >833h — unrealistisch für ein einzelnes Projekt → Sekunden
        let trackedH = rawTracked > 50000 ? rawTracked / 3600 : rawTracked / 60;
        let budgetH = rawBudget > 50000 ? rawBudget / 3600 : rawBudget / 60;
        try {
          if (s.raw_payload) {
            const raw = typeof s.raw_payload === 'string' ? JSON.parse(s.raw_payload) : s.raw_payload;
            if (typeof raw.trackedDuration === 'number') trackedH = raw.trackedDuration / 3600;
            // timeBudget bevorzugen; wenn 0 oder fehlt, plannedDuration als Budget nehmen
            if (typeof raw.timeBudget === 'number' && raw.timeBudget > 0) {
              budgetH = raw.timeBudget / 3600;
            } else if (typeof raw.plannedDuration === 'number' && raw.plannedDuration > 0) {
              budgetH = raw.plannedDuration / 3600;
            } else {
              budgetH = 0;
            }
          }
        } catch (_) { /* raw_payload abgeschnitten/ungültig — DB-Wert (÷60) bereits gesetzt */ }
        const budgetPct = budgetH > 0 ? Math.round((trackedH / budgetH) * 100) : null;

        // Mitarbeiter-Verteilung aus den synced TimeEntries (duration_minutes → Stunden)
        const byUser = timeByProject[s.awork_project_id]?.byUser ?? {};
        const topUsers = Object.entries(byUser)
          .map(([name, hours]) => ({ name, hours }))
          .sort((a, b) => b.hours - a.hours);
        const timeEntryTotalH = topUsers.reduce((sum, u) => sum + u.hours, 0);

        // PM from linked LiquidityProject
        const linkedProject = liquidityProjects.find(p => p.awork_project_id === s.awork_project_id);
        const pm = linkedProject?.project_manager || s.responsible_user_name || '';

        // Budget category heuristic
        const budgetCategory = detectBudgetCategory(s.name, s.project_type);
        // Budget relevant = fixed_budget_project AND has a total project budget (not just ticket-level)
        const isBudgetRelevant = budgetCategory === 'fixed_budget_project' && budgetH > 0;
        const exclusionReason = !isBudgetRelevant ? (
          budgetH === 0 ? 'kein Gesamtbudget' :
          budgetCategory === 'ongoing_support' ? 'laufende Betreuung / OM' :
          budgetCategory === 'maintenance_contract' ? 'Wartungsvertrag' :
          budgetCategory === 'internal' ? 'intern' :
          budgetCategory === 'support_request' ? 'Support' :
          'kein Gesamtbudget'
        ) : null;

        return {
          ...s,
          trackedH,
          budgetH,
          budgetPct,
          topUsers,
          timeEntryTotalH,
          isOverrun: isBudgetRelevant && budgetPct !== null && budgetPct >= 100,
          pm,
          budgetCategory,
          isBudgetRelevant,
          exclusionReason,
        };
      });
  }, [snapshots, timeByProject, liquidityProjects]);

  const allPMs = useMemo(() => [...new Set(projects.map(p => p.pm).filter(Boolean))].sort(), [projects]);
  const budgetRelevant = projects.filter(p => p.isBudgetRelevant);
  const nonBudgetRelevant = projects.filter(p => !p.isBudgetRelevant);
  const noBudgetCount = budgetRelevant.filter(p => p.budgetH === 0).length;

  const sorted = useMemo(() => {
    let list = filterCategory === 'fixed_budget_project' ? budgetRelevant :
               filterCategory ? projects.filter(p => p.budgetCategory === filterCategory) :
               projects;
    if (filterPM) list = list.filter(p => p.pm === filterPM);
    if (filterOverrun) list = list.filter(p => p.isOverrun);
    if (filterNoBudget) list = list.filter(p => p.budgetH === 0);
    if (sortBy === 'budget_pct') {
      list = [...list].sort((a, b) => {
        if (a.budgetPct === null && b.budgetPct === null) return 0;
        if (a.budgetPct === null) return 1;
        if (b.budgetPct === null) return -1;
        return b.budgetPct - a.budgetPct;
      });
    } else if (sortBy === 'tracked') {
      list = [...list].sort((a, b) => b.trackedH - a.trackedH);
    } else {
      list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
    }
    return list;
  }, [projects, sortBy, filterOverrun, filterNoBudget]);

  const overrunCount = budgetRelevant.filter(p => p.isOverrun).length;
  const warnCount = budgetRelevant.filter(p => p.budgetPct !== null && p.budgetPct >= 80 && p.budgetPct < 100).length;
  const totalTrackedH = projects.reduce((s, p) => s + p.trackedH, 0).toFixed(0);
  const totalBudgetH = projects.reduce((s, p) => s + p.budgetH, 0).toFixed(0);

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
        <Card className="p-4 border-l-4 border-l-amber-500">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">In Warnzone (≥80%)</p>
          <p className="text-2xl font-bold mt-1 text-amber-600">{warnCount}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-red-500">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Budget überzogen</p>
          <p className="text-2xl font-bold mt-1 text-red-600">{overrunCount}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-slate-400">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Kein Budget hinterlegt</p>
          <p className="text-2xl font-bold mt-1 text-slate-500">{noBudgetCount}</p>
          <p className="text-xs text-muted-foreground">keine Kontrolle möglich</p>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Category filter */}
        <div className="flex gap-1 border rounded-lg p-1">
          {[
            { key: 'fixed_budget_project', label: 'Fixpreis' },
            { key: '', label: 'Alle' },
          ].map(s => (
            <button key={s.key} onClick={() => setFilterCategory(s.key)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${filterCategory === s.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {s.label}
            </button>
          ))}
        </div>
        {/* PM filter */}
        <select
          className="border rounded-lg px-2.5 py-1.5 text-xs bg-card h-8"
          value={filterPM}
          onChange={e => setFilterPM(e.target.value)}
        >
          <option value="">Alle PM</option>
          {allPMs.map(pm => <option key={pm} value={pm}>{pm}</option>)}
        </select>
        {/* Sort */}
        <div className="flex gap-1 border rounded-lg p-1">
          {[
            { key: 'budget_pct', label: 'Budget %' },
            { key: 'tracked', label: 'Stunden' },
            { key: 'name', label: 'Name' },
          ].map(s => (
            <button key={s.key} onClick={() => setSortBy(s.key)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${sortBy === s.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <button onClick={() => setFilterOverrun(f => !f)}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${filterOverrun ? 'bg-red-50 border-red-300 text-red-700 font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}>
          <AlertTriangle className="w-3 h-3" />
          Nur Überzieher
        </button>
        <button onClick={() => { setFilterNoBudget(f => !f); if (filterOverrun) setFilterOverrun(false); }}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${filterNoBudget ? 'bg-slate-100 border-slate-400 text-slate-700 font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}>
          Kein Budget ({noBudgetCount})
        </button>
        <button onClick={() => setShowNonBudget(f => !f)}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${showNonBudget ? 'bg-muted border-muted-foreground/30 font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}>
          Nicht budgetrelevant ({nonBudgetRelevant.length})
        </button>
      </div>

      {/* Non-budget section */}
      {showNonBudget && nonBudgetRelevant.length > 0 && (
        <div className="rounded-xl border border-dashed border-muted-foreground/30 p-4 space-y-2 bg-muted/10">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Nicht budgetrelevant / ohne Gesamtbudget ({nonBudgetRelevant.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {nonBudgetRelevant.map(p => (
              <span key={p.awork_project_id} className="text-xs border rounded-lg px-2.5 py-1 bg-card flex items-center gap-1.5">
                <span className="text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.exclusionReason || p.budgetCategory?.replace(/_/g, ' ')}</span>
                <span className="font-medium">{p.name}</span>
                {p.pm && <span className="text-muted-foreground">· {p.pm}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

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
                    <a
                      href={`https://app.awork.com/projects/${p.awork_project_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      title="In awork öffnen"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
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
                  {p.budgetH > 0 && <BudgetBar pct={pct ?? 0} />}
                </div>

                <div className="grid grid-cols-3 gap-4 flex-shrink-0 text-right ml-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Erfasst</p>
                    <p className="text-sm font-semibold">{fmtH(p.trackedH)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Budget</p>
                    <p className="text-sm font-medium">{p.budgetH > 0 ? fmtH(p.budgetH) : '—'}</p>
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
                    <p className="text-xs text-muted-foreground">Keine lokalen Zeiteinträge (letzte 2 Monate) vorhanden.</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        Mitarbeiter-Verteilung <span className="normal-case font-normal">(lokal erfasst, letzte 2 Monate · {fmtH(p.timeEntryTotalH)} total)</span>
                      </p>
                      {p.topUsers.map((u, i) => {
                        const userPct = p.timeEntryTotalH > 0 ? Math.round((u.hours / p.timeEntryTotalH) * 100) : 0;
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-xs w-32 truncate font-medium">{u.name}</span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary/70 rounded-full"
                                style={{ width: `${userPct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-12 text-right">{fmtH(u.hours)}</span>
                            <span className="text-xs text-muted-foreground w-8 text-right">{userPct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground border-t pt-3">
                    {p.project_status && (
                      <span>Status: <span className="font-medium text-foreground">{p.project_status}</span></span>
                    )}
                    <span>Gesamt erfasst (awork): <span className="font-medium text-foreground">{fmtH(p.trackedH)}</span></span>
                    {p.budgetH > 0 && <span>Budget: <span className="font-medium text-foreground">{fmtH(p.budgetH)}</span></span>}
                  </div>
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