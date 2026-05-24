import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Clock, AlertTriangle } from 'lucide-react';

const MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function formatH(minutes) {
  return (minutes / 60).toFixed(1) + ' h';
}

export default function NonBillableWidget() {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['aworkTimeEntries'],
    queryFn: () => base44.entities.AworkTimeEntry.list('-entry_date', 5000),
    staleTime: 5 * 60 * 1000,
  });

  const { monthlyData, totalBillable, totalNonBillable, nonBillablePct, topProjects } = useMemo(() => {
    if (!entries.length) return { monthlyData: [], totalBillable: 0, totalNonBillable: 0, nonBillablePct: 0, topProjects: [] };

    // Nur Kundenprojekte (nicht reine Intern-Projekte)
    const clientEntries = entries.filter(e => !e.project_name?.toLowerCase().includes('rittler - interne'));

    // Monats-Aggregation
    const byMonth = {};
    for (const e of clientEntries) {
      const m = e.entry_month;
      if (!m) continue;
      if (!byMonth[m]) byMonth[m] = { billable: 0, nonBillable: 0 };
      const mins = e.duration_minutes || 0;
      if (e.is_billable !== false) byMonth[m].billable += mins;
      else byMonth[m].nonBillable += mins;
    }

    const monthlyData = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, v]) => {
        const [y, m] = month.split('-');
        const total = v.billable + v.nonBillable;
        return {
          name: MONTHS_DE[parseInt(m, 10) - 1],
          month,
          billable_h: parseFloat((v.billable / 60).toFixed(1)),
          non_billable_h: parseFloat((v.nonBillable / 60).toFixed(1)),
          pct: total > 0 ? Math.round((v.nonBillable / total) * 100) : 0,
        };
      });

    // Gesamt-KPIs (letzten 2 Monate)
    const recentMonths = monthlyData.slice(-2).map(d => d.month);
    const recentEntries = clientEntries.filter(e => recentMonths.includes(e.entry_month));
    const totalBillable = recentEntries.filter(e => e.is_billable !== false).reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const totalNonBillable = recentEntries.filter(e => e.is_billable === false).reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const total = totalBillable + totalNonBillable;
    const nonBillablePct = total > 0 ? Math.round((totalNonBillable / total) * 100) : 0;

    // Top Projekte mit nicht-verrechenbaren Stunden (Kundenprojekte)
    const byProject = {};
    for (const e of recentEntries.filter(e => e.is_billable === false)) {
      const key = e.project_name || 'Unbekannt';
      if (!byProject[key]) byProject[key] = 0;
      byProject[key] += e.duration_minutes || 0;
    }
    const topProjects = Object.entries(byProject)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, mins]) => ({ name, h: parseFloat((mins / 60).toFixed(1)) }));

    return { monthlyData, totalBillable, totalNonBillable, nonBillablePct, topProjects };
  }, [entries]);

  const pctColor = nonBillablePct >= 30 ? 'text-red-500' : nonBillablePct >= 15 ? 'text-amber-500' : 'text-green-600';

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><Clock className="w-4 h-4" />Nicht verrechenbare Stunden</CardTitle></CardHeader>
        <CardContent><div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Lade Zeitbuchungen...</div></CardContent>
      </Card>
    );
  }

  if (!entries.length) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><Clock className="w-4 h-4" />Nicht verrechenbare Stunden</CardTitle></CardHeader>
        <CardContent>
          <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
            <Clock className="w-8 h-8 opacity-30" />
            <span>Noch keine Daten — bitte Sync starten</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Nicht verrechenbare Stunden (Kundenprojekte)
          </CardTitle>
          {nonBillablePct >= 20 && (
            <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
              <AlertTriangle className="w-3 h-3" />
              Hoch
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-lg font-bold text-foreground">{formatH(totalBillable)}</div>
            <div className="text-xs text-muted-foreground">Verrechenbar</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-bold ${pctColor}`}>{formatH(totalNonBillable)}</div>
            <div className="text-xs text-muted-foreground">Nicht verr.</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${pctColor}`}>{nonBillablePct}%</div>
            <div className="text-xs text-muted-foreground">Quote (2 Mon.)</div>
          </div>
        </div>

        {/* Monthly Bar Chart */}
        {monthlyData.length > 0 && (
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={monthlyData} barSize={20} barGap={2}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                formatter={(v, name) => [`${v} h`, name === 'billable_h' ? 'Verrechenbar' : 'Nicht verr.']}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="billable_h" stackId="a" fill="hsl(var(--chart-2))" radius={[0, 0, 0, 0]} />
              <Bar dataKey="non_billable_h" stackId="a" fill="hsl(var(--chart-4))" radius={[3, 3, 0, 0]}>
                {monthlyData.map((entry, i) => (
                  <Cell key={i} fill={entry.pct >= 30 ? '#ef4444' : entry.pct >= 15 ? '#f59e0b' : '#f87171'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Top Projekte */}
        {topProjects.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top Projekte (nicht verr.)</div>
            {topProjects.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="truncate text-foreground max-w-[75%]" title={p.name}>{p.name}</span>
                <span className="font-medium text-red-500 ml-2">{p.h} h</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}