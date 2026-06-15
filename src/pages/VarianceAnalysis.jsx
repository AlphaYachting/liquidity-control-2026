import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { BarChart2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
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

export default function VarianceAnalysis() {
  const [view, setView] = useState('chart'); // 'chart' | 'table'

  const { data: blocks = [], isLoading: bLoading } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });
  const { data: invoices = [], isLoading: iLoading } = useQuery({
    queryKey: ['invoiceRecords'], queryFn: () => base44.entities.InvoiceRecord.list()
  });

  const isLoading = bLoading || iLoading;
  const months = useMemo(() => getMonthsList(), []);

  const monthlyData = useMemo(() => {
    if (isLoading) return [];

    return months.map(month => {
      // Planned: billing blocks with billing_month = this month
      const plannedBlocks = blocks.filter(b => b.billing_month === month);
      const planned = plannedBlocks.reduce((s, b) => s + (b.amount_net || 0), 0);

      // Actual invoiced: invoices with invoice_date in this month (non-credit)
      const actualInvoices = invoices.filter(inv => {
        if (!inv.invoice_date || inv.is_credit_note) return false;
        return inv.invoice_date.startsWith(month);
      });
      const actual = actualInvoices.reduce((s, inv) => s + (inv.net_amount || 0), 0);

      // Paid: invoices paid in this month
      const paidInvoices = invoices.filter(inv => {
        if (!inv.payment_date || inv.is_credit_note) return false;
        return inv.payment_date.startsWith(month);
      });
      const paid = paidInvoices.reduce((s, inv) => s + (inv.gross_amount || 0), 0);

      const variance = actual - planned;
      const variancePct = planned > 0 ? Math.round((variance / planned) * 100) : null;

      const label = format(parseISO(`${month}-01`), 'MMM yy', { locale: de });
      return { month, label, planned, actual, paid, variance, variancePct };
    });
  }, [blocks, invoices, months, isLoading]);

  const totalPlanned = monthlyData.reduce((s, m) => s + m.planned, 0);
  const totalActual = monthlyData.reduce((s, m) => s + m.actual, 0);
  const overallVariance = totalActual - totalPlanned;
  const overallPct = totalPlanned > 0 ? Math.round((overallVariance / totalPlanned) * 100) : null;

  const chartData = monthlyData.map(m => ({
    name: m.label,
    Geplant: Math.round(m.planned),
    'Tatsächlich verrechnet': Math.round(m.actual),
    Bezahlt: Math.round(m.paid),
  }));

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abweichungsanalyse: Geplant vs. Tatsächlich"
        subtitle={`12 Monate ab heute · Abrechnungsplanung vs. tatsächliche Rechnungsstellung`}
        icon={BarChart2}
        actions={
          <div className="flex gap-1 border rounded-lg p-1">
            <button onClick={() => setView('chart')} className={`px-3 py-1 text-xs rounded-md transition-colors ${view === 'chart' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Grafik</button>
            <button onClick={() => setView('table')} className={`px-3 py-1 text-xs rounded-md transition-colors ${view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Tabelle</button>
          </div>
        }
      />

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-blue-500">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Geplant (nächste 12 Mon.)</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalPlanned)}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-emerald-500">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Tats. verrechnet</p>
          <p className="text-2xl font-bold mt-1 text-emerald-700">{formatCurrency(totalActual)}</p>
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
          <p className="text-2xl font-bold mt-1">
            {totalPlanned > 0 ? `${Math.round((totalActual / totalPlanned) * 100)}%` : '—'}
          </p>
          <p className="text-xs text-muted-foreground">Ist / Plan</p>
        </Card>
      </div>

      {view === 'chart' ? (
        <Card className="p-6">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend />
              <Bar dataKey="Geplant" fill="hsl(var(--chart-1))" opacity={0.6} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Tatsächlich verrechnet" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Bezahlt" fill="hsl(var(--chart-5))" opacity={0.7} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Monat</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Geplant</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Verrechnet</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Bezahlt</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Abweichung</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">% Plan</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((m, idx) => {
                const varColor = m.variance > 0 ? 'text-emerald-600' : m.variance < 0 ? 'text-red-600' : 'text-muted-foreground';
                return (
                  <tr key={idx} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{m.label}</td>
                    <td className="px-4 py-3 text-right">{m.planned > 0 ? formatCurrency(m.planned) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 text-right">{m.actual > 0 ? <span className="text-emerald-700 font-medium">{formatCurrency(m.actual)}</span> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 text-right">{m.paid > 0 ? formatCurrency(m.paid) : <span className="text-muted-foreground">—</span>}</td>
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
                <td className="px-4 py-3 text-right">{formatCurrency(monthlyData.reduce((s, m) => s + m.paid, 0))}</td>
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