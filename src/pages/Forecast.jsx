import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingUp, Plus } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, MONTHS_2026, getMonthLabel, weightedAmount } from '@/lib/liquidityUtils';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

const PRESET_SCENARIOS = {
  conservative: { scenario_name: 'Konservativ', scenario_type: 'conservative', include_uncertain_projects: false, include_overdue_receivables: false, safety_buffer_percent: 15, probability_threshold: 80, receivable_collection_rate: 70 },
  realistic: { scenario_name: 'Realistisch', scenario_type: 'realistic', include_uncertain_projects: true, include_overdue_receivables: true, safety_buffer_percent: 10, probability_threshold: 50, receivable_collection_rate: 85 },
  best_case: { scenario_name: 'Best Case', scenario_type: 'best_case', include_uncertain_projects: true, include_overdue_receivables: true, safety_buffer_percent: 5, probability_threshold: 20, receivable_collection_rate: 95 },
};

export default function Forecast() {
  const [activeTab, setActiveTab] = useState('conservative');
  const [params, setParams] = useState({
    opening_cash_balance: 50000,
    fixed_monthly_costs: 25000,
    tax_obligations: 5000,
    payment_delay_days: 14,
    ...PRESET_SCENARIOS.conservative
  });

  const { data: planLines = [], isLoading } = useQuery({
    queryKey: ['planLines'], queryFn: () => base44.entities.LiquidityPlanLine.list()
  });

  const update = (k, v) => setParams(p => ({ ...p, [k]: v }));

  const selectPreset = (key) => {
    setActiveTab(key);
    setParams(p => ({ ...p, ...PRESET_SCENARIOS[key] }));
  };

  const projection = useMemo(() => {
    let balance = Number(params.opening_cash_balance) || 0;
    return MONTHS_2026.map(m => {
      const eligibleInflows = planLines.filter(l =>
        l.month === m && l.direction === 'inflow' && l.status !== 'cancelled' &&
        (Number(l.probability_percent) || 100) >= (params.probability_threshold || 0) &&
        (params.include_uncertain_projects || l.status !== 'uncertain')
      );
      const inflows = eligibleInflows.reduce((s, l) => s + weightedAmount(l.amount_net, l.probability_percent), 0)
        * ((params.receivable_collection_rate || 100) / 100);

      const eligibleOutflows = planLines.filter(l => l.month === m && l.direction === 'outflow' && l.status !== 'cancelled');
      const outflows = eligibleOutflows.reduce((s, l) => s + (Number(l.amount_net) || 0), 0)
        + (Number(params.fixed_monthly_costs) || 0)
        + (Number(params.tax_obligations) || 0);

      const buffer = outflows * ((params.safety_buffer_percent || 0) / 100);
      const net = inflows - outflows - buffer;
      balance += net;
      return { month: m, label: getMonthLabel(m), inflows, outflows: outflows + buffer, net, closing: balance, gap: balance < 0 ? balance : 0 };
    });
  }, [planLines, params]);

  const minBalance = Math.min(...projection.map(p => p.closing));
  const totalInflow = projection.reduce((s, p) => s + p.inflows, 0);
  const totalOutflow = projection.reduce((s, p) => s + p.outflows, 0);
  const gapMonths = projection.filter(p => p.gap < 0).length;

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Forecast & Szenarien" subtitle="Liquiditätsplanung 2026" icon={TrendingUp} />

      <Tabs value={activeTab} onValueChange={selectPreset}>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cashflow-Projektion – {params.scenario_name}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={projection} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="inflows" name="Zuflüsse" fill="hsl(142, 71%, 45%)" radius={[4,4,0,0]} />
                  <Bar dataKey="outflows" name="Abflüsse" fill="hsl(0, 84%, 60%)" radius={[4,4,0,0]} />
                  <Line dataKey="closing" name="Kontostand" stroke="hsl(221, 83%, 53%)" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Parameter</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label className="text-xs">Eröffnungssaldo</Label><Input type="number" value={params.opening_cash_balance} onChange={e => update('opening_cash_balance', Number(e.target.value))} /></div>
            <div><Label className="text-xs">Fixe mtl. Kosten (Gehälter etc.)</Label><Input type="number" value={params.fixed_monthly_costs} onChange={e => update('fixed_monthly_costs', Number(e.target.value))} /></div>
            <div><Label className="text-xs">Steuer/SV-Pflichten mtl.</Label><Input type="number" value={params.tax_obligations} onChange={e => update('tax_obligations', Number(e.target.value))} /></div>
            <div><Label className="text-xs">Sicherheitspuffer (%)</Label><Input type="number" value={params.safety_buffer_percent} onChange={e => update('safety_buffer_percent', Number(e.target.value))} /></div>
            <div><Label className="text-xs">Wahrscheinlichkeitsschwelle (%)</Label><Input type="number" value={params.probability_threshold} onChange={e => update('probability_threshold', Number(e.target.value))} /></div>
            <div><Label className="text-xs">Forderungs-Eingangsrate (%)</Label><Input type="number" value={params.receivable_collection_rate} onChange={e => update('receivable_collection_rate', Number(e.target.value))} /></div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Unsichere Projekte inkl.</Label>
              <Switch checked={params.include_uncertain_projects} onCheckedChange={v => update('include_uncertain_projects', v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Überfällige Forderungen inkl.</Label>
              <Switch checked={params.include_overdue_receivables} onCheckedChange={v => update('include_overdue_receivables', v)} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}