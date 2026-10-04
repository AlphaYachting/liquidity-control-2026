const std = (min) => Math.round((min || 0) / 60);
const eur = (v) => Math.round(v || 0).toLocaleString('de-AT');
const kurz = (iso) => iso ? new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }) : 'kein Termin gesetzt';

// Projektlage aus der Funktion projektLage — aWork-Altstand und App-Daten in einer Rechnung.
// Diese Zahlen gelten seit der Umstellung als massgeblich für Stunden, Tempo und Stillstand.
export function lageBlock(lage) {
  if (!lage || lage.error) return '';
  const d = lage.datenstand || {};
  const p = lage.plan || {};
  const g = lage.prognose || {};
  const m = lage.mehrleistung || {};
  const e = lage.euro;
  const r = lage.rest;
  const wert = (v, einheit = '') => (v === null || v === undefined ? '—' : `${v}${einheit}`);
  return `Projektlage (Funktion projektLage, Stand heute — massgeblich für Stunden, Tempo und Stillstand):
Datenregel: ${d.regel || '—'}
Ist-Stunden: ${wert(p.ist_stunden)} (aWork-Altstand ${wert(d.awork_stunden)} + App ${wert(d.app_stunden)})
Planstunden: ${wert(p.plan_stunden)} (${p.plan_quelle || 'kein Planwert'})${p.plan_ungepflegt ? ' — Planwert offensichtlich ungepflegt' : ''}
Auslastung: ${wert(p.auslastung_pct, ' %')} | Fortschritt: ${wert(p.fortschritt_pct, ' %')} (${p.fortschritt_quelle || 'nicht bestimmbar'}; ${wert(p.aufgaben_erledigt)} von ${wert(p.aufgaben_gesamt)} Aufgaben)
letzte Zeitbuchung: ${d.letzte_buchung || 'keine'}${d.tage_seit_letzter_buchung !== null && d.tage_seit_letzter_buchung !== undefined ? ` (vor ${d.tage_seit_letzter_buchung} Tagen)` : ''}
Tempo: ${wert(g.stunden_letzte_4_wochen)} Std. in den letzten 4 Wochen, ${wert(g.stunden_4_wochen_davor)} Std. in den 4 Wochen davor
Hochrechnung (Schätzung): ${wert(g.hochrechnung_gesamt_stunden, ' Std. gesamt')}${g.hochrechnung_ueber_plan_stunden > 0 ? `, das wären ${g.hochrechnung_ueber_plan_stunden} Std. über Plan` : ''}
Liefertermin: ${g.liefertermin || 'keiner hinterlegt'}${g.tage_bis_liefertermin !== null && g.tage_bis_liefertermin !== undefined ? ` (in ${g.tage_bis_liefertermin} Tagen)` : ''}
Mehrleistung: ${wert(m.stunden_als_mehrleistung_gebucht)} Std. als Mehrleistung gebucht, ${(m.zusatzwunsch_tickets || []).length} Zusatzwunsch-Aufgaben, ${wert(m.nicht_verrechenbar_stunden)} Std. nicht verrechenbar
${e ? `Auftragswert netto: ${wert(e.auftragswert_netto, ' EUR')} | bewerteter Aufwand netto: ${wert(e.ist_aufwand_bewertet_netto, ' EUR')} (${e.stundensatz} EUR/Std., ${e.stundensatz_quelle}) | Deckung: ${wert(e.deckung_pct, ' %')}\n` : ''}${r ? `Blick nach vorn (ab Umstellung ${r.stichtag}): ${r.offene_aufgaben} offene Aufgaben${r.offene_aufgaben_soll_stunden ? `, geplant mit ${r.offene_aufgaben_soll_stunden} Std.` : ''} | Restbudget ${r.rest_budget_stunden} Std., seither gebucht ${r.seit_umstellung_gebucht_stunden} Std., verbleibend ${r.rest_verbleibend_stunden} Std.${r.noch_zu_bekommen_netto !== undefined ? ` | noch zu bekommen ${r.noch_zu_bekommen_netto} EUR netto (Auftrag ${r.auftrag_netto}, abgerechnet ${r.abgerechnet_netto})` : ''}\nRest-Ampel: ${r.ampel} — ${r.aussage}\n` : ''}Ampel Gesamtprojekt (inkl. Vergangenheit): ${lage.ampel}
${(lage.gruende || []).map((x) => `  - ${x}`).join('\n')}

`;
}

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