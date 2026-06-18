import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CalendarCheck, FileText, CheckCircle2, Circle } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, getMonthLabel } from '@/lib/liquidityUtils';
import { calculateNextMonthBillable } from '@/lib/reconciliationUtils';
import ProjectDetailSlideOver from '@/components/projects/ProjectDetailSlideOver';

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
  const [slideOverProjectId, setSlideOverProjectId] = useState(null);

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
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });
  const { data: billingPlans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['monthlyBillingPlansAll'], queryFn: () => base44.entities.MonthlyBillingPlan.list()
  });

  const isLoading = blocksLoading || invoicesLoading || instructionsLoading || plansLoading;

  // Determine next month string (YYYY-MM)
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

  // Aktuellen Monat lokal berechnen
  const curMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const result = calculateNextMonthBillable(blocks, invoices);
  const ordersById = Object.fromEntries(orders.map(o => [o.id, o]));

  // Alle relevanten Statuses anzeigen — auch invoice_created/paid damit fertige Anweisungen
  // nicht aus dem Forecast verschwinden (war der Bug: Vision Decision GmbH etc.)
  const ACTIVE_STATUSES = ['draft', 'ready_for_backoffice', 'sent_to_backoffice', 'invoice_created', 'paid'];

  // Instructions für aktuellen UND nächsten Monat
  const allForecastInstructions = instructions.filter(i => {
    if (!i.planned_invoice_date) return false;
    const month = i.planned_invoice_date.substring(0, 7);
    return (month === curMonthStr || month === nextMonthStr) && ACTIVE_STATUSES.includes(i.status);
  });
  const curMonthInstructions = allForecastInstructions.filter(i => i.planned_invoice_date?.substring(0, 7) === curMonthStr);
  const nextMonthInstructions = allForecastInstructions.filter(i => i.planned_invoice_date?.substring(0, 7) === nextMonthStr);

  // Blocks für aktuellen Monat (aus DB direkt filtern)
  const invoicesByBlockId = {};
  invoices.forEach(i => {
    if (!i.billing_block_id) return;
    if (!invoicesByBlockId[i.billing_block_id]) invoicesByBlockId[i.billing_block_id] = [];
    invoicesByBlockId[i.billing_block_id].push(i);
  });

  const { calculateBillingBlockStatus } = { calculateBillingBlockStatus: (b) => {
    const blockInvoices = invoicesByBlockId[b.id] || [];
    const relevant = blockInvoices.filter(i => !i.is_credit_note && i.payment_status !== 'cancelled');
    const invoiced = relevant.reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
    return {
      block_amount_net: Number(b.amount_net) || 0,
      invoiced_against_block: invoiced,
      remaining_to_invoice: (Number(b.amount_net) || 0) - invoiced,
      risk_adjusted_amount: (Number(b.amount_net) || 0) * ((Number(b.probability_percent) || 90) / 100),
    };
  }};

  const curInstructionBlockIds = new Set(curMonthInstructions.map(i => i.billing_block_id).filter(Boolean));
  const curMonthBlocks = blocks
    .filter(b => b.billing_month === curMonthStr
      && b.invoice_readiness_status !== 'invoiced'
      && b.invoice_readiness_status !== 'paid'
      && b.work_status !== 'blocked'
      && !curInstructionBlockIds.has(b.id))
    .map(b => ({ ...b, _status: calculateBillingBlockStatus(b) }));

  // Block-IDs die bereits durch eine Instruction abgedeckt sind (nächster Monat)
  const instructionBlockIds = new Set(nextMonthInstructions.map(i => i.billing_block_id).filter(Boolean));
  const visibleBlocksFromResult = result.blocks.filter(b => !instructionBlockIds.has(b.id));

  const totalCurInstructionNet = curMonthInstructions.reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0);
  const totalInstructionNet = nextMonthInstructions.reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0);
  const totalCurBlockNet = curMonthBlocks.reduce((s, b) => s + b._status.block_amount_net, 0);

  let visibleBlocks = visibleBlocksFromResult;
  if (filters.responsible) visibleBlocks = visibleBlocks.filter(b => b.responsible_person === filters.responsible);
  if (filters.customer) visibleBlocks = visibleBlocks.filter(b => (b.customer || '').toLowerCase().includes(filters.customer.toLowerCase()));

  let visibleCurBlocks = curMonthBlocks;
  if (filters.responsible) visibleCurBlocks = visibleCurBlocks.filter(b => b.responsible_person === filters.responsible);
  if (filters.customer) visibleCurBlocks = visibleCurBlocks.filter(b => (b.customer || '').toLowerCase().includes(filters.customer.toLowerCase()));

  let visibleInstructions = nextMonthInstructions
    .filter(i => !filters.customer || (i.customer_name || '').toLowerCase().includes(filters.customer.toLowerCase()))
    .sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || '', 'de'));

  let visibleCurInstructions = curMonthInstructions
    .filter(i => !filters.customer || (i.customer_name || '').toLowerCase().includes(filters.customer.toLowerCase()))
    .sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || '', 'de'));

  const responsibleOptions = [...new Set(blocks.map(b => b.responsible_person).filter(Boolean))];

  // MonthlyBillingPlans (Rechnungsplanung) für aktuellen und nächsten Monat
  // Nur aktive Pläne (nicht invoiced/on_hold/postponed), die einen geplanten Betrag haben
  const PLAN_ACTIVE_STATUSES = ['open','planned','in_review','ready_for_invoice','sent_to_backoffice'];
  const projectsById = Object.fromEntries(projects.map(p => [p.id, p]));
  const instructionsByProjectId = {};
  instructions.forEach(i => {
    if (!i.project_id) return;
    if (!instructionsByProjectId[i.project_id]) instructionsByProjectId[i.project_id] = [];
    instructionsByProjectId[i.project_id].push(i);
  });

  const curMonthPlans = billingPlans.filter(p =>
    p.planning_month === curMonthStr &&
    PLAN_ACTIVE_STATUSES.includes(p.billing_status) &&
    Number(p.planned_amount_net) > 0
  );
  const nextMonthPlans = billingPlans.filter(p =>
    p.planning_month === nextMonthStr &&
    PLAN_ACTIVE_STATUSES.includes(p.billing_status) &&
    Number(p.planned_amount_net) > 0
  );

  let visibleCurPlans = curMonthPlans
    .filter(p => !filters.customer || (projectsById[p.project_id]?.customer || projectsById[p.project_id]?.project_name || '').toLowerCase().includes(filters.customer.toLowerCase()))
    .sort((a, b) => (projectsById[a.project_id]?.customer || '').localeCompare(projectsById[b.project_id]?.customer || '', 'de'));
  let visibleNextPlans = nextMonthPlans
    .filter(p => !filters.customer || (projectsById[p.project_id]?.customer || projectsById[p.project_id]?.project_name || '').toLowerCase().includes(filters.customer.toLowerCase()))
    .sort((a, b) => (projectsById[a.project_id]?.customer || '').localeCompare(projectsById[b.project_id]?.customer || '', 'de'));

  const totalCurPlansNet = curMonthPlans.reduce((s, p) => s + (Number(p.planned_amount_net) || 0), 0);
  const totalNextPlansNet = nextMonthPlans.reduce((s, p) => s + (Number(p.planned_amount_net) || 0), 0);

  const PLAN_STATUS_LABELS = {
    open: 'offen', planned: 'geplant', in_review: 'in Prüfung',
    ready_for_invoice: 'bereit', sent_to_backoffice: 'in Verrechnung',
    invoiced: 'verrechnet', postponed: 'verschoben', on_hold: 'on hold',
  };
  const PLAN_STATUS_COLORS = {
    open: 'bg-slate-100 text-slate-600', planned: 'bg-blue-100 text-blue-700',
    in_review: 'bg-amber-100 text-amber-700', ready_for_invoice: 'bg-emerald-100 text-emerald-700',
    sent_to_backoffice: 'bg-orange-100 text-orange-700',
  };
  const INVOICE_TYPE_LABELS = {
    AZ: 'Anzahlung', TR: 'Teilrechnung', ER: 'Schlussrechnung',
  };

  const nextMonthLabel = getMonthLabel(result.next_month_str) || result.next_month_str;
  const curMonthLabel = getMonthLabel(curMonthStr) || curMonthStr;
  const hasCurrentMonthData = visibleCurBlocks.length > 0 || visibleCurInstructions.length > 0;

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
        title={`Abrechnungsforecast — ${curMonthLabel} & ${nextMonthLabel}`}
        subtitle="Laufender Monat (live) und Planung für den nächsten Monat"
        icon={CalendarCheck}
      />

      {/* KPIs aktueller Monat — Anweisungen + Rechnungsplanung */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-blue-700 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse inline-block" />
          Laufender Monat — {curMonthLabel}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title="Rechnungsplanung" value={formatCurrency(totalCurPlansNet)} variant="info"
            subtitle={`${curMonthPlans.length} geplante Abrechnungen`} />
          <KpiCard title="Noch nicht angewiesen" value={formatCurrency(
            curMonthPlans.filter(p => ['open','planned','in_review'].includes(p.billing_status))
              .reduce((s, p) => s + (Number(p.planned_amount_net) || 0), 0)
          )} variant="warning"
            subtitle={`${curMonthPlans.filter(p => ['open','planned','in_review'].includes(p.billing_status)).length} Einträge offen`} />
          <KpiCard title="Abrechnungsanweisungen" value={formatCurrency(totalCurInstructionNet)} variant="info"
            subtitle={`${curMonthInstructions.length} Anweisung(en)`} />
          <KpiCard title="Davon übermittelt" value={formatCurrency(
            curMonthInstructions.filter(i => ['sent_to_backoffice','invoice_created','paid'].includes(i.status))
              .reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0)
          )} variant="success"
            subtitle={`${curMonthInstructions.filter(i => ['sent_to_backoffice','invoice_created','paid'].includes(i.status)).length} an sevDesk`} />
        </div>
      </div>

      {/* KPIs nächster Monat — Anweisungen + Rechnungsplanung */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
          Nächster Monat — {nextMonthLabel}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title="Rechnungsplanung" value={formatCurrency(totalNextPlansNet)} variant="info"
            subtitle={`${nextMonthPlans.length} geplante Abrechnungen`} />
          <KpiCard title="Noch nicht angewiesen" value={formatCurrency(
            nextMonthPlans.filter(p => ['open','planned','in_review'].includes(p.billing_status))
              .reduce((s, p) => s + (Number(p.planned_amount_net) || 0), 0)
          )} variant="warning"
            subtitle={`${nextMonthPlans.filter(p => ['open','planned','in_review'].includes(p.billing_status)).length} Einträge offen`} />
          <KpiCard title="Abrechnungsanweisungen" value={formatCurrency(totalInstructionNet)} variant="info"
            subtitle={`${nextMonthInstructions.length} Anweisung(en)`} />
          <KpiCard title="Davon übermittelt" value={formatCurrency(
            nextMonthInstructions.filter(i => ['sent_to_backoffice','invoice_created','paid'].includes(i.status))
              .reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0)
          )} variant="success"
            subtitle={`${nextMonthInstructions.filter(i => ['sent_to_backoffice','invoice_created','paid'].includes(i.status)).length} an sevDesk`} />
        </div>
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

      {/* AKTUELLER MONAT: Instructions */}
      {visibleCurInstructions.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/30 overflow-hidden">
          <div className="px-4 py-2.5 bg-blue-100/60 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-700" />
            <span className="font-semibold text-sm text-blue-800">Billing-Anweisungen — {curMonthLabel}</span>
            <span className="text-xs text-blue-600 ml-auto">{visibleCurInstructions.length} Anweisung(en) · {formatCurrency(totalCurInstructionNet)} netto</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-blue-50">
              <tr>
                <th className="text-left p-3 font-medium text-muted-foreground">Kunde / Projekt</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Typ</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Netto</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Datum</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Anweisungstext</th>
              </tr>
            </thead>
            <tbody>
              {visibleCurInstructions.map(instr => {
                const STATUS_COLORS = { draft: 'bg-gray-100 text-gray-600', ready_for_backoffice: 'bg-blue-100 text-blue-700', sent_to_backoffice: 'bg-amber-100 text-amber-700', invoice_created: 'bg-purple-100 text-purple-700', paid: 'bg-teal-100 text-teal-700' };
                const INVOICE_TYPE_LABELS = { advance_invoice: 'Anzahlung', partial_invoice: 'Teilrechnung', final_invoice: 'Schlussrechnung', correction: 'Korrektur', credit_note: 'Gutschrift' };
                return (
                  <tr key={instr.id} className="border-t hover:bg-blue-50/60 cursor-pointer"
                    onClick={() => instr.project_id && setSlideOverProjectId(instr.project_id)}>
                    <td className="p-3"><p className="font-medium">{instr.customer_name || '—'}</p><p className="text-xs text-muted-foreground">{instr.project_name || '—'}</p></td>
                    <td className="p-3"><Badge className="text-xs bg-blue-100 text-blue-700">{INVOICE_TYPE_LABELS[instr.invoice_type] || instr.invoice_type}</Badge></td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(instr.instruction_amount_net)}</td>
                    <td className="p-3"><Badge className={`text-xs ${STATUS_COLORS[instr.status] || 'bg-gray-100 text-gray-600'}`}>{{ draft:'Entwurf', ready_for_backoffice:'Bereit', sent_to_backoffice:'Gesendet', invoice_created:'Rechnung erstellt', paid:'Bezahlt' }[instr.status] || instr.status}</Badge></td>
                    <td className="p-3 text-sm">{instr.planned_invoice_date || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">{instr.invoice_instruction_text || instr.invoice_reason || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* AKTUELLER MONAT: Rechnungsplanung (MonthlyBillingPlan) */}
      {visibleCurPlans.length > 0 && (
        <div className="rounded-xl border border-blue-300 bg-blue-50/20 overflow-hidden">
          <div className="px-4 py-2.5 bg-blue-100/40 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-sm text-blue-800">Rechnungsplanung — {curMonthLabel}</span>
            <span className="text-xs text-blue-600 ml-auto">{visibleCurPlans.length} Eintrag/Einträge · {formatCurrency(totalCurPlansNet)} netto</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-blue-50/60">
              <tr>
                <th className="text-left p-3 font-medium text-muted-foreground">Kunde / Projekt</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Typ</th>
                <th className="text-right p-3 font-medium text-muted-foreground">%</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Netto</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Brutto</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Anweisung</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Datum</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Grund</th>
              </tr>
            </thead>
            <tbody>
              {visibleCurPlans.map(plan => {
                const proj = projectsById[plan.project_id];
                const hasInstruction = !!plan.linked_billing_instruction_id;
                const linkedInstr = hasInstruction ? instructions.find(i => i.id === plan.linked_billing_instruction_id) : null;
                const instrDate = linkedInstr?.planned_invoice_date || null;
                return (
                  <tr key={plan.id} className="border-t hover:bg-blue-50/60 cursor-pointer"
                    onClick={() => plan.project_id && setSlideOverProjectId(plan.project_id)}>
                    <td className="p-3">
                      <p className="font-medium">{proj?.customer || plan.assigned_pm || '—'}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">{proj?.project_name || '—'}</p>
                    </td>
                    <td className="p-3">
                      <Badge className="text-xs bg-blue-100 text-blue-700">
                        {INVOICE_TYPE_LABELS[plan.planned_invoice_type] || plan.planned_invoice_type || '—'}
                      </Badge>
                    </td>
                    <td className="p-3 text-right text-muted-foreground">{plan.planned_percent > 0 ? `${Math.round(plan.planned_percent)}%` : '—'}</td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(plan.planned_amount_net)}</td>
                    <td className="p-3 text-right text-muted-foreground">{formatCurrency(plan.planned_amount_gross)}</td>
                    <td className="p-3">
                      <Badge className={`text-xs ${PLAN_STATUS_COLORS[plan.billing_status] || 'bg-slate-100 text-slate-600'}`}>
                        {PLAN_STATUS_LABELS[plan.billing_status] || plan.billing_status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {hasInstruction
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500" title="Abrechnungsanweisung erstellt" />
                        : <Circle className="w-4 h-4 text-slate-300" title="Keine Anweisung" />}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{instrDate || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[180px] truncate">{plan.invoice_reason || plan.internal_note || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}



      {/* NÄCHSTER MONAT: Instructions */}
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
                  invoice_created: 'bg-purple-100 text-purple-700',
                  paid: 'bg-teal-100 text-teal-700',
                };
                const INVOICE_TYPE_LABELS = {
                  advance_invoice: 'Anzahlung',
                  partial_invoice: 'Teilrechnung',
                  final_invoice: 'Schlussrechnung',
                  correction: 'Korrektur',
                  credit_note: 'Gutschrift',
                };
                return (
                  <tr key={instr.id} className="border-t hover:bg-amber-50/80 cursor-pointer"
                    onClick={() => instr.project_id && setSlideOverProjectId(instr.project_id)}>
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
                        {{ draft:'Entwurf', ready_for_backoffice:'Bereit', sent_to_backoffice:'Gesendet', invoice_created:'Rechnung erstellt', paid:'Bezahlt' }[instr.status] || instr.status}
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

      {/* NÄCHSTER MONAT: Rechnungsplanung (MonthlyBillingPlan) */}
      {visibleNextPlans.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/20 overflow-hidden">
          <div className="px-4 py-2.5 bg-amber-100/40 flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-600" />
            <span className="font-semibold text-sm text-amber-800">Rechnungsplanung — {nextMonthLabel}</span>
            <span className="text-xs text-amber-600 ml-auto">{visibleNextPlans.length} Eintrag/Einträge · {formatCurrency(totalNextPlansNet)} netto</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-amber-50/60">
              <tr>
                <th className="text-left p-3 font-medium text-muted-foreground">Kunde / Projekt</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Typ</th>
                <th className="text-right p-3 font-medium text-muted-foreground">%</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Netto</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Brutto</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Anweisung</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Datum</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Grund</th>
              </tr>
            </thead>
            <tbody>
              {visibleNextPlans.map(plan => {
                const proj = projectsById[plan.project_id];
                const hasInstruction = !!plan.linked_billing_instruction_id;
                const linkedInstr = hasInstruction ? instructions.find(i => i.id === plan.linked_billing_instruction_id) : null;
                const instrDate = linkedInstr?.planned_invoice_date || null;
                return (
                  <tr key={plan.id} className="border-t hover:bg-amber-50/60 cursor-pointer"
                    onClick={() => plan.project_id && setSlideOverProjectId(plan.project_id)}>
                    <td className="p-3">
                      <p className="font-medium">{proj?.customer || plan.assigned_pm || '—'}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">{proj?.project_name || '—'}</p>
                    </td>
                    <td className="p-3">
                      <Badge className="text-xs bg-amber-100 text-amber-700">
                        {INVOICE_TYPE_LABELS[plan.planned_invoice_type] || plan.planned_invoice_type || '—'}
                      </Badge>
                    </td>
                    <td className="p-3 text-right text-muted-foreground">{plan.planned_percent > 0 ? `${Math.round(plan.planned_percent)}%` : '—'}</td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(plan.planned_amount_net)}</td>
                    <td className="p-3 text-right text-muted-foreground">{formatCurrency(plan.planned_amount_gross)}</td>
                    <td className="p-3">
                      <Badge className={`text-xs ${PLAN_STATUS_COLORS[plan.billing_status] || 'bg-slate-100 text-slate-600'}`}>
                        {PLAN_STATUS_LABELS[plan.billing_status] || plan.billing_status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {hasInstruction
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500" title="Abrechnungsanweisung erstellt" />
                        : <Circle className="w-4 h-4 text-slate-300" title="Keine Anweisung" />}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{instrDate || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[180px] truncate">{plan.invoice_reason || plan.internal_note || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}


      <ProjectDetailSlideOver
        projectId={slideOverProjectId}
        open={!!slideOverProjectId}
        onClose={() => setSlideOverProjectId(null)}
      />
    </div>
  );
}