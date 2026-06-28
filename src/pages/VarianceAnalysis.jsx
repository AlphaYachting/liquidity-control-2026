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
 * "Geplant" = BillingInstructions mit planned_invoice_date in diesem Monat
 *   die noch NICHT fakturiert/storniert sind.
 * Dies spiegelt exakt das wider, was im Projektcockpit und Forecast als Abrechnungsplan steht.
 *
 * "Verrechnet" = InvoiceRecords (echte Rechnungen aus sevDesk) mit invoice_date in diesem Monat.
 *
 * "Bezahlt" = InvoiceRecords mit payment_date in diesem Monat (Brutto).
 */

const PLAN_STATUSES_ACTIVE = ['draft', 'ready_for_backoffice', 'sent_to_backoffice'];
// draft wird als Indikator mitgezählt, invoice_created / paid / cancelled ausgeschlossen

export default function VarianceAnalysis() {
  const [view, setView] = useState('chart');
  const [filterPM, setFilterPM] = useState('');

  const { data: billingInstructions = [], isLoading: l1 } = useQuery({
    queryKey: ['billingInstructions-variance'],
    queryFn: () => base44.entities.BillingInstruction.list(),
  });
  const { data: invoices = [], isLoading: l2 } = useQuery({
    queryKey: ['invoiceRecords'],
    queryFn: () => base44.entities.InvoiceRecord.list(),
  });
  const { data: projects = [], isLoading: l3 } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.LiquidityProject.list(),
  });

  const isLoading = l1 || l2 || l3;
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

  // Gefilterte BillingInstructions nach PM
  const filteredBIs = useMemo(() => {
    if (!filterPM) return billingInstructions;
    return billingInstructions.filter(bi => {
      const pm = bi.requested_by_pm || projectPMMap[bi.project_id] || '';
      return pm === filterPM;
    });
  }, [billingInstructions, filterPM, projectPMMap]);

  // Gefilterte Invoices nach PM (über project_id)
  const filteredInvoices = useMemo(() => {
    if (!filterPM) return invoices;
    return invoices.filter(inv => {
      const pm = inv.project_id ? projectPMMap[inv.project_id] : '';
      return pm === filterPM;
    });
  }, [invoices, filterPM, projectPMMap]);

  const monthlyData = useMemo(() => {
    if (isLoading) return [];

    return months.map(month => {
      // ── GEPLANT: BillingInstructions mit planned_invoice_date in diesem Monat ──
      // Nur aktive (nicht bereits fakturiert/bezahlt/storniert)
      const plannedBIs = filteredBIs.filter(bi => {
        if (['invoice_created', 'paid', 'cancelled'].includes(bi.status)) return false;
        const d = bi.planned_invoice_date;
        return d && d.startsWith(month);
      });
      // Bereits als invoice_created/paid laufende BIs mit diesem Monat zählen als verrechnet
      const invoicedBIs = filteredBIs.filter(bi => {
        if (!['invoice_created', 'paid'].includes(bi.status)) return false;
        const d = bi.planned_invoice_date;
        return d && d.startsWith(month);
      });

      const planned = plannedBIs.reduce((s, bi) => s + (Number(bi.instruction_amount_net) || 0), 0);
      // Aus BillingInstructions bereits erstellte Rechnungen als Referenz
      const plannedThenInvoiced = invoicedBIs.reduce((s, bi) => s + (Number(bi.instruction_amount_net) || 0), 0);

      // ── VERRECHNET: echte Rechnungen (InvoiceRecord) mit invoice_date in diesem Monat ──
      const actualInvoices = filteredInvoices.filter(inv => {
        if (!inv.invoice_date || inv.is_credit_note) return false;
        if (['cancelled', 'draft'].includes(inv.payment_status)) return false;
        return inv.invoice_date.startsWith(month);
      });
      const actual = actualInvoices.reduce((s, inv) => s + (Number(inv.net_amount) || 0), 0);

      // Gesamtplan (geplant + was bereits invoiciert wurde aus diesem Monat)
      const totalPlan = planned + plannedThenInvoiced;

      const variance = actual - totalPlan;
      const variancePct = totalPlan > 0 ? Math.round((variance / totalPlan) * 100) : null;

      const label = format(parseISO(`${month}-01`), 'MMM yy', { locale: de });
      return {
        month, label,
        planned: totalPlan,      // Plan aus BillingInstructions
        actual,                  // Tatsächlich verrechnet (InvoiceRecords)
        variance,
        variancePct,
        plannedCount: plannedBIs.length + invoicedBIs.length,
        actualCount: actualInvoices.length,
      };
    });
  }, [filteredBIs, filteredInvoices, months, isLoading]);

  const totalPlanned = monthlyData.reduce((s, m) => s + m.planned, 0);
  const totalActual = monthlyData.reduce((s, m) => s + m.actual, 0);
  const overallVariance = totalActual - totalPlanned;
  const overallPct = totalPlanned > 0 ? Math.round((overallVariance / totalPlanned) * 100) : null;

  const chartData = monthlyData.map(m => ({
    name: m.label,
    Geplant: Math.round(m.planned),
    'Verrechnet (Ist)': Math.round(m.actual),
  }));

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abweichungsanalyse"
        subtitle="Abrechnungsplan (BillingInstructions) vs. tatsächliche Rechnungsstellung (sevDesk)"
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
          <strong>Plan</strong> = BillingInstructions mit geplantem Rechnungsdatum in diesem Monat (inkl. bereits erstellter Rechnungen aus dem Plan).{' '}
          <strong>Verrechnet</strong> = echte Rechnungen aus sevDesk (InvoiceRecords) mit Rechnungsdatum in diesem Monat.{' '}
          Diese Quellen entsprechen exakt dem Projektcockpit und dem Abrechnungsforecast.
        </AlertDescription>
      </Alert>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-blue-500">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Plan (12 Mon.)</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalPlanned)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">aus BillingInstructions</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-emerald-500">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Verrechnet (Ist)</p>
          <p className="text-2xl font-bold mt-1 text-emerald-700">{formatCurrency(totalActual)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">echte Rechnungen (Netto)</p>
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
          <p className="text-2xl font-bold mt-1">{totalPlanned > 0 ? `${Math.round((totalActual / totalPlanned) * 100)}%` : '—'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Verrechnet / Plan</p>
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
              <Bar dataKey="Verrechnet (Ist)" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Monat</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Geplant (BI)</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Verrechnet (Ist)</th>
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
                        ? <div><span className="font-medium">{formatCurrency(m.planned)}</span><br /><span className="text-xs text-muted-foreground">{m.plannedCount} Anweis.</span></div>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.actual > 0
                        ? <div><span className="text-emerald-700 font-medium">{formatCurrency(m.actual)}</span><br /><span className="text-xs text-muted-foreground">{m.actualCount} Rechnungen</span></div>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${varColor}`}>
                      {m.planned === 0 && m.actual === 0 ? '—' : `${m.variance >= 0 ? '+' : ''}${formatCurrency(m.variance)}`}
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
                <td className="px-4 py-3 text-right text-emerald-700">{formatCurrency(totalActual)}</td>
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