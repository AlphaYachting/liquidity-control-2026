const std = (min) => Math.round((min || 0) / 60);
const eur = (v) => Math.round(v || 0).toLocaleString('de-AT');
const kurz = (iso) => iso ? new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }) : 'kein Termin gesetzt';

// Faktenblock für die Projektintelligenz — getrennt beschriftet nach netto/brutto,
// inklusive der bekannten Datenprobleme und der Kundenklammer.
export function faktenBlock(kennzahlen, finanzen, kontext) {
  if (!kennzahlen && !finanzen) return '';
  const k = kennzahlen || {};
  const f = finanzen || {};
  const c = kontext || {};

  const budget = k.budget_verbraucht_prozent === null || k.budget_verbraucht_prozent === undefined
    ? '—' : Math.round(k.budget_verbraucht_prozent);

  const blockiertZeile = `blockierte Aufgaben: ${k.blockiert || 0}${c.hatBlockiertStatus === false
    ? " — im awork-Workspace existiert kein Status 'blockiert', 0 bedeutet hier nichts" : ''}`;

  const zeitbuchungZeile = c.letzteZeitbuchung
    ? `letzte Zeitbuchung: ${kurz(c.letzteZeitbuchung)} (vor ${c.tageSeitZeitbuchung} Tagen)`
    : 'letzte Zeitbuchung: keine Zeitbuchung in den Daten';

  const hinweise = [
    ...(f.warnings || []).map(w => `  ${w.message}`),
    ...(f.unmatchedInvoiceCount > 0
      ? [`  ${f.unmatchedInvoiceCount} Rechnung(en) dieses Kunden sind keinem Auftrag zugeordnet und in den obigen Zahlen NICHT enthalten.`]
      : []),
  ];

  const weitere = [
    ...(c.weitereProjekteDesKunden || []).map(p => `  Projekt: ${p.project_name || p.id}`),
    ...(c.weitereAuftraegeDesKunden || []).map(o =>
      `  Auftrag: ${o.order_number || 'ohne Nummer'} — ${o.project_name || ''} (${eur(o.total_net_amount)} EUR netto)`),
  ];

  return `Diese Werte stammen aus der Projektansicht und gelten für die Anzeige. Verwende sie unverändert. Weichen von dir geladene Daten davon ab, melde den Widerspruch ausdrücklich — löse ihn nicht auf und erfinde keine Erklärung.

Aufgaben erledigt: ${k.erledigt || 0} von ${k.gesamt || 0} (${Math.round(k.erledigt_prozent || 0)} %)
Zeitbudget: ${std(k.gebuchte_minuten)} von ${std(k.geplante_minuten)} Stunden (${budget} %)
${blockiertZeile}
${zeitbuchungZeile}
nächste Frist: ${kurz(k.naechste_frist)}
Abrechnungsfortschritt: ${Math.round(f.billingPct || 0)} %   Zahlungsfortschritt: ${Math.round(f.paymentPct || 0)} %

Abrechnungsmodell: ${f.abrechnungsmodell || 'unbekannt'}
Auftragswert netto: ${eur(f.orderNet)} EUR
fakturiert netto: ${eur(f.invoicedNet)} EUR | fakturiert brutto: ${eur(f.invoicedGross)} EUR
bezahlt netto: ${eur(f.paidNet)} EUR | bezahlt brutto: ${eur(f.paidGross)} EUR
offene Forderung brutto: ${eur(f.openReceivableGross)} EUR
Basis der Auftragssumme: ${f.commercialBaseSource || 'unbekannt'}

Datenhinweise:
${hinweise.length ? hinweise.join('\n') : '  keine'}

Weitere Aufträge/Projekte dieses Kunden:
${weitere.length ? weitere.join('\n') : '  keine'}
Diese sind in den obigen Zahlen nicht enthalten. Beziehe dich nur auf Projekte, die du selbst geladen hast.

`;
}