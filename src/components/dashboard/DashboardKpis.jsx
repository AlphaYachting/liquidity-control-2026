import React from 'react';
import { TrendingUp, Receipt, AlertTriangle, CreditCard, FileText, Clock, DollarSign, BarChart3 } from 'lucide-react';
import KpiCard from '@/components/shared/KpiCard';
import { formatCurrency, calcOverdueDays } from '@/lib/liquidityUtils';

export default function DashboardKpis({ projects, planLines, contracts, tools, receivables, payables, invoices = [], liveInvoiced, liveOpen, liveReceivablesData }) {
  const totalPlanned = planLines.filter(l => l.direction === 'inflow').reduce((s, l) => s + (Number(l.amount_net) || 0), 0);
  const alreadyInvoiced = liveInvoiced ?? projects.reduce((s, p) => s + (Number(p.already_invoiced_amount) || 0), 0);
  const openProject = liveOpen ?? projects.reduce((s, p) => s + (Number(p.open_amount) || 0), 0);

  const today = new Date();
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const in90 = new Date(today); in90.setDate(in90.getDate() + 90);

  const next30 = planLines.filter(l => l.direction === 'inflow' && l.date && new Date(l.date) <= in30 && new Date(l.date) >= today)
    .reduce((s, l) => s + (Number(l.amount_net) || 0), 0);
  const next90 = planLines.filter(l => l.direction === 'inflow' && l.date && new Date(l.date) <= in90 && new Date(l.date) >= today)
    .reduce((s, l) => s + (Number(l.amount_net) || 0), 0);

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
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
    </div>
  );
}