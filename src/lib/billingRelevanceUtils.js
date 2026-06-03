/**
 * Billing Relevance Classification Logic
 * Excel = operational truth for active/future billing
 * InvoiceSystem = truth for actual invoices/payments
 */

const ACTIVE_BILLING_STATUSES = ['offen', 'open', 'geplant', 'planned', 'in_verrechnung', 'in verrechnung', 'on_hold', 'verschoben', 'laufend'];
const INACTIVE_STATUSES = ['abgeschlossen', 'closed', 'cancelled', 'storniert', 'fertig', 'done', 'completed', 'archiviert'];

/**
 * Classify an Excel row into a billing_relevance_status
 */
export function classifyBillingRelevance(row) {
  const status = (row.project_status || '').toLowerCase();
  const billing = (row.billing_status || '').toLowerCase();
  const reasons = [];

  // Hard inactive
  if (INACTIVE_STATUSES.some(k => status.includes(k) || billing.includes(k))) {
    return { status: 'inactive', reasons: ['Status abgeschlossen/storniert'] };
  }

  // Active signals
  if (ACTIVE_BILLING_STATUSES.some(k => status.includes(k) || billing.includes(k))) {
    reasons.push('Status aktiv/laufend');
  }
  if ((row.open_amount_net || 0) > 0) reasons.push(`Offener Betrag €${Math.round(row.open_amount_net)}`);
  if ((row.open_percent || 0) > 0) reasons.push(`Offen ${row.open_percent}%`);
  if ((row.expected_current_month_amount_net || 0) > 0) reasons.push('Erwartung aktueller Monat');
  if ((row.expected_next_month_amount_net || 0) > 0) reasons.push('Erwartung Folgemonat');
  if (row.notes_next_invoice) reasons.push('Abrechnungshinweis vorhanden');

  // Future-only signals (no current billing but future planned)
  const futureSigns = (row.expected_next_month_amount_net || 0) > 0 || row.reminder_date;
  const currentSigns = (row.open_amount_net || 0) > 0 || (row.expected_current_month_amount_net || 0) > 0 || reasons.length > 0;

  if (reasons.length === 0 && (row.total_order_amount_net || 0) === 0) {
    return { status: 'not_billing_relevant', reasons: ['Keine Auftragssumme, kein Statushinweis'] };
  }
  if (futureSigns && !currentSigns) {
    return { status: 'future_billing_relevant', reasons: reasons.length ? reasons : ['Nur Zukunftsplanung vorhanden'] };
  }
  if (reasons.length > 0) {
    return { status: 'active_billing_relevant', reasons };
  }
  return { status: 'needs_review', reasons: ['Kein eindeutiges Billing-Signal'] };
}

/**
 * Classify an existing app project that is NOT in the Excel sheet
 */
export function classifyExistingProjectNotInExcel(project, invoices, orders) {
  const hasOpenInvoice = invoices.some(i =>
    i.project_id === project.id &&
    ['open', 'partially_paid', 'overdue'].includes(i.payment_status) &&
    i.payment_status !== 'cancelled'
  );
  const hasOrder = orders.some(o => o.project_id === project.id);
  const isFinished = ['completed', 'cancelled'].includes(project.status);

  if (hasOpenInvoice) return { status: 'needs_review', reason: 'Offene Rechnung, aber nicht im Excel' };
  if (isFinished && !hasOpenInvoice) return { status: 'archived', reason: 'Abgeschlossen, keine offenen Rechnungen' };
  if (!hasOrder && !hasOpenInvoice && (project.total_net_amount || 0) === 0) return { status: 'not_billing_relevant', reason: 'Kein Auftrag, kein offenes Geld' };
  return { status: 'inactive', reason: 'Nicht im PM-Excel, kein kritischer offener Posten' };
}

/**
 * Determine if a project should appear in the active Project Cockpit view
 */
export function isProjectCockpitRelevant(project) {
  if (project.excluded_from_project_cockpit) return false;
  const rel = project.billing_relevance_status;
  if (!rel) return true; // Legacy projects without classification → show by default
  return ['active_billing_relevant', 'future_billing_relevant', 'needs_review'].includes(rel);
}

/**
 * Determine if a project should appear in the forecast
 */
export function isForecastRelevant(project) {
  if (project.excluded_from_forecast) return false;
  const rel = project.billing_relevance_status;
  if (!rel) return true;
  return ['active_billing_relevant', 'future_billing_relevant'].includes(rel);
}

export const RELEVANCE_LABELS = {
  active_billing_relevant: 'Aktiv abrechnungsrelevant',
  future_billing_relevant: 'Zukunfts-Abrechnung',
  inactive: 'Inaktiv',
  archived: 'Archiviert',
  not_billing_relevant: 'Nicht relevant',
  needs_review: 'Prüfung nötig',
};

export const RELEVANCE_COLORS = {
  active_billing_relevant: 'bg-emerald-100 text-emerald-800',
  future_billing_relevant: 'bg-blue-100 text-blue-700',
  inactive: 'bg-gray-100 text-gray-500',
  archived: 'bg-gray-100 text-gray-400',
  not_billing_relevant: 'bg-slate-100 text-slate-500',
  needs_review: 'bg-amber-100 text-amber-700',
};