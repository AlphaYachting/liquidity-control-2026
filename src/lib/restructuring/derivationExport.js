// Herleitung aus dem Auftragsbestand als eigener Block für Export und Bericht.
import { fmtEUR } from './restructuringFormat';

export const DERIVATION_SOURCE =
  'Bestätigte Aufträge (ConfirmedOrder) − verrechnete Beträge (InvoiceRecord), Kapazitätsgrenze und Zahlungsstaffel laut Sanierungs-Einstellungen';

export function derivationExportRows(d) {
  if (!d) return { columns: [], rows: [], summary: [] };
  const columns = ['Schritt', 'Position', 'Betrag', 'Erläuterung'];
  const rows = [];
  d.steps.forEach((s) => {
    rows.push([String(s.no), s.label, s.amount.toFixed(2), s.note]);
    s.rows.forEach((r) => {
      rows.push([
        '',
        `   ${[r.order_number, r.customer, r.project_name].filter((x) => x && x !== '—').join(' · ')}`,
        (r._amount || 0).toFixed(2),
        '',
      ]);
    });
  });
  const summary = [
    `Auftragsbestand offen netto: ${fmtEUR(d.backlogNet)}`,
    `Kapazitätsgrenze: ${d.cap > 0 ? `${fmtEUR(d.cap)} brutto je Monat` : 'nicht gepflegt'}`,
    `Abrechenbar im Horizont: ${Math.round(d.coverRatio * 100)} % des Auftragsbestands`,
    `Altanteil brutto: ${fmtEUR(d.altGross)} · Neuleistung brutto: ${fmtEUR(d.neuGross)}`,
    `Zahlungseingang in ${d.weeks} Planwochen: ${fmtEUR(d.cashInHorizon)}`
      + (d.patternName ? ` (Staffel „${d.patternName}")` : ''),
  ];
  return { columns, rows, summary };
}