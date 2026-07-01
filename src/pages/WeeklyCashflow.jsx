import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CalendarDays, TrendingUp, TrendingDown, Minus, AlertTriangle, ChevronDown, ChevronRight, Repeat } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { buildWeeklyCashflow } from '@/lib/weeklyCashflowEngine';

export default function WeeklyCashflow() {
  const [overdueOpen, setOverdueOpen] = useState(false);

  const { data: invoices = [], isLoading: iLoading } = useQuery({
    queryKey: ['invoiceRecords'], queryFn: () => base44.entities.InvoiceRecord.list('-invoice_date', 2000)
  });
  const { data: payables = [], isLoading: pLoading } = useQuery({
    queryKey: ['payables'], queryFn: () => base44.entities.Payable.list()
  });
  const { data: blocks = [], isLoading: bLoading } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });
  const { data: contracts = [], isLoading: cLoading } = useQuery({
    queryKey: ['contracts'], queryFn: () => base44.entities.RecurringContract.list('', 1000)
  });

  const isLoading = iLoading || pLoading || bLoading || cLoading;

  const { overdue, weekly, activeContractsCount } = useMemo(() => {
    if (isLoading) return { overdue: { total: 0, count: 0, items: [] }, weekly: [], activeContractsCount: 0 };
    return buildWeeklyCashflow({ invoices, payables, blocks, contracts });
  }, [invoices, payables, blocks, contracts, isLoading]);

  const maxAbsValue = useMemo(
    () => Math.max(...weekly.map(w => Math.max(w.inflows, w.outflows, 1)), 1),
    [weekly]
  );

  const totalInflow8w = weekly.reduce((s, w) => s + w.inflows, 0);
  const totalOutflow8w = weekly.reduce((s, w) => s + w.outflows, 0);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wöchentliche Cashflow-Vorschau"
        subtitle="8-Wochen-Horizont · offene Forderungen, wiederkehrende Verträge, Ausgaben"
        icon={CalendarDays}
      />

      {/* KPI-Kopfzeile */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Überfällig (sofort)" value={formatCurrency(overdue.total)} variant="danger" subtitle={`${overdue.count} Rechnungen`} />
        <KpiCard title="Zuflüsse (8 Wochen)" value={formatCurrency(totalInflow8w)} variant="success" />
        <KpiCard title="Abflüsse (8 Wochen)" value={formatCurrency(totalOutflow8w)} variant="danger" />
        <KpiCard title="Aktive Verträge" value={activeContractsCount} subtitle="Hosting, Wartung, Domain …" />
      </div>

      {/* Überfällige offene Forderungen — sofort fällig */}
      {overdue.count > 0 && (
        <Card className="border-2 border-red-300 bg-red-50/50">
          <button
            onClick={() => setOverdueOpen(o => !o)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-red-900">Überfällige offene Forderungen</p>
                <p className="text-xs text-red-700">{overdue.count} Rechnungen · sollten längst eingegangen sein</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-red-700">{formatCurrency(overdue.total)}</span>
              {overdueOpen ? <ChevronDown className="w-4 h-4 text-red-600" /> : <ChevronRight className="w-4 h-4 text-red-600" />}
            </div>
          </button>
          {overdueOpen && (
            <div className="px-4 pb-4 space-y-1 max-h-72 overflow-y-auto">
              {overdue.items.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-red-100/50">
                  <span className="truncate mr-3">{it.name || '—'}</span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-red-600">fällig {it.due_date}</span>
                    <span className="font-medium text-red-700 w-24 text-right">{formatCurrency(it.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Wochenzeilen */}
      <div className="grid grid-cols-1 gap-4">
        {weekly.map((week, idx) => {
          const inflowPct = maxAbsValue > 0 ? (week.inflows / maxAbsValue) * 100 : 0;
          const outflowPct = maxAbsValue > 0 ? (week.outflows / maxAbsValue) * 100 : 0;
          const isToday = idx === 0;
          const netPositive = week.net >= 0;

          return (
            <Card key={idx} className={`p-4 ${isToday ? 'border-primary border-2' : ''}`}>
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="md:w-48 flex-shrink-0">
                  <p className="text-sm font-semibold">{week.label}</p>
                  {isToday && <span className="text-xs text-primary font-medium">Aktuelle Woche</span>}
                </div>

                <div className="flex-1 space-y-2">
                  {/* Inflows bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20 text-right">Einzahlung</span>
                    <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${inflowPct}%` }} />
                    </div>
                    <span className="text-xs font-medium text-emerald-700 w-24 text-right">{formatCurrency(week.inflows)}</span>
                  </div>

                  {/* Contract inflow breakdown */}
                  {week.contractInflow > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 text-right flex items-center justify-end gap-1"><Repeat className="w-3 h-3" />Verträge</span>
                      <div className="flex-1">
                        <span className="text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                          {formatCurrency(week.contractInflow)} wiederkehrend
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Outflows bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20 text-right">Ausgabe</span>
                    <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${outflowPct}%` }} />
                    </div>
                    <span className="text-xs font-medium text-red-700 w-24 text-right">{formatCurrency(week.outflows)}</span>
                  </div>

                  {/* Planned billing indicator (separat, nicht im Netto) */}
                  {week.plannedBilling > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 text-right">Plan. RE</span>
                      <div className="flex-1">
                        <span className="text-xs text-blue-600 font-medium bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
                          {formatCurrency(week.plannedBilling)} geplant (nicht im Netto)
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="md:w-32 flex-shrink-0 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {netPositive ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : week.net === 0 ? <Minus className="w-4 h-4 text-muted-foreground" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
                    <span className={`font-bold text-sm ${netPositive ? 'text-emerald-700' : week.net === 0 ? 'text-muted-foreground' : 'text-red-600'}`}>
                      {netPositive ? '+' : ''}{formatCurrency(week.net)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Netto</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}