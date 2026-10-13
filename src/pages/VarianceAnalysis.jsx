import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { BarChart2, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const MONTHS_FORWARD = 12;

function getMonthsList() {
  const today = new Date();
  return Array.from({ length: MONTHS_FORWARD }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    return format(d, 'yyyy-MM');
  });
}

/**
 * Reiner Plan-Soll/Ist aus dem Projektcockpit (MonthlyBillingPlan) — KEINE sevDesk-Rechnungen.
 *
 * "Geplant" = der Umsatz, den die PMs für den jeweiligen planning_month zur Verrechnung
 *   eingeplant hatten (alle Planungspositionen außer stornierte).
 *
 * "Abgerechnet" = davon die Positionen, die tatsächlich abgerechnet wurden (billing_status = invoiced).
 *
 * Beispiel: Im Juni 40.778 € geplant, davon 18–19.000 € tatsächlich abgerechnet.
 */

export default function VarianceAnalysis() {
  const [view, setView] = useState('chart');
  const [filterPM, setFilterPM] = useState('');

  const { data: billingPlans = [], isLoading: l1 } = useQuery({
    queryKey: ['monthlyBillingPlans-variance'],
    queryFn: () => base44.entities.MonthlyBillingPlan.list('-planning_month', 2000),
  });
  const { data: projects = [], isLoading: l3 } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.LiquidityProject.list(),
  });

  const isLoading = l1 || l3;
  const months = useMemo(() => getMonthsList(), []);

  // PM-Liste aus Projekten
  const pmOptions = useMemo(() => {
    const set = new Set(projects.map(p => p.project_manager).filter(Boolean));
    return Array.from(set).sort();
  }, [projects]);

  // project_id -> project_manager lookup
  const projectPMMap = useMemo(() => {
    const map = {};
    projects.forEach(p => { map[p.id] = p.project_manager || ''; });
    return map;
  }, [projects]);

  // Gefilterte PM-Planung (MonthlyBillingPlan) nach PM
  const filteredPlans = useMemo(() => {
    if (!filterPM) return billingPlans;
    return billingPlans.filter(p => {
      const pm = p.assigned_pm || projectPMMap[p.project_id] || '';
      return pm === filterPM;
    });
  }, [billingPlans, filterPM, projectPMMap]);

  const monthlyData = useMemo(() => {
    if (isLoading) return [];

    return months.map(month => {
      // ── GEPLANT: PM-Abrechnungsplanung (MonthlyBillingPlan) für diesen planning_month ──
      // Das ist der Umsatz, den die PMs für den Monat zur Verrechnung eingeplant hatten.
      const plannedItems = filteredPlans.filter(p => p.planning_month === month && p.billing_status !== 'cancelled');
      const planned = plannedItems.reduce((s, p) => s + (Number(p.planned_amount_net) || 0), 0);

      // ── DAVON ABGERECHNET: geplante Positionen, die tatsächlich abgerechnet wurden ──
      const realizedItems = plannedItems.filter(p => p.billing_status === 'invoiced');
      const realized = realizedItems.reduce((s, p) => s + (Number(p.planned_amount_net) || 0), 0);

      // Abweichung = realisierte Planung gegenüber geplanter Planung
      const variance = realized - planned;
      const variancePct = planned > 0 ? Math.round((realized / planned) * 100) : null;

      const label = format(parseISO(`${month}-01`), 'MMM yy', { locale: de });
      return {
        month, label,
        planned,                 // PM-Abrechnungsplanung (Soll)
        realized,                // Davon tatsächlich abgerechnet (Ist)
        variance,
        variancePct,
        plannedCount: plannedItems.length,
        realizedCount: realizedItems.length,
      };
    });
  }, [filteredPlans, months, isLoading]);

  const totalPlanned = monthlyData.reduce((s, m) => s + m.planned, 0);
  const totalRealized = monthlyData.reduce((s, m) => s + m.realized, 0);
  const overallVariance = totalRealized - totalPlanned;
  const overallPct = totalPlanned > 0 ? Math.round((totalRealized / totalPlanned) * 100) : null;

  const chartData = monthlyData.map(m => ({
    name: m.label,
    Geplant: Math.round(m.planned),
    Abgerechnet: Math.round(m.realized),
  }));

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abweichungsanalyse"
        subtitle="Plan-Soll/Ist aus dem Projektcockpit: geplante vs. tatsächlich abgerechnete Planung"
        icon={BarChart2}
        actions={
          <div className="flex items-center gap-3">
            {/* PM Filter */}
            <select
              value={filterPM}
              onChange={e => setFilterPM(e.target.value)}
              className="text-xs border rounded-lg px-2 py-1.5 bg-background text-foreground"
            >
              <option value="">Alle PMs</option>
              {pmOptions.map(pm => <option key={pm} value={pm}>{pm}</option>)}
            </select>
            {/* View toggle */}
            <div className="flex gap-1 border rounded-lg p-1">
              <button onClick={() => setView('chart')} className={`px-3 py-1 text-xs rounded-md transition-colors ${view === 'chart' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Grafik</button>
              <button onClick={() => setView('table')} className={`px-3 py-1 text-xs rounded-md transition-colors ${view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Tabelle</button>
            </div>
          </div>
        }
      />

      <Alert className="border-blue-200 bg-blue-50">
        <Info className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-xs">
          <strong>Geplant</strong> = was die Projektmanager im Projektcockpit für diesen Monat zur Verrechnung eingeplant haben.{' '}
          <strong>Abgerechnet</strong> = davon die Positionen, die tatsächlich abgerechnet wurden.{' '}
          Es geht ausschließlich um den Planvergleich — echte sevDesk-Rechnungen sind hier nicht relevant.
        </AlertDescription>
      </Alert>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-blue-500">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Geplant (12 Mon.)</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalPlanned)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">PM-Planung im Cockpit</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-emerald-500">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Abgerechnet (Ist)</p>
          <p className="text-2xl font-bold mt-1 text-emerald-700">{formatCurrency(totalRealized)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">davon realisiert (Netto)</p>
        </Card>
        <Card className={`p-4 border-l-4 ${overallVariance >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Abweichung</p>
          <div className="flex items-center gap-1 mt-1">
            {overallVariance > 0 ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : overallVariance < 0 ? <TrendingDown className="w-4 h-4 text-red-500" /> : <Minus className="w-4 h-4 text-muted-foreground" />}
            <p className={`text-2xl font-bold ${overallVariance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{overallVariance >= 0 ? '+' : ''}{formatCurrency(overallVariance)}</p>
          </div>
          {overallPct !== null && <p className="text-xs text-muted-foreground">{overallPct >= 0 ? '+' : ''}{overallPct}% vs. Plan</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Ø Erreichungsgrad</p>
          <p className="text-2xl font-bold mt-1">{totalPlanned > 0 ? `${Math.round((totalRealized / totalPlanned) * 100)}%` : '—'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Abgerechnet / Geplant</p>
        </Card>
      </div>

      {filterPM && (
        <div className="flex items-center gap-2">
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">Filter: PM = {filterPM}</Badge>
          <button onClick={() => setFilterPM('')} className="text-xs text-muted-foreground hover:text-foreground underline">Filter entfernen</button>
        </div>
      )}

      {view === 'chart' ? (
        <Card className="p-6">
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend />
              <Bar dataKey="Geplant" fill="hsl(var(--chart-1))" opacity={0.65} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Abgerechnet" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Monat</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Geplant (Soll)</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Abgerechnet (Ist)</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Abweichung</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">% Plan</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((m, idx) => {
                const varColor = m.variance > 0 ? 'text-emerald-600' : m.variance < 0 ? 'text-red-600' : 'text-muted-foreground';
                const isPast = m.month < format(new Date(), 'yyyy-MM');
                return (
                  <tr key={idx} className={`border-b hover:bg-muted/20 transition-colors ${isPast ? 'bg-muted/10' : ''}`}>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-1.5">
                        {m.label}
                        {isPast && <span className="text-xs text-muted-foreground bg-muted px-1 rounded">Vergangen</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.planned > 0
                        ? <div><span className="font-medium">{formatCurrency(m.planned)}</span><br /><span className="text-xs text-muted-foreground">{m.plannedCount} Positionen</span></div>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.realized > 0
                        ? <div><span className="font-medium text-emerald-700">{formatCurrency(m.realized)}</span><br /><span className="text-xs text-muted-foreground">{m.planned > 0 ? Math.round((m.realized / m.planned) * 100) : 0}% des Plans</span></div>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${varColor}`}>
                      {m.planned === 0 && m.realized === 0 ? '—' : `${m.variance >= 0 ? '+' : ''}${formatCurrency(m.variance)}`}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${varColor}`}>
                      {m.variancePct !== null ? `${m.variancePct >= 0 ? '+' : ''}${m.variancePct}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 font-semibold border-t-2">
                <td className="px-4 py-3">Gesamt</td>
                <td className="px-4 py-3 text-right">{formatCurrency(totalPlanned)}</td>
                <td className="px-4 py-3 text-right text-emerald-700">{formatCurrency(totalRealized)}</td>
                <td className={`px-4 py-3 text-right ${overallVariance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {overallVariance >= 0 ? '+' : ''}{formatCurrency(overallVariance)}
                </td>
                <td className={`px-4 py-3 text-right ${overallVariance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {overallPct !== null ? `${overallPct >= 0 ? '+' : ''}${overallPct}%` : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}