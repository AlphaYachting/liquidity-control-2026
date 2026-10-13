/**
 * weeklyCashflowEngine.js — Wöchentliche Ist-Cashflow-Vorschau, 8 Wochen.
 *
 * Ziel: ALLE tatsächlichen Zahlungsquellen abbilden, nicht nur einen Ausschnitt.
 *
 * Zuflüsse:
 *  1. Überfällige offene Rechnungen (due_date < heute)      → Bucket "overdue" (sofort fällig)
 *  2. Offene Rechnungen mit Fälligkeit in den nächsten 8 Wochen → passende Woche
 *  3. Wiederkehrende Verträge (Hosting/Wartung/Domain/...)  → nach Intervall in die Wochen
 *
 * Abflüsse:
 *  - Offene Verbindlichkeiten (Payable) nach due_date
 *
 * Separat (NICHT im Netto): geplante Rechnungen aus ProjectBillingBlock.
 *
 * Gutschriften (is_credit_note) und stornierte Positionen werden ausgefiltert.
 */

import { addDays, startOfWeek, format, isWithinInterval, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { isLiquidityRelevantInvoice } from './invoiceLiquidityFilter';

const WEEKS_AHEAD = 8;

export function getWeeks() {
  const today = new Date();
  const start = startOfWeek(today, { weekStartsOn: 1 });
  return Array.from({ length: WEEKS_AHEAD }, (_, i) => {
    const weekStart = addDays(start, i * 7);
    const weekEnd = addDays(weekStart, 6);
    return {
      weekStart,
      weekEnd,
      label: `KW ${format(weekStart, 'w')} · ${format(weekStart, 'dd.MM.', { locale: de })} – ${format(weekEnd, 'dd.MM.', { locale: de })}`,
    };
  });
}

const invoiceAmount = (inv) => Number(inv.open_amount) > 0
  ? Number(inv.open_amount)
  : Number(inv.gross_amount) || Number(inv.net_amount) || 0;

const safeInInterval = (dateStr, interval) => {
  try { return isWithinInterval(parseISO(dateStr), interval); } catch { return false; }
};

/**
 * Verteilt einen wiederkehrenden Vertrag auf die 8 Wochen.
 * monthly  → in jeder Woche anteilig (Monatsbetrag / ~4.33)
 * quarterly/yearly/once → im Fälligkeits- bzw. Startmonat, sofern in den 8 Wochen
 */
function contractInflowForWeek(contract, weekStart, weekEnd) {
  const interval = contract.billing_interval || 'monthly';

  if (interval === 'monthly') {
    const monthly = Number(contract.monthly_fixed_price) || 0;
    // Monatsbetrag gleichmäßig auf Wochen (52/12 ≈ 4.333 Wochen/Monat)
    return monthly > 0 ? monthly / (52 / 12) : 0;
  }

  if (['quarterly', 'yearly', 'once'].includes(interval)) {
    const dateStr = contract.due_date || contract.start_date;
    if (!dateStr) return 0;
    if (!safeInInterval(dateStr, { start: weekStart, end: weekEnd })) return 0;
    if (interval === 'quarterly') {
      return Number(contract.monthly_fixed_price) > 0
        ? Number(contract.monthly_fixed_price) * 3
        : (Number(contract.annual_amount) || 0) / 4;
    }
    return Number(contract.annual_amount) || Number(contract.one_time_payment) || 0;
  }

  return 0;
}

export function buildWeeklyCashflow({ invoices = [], payables = [], blocks = [], contracts = [] }) {
  const _t = new Date();
  const todayStr = `${_t.getFullYear()}-${String(_t.getMonth() + 1).padStart(2, '0')}-${String(_t.getDate()).padStart(2, '0')}`;
  const weeks = getWeeks();

  // Nur versendete, nicht stornierte Rechnungen (keine Entwürfe/Gutschriften), noch offen
  const openInvoices = invoices.filter(inv =>
    inv.due_date &&
    inv.payment_status !== 'paid' &&
    isLiquidityRelevantInvoice(inv)
  );

  const activeContracts = contracts.filter(c => ['active', 'pending'].includes(c.status));

  // ── Bucket "Überfällig / sofort fällig" (due_date < heute) ──
  const overdueInvoices = openInvoices.filter(inv => inv.due_date < todayStr);
  const overdue = {
    total: overdueInvoices.reduce((s, inv) => s + invoiceAmount(inv), 0),
    count: overdueInvoices.length,
    items: overdueInvoices
      .map(inv => ({
        name: [inv.invoice_number, inv.customer_name].filter(Boolean).join(' · '),
        amount: invoiceAmount(inv),
        due_date: inv.due_date,
      }))
      .sort((a, b) => (a.due_date < b.due_date ? -1 : 1)),
  };

  // ── Wochen-Buckets ──
  const weekly = weeks.map(({ weekStart, weekEnd, label }) => {
    const interval = { start: weekStart, end: weekEnd };

    const invoiceInflow = openInvoices
      .filter(inv => inv.due_date >= todayStr && safeInInterval(inv.due_date, interval))
      .reduce((s, inv) => s + invoiceAmount(inv), 0);

    const contractInflow = activeContracts
      .reduce((s, c) => s + contractInflowForWeek(c, weekStart, weekEnd), 0);

    const inflows = invoiceInflow + contractInflow;

    const outflows = payables
      .filter(pay => pay.due_date && !['paid', 'cancelled'].includes(pay.status) && safeInInterval(pay.due_date, interval))
      .reduce((s, pay) => s + (Number(pay.gross_amount) || Number(pay.net_amount) || 0), 0);

    const plannedBilling = blocks
      .filter(b => b.planned_invoice_date && b.invoice_readiness_status !== 'invoiced' && safeInInterval(b.planned_invoice_date, interval))
      .reduce((s, b) => s + (Number(b.amount_net) || 0), 0);

    return {
      label, weekStart, weekEnd,
      invoiceInflow, contractInflow, inflows, outflows, plannedBilling,
      net: inflows - outflows,
    };
  });

  return { overdue, weekly, activeContractsCount: activeContracts.length };
}