import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingUp, ChevronDown, ChevronRight, AlertTriangle, Info, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatCurrency, MONTHS_2026, getMonthLabel } from '@/lib/liquidityUtils';
import { buildFullForecast } from '@/lib/forecastEngine';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import ForecastMonthDrillDown from '@/components/forecast/ForecastMonthDrillDown';
import ForecastWarnings from '@/components/forecast/ForecastWarnings';
import ForecastSourceCards from '@/components/forecast/ForecastSourceCards';

const PRESET_SCENARIOS = {
  conservative: { label: 'Konservativ', opening_cash_balance: 50000, fixed_monthly_costs: 25000, tax_obligations: 5000 },
  realistic:    { label: 'Realistisch', opening_cash_balance: 50000, fixed_monthly_costs: 25000, tax_obligations: 5000 },
  best_case:    { label: 'Best Case',   opening_cash_balance: 50000, fixed_monthly_costs: 25000, tax_obligations: 5000 },
};

const SOURCE_COLORS = {
  plan_line: '#3b82f6',
  recurring_contract: '#10b981',
  receivable: '#f59e0b',
  tool_cost: '#ef4444',
  payable: '#8b5cf6',
};

const customTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border rounded-lg p-3 shadow-lg text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
      ))}
    </div>
  );
};

export default function Forecast() {
  const [scenario, setScenario] = useState('realistic');
  const [openMonth, setOpenMonth] = useState(null);
  const [params, setParams] = useState({ opening_cash_balance: 50000, fixed_monthly_costs: 25000, tax_obligations: 5000 });

  const { data: planLines = [], isLoading: l1 } = useQuery({ queryKey: ['planLines'], queryFn: () => base44.entities.LiquidityPlanLine.list() });
  const { data: contracts = [], isLoading: l2 } = useQuery({ queryKey: ['contracts'], queryFn: () => base44.entities.RecurringContract.list() });
  const { data: tools = [], isLoading: l3 } = useQuery({ queryKey: ['tools'], queryFn: () => base44.entities.ToolCost.list() });
  const { data: receivables = [], isLoading: l4 } = useQuery({ queryKey: ['receivables'], queryFn: () => base44.entities.Receivable.list() });
  const { data: payables = [], isLoading: l5 } = useQuery({ queryKey: ['payables'], queryFn: () => base44.entities.Payable.list() });
  const { data: invoiceRecords = [], isLoading: l6 } = useQuery({
    queryKey: ['invoiceRecords-forecast'],
    queryFn: () => base44.entities.InvoiceRecord.list(),
  });

  const isLoading = l1 || l2 || l3 || l4 || l5 || l6;

  const update = (k, v) => setParams(p => ({ ...p, [k]: v }));

  const { months, warnings, sourceSummary } = useMemo(() => {
    if (isLoading) return { months: [], warnings: [], sourceSummary: {} };
    return buildFullForecast({
      planLines,
      contracts,
      tools,
      receivables,
      payables,
      invoiceRecords,
      scenario,
      openingBalance: Number(params.opening_cash_balance) || 0,
      fixedMonthlyCosts: Number(params.fixed_monthly_costs) || 0,
      taxObligations: Number(params.tax_obligations) || 0,
    });
  }, [planLines, contracts, tools, receivables, payables, invoiceRecords, scenario, params, isLoading]);

  const chartData = months.map(m => ({
    label: getMonthLabel(m.month),
    month: m.month,
    inflows: Math.round(m.weighted_inflow),
    outflows: Math.round(m.weighted_outflow),
    closing: Math.round(m.closing),
    risk_flags: m.risk_flags,
  }));

  const totalInflow = months.reduce((s, m) => s + m.weighted_inflow, 0);
  const totalOutflow = months.reduce((s, m) => s + m.weighted_outflow, 0);
  const minBalance = months.length ? Math.min(...months.map(m => m.closing)) : 0;
  const gapMonths = months.filter(m => m.gap < 0).length;

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-4 gap-4">{Array(4).fill(0).map((_,i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-[400px]" />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forecast & Szenarien"
        subtitle={`Liquiditätsplanung ${months[0] ? getMonthLabel(months[0].month) : ''} – ${months[11] ? getMonthLabel(months[11].month) : ''} (12 Monate)`}
        icon={TrendingUp}
      />

      <Alert className="border-blue-200 bg-blue-50">
        <Info className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-xs">
          Forecast berechnet aus: <strong>Planzeilen</strong>, <strong>laufenden Verträgen</strong>, <strong>offenen Forderungen</strong>, <strong>tatsächlichen Ausgangsrechnungen (InvoiceRecord)</strong>, <strong>Eingangsrechnungen</strong> und <strong>Toolkosten</strong>.
          Bereits in der Forderungsliste erfasste Rechnungen werden nicht doppelt gezählt. Alle Beträge sind wahrscheinlichkeitsgewichtet.
        </AlertDescription>
      </Alert>

      <Tabs value={scenario} onValueChange={setScenario}>
        <TabsList>
          <TabsTrigger value="conservative">Konservativ</TabsTrigger>
          <TabsTrigger value="realistic">Realistisch</TabsTrigger>
          <TabsTrigger value="best_case">Best Case</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Erwartete Zuflüsse" value={formatCurrency(totalInflow)} variant="success" />
        <KpiCard title="Erwartete Abflüsse" value={formatCurrency(totalOutflow)} variant="danger" />
        <KpiCard title="Min. Kontostand" value={formatCurrency(minBalance)} variant={minBalance < 0 ? 'danger' : 'success'} />
        <KpiCard title="Risiko-Monate" value={gapMonths} variant={gapMonths > 0 ? 'danger' : 'success'} subtitle={gapMonths > 0 ? 'Liquiditätslücke' : 'Kein Gap'} />
      </div>

      <ForecastSourceCards months={months} sourceSummary={sourceSummary} />

      {warnings.length > 0 && <ForecastWarnings warnings={warnings} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cashflow-Projektion – {PRESET_SCENARIOS[scenario]?.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={customTooltip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="inflows" name="Zuflüsse (gewichtet)" fill="hsl(142, 71%, 45%)" radius={[4,4,0,0]} />
                  <Bar dataKey="outflows" name="Abflüsse (gewichtet)" fill="hsl(0, 84%, 60%)" radius={[4,4,0,0]} />
                  <Line dataKey="closing" name="Kontostand" stroke="hsl(221, 83%, 53%)" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Parameter</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label className="text-xs">Eröffnungssaldo</Label><Input type="number" value={params.opening_cash_balance} onChange={e => update('opening_cash_balance', e.target.value)} /></div>
            <div><Label className="text-xs">Fixe mtl. Kosten (Gehälter etc.)</Label><Input type="number" value={params.fixed_monthly_costs} onChange={e => update('fixed_monthly_costs', e.target.value)} /></div>
            <div><Label className="text-xs">Steuer/SV-Pflichten mtl.</Label><Input type="number" value={params.tax_obligations} onChange={e => update('tax_obligations', e.target.value)} /></div>
            <div className="pt-2 border-t space-y-1 text-xs text-muted-foreground">
              <p><strong>Konservativ:</strong> Nur bestätigte Zuflüsse, keine unsicheren Forderungen</p>
              <p><strong>Realistisch:</strong> Alle aktiven Quellen mit Wahrscheinlichkeitswichtung</p>
              <p><strong>Best Case:</strong> Alle möglichen Zuflüsse inklusive unsicherer Positionen</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly drill-down */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monatliche Aufschlüsselung — klicken zum Erweitern</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {months.map((m) => (
            <ForecastMonthDrillDown
              key={m.month}
              monthData={m}
              isOpen={openMonth === m.month}
              onToggle={() => setOpenMonth(openMonth === m.month ? null : m.month)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}