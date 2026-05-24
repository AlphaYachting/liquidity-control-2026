import React from 'react';
import { TrendingUp, Receipt, AlertTriangle, CreditCard, FileText, Clock, DollarSign, BarChart3 } from 'lucide-react';
import KpiCard from '@/components/shared/KpiCard';
import { formatCurrency, calcOverdueDays } from '@/lib/liquidityUtils';

export default function DashboardKpis({ projects, planLines, contracts, tools, receivables, payables, invoices = [], liveInvoiced, liveOpen }) {
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

  // Offene Forderungen: Receivable (manuell) + InvoiceRecord (sevDesk) — beide Quellen zusammengeführt
  const openReceivablesManual = receivables
    .filter(r => r.status !== 'paid' && r.status !== 'write_off')
    .reduce((s, r) => s + (Number(r.gross_amount) || 0), 0);
  const openReceivablesInvoices = invoices
    .filter(i => i.payment_status !== 'paid' && i.payment_status !== 'cancelled' && !i.is_credit_note)
    .reduce((s, i) => s + (Number(i.open_amount) > 0 ? Number(i.open_amount) : Number(i.gross_amount) || 0), 0);
  const openReceivables = openReceivablesManual + openReceivablesInvoices;

  const overdueReceivablesManual = receivables
    .filter(r => r.status !== 'paid' && r.status !== 'write_off' && calcOverdueDays(effectiveDueDate(r)) > 0)
    .reduce((s, r) => s + (Number(r.gross_amount) || 0), 0);
  const overdueReceivablesInvoices = invoices
    .filter(i => i.payment_status !== 'paid' && i.payment_status !== 'cancelled' && !i.is_credit_note && calcOverdueDays(effectiveDueDate(i)) > 0)
    .reduce((s, i) => s + (Number(i.open_amount) > 0 ? Number(i.open_amount) : Number(i.gross_amount) || 0), 0);
  const overdueReceivables = overdueReceivablesManual + overdueReceivablesInvoices;

  const toolCosts = tools.reduce((s, t) => s + (Number(t.annual_cost) || 0), 0);
  const monthlyToolAvg = tools.reduce((s, t) => s + (Number(t.monthly_cost) || 0), 0);

  const openPayables = payables.filter(p => p.status !== 'paid').reduce((s, p) => s + (Number(p.gross_amount) || 0), 0);

  const kpis = [
    { title: 'Geplante Zuflüsse 2026', value: formatCurrency(totalPlanned), icon: TrendingUp, variant: 'info' },
    { title: 'Bereits verrechnet', value: formatCurrency(alreadyInvoiced), icon: Receipt, variant: 'success' },
    { title: 'Offene Projektbeträge', value: formatCurrency(openProject), icon: BarChart3, variant: 'warning' },
    { title: 'Zufluss nächste 30 Tage', value: formatCurrency(next30), icon: Clock, variant: 'info' },
    { title: 'Zufluss nächste 90 Tage', value: formatCurrency(next90), icon: Clock, variant: 'info' },
    { title: 'Offene Forderungen', value: formatCurrency(openReceivables), icon: AlertTriangle, variant: openReceivables > 0 ? 'warning' : 'default' },
    { title: 'Überfällige Forderungen', value: formatCurrency(overdueReceivables), icon: AlertTriangle, variant: overdueReceivables > 0 ? 'danger' : 'default' },
    { title: 'Toolkosten 2026', value: formatCurrency(toolCosts), subtitle: `Ø ${formatCurrency(monthlyToolAvg)}/Monat`, icon: CreditCard, variant: 'default' },
    { title: 'Offene Verbindlichkeiten', value: formatCurrency(openPayables), icon: FileText, variant: openPayables > 0 ? 'warning' : 'default' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
      {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
    </div>
  );
}