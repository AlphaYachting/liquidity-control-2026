import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CalendarCheck, TrendingUp } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, getMonthLabel } from '@/lib/liquidityUtils';
import { calculateNextMonthBillable } from '@/lib/reconciliationUtils';

const WORK_STATUS_COLORS = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  blocked: 'bg-red-100 text-red-700',
};

const READINESS_COLORS = {
  not_ready: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  ready: 'bg-emerald-100 text-emerald-700',
  invoiced: 'bg-purple-100 text-purple-700',
  paid: 'bg-teal-100 text-teal-700',
};

export default function NextMonthForecast() {
  const [filters, setFilters] = useState({ responsible: '', customer: '' });

  const { data: blocks = [], isLoading: blocksLoading } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoiceRecords'], queryFn: () => base44.entities.InvoiceRecord.list()
  });
  const { data: orders = [] } = useQuery({
    queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list()
  });

  const isLoading = blocksLoading || invoicesLoading;

  const result = calculateNextMonthBillable(blocks, invoices);

  const ordersById = Object.fromEntries(orders.map(o => [o.id, o]));

  let visibleBlocks = result.blocks;
  if (filters.responsible) visibleBlocks = visibleBlocks.filter(b => b.responsible_person === filters.responsible);
  if (filters.customer) visibleBlocks = visibleBlocks.filter(b => (b.customer || '').toLowerCase().includes(filters.customer.toLowerCase()));

  const responsibleOptions = [...new Set(blocks.map(b => b.responsible_person).filter(Boolean))];

  const nextMonthLabel = getMonthLabel(result.next_month_str) || result.next_month_str;

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-3 gap-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Forecast Nächster Monat — ${nextMonthLabel}`}
        subtitle="Was kann nächsten Monat verrechnet werden?"
        icon={CalendarCheck}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard title={`Geplant ${nextMonthLabel}`} value={formatCurrency(result.next_month_planned_amount)} variant="info" />
        <KpiCard title="Abrechnungsbereit" value={formatCurrency(result.next_month_invoice_ready_amount)} variant="success" />
        <KpiCard title="Blockiert" value={formatCurrency(result.next_month_blocked_amount)} variant="destructive" />
        <KpiCard title="Bereits verrechnet" value={formatCurrency(result.next_month_already_invoiced_amount)} variant="default" />
        <KpiCard title="Erwarteter Eingang" value={formatCurrency(result.next_month_expected_cash_in)} variant="warning"
          subtitle="Risikogewichtet" />
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          className="border rounded-lg px-3 py-1.5 text-sm bg-card"
          value={filters.responsible}
          onChange={e => setFilters(f => ({ ...f, responsible: e.target.value }))}
        >
          <option value="">Alle PM</option>
          {responsibleOptions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input
          className="border rounded-lg px-3 py-1.5 text-sm bg-card"
          placeholder="Kunde filtern…"
          value={filters.customer}
          onChange={e => setFilters(f => ({ ...f, customer: e.target.value }))}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-3 font-medium text-muted-foreground">Kunde / Projekt</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Paket</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Betrag</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Arbeit</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Bereit</th>
              <th className="text-left p-3 font-medium text-muted-foreground">PM</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Bereits verr.</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Noch offen</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Grund / Hinweis</th>
            </tr>
          </thead>
          <tbody>
            {visibleBlocks.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">Keine Pakete für nächsten Monat geplant</td></tr>
            ) : (
              visibleBlocks.map(block => {
                const order = ordersById[block.confirmed_order_id];
                const bs = block._status;
                let hint = '';
                if (block.work_status === 'blocked') hint = 'Arbeit blockiert';
                else if (block.invoice_readiness_status === 'not_ready' && block.work_status !== 'completed') hint = 'Arbeit noch nicht fertig';
                else if (block.invoice_readiness_status === 'ready' || block.work_status === 'completed') hint = '✓ Bereit zur Verrechnung';
                return (
                  <tr key={block.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <p className="font-medium">{block.customer || order?.customer || '—'}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[140px]">{block.project_name || order?.project_name || '—'}</p>
                    </td>
                    <td className="p-3 font-medium">{block.title}</td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(block.amount_net)}</td>
                    <td className="p-3">
                      <Badge className={`text-xs ${WORK_STATUS_COLORS[block.work_status] || ''}`}>
                        {block.work_status?.replace(/_/g, ' ') || '—'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge className={`text-xs ${READINESS_COLORS[block.invoice_readiness_status] || ''}`}>
                        {block.invoice_readiness_status?.replace(/_/g, ' ') || '—'}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{block.responsible_person || '—'}</td>
                    <td className="p-3 text-right text-muted-foreground">{formatCurrency(bs.invoiced_against_block)}</td>
                    <td className="p-3 text-right">
                      <span className={bs.remaining_to_invoice > 0 ? 'text-amber-600 font-medium' : 'text-emerald-600'}>
                        {formatCurrency(bs.remaining_to_invoice)}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{hint}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}