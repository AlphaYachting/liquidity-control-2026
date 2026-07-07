/**
 * invoiceLiquidityFilter.js — Zentrale Wahrheitsquelle dafür, welche Rechnungen
 * in die Liquiditätsübersicht einfließen dürfen.
 *
 * Regel (fachliche Vorgabe):
 *  Nur Rechnungen, die tatsächlich VERSENDET wurden und danach NICHT storniert wurden.
 *
 * Damit ausgeschlossen:
 *  - Stornierte Rechnungen (payment_status === 'cancelled')
 *  - Entwürfe (payment_status === 'draft')
 *  - Noch nicht versendete Rechnungen (is_sent !== true)
 *  - Gutschriften (is_credit_note)
 *
 * Hinweis zu is_sent: Der sevDesk-Sync setzt is_sent = true, sobald eine Rechnung
 * den Entwurfsstatus (sevDesk-Status 100) verlassen hat. Für ältere Datensätze
 * ohne gepflegtes is_sent-Feld gilt: alles außer 'draft' war bereits versendet.
 */

/** Wurde die Rechnung versendet? Robust auch für Alt-Datensätze ohne is_sent. */
export function isInvoiceSent(inv) {
  if (inv.is_sent === true) return true;
  if (inv.is_sent === false) return false;
  // Alt-Datensatz ohne is_sent: Entwürfe gelten als NICHT versendet, alles andere als versendet.
  return inv.payment_status !== 'draft';
}

/**
 * Darf diese Rechnung in die Liquiditätsübersicht (Anzeige + Berechnung)?
 * Storno und Entwurf immer raus, nicht-versendete raus, Gutschriften raus.
 */
export function isLiquidityRelevantInvoice(inv) {
  if (!inv) return false;
  if (inv.payment_status === 'cancelled') return false;
  if (inv.payment_status === 'draft') return false;
  if (inv.is_credit_note) return false;
  if (!isInvoiceSent(inv)) return false;
  return true;
}

/** Bequemer Array-Filter für Listen von Rechnungen. */
export function filterLiquidityInvoices(invoices = []) {
  return invoices.filter(isLiquidityRelevantInvoice);
}