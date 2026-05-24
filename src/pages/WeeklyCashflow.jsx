import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CalendarDays, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { addDays, startOfWeek, format, isWithinInterval, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

const WEEKS_AHEAD = 8;

function getWeeks() {
  const today = new Date();
  const start = startOfWeek(today, { weekStartsOn: 1 });
  return Array.from({ length: WEEKS_AHEAD }, (_, i) => {
    const weekStart = addDays(start, i * 7);
    const weekEnd = addDays(weekStart, 6);
    return { weekStart, weekEnd, label: `KW ${format(weekStart, 'w')} · ${format(weekStart, 'dd.MM.', { locale: de })} – ${format(weekEnd, 'dd.MM.', { locale: de })}` };
  });
}

export default function WeeklyCashflow() {
  const { data: invoices = [], isLoading: iLoading } = useQuery({
    queryKey: ['invoiceRecords'], queryFn: () => base44.entities.InvoiceRecord.list()
  });
  const { data: payables = [], isLoading: pLoading } = useQuery({
    queryKey: ['payables'], queryFn: () => base44.entities.Payable.list()
  });
  const { data: blocks = [], isLoading: bLoading } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });

  const isLoading = iLoading || pLoading || bLoading;
  const weeks = useMemo(() => getWeeks(), []);

  const weeklyData = useMemo(() => {
    if (isLoading) return [];

    return weeks.map(({ weekStart, weekEnd, label }) => {
      const interval = { start: weekStart, end: weekEnd };

      // Expected inflows: open invoices with due_date in this week
      const inflows = invoices
        .filter(inv => {
          if (!inv.due_date || inv.payment_status === 'paid' || inv.payment_status === 'cancelled') return false;
          try { return isWithinInterval(parseISO(inv.due_date), interval); } catch { return false; }
        })
        .reduce((s, inv) => s + (inv.open_amount || inv.gross_amount || 0), 0);

      // Expected outflows: open payables with due_date in this week
      const outflows = payables
        .filter(pay => {
          if (!pay.due_date || pay.status === 'paid') return false;
          try { return isWithinInterval(parseISO(pay.due_date), interval); } catch { return false; }
        })
        .reduce((s, pay) => s + (pay.gross_amount || 0), 0);

      // Planned billing (blocks with planned_invoice_date in this week)
      const plannedBilling = blocks
        .filter(b => {
          if (!b.planned_invoice_date || b.invoice_readiness_status === 'invoiced') return false;
          try { return isWithinInterval(parseISO(b.planned_invoice_date), interval); } catch { return false; }
        })
        .reduce((s, b) => s + (b.amount_net || 0), 0);

      const net = inflows - outflows;

      return { label, weekStart, weekEnd, inflows, outflows, plannedBilling, net };
    });
  }, [invoices, payables, blocks, weeks, isLoading]);

  const maxAbsValue = useMemo(() => Math.max(...weeklyData.map(w => Math.max(w.inflows, w.outflows, 1))), [weeklyData]);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wöchentliche Cashflow-Vorschau"
        subtitle={`8-Wochen-Horizont · Einzahlungen, Ausgaben, geplante Rechnungen`}
        icon={CalendarDays}
      />

      <div className="grid grid-cols-1 gap-4">
        {weeklyData.map((week, idx) => {
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

                  {/* Outflows bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20 text-right">Ausgabe</span>
                    <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${outflowPct}%` }} />
                    </div>
                    <span className="text-xs font-medium text-red-700 w-24 text-right">{formatCurrency(week.outflows)}</span>
                  </div>

                  {/* Planned billing indicator */}
                  {week.plannedBilling > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 text-right">Plan. RE</span>
                      <div className="flex-1">
                        <span className="text-xs text-blue-600 font-medium bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
                          {formatCurrency(week.plannedBilling)} geplant
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className={`md:w-32 flex-shrink-0 text-right`}>
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