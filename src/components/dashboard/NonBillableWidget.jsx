import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Clock, AlertTriangle, TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import TaetigkeitsMix from './TaetigkeitsMix';

const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// Aktuellen Monat lokal (nicht UTC) bestimmen
function getLocalMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatH(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${String(m).padStart(2, '0')} h`;
}

function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${MONTHS_DE[parseInt(m, 10) - 1]} ${y}`;
}

function pctColor(pct) {
  return pct >= 30 ? 'text-red-500' : pct >= 15 ? 'text-amber-500' : 'text-green-600';
}

function MonthKpiPanel({ label, billable, nonBillable, userStats, isCurrentMonth }) {
  const total = billable + nonBillable;
  const pct = total > 0 ? Math.round((nonBillable / total) * 100) : 0;
  const color = pctColor(pct);

  return (
    <div className={`rounded-xl border p-4 space-y-4 ${isCurrentMonth ? 'border-primary/30 bg-primary/3' : 'border-border bg-muted/20'}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        {isCurrentMonth && (
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Live</span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-base font-bold text-foreground">{formatH(billable)}</div>
          <div className="text-xs text-muted-foreground">Verrechenbar</div>
        </div>
        <div>
          <div className={`text-base font-bold ${color}`}>{formatH(nonBillable)}</div>
          <div className="text-xs text-muted-foreground">Nicht verr.</div>
        </div>
        <div>
          <div className={`text-2xl font-bold ${color}`}>{pct}%</div>
          <div className="text-xs text-muted-foreground">Quote</div>
        </div>
      </div>

      {/* Kollegen-Chart */}
      {userStats.length > 0 && (
        <>
          <div className="text-xs font-medium text-muted-foreground border-t pt-3">Kollegen</div>
          <ResponsiveContainer width="100%" height={Math.max(100, userStats.length * 30)}>
            <BarChart data={userStats} layout="vertical" barSize={14} margin={{ left: 0, right: 52, top: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="shortName" tick={{ fontSize: 11 }} width={80} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v, key) => {
                  const h = Math.floor(v); const m = Math.round((v - h) * 60);
                  return [`${h}:${String(m).padStart(2, '0')} h`, key === 'non_billable_h' ? 'Nicht verr.' : 'Verrechenbar'];
                }}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="billable_h" stackId="u" fill="hsl(var(--chart-2))" />
              <Bar dataKey="non_billable_h" stackId="u" radius={[0, 3, 3, 0]}>
                {userStats.map((u, i) => {
                  const ut = u.billable_h + u.non_billable_h;
                  const p = ut > 0 ? (u.non_billable_h / ut) * 100 : 0;
                  return <Cell key={i} fill={p >= 30 ? '#dc2626' : p >= 15 ? '#f59e0b' : '#fca5a5'} />;
                })}
                <LabelList
                  dataKey="non_billable_h"
                  position="right"
                  formatter={v => { if (!v) return ''; const h = Math.floor(v); const m = Math.round((v - h) * 60); return `${h}:${String(m).padStart(2, '0')}`; }}
                  style={{ fontSize: 10, fill: '#6b7280', fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

export default function NonBillableWidget() {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['aworkTimeEntries'],
    queryFn: () => base44.entities.AworkTimeEntry.list('-entry_date', 5000),
    staleTime: 5 * 60 * 1000,
  });

  const { data: syncLogs = [] } = useQuery({
    queryKey: ['aworkSyncLog'],
    queryFn: () => base44.entities.AworkSyncLog.filter({ sync_type: 'time_entries' }, '-finished_at', 1),
    staleTime: 5 * 60 * 1000,
  });

  const lastSync = syncLogs[0] || null;
  const syncOk = lastSync?.status === 'success';
  const syncFailed = lastSync?.status === 'failed' || lastSync?.status === 'partial';
  const syncAge = lastSync?.finished_at ? Math.floor((Date.now() - new Date(lastSync.finished_at).getTime()) / (1000 * 60 * 60)) : null;
  const syncStale = syncAge !== null && syncAge > 26; // mehr als ~1 Tag alt

  const { monthlyChartData, curData, prevData, curMonth, prevMonth } = useMemo(() => {
    const empty = { monthlyChartData: [], curData: null, prevData: null, curMonth: '', prevMonth: '' };
    if (!entries.length) return empty;

    const clientEntries = entries;

    // Monats-Aggregation
    const byMonth = {};
    for (const e of clientEntries) {
      const m = e.entry_month;
      if (!m) continue;
      if (!byMonth[m]) byMonth[m] = { billable: 0, nonBillable: 0, users: {} };
      const mins = e.duration_minutes || 0;
      const isBillable = e.is_billable !== false;
      if (isBillable) byMonth[m].billable += mins;
      else byMonth[m].nonBillable += mins;
      // User-Aggregation pro Monat
      const name = e.user_name || 'Unbekannt';
      if (!byMonth[m].users[name]) byMonth[m].users[name] = { billable: 0, nonBillable: 0 };
      if (isBillable) byMonth[m].users[name].billable += mins;
      else byMonth[m].users[name].nonBillable += mins;
    }

    // Aktueller Monat (lokal, nicht UTC!)
    const todayMonth = getLocalMonth();
    const availableMonths = Object.keys(byMonth).sort();
    const lastAvailable = availableMonths[availableMonths.length - 1] || todayMonth;
    const curMonth = byMonth[todayMonth] ? todayMonth : lastAvailable;

    // Vormonat
    const [cy, cm] = curMonth.split('-').map(Number);
    const prevDate = new Date(cy, cm - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    function buildMonthData(monthKey) {
      const d = byMonth[monthKey];
      if (!d) return null;
      const userStats = Object.entries(d.users)
        .map(([fullName, v]) => ({
          fullName,
          shortName: fullName.split(' ')[0], // Vorname
          billable_h: parseFloat((v.billable / 60).toFixed(1)),
          non_billable_h: parseFloat((v.nonBillable / 60).toFixed(1)),
        }))
        .filter(u => u.non_billable_h > 0 || u.billable_h > 0)
        .sort((a, b) => b.non_billable_h - a.non_billable_h);
      return {
        billable: d.billable / 60,
        nonBillable: d.nonBillable / 60,
        userStats,
      };
    }

    // Trend-Chart letzte 4 Monate
    const monthlyChartData = availableMonths
      .slice(-4)
      .map(month => {
        const [, m] = month.split('-');
        const v = byMonth[month];
        const total = v.billable + v.nonBillable;
        return {
          name: MONTHS_SHORT[parseInt(m, 10) - 1],
          billable_h: parseFloat((v.billable / 60).toFixed(1)),
          non_billable_h: parseFloat((v.nonBillable / 60).toFixed(1)),
          pct: total > 0 ? Math.round((v.nonBillable / total) * 100) : 0,
          isCurrent: month === curMonth,
        };
      });

    return {
      monthlyChartData,
      curData: buildMonthData(curMonth),
      prevData: buildMonthData(prevMonth),
      curMonth,
      prevMonth,
    };
  }, [entries]);

  // Delta für Header-Badge
  const curPct = curData ? (curData.billable + curData.nonBillable > 0 ? Math.round((curData.nonBillable / (curData.billable + curData.nonBillable)) * 100) : 0) : 0;
  const prevPct = prevData ? (prevData.billable + prevData.nonBillable > 0 ? Math.round((prevData.nonBillable / (prevData.billable + prevData.nonBillable)) * 100) : 0) : 0;
  const delta = curPct - prevPct;

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

  const DeltaIcon = delta > 3 ? TrendingUp : delta < -3 ? TrendingDown : Minus;
  const deltaTextColor = delta > 3 ? 'text-red-500' : delta < -3 ? 'text-green-600' : 'text-muted-foreground';
  const deltaBg = delta > 3 ? 'bg-red-50' : delta < -3 ? 'bg-green-50' : 'bg-muted/50';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Nicht verrechenbare Stunden — Entwicklung
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Sync-Status Badge */}
            {lastSync && (
              <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                syncFailed ? 'bg-red-50 text-red-600' :
                syncStale ? 'bg-amber-50 text-amber-600' :
                'bg-green-50 text-green-700'
              }`} title={lastSync.finished_at ? `Letzter Sync: ${new Date(lastSync.finished_at).toLocaleString('de-AT')}` : ''}>
                {syncFailed ? <XCircle className="w-3 h-3" /> : syncStale ? <RefreshCw className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                {syncFailed ? 'Sync fehlgeschlagen' : syncStale ? `Sync vor ${syncAge}h` : syncAge !== null ? `Sync vor ${syncAge}h` : 'Sync OK'}
              </div>
            )}
            {curPct >= 20 && (
              <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                <AlertTriangle className="w-3 h-3" />
                Hoch
              </div>
            )}
            {prevData && (
              <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md font-semibold ${deltaTextColor} ${deltaBg}`}>
                <DeltaIcon className="w-3 h-3" />
                {delta > 0 ? '+' : ''}{delta} PP ggü. Vormonat
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Trend-Chart */}
        {monthlyChartData.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Monatstrend</div>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={monthlyChartData} barSize={32} barGap={2}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(v, name) => {
                    const h = Math.floor(v); const m = Math.round((v - h) * 60);
                    return [`${h}:${String(m).padStart(2, '0')} h`, name === 'billable_h' ? 'Verrechenbar' : 'Nicht verr.'];
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="billable_h" stackId="a" fill="hsl(var(--chart-2))" />
                <Bar dataKey="non_billable_h" stackId="a" radius={[3, 3, 0, 0]}>
                  {monthlyChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.pct >= 30 ? '#dc2626' : entry.pct >= 15 ? '#f59e0b' : '#fca5a5'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Vormonat vs. Aktueller Monat — nebeneinander */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {prevData && (
            <MonthKpiPanel
              label={monthLabel(prevMonth)}
              billable={prevData.billable}
              nonBillable={prevData.nonBillable}
              userStats={prevData.userStats}
              isCurrentMonth={false}
            />
          )}
          {curData && (
            <MonthKpiPanel
              label={monthLabel(curMonth)}
              billable={curData.billable}
              nonBillable={curData.nonBillable}
              userStats={curData.userStats}
              isCurrentMonth={true}
            />
          )}
        </div>

        {/* Tätigkeiten je Person im laufenden Monat */}
        <div className="border-t pt-4">
          <TaetigkeitsMix entries={entries} month={curMonth} />
        </div>

      </CardContent>
    </Card>
  );
}