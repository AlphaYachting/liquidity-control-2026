import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { BarChart2, RefreshCw, ChevronDown, ChevronRight, TrendingUp, Info } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/liquidityUtils';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';

const CATEGORY_COLORS = {
  'Marketing': '#3b82f6',
  'Positionierung': '#8b5cf6',
  'Grafik & Design': '#f59e0b',
  'Webdesign': '#10b981',
  'Online-Marketing': '#ef4444',
};

const CATEGORY_ICONS = {
  'Marketing': '📣',
  'Positionierung': '🎯',
  'Grafik & Design': '🎨',
  'Webdesign': '🌐',
  'Online-Marketing': '📈',
};

const STATUS_LABELS = {
  paid: { label: 'Bezahlt', color: 'bg-emerald-100 text-emerald-700' },
  open: { label: 'Offen', color: 'bg-blue-100 text-blue-700' },
  overdue: { label: 'Überfällig', color: 'bg-red-100 text-red-700' },
  partially_paid: { label: 'Teilw. bezahlt', color: 'bg-amber-100 text-amber-700' },
  cancelled: { label: 'Storniert', color: 'bg-gray-100 text-gray-500' },
  unclear: { label: 'Unklar', color: 'bg-gray-100 text-gray-500' },
};

export default function RevenueAnalysis() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [expandedMonth, setExpandedMonth] = useState(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('categorizeInvoices', {});
      setData(res.data);
    } catch (e) {
      setError(e.message || 'Fehler bei der Analyse');
    } finally {
      setLoading(false);
    }
  };

  // Pie chart data
  const pieData = useMemo(() => {
    if (!data?.summary) return [];
    return Object.entries(data.summary)
      .map(([cat, val]) => ({ name: cat, value: Math.round(val.total_net), count: val.count }))
      .filter(d => d.value > 0);
  }, [data]);

  // Monthly bar chart data
  const monthlyData = useMemo(() => {
    if (!data?.categorized) return [];
    const months = {};
    for (const inv of data.categorized) {
      const month = inv.invoice_date?.slice(0, 7);
      if (!month) continue;
      if (!months[month]) months[month] = { month };
      if (!months[month][inv.category]) months[month][inv.category] = 0;
      months[month][inv.category] += inv.net_amount || 0;
    }
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
      ...m,
      label: new Date(m.month + '-01').toLocaleDateString('de-AT', { month: 'short', year: '2-digit' })
    }));
  }, [data]);

  const totalNet = useMemo(() => {
    if (!data?.summary) return 0;
    return Object.values(data.summary).reduce((s, v) => s + v.total_net, 0);
  }, [data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Umsatzbewertung"
        subtitle="KI-gestützte Kategorisierung aller Rechnungen nach Leistungsbereichen"
        icon={BarChart2}
        actions={
          <Button onClick={runAnalysis} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'KI analysiert…' : data ? 'Neu analysieren' : 'Analyse starten'}
          </Button>
        }
      />

      {!data && !loading && (
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="w-4 h-4 text-blue-600" />
          <AlertDescription className="text-blue-800 text-sm">
            Klicke auf <strong>„Analyse starten"</strong>, um alle Rechnungen automatisch den vier Leistungsbereichen zuzuordnen.
            Die KI analysiert Rechnungstexte, Kundennamen und Betragsangaben.
          </AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-[300px]" />
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            KI liest und kategorisiert alle Rechnungen… Das kann 15–30 Sekunden dauern.
          </div>
        </div>
      )}

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {data && !loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(data.summary).map(([cat, val]) => (
              <KpiCard
                key={cat}
                title={`${CATEGORY_ICONS[cat]} ${cat}`}
                value={formatCurrency(val.total_net)}
                subtitle={`${val.count} Rechnungen · ${totalNet > 0 ? Math.round((val.total_net / totalNet) * 100) : 0}% Anteil`}
                variant="default"
              />
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Umsatzanteile nach Bereich (Netto)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${Math.round(percent * 100)}%`} labelLine={false}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Legend formatter={(v) => `${CATEGORY_ICONS[v] ?? ''} ${v}`} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly bar chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Monatlicher Umsatz nach Bereich</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {Object.keys(CATEGORY_COLORS).map(cat => (
                      <Bar key={cat} dataKey={cat} name={`${CATEGORY_ICONS[cat]} ${cat}`} stackId="a" fill={CATEGORY_COLORS[cat]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Detail per category */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold">Rechnungen nach Bereich</h2>
            {Object.entries(data.summary).map(([cat, val]) => (
              <Card key={cat} className="overflow-hidden">
                <button
                  className="w-full text-left"
                  onClick={() => setExpandedCategory(expandedCategory === cat ? null : cat)}
                >
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{CATEGORY_ICONS[cat]}</span>
                        <div>
                          <CardTitle className="text-sm font-semibold">{cat}</CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">{val.count} Rechnungen</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-bold">{formatCurrency(val.total_net)}</p>
                          <p className="text-xs text-muted-foreground">Netto</p>
                        </div>
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${totalNet > 0 ? Math.min(100, (val.total_net / totalNet) * 100) : 0}%`,
                              backgroundColor: CATEGORY_COLORS[cat]
                            }}
                          />
                        </div>
                        {expandedCategory === cat
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        }
                      </div>
                    </div>
                  </CardHeader>
                </button>

                {expandedCategory === cat && (
                  <CardContent className="pt-0 px-4 pb-4">
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left p-2 font-medium">Rechnungsnr.</th>
                            <th className="text-left p-2 font-medium">Datum</th>
                            <th className="text-left p-2 font-medium">Kunde</th>
                            <th className="text-left p-2 font-medium">Leistung</th>
                            <th className="text-right p-2 font-medium">Netto</th>
                            <th className="text-right p-2 font-medium">Status</th>
                            <th className="text-right p-2 font-medium">Konfidenz</th>
                          </tr>
                        </thead>
                        <tbody>
                          {val.invoices.sort((a, b) => (b.invoice_date || '').localeCompare(a.invoice_date || '')).map((inv, idx) => {
                            const statusInfo = STATUS_LABELS[inv.payment_status] ?? { label: inv.payment_status, color: 'bg-gray-100 text-gray-500' };
                            return (
                              <tr key={inv.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                                <td className="p-2 font-mono">{inv.invoice_number || '—'}</td>
                                <td className="p-2">{inv.invoice_date || '—'}</td>
                                <td className="p-2 max-w-[140px] truncate">{inv.customer_name}</td>
                                <td className="p-2 max-w-[200px] truncate text-muted-foreground">{inv.notes || '—'}</td>
                                <td className="p-2 text-right font-medium">{formatCurrency(inv.net_amount)}</td>
                                <td className="p-2 text-right">
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${statusInfo.color}`}>
                                    {statusInfo.label}
                                  </span>
                                </td>
                                <td className="p-2 text-right">
                                  <span className={`text-xs font-medium ${inv.confidence >= 80 ? 'text-emerald-600' : inv.confidence >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                                    {inv.confidence}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-muted/30 font-semibold">
                          <tr>
                            <td colSpan={4} className="p-2 text-xs">Gesamt</td>
                            <td className="p-2 text-right text-xs">{formatCurrency(val.total_net)}</td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>

          <p className="text-xs text-muted-foreground text-right">
            {data.total_invoices} Rechnungen analysiert · KI-Kategorisierung kann Fehler enthalten
          </p>
        </>
      )}
    </div>
  );
}