import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Clock, AlertTriangle } from 'lucide-react';

const MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function formatH(seconds) {
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')} h`;
}

export default function NonBillableWidget() {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['aworkTimeEntries'],
    queryFn: () => base44.entities.AworkTimeEntry.list('-entry_date', 5000),
    staleTime: 5 * 60 * 1000,
  });

  const { monthlyData, totalBillable, totalNonBillable, nonBillablePct, userNonBillable, currentMonth } = useMemo(() => {
    if (!entries.length) return { monthlyData: [], totalBillable: 0, totalNonBillable: 0, nonBillablePct: 0, userNonBillable: [], currentMonth: '' };

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

    // Letzte 4 Monate (inkl. aktueller)
    const monthlyData = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-4)
      .map(([month, v]) => {
        const [, m] = month.split('-');
        const total = v.billable + v.nonBillable;
        return {
          name: MONTHS_DE[parseInt(m, 10) - 1],
          month,
          billable_h: parseFloat((v.billable / 3600).toFixed(1)),
          non_billable_h: parseFloat((v.nonBillable / 3600).toFixed(1)),
          pct: total > 0 ? Math.round((v.nonBillable / total) * 100) : 0,
        };
      });

    // KPIs aus aktuellem Monat — falls keine Daten, letzten verfügbaren Monat nehmen
    const todayMonth = new Date().toISOString().substring(0, 7);
    const availableMonths = Object.keys(byMonth).sort();
    const lastAvailableMonth = availableMonths[availableMonths.length - 1] || todayMonth;
    const currentMonth = byMonth[todayMonth] ? todayMonth : lastAvailableMonth;
    const currentMonthEntries = clientEntries.filter(e => e.entry_month === currentMonth);
    const totalBillable = currentMonthEntries.filter(e => e.is_billable !== false).reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const totalNonBillable = currentMonthEntries.filter(e => e.is_billable === false).reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const total = totalBillable + totalNonBillable;
    const nonBillablePct = total > 0 ? Math.round((totalNonBillable / total) * 100) : 0;

    // Kollegen - aktueller Monat (currentMonth und currentMonthEntries bereits oben definiert)
    const byUser = {};
    for (const e of currentMonthEntries) {
      const name = e.user_name || 'Unbekannt';
      if (!byUser[name]) byUser[name] = { nonBillable: 0, billable: 0 };
      if (e.is_billable === false) byUser[name].nonBillable += e.duration_minutes || 0;
      else byUser[name].billable += e.duration_minutes || 0;
    }
    const userNonBillable = Object.entries(byUser)
      .map(([fullName, v]) => ({
        fullName,
        non_billable_h: parseFloat((v.nonBillable / 3600).toFixed(1)),
          billable_h: parseFloat((v.billable / 3600).toFixed(1)),
      }))
      .filter(u => u.non_billable_h > 0 || u.billable_h > 0)
      .sort((a, b) => b.non_billable_h - a.non_billable_h);

    return { monthlyData, totalBillable, totalNonBillable, nonBillablePct, userNonBillable, currentMonth };
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

  const [curYear, curMonthNum] = currentMonth.split('-');
  const currentMonthLabel = `${MONTHS_DE[parseInt(curMonthNum, 10) - 1]} ${curYear}`;

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
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* LINKS: Monats-Trend + KPIs */}
          <div className="space-y-4">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Trend (letzte Monate)</div>

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
                <div className="text-xs text-muted-foreground">Quote (akt. Monat)</div>
              </div>
            </div>

            {/* Monthly Bar Chart */}
            {monthlyData.length > 0 && (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={monthlyData} barSize={28} barGap={2}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v, name) => {
                      const h = Math.floor(v); const m = Math.round((v - h) * 60);
                      return [`${h}:${String(m).padStart(2,'0')} h`, name === 'billable_h' ? 'Verrechenbar' : 'Nicht verr.'];
                    }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="billable_h" stackId="a" fill="hsl(var(--chart-2))" />
                  <Bar dataKey="non_billable_h" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]}>
                    {monthlyData.map((entry, i) => (
                      <Cell key={i} fill={entry.pct >= 30 ? '#dc2626' : entry.pct >= 15 ? '#f59e0b' : '#fca5a5'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* RECHTS: Kollegen aktueller Monat */}
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Kollegen – nicht verrechenbar ({currentMonthLabel})
            </div>
            {userNonBillable.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(140, userNonBillable.length * 32)}>
                <BarChart data={userNonBillable} layout="vertical" barSize={18} margin={{ left: 0, right: 48, top: 2, bottom: 2 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="fullName" tick={{ fontSize: 11 }} width={100} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v, key) => {
                      const h = Math.floor(v); const m = Math.round((v - h) * 60);
                      return [`${h}:${String(m).padStart(2,'0')} h`, key === 'non_billable_h' ? 'Nicht verr.' : 'Verrechenbar'];
                    }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="billable_h" stackId="u" fill="hsl(var(--chart-2))" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="non_billable_h" stackId="u" radius={[0, 3, 3, 0]}>
                    {userNonBillable.map((u, i) => {
                      const userTotal = u.billable_h + u.non_billable_h;
                      const pct = userTotal > 0 ? (u.non_billable_h / userTotal) * 100 : 0;
                      const color = pct >= 30 ? '#dc2626' : pct >= 15 ? '#f59e0b' : '#fca5a5';
                      return <Cell key={i} fill={color} />;
                    })}
                    <LabelList dataKey="non_billable_h" position="right" formatter={v => { if (!v) return ''; const h = Math.floor(v); const m = Math.round((v - h) * 60); return `${h}:${String(m).padStart(2,'0')} h`; }} style={{ fontSize: 11, fill: '#6b7280', fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-sm text-muted-foreground italic">Keine Daten für den aktuellen Monat.</div>
            )}
          </div>

        </div>
      </CardContent>
    </Card>
  );
}