import React from 'react';
import { TrendingUp, Receipt, AlertTriangle, CreditCard, FileText, Clock, DollarSign, BarChart3 } from 'lucide-react';
import KpiCard from '@/components/shared/KpiCard';
import { formatCurrency, calcOverdueDays } from '@/lib/liquidityUtils';

export default function DashboardKpis({ projects, planLines, contracts, tools, receivables, payables, invoices = [], blocks = [], instructions = [], liveInvoiced, liveOpen, liveReceivablesData }) {
  const openProject = liveOpen ?? projects.reduce((s, p) => s + (Number(p.open_amount) || 0), 0);

  // Bereits verrechnet 2026 — strikt Kalenderjahr 2026 aus InvoiceRecords (netto, ohne Storno/Gutschrift)
  const alreadyInvoiced = invoices
    .filter(i => (i.invoice_date || '').startsWith('2026') && i.payment_status !== 'cancelled' && !i.is_credit_note)
    .reduce((s, i) => s + (Number(i.net_amount) || 0), 0);

  const today = new Date();
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);

  // Erwartete Verrechnung nächste 30 Tage — aus echten Datenquellen:
  // 1. Aktive Abrechnungsanweisungen (BillingInstruction) mit geplantem Rechnungsdatum im Fenster
  // 2. Offene Abrechnungspakete (BillingBlock) mit planned_invoice_date / billing_month im Fenster
  const ACTIVE_INSTR = new Set(['draft', 'ready_for_backoffice', 'sent_to_backoffice']);
  const blockDate = (b) => b.planned_invoice_date || (b.billing_month ? `${b.billing_month}-15` : null);
  const inWindow = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= today && d <= in30;
  };

  const next30FromInstr = instructions
    .filter(i => ACTIVE_INSTR.has(i.status) && inWindow(i.planned_invoice_date))
    .reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0);

  const coveredByInstr = new Set(instructions.map(i => i.billing_block_id).filter(Boolean));
  const next30FromBlocks = blocks
    .filter(b => !['invoiced', 'paid'].includes(b.invoice_readiness_status) && !coveredByInstr.has(b.id) && inWindow(blockDate(b)))
    .reduce((s, b) => s + (Number(b.amount_net) || 0) * ((b.probability_percent ?? 90) / 100), 0);

  const next30 = next30FromInstr + next30FromBlocks;

  // Effektives Fälligkeitsdatum: due_date, sonst invoice_date + 30 Tage als Fallback
  const effectiveDueDate = (item) => {
    if (item.due_date) return item.due_date;
    if (item.invoice_date) {
      const d = new Date(item.invoice_date);
      d.setDate(d.getDate() + 30);
      return d.toISOString().substring(0, 10);
    }
    return null;
  };

  // Offene Forderungen: Wenn Live-Daten verfügbar → direkt von sevDesk API (exakte Übereinstimmung mit sevDesk UI)
  // Fallback: lokale DB (InvoiceRecord + manuelle Receivables)
  let openReceivables, openReceivablesNet, overdueReceivables, overdueReceivablesNet;

  if (liveReceivablesData?.invoices) {
    // Live-Modus: Direkt aus sevDesk API
    const liveInvs = liveReceivablesData.invoices;
    openReceivables = liveInvs.reduce((s, i) => s + (Number(i.open_amount) || 0), 0);
    openReceivablesNet = openReceivables / 1.20; // Näherungswert Netto (20% MwSt.)
    overdueReceivables = liveInvs
      .filter(i => i.due_date && calcOverdueDays(i.due_date) > 0)
      .reduce((s, i) => s + (Number(i.open_amount) || 0), 0);
    overdueReceivablesNet = overdueReceivables / 1.20;
  } else {
    // Fallback: lokale DB
    const openReceivablesManual = receivables
      .filter(r => r.status !== 'paid' && r.status !== 'write_off')
      .reduce((s, r) => s + (Number(r.gross_amount) || 0), 0);
    const openReceivablesInvoices = invoices
      .filter(i => i.payment_status !== 'paid' && i.payment_status !== 'cancelled' && i.payment_status !== 'draft' && !i.is_credit_note)
      .reduce((s, i) => s + (Number(i.open_amount) > 0 ? Number(i.open_amount) : Number(i.gross_amount) || 0), 0);
    openReceivables = openReceivablesManual + openReceivablesInvoices;

    const openReceivablesManualNet = receivables
      .filter(r => r.status !== 'paid' && r.status !== 'write_off')
      .reduce((s, r) => s + (Number(r.net_amount) || 0), 0);
    const openReceivablesInvoicesNet = invoices
      .filter(i => i.payment_status !== 'paid' && i.payment_status !== 'cancelled' && i.payment_status !== 'draft' && !i.is_credit_note)
      .reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
    openReceivablesNet = openReceivablesManualNet + openReceivablesInvoicesNet;

    const overdueReceivablesManual = receivables
      .filter(r => r.status !== 'paid' && r.status !== 'write_off' && calcOverdueDays(effectiveDueDate(r)) > 0)
      .reduce((s, r) => s + (Number(r.gross_amount) || 0), 0);
    const overdueReceivablesInvoices = invoices
      .filter(i => i.payment_status !== 'paid' && i.payment_status !== 'cancelled' && i.payment_status !== 'draft' && !i.is_credit_note && calcOverdueDays(effectiveDueDate(i)) > 0)
      .reduce((s, i) => s + (Number(i.open_amount) > 0 ? Number(i.open_amount) : Number(i.gross_amount) || 0), 0);
    overdueReceivables = overdueReceivablesManual + overdueReceivablesInvoices;

    const overdueReceivablesManualNet = receivables
      .filter(r => r.status !== 'paid' && r.status !== 'write_off' && calcOverdueDays(effectiveDueDate(r)) > 0)
      .reduce((s, r) => s + (Number(r.net_amount) || 0), 0);
    const overdueReceivablesInvoicesNet = invoices
      .filter(i => i.payment_status !== 'paid' && i.payment_status !== 'cancelled' && i.payment_status !== 'draft' && !i.is_credit_note && calcOverdueDays(effectiveDueDate(i)) > 0)
      .reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
    overdueReceivablesNet = overdueReceivablesManualNet + overdueReceivablesInvoicesNet;
  }

  const toolCosts = tools.reduce((s, t) => s + (Number(t.annual_cost) || 0), 0);
  const monthlyToolAvg = tools.reduce((s, t) => s + (Number(t.monthly_cost) || 0), 0);

  const openPayables = payables.filter(p => p.status !== 'paid').reduce((s, p) => s + (Number(p.gross_amount) || 0), 0);

  const kpis = [
    // 1. Liquidity & billing decisions first
    { title: 'Erwartete Verrechnung aktueller Monat', value: formatCurrency(next30), subtitle: 'nächste 30 Tage', icon: TrendingUp, variant: 'info' },
    { title: 'Offene Projektbeträge', value: formatCurrency(openProject), subtitle: 'noch zu verrechnen', icon: BarChart3, variant: 'warning' },
    { title: 'Bereits verrechnet 2026', value: formatCurrency(alreadyInvoiced), icon: Receipt, variant: 'success' },
    { title: 'Aktive Projekte', value: projects.filter(p => p.status === 'active').length, icon: DollarSign, variant: 'default' },
    // 2. Receivables risk
    { title: 'Überfällige Forderungen (brutto)', value: formatCurrency(overdueReceivables), subtitle: overdueReceivablesNet > 0 ? `Netto ca. ${formatCurrency(overdueReceivablesNet)}` : (liveReceivablesData ? 'Live sevDesk' : undefined), icon: AlertTriangle, variant: overdueReceivables > 0 ? 'danger' : 'default' },
    // 3. Costs
    { title: 'Toolkosten 2026', value: formatCurrency(toolCosts), subtitle: `Ø ${formatCurrency(monthlyToolAvg)}/Monat`, icon: CreditCard, variant: 'default' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {kpis.map((k, i) => <KpiCard key={i} {...k} compact />)}
    </div>
  );
}