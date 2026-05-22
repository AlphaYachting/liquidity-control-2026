import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CalendarCheck, FileText } from 'lucide-react';
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
  const { data: instructions = [], isLoading: instructionsLoading } = useQuery({
    queryKey: ['billingInstructions'], queryFn: () => base44.entities.BillingInstruction.list()
  });

  const isLoading = blocksLoading || invoicesLoading || instructionsLoading;

  // Determine next month string (YYYY-MM)
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

  const result = calculateNextMonthBillable(blocks, invoices);
  const ordersById = Object.fromEntries(orders.map(o => [o.id, o]));

  // BillingInstructions geplant für nächsten Monat
  const ACTIVE_STATUSES = ['draft', 'ready_for_backoffice', 'sent_to_backoffice'];
  const nextMonthInstructions = instructions.filter(i => {
    if (!i.planned_invoice_date) return false;
    const month = i.planned_invoice_date.substring(0, 7);
    return month === nextMonthStr && ACTIVE_STATUSES.includes(i.status);
  });

  // Block-IDs die bereits durch eine Instruction abgedeckt sind (nicht doppelt zeigen)
  const instructionBlockIds = new Set(nextMonthInstructions.map(i => i.billing_block_id).filter(Boolean));

  // Blocks filtern: keine die schon eine aktive Instruction haben
  const visibleBlocksFromResult = result.blocks.filter(b => !instructionBlockIds.has(b.id));

  const totalInstructionNet = nextMonthInstructions.reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0);

  let visibleBlocks = visibleBlocksFromResult;
  if (filters.responsible) visibleBlocks = visibleBlocks.filter(b => b.responsible_person === filters.responsible);
  if (filters.customer) visibleBlocks = visibleBlocks.filter(b => (b.customer || '').toLowerCase().includes(filters.customer.toLowerCase()));

  let visibleInstructions = nextMonthInstructions;
  if (filters.customer) visibleInstructions = visibleInstructions.filter(i => (i.customer_name || '').toLowerCase().includes(filters.customer.toLowerCase()));

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
        <KpiCard title={`Geplant ${nextMonthLabel}`} value={formatCurrency(result.next_month_planned_amount + totalInstructionNet)} variant="info" />
        <KpiCard title="Abrechnungsbereit" value={formatCurrency(result.next_month_invoice_ready_amount)} variant="success" />
        <KpiCard title="Billing-Anweisungen" value={formatCurrency(totalInstructionNet)} variant="warning"
          subtitle={`${nextMonthInstructions.length} aktive Anweisung(en)`} />
        <KpiCard title="Bereits verrechnet" value={formatCurrency(result.next_month_already_invoiced_amount)} variant="default" />
        <KpiCard title="Erwarteter Eingang" value={formatCurrency(result.next_month_expected_cash_in + totalInstructionNet)} variant="success"
          subtitle="inkl. Anweisungen" />
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

      {/* Instructions Section */}
      {visibleInstructions.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
          <div className="px-4 py-2.5 bg-amber-100/60 flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-700" />
            <span className="font-semibold text-sm text-amber-800">Aktive Abrechnungsanweisungen für {nextMonthLabel}</span>
            <span className="text-xs text-amber-600 ml-auto">{visibleInstructions.length} Anweisung(en) · {formatCurrency(totalInstructionNet)} netto</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-amber-50">
              <tr>
                <th className="text-left p-3 font-medium text-muted-foreground">Kunde / Projekt</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Typ</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Netto</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Brutto</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Datum</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Anweisungstext</th>
              </tr>
            </thead>
            <tbody>
              {visibleInstructions.map(instr => {
                const STATUS_COLORS = {
                  draft: 'bg-gray-100 text-gray-600',
                  ready_for_backoffice: 'bg-blue-100 text-blue-700',
                  sent_to_backoffice: 'bg-amber-100 text-amber-700',
                };
                const INVOICE_TYPE_LABELS = {
                  advance_invoice: 'Anzahlung',
                  partial_invoice: 'Teilrechnung',
                  final_invoice: 'Schlussrechnung',
                  correction: 'Korrektur',
                  credit_note: 'Gutschrift',
                };
                return (
                  <tr key={instr.id} className="border-t hover:bg-amber-50/80">
                    <td className="p-3">
                      <p className="font-medium">{instr.customer_name || '—'}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[140px]">{instr.project_name || '—'}</p>
                    </td>
                    <td className="p-3">
                      <Badge className="text-xs bg-blue-100 text-blue-700">
                        {INVOICE_TYPE_LABELS[instr.invoice_type] || instr.invoice_type}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(instr.instruction_amount_net)}</td>
                    <td className="p-3 text-right text-muted-foreground">{formatCurrency(instr.instruction_amount_gross)}</td>
                    <td className="p-3">
                      <Badge className={`text-xs ${STATUS_COLORS[instr.status] || 'bg-gray-100 text-gray-600'}`}>
                        {instr.status?.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="p-3 text-sm">{instr.planned_invoice_date || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">{instr.invoice_instruction_text || instr.invoice_reason || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Billing Blocks Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/30 flex items-center gap-2">
          <span className="font-semibold text-sm">Abrechnungspakete für {nextMonthLabel}</span>
          <span className="text-xs text-muted-foreground ml-auto">{visibleBlocks.length} Paket(e)</span>
        </div>
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
              <th className="text-left p-3 font-medium text-muted-foreground">Hinweis</th>
            </tr>
          </thead>
          <tbody>
            {visibleBlocks.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground text-sm">Keine weiteren Pakete für {nextMonthLabel}</td></tr>
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