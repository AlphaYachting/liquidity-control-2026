/**
 * betriebsLiquiditaet.js — Liquidität des laufenden Betriebs (Fortbetriebskonto).
 * Reine Lese-Logik, schreibt nie Daten.
 *
 * Vorgaben (Übergabe Liquidität 02.11.2026, Entscheidungen Alfons 02.11.2026):
 *  - Planungskonto ist ausschließlich das Fortbetriebskonto. Massekonto und Altkonto zählen nicht.
 *  - Gesperrter Sockel (Stammeinlage) wird nie als verfügbar geführt.
 *  - Rechnungen mit Rechnungsdatum vor dem 24.07.2026 bleiben draußen (nur Liste „nicht eingeplant").
 *  - Alle Beträge brutto, weil Geld brutto fließt; Umsatzsteuer-Zahllast ist ein eigener Kostenposten.
 *  - Jede Zahl trägt Herkunft und Belegstufe.
 *
 * Eingänge: offene Forderungen · Retainer/Verträge ohne Rechnung · Sprint-Etappen ·
 *           offene Abrechnungsanweisungen · nicht abgerechnete Regie-/Supportzeit
 * Ausgänge: Kostenposten (CashOutflowItem) zu ihren Fälligkeitstagen
 */
import { outflowDueDates } from '@/lib/restructuring/restructuringEngine';
import { isLiquidityRelevantInvoice } from '@/lib/invoiceLiquidityFilter';
import { OUTFLOW_CATEGORY_LABELS } from '@/lib/restructuring/restructuringFormat';

export const STICHTAG_FORTBETRIEB = '2026-07-24';
export const ZAHLUNGSZIEL_TAGE = 14;
export const UST_STANDARD = 20;
const STUNDENSATZ_STANDARD = { support: 130, aufwand: 120 };

export const EINGANG_ARTEN = {
  forderung: 'Offene Forderungen',
  vertrag: 'Retainer & Verträge (noch ohne Rechnung)',
  etappe: 'Projektetappen',
  anweisung: 'Abrechnungsanweisungen',
  regie: 'Regie / Support (nicht abgerechnet)',
};
export const AUSGANG_ARTEN = OUTFLOW_CATEGORY_LABELS;

export const LIQ_STATUS_LABELS = {
  normal: 'normal',
  bezahlt_belegt: 'bezahlt laut Auszug',
  bezahlt_wahrscheinlich: 'wahrscheinlich bezahlt',
  ungeklaert: 'ungeklärt',
  nicht_einplanen: 'nicht einplanen',
};

// ── Datum (immer als lokales YYYY-MM-DD, gerechnet zu Mittag gegen Sommerzeit-Effekte) ──
const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(num(v) * 100) / 100;
export const toDate = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`) : null);
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (isoStr, n) => { const d = toDate(isoStr); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((toDate(a) - toDate(b)) / 86400000);
const montagVon = (isoStr) => { const d = toDate(isoStr); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return iso(d); };
const maxIso = (a, b) => (a > b ? a : b);
const monatVon = (isoStr) => String(isoStr).slice(0, 7);
const monatsletzter = (mk) => { const [y, m] = mk.split('-').map(Number); return iso(new Date(y, m, 0, 12)); };
const naechsterMonat = (mk) => { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m, 1, 12); return monatVon(iso(d)); };
export const kwVon = (isoStr) => {
  const d = toDate(isoStr); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4, 12);
  return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
};

export const kundeNorm = (s) => (s || '').toLowerCase()
  .replace(/\n/g, ' ')
  .replace(/ges\.?\s?m\.?\s?b\.?\s?h\.?|gmbh|gesmbh|\bkg\b|\bog\b|\bag\b|e\.u\.|d\.o\.o\.?|& co\.?|co\.|[^a-z0-9äöüß]/g, '')
  .trim();
const gleicherKunde = (a, b) => {
  const x = kundeNorm(a); const y = kundeNorm(b);
  if (!x || !y) return false;
  return x === y || (x.length >= 6 && y.startsWith(x)) || (y.length >= 6 && x.startsWith(y));
};
const brutto = (netto, ust = UST_STANDARD) => round2(num(netto) * (1 + num(ust) / 100));

// ── Kontostand ─────────────────────────────────────────────────────────────
export function aktuellerKontostand(snapshots = [], heute) {
  const fb = snapshots
    .filter((s) => !s.account || s.account === 'fortbetrieb')
    .filter((s) => s.balance_date && s.balance_date <= heute)
    .sort((a, b) => (a.balance_date < b.balance_date ? 1 : a.balance_date > b.balance_date ? -1 : (b.created_date || '').localeCompare(a.created_date || '')));
  return fb[0] || null;
}

// ── Zahlungsverhalten je Kunde: Ø Tage zwischen Fälligkeit und Zahlung (bezahlte Rechnungen) ──
function zahlungsverhalten(invoices) {
  const proKunde = new Map();
  invoices.forEach((i) => {
    if (i.payment_status !== 'paid' || !i.payment_date || !i.due_date) return;
    if (i.invoice_date && i.invoice_date < '2026-01-01') return;
    const k = kundeNorm(i.customer_name);
    if (!k) return;
    const t = diffDays(i.payment_date, i.due_date);
    if (Math.abs(t) > 120) return;
    const arr = proKunde.get(k) || [];
    arr.push(t);
    proKunde.set(k, arr);
  });
  const verzug = new Map();
  proKunde.forEach((arr, k) => {
    if (arr.length < 2) return;
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
    verzug.set(k, Math.max(-10, Math.min(45, Math.round(avg))));
  });
  return (kunde) => verzug.get(kundeNorm(kunde)) ?? 0;
}

// ── Hauptfunktion ──────────────────────────────────────────────────────────
export function baueBetriebsLiquiditaet(daten = {}, optionen = {}) {
  const {
    snapshots = [], kosten = [], rechnungen = [], vertraege = [], etappen = [], sprints = [],
    projekte = [], kunden = [], anweisungen = [], zeiten = [],
    personen = [], tickets = [], ticketZeiten = [], einstellungen = {}, mahnungen = [], deals = [],
  } = daten;
  const heute = optionen.heute || iso(new Date());
  const wochen = optionen.wochen || 13;
  const mitSzenario = !!optionen.mitSzenario;
  const gfEmail = (optionen.gfEmail || '').toLowerCase();
  // Alles, was fakturiert werden soll (auch mit Zahlung nach dem Horizont) — Grundlage für Monatsblick und Wochenliste
  const faktura = [];

  const konto = aktuellerKontostand(snapshots, heute);
  const kontostand = konto ? num(konto.amount) : 0;
  const gesperrt = konto ? num(konto.locked_amount) : 0;
  const kontoDatum = konto?.balance_date || heute;

  const start = montagVon(heute);
  const ende = addDays(start, wochen * 7); // exklusiv
  const wochenListe = Array.from({ length: wochen }, (_, i) => {
    const von = addDays(start, i * 7);
    return { index: i, von, bis: addDays(von, 6), kw: kwVon(von) };
  });
  const wocheVon = (datum) => {
    if (datum < start) return 0;
    const idx = Math.floor(diffDays(datum, start) / 7);
    return idx < wochen ? idx : -1;
  };

  const ereignisse = [];
  const nichtEingeplant = [];
  const ausgebucht = [];
  const verzugVon = zahlungsverhalten(rechnungen);

  const ein = (e) => {
    const w = wocheVon(e.datum);
    if (w < 0) { nichtEingeplant.push({ ...e, grund: 'nach dem Planungshorizont' }); return; }
    ereignisse.push({ ...e, richtung: 'ein', woche: w, betrag: round2(e.betrag) });
  };

  // ── 1. Offene Forderungen ────────────────────────────────────────────────
  const forderungen = [];
  rechnungen.forEach((r) => {
    if (!isLiquidityRelevantInvoice(r)) return;
    if (r.payment_status === 'paid' || r.invoice_type === 'correction') return;
    const offen = num(r.open_amount) > 0 ? num(r.open_amount) : Math.max(0, num(r.gross_amount) - num(r.paid_amount));
    if (offen <= 0.01) return;
    const basis = {
      id: r.id, art: 'forderung', kunde: r.customer_name || '— ohne Kundennamen —',
      label: `Rechnung ${r.invoice_number || '—'}`, betrag: offen,
      quelle: { typ: 'rechnung', id: r.id, nummer: r.invoice_number },
      rechnungsdatum: r.invoice_date, faellig: r.due_date || (r.invoice_date ? addDays(r.invoice_date, ZAHLUNGSZIEL_TAGE) : null),
      liqStatus: r.liquiditaet_status || 'normal', notiz: r.liquiditaet_notiz || '',
    };
    if (r.invoice_date && r.invoice_date < STICHTAG_FORTBETRIEB) {
      nichtEingeplant.push({ ...basis, grund: 'Rechnung vor dem 24.07.2026 – nicht Fortbetrieb' });
      return;
    }
    if (basis.liqStatus === 'bezahlt_belegt' || basis.liqStatus === 'bezahlt_wahrscheinlich') {
      ausgebucht.push(basis);
      forderungen.push({ ...basis, erwartet: null });
      return;
    }
    if (basis.liqStatus === 'nicht_einplanen') {
      nichtEingeplant.push({ ...basis, grund: 'bewusst nicht eingeplant' });
      forderungen.push({ ...basis, erwartet: null });
      return;
    }
    const faellig = basis.faellig || heute;
    const verzug = verzugVon(r.customer_name);
    let erwartet = addDays(faellig, verzug);
    let hinweis = verzug ? `Ø Zahlungsverhalten ${verzug > 0 ? '+' : ''}${verzug} Tage` : 'zum Fälligkeitstag';
    if (erwartet < heute) {
      const ueber = diffDays(heute, faellig);
      const versatz = ueber <= 30 ? 7 : ueber <= 60 ? 14 : 28;
      erwartet = addDays(montagVon(heute), versatz);
      hinweis = `${ueber} Tage überfällig – Eingang angenommen in ${versatz / 7} Woche(n)`;
    }
    const risiko = basis.liqStatus === 'ungeklaert' ? 'Zahlung ungeklärt – Risiko Doppelzählung' : null;
    const e = { ...basis, datum: erwartet, hinweis, risiko, belegstufe: 'beleg' };
    forderungen.push({ ...basis, erwartet, hinweis, risiko });
    ein(e);
  });

  // Rechnungen je Kunde und Monat — damit Verträge nicht doppelt gezählt werden
  const rechnungInMonat = (kunde, mk) => rechnungen.some((r) =>
    r.payment_status !== 'cancelled' && !r.is_credit_note && r.invoice_date && monatVon(r.invoice_date) === mk && gleicherKunde(kunde, r.customer_name));
  const rechnungNahe = (kunde, datum, tage) => rechnungen.some((r) =>
    r.payment_status !== 'cancelled' && !r.is_credit_note && r.invoice_date && Math.abs(diffDays(r.invoice_date, datum)) <= tage && gleicherKunde(kunde, r.customer_name));

  // ── 2. Retainer & Verträge ohne Rechnung ────────────────────────────────
  const vertragsZeilen = [];
  const monate = [];
  for (let mk = monatVon(heute); mk <= monatVon(addDays(ende, -1)); mk = naechsterMonat(mk)) monate.push(mk);
  const gesehen = new Set();
  vertraege.forEach((v) => {
    if (v.status !== 'active' || v.in_liquiditaet === false) return;
    const monatlich = ['online_marketing', 'maintenance', 'support'].includes(v.contract_type)
      && v.billing_interval === 'monthly' && num(v.monthly_fixed_price) > 0;
    const jaehrlich = ['maintenance', 'hosting', 'domain'].includes(v.contract_type)
      && v.billing_interval === 'yearly' && num(v.annual_amount) > 0 && v.due_date;
    const schluessel = `${kundeNorm(v.customer)}|${monatlich ? num(v.monthly_fixed_price) : num(v.annual_amount)}|${v.billing_interval}`;
    if ((monatlich || jaehrlich) && gesehen.has(schluessel)) return;
    if (monatlich || jaehrlich) gesehen.add(schluessel);
    if (monatlich) {
      monate.forEach((mk) => {
        if (rechnungInMonat(v.customer, mk)) return;
        const rdat = maxIso(`${mk}-01`, heute);
        const zahlung = addDays(rdat, ZAHLUNGSZIEL_TAGE + verzugVon(v.customer));
        const e = {
          id: `${v.id}:${mk}`, art: 'vertrag', kunde: v.customer, label: `${v.project_name || 'Retainer'} · ${mk}`,
          betrag: brutto(v.monthly_fixed_price), datum: zahlung, belegstufe: 'vertrag',
          hinweis: `Monatsrechnung ${mk} noch nicht gestellt – Rechnung ${rdat}, Zahlung + ${ZAHLUNGSZIEL_TAGE} Tage`,
          quelle: { typ: 'vertrag', id: v.id },
          rechnungsdatum: rdat, netto: num(v.monthly_fixed_price), vertragsart: v.contract_type,
        };
        faktura.push(e);
        if (wocheVon(e.datum) >= 0) vertragsZeilen.push(e);
        ein(e);
      });
    } else if (jaehrlich) {
      if (v.due_date < heute || v.due_date >= ende) return;
      if (rechnungNahe(v.customer, v.due_date, 45)) return;
      const e = {
        id: `${v.id}:${v.due_date}`, art: 'vertrag', kunde: v.customer, label: `${v.project_name || 'Jahresvertrag'} · Verlängerung`,
        betrag: brutto(v.annual_amount), datum: addDays(v.due_date, ZAHLUNGSZIEL_TAGE + verzugVon(v.customer)), belegstufe: 'vertrag',
        hinweis: `Jahresverrechnung zur Fälligkeit ${v.due_date} (laut Vertrag), Zahlung + ${ZAHLUNGSZIEL_TAGE} Tage`,
        quelle: { typ: 'vertrag', id: v.id },
        rechnungsdatum: v.due_date, netto: num(v.annual_amount), vertragsart: v.contract_type,
      };
      faktura.push(e);
      if (wocheVon(e.datum) >= 0) vertragsZeilen.push(e);
      ein(e);
    }
  });

  // ── 3. Sprint-Etappen ────────────────────────────────────────────────────
  const sprintById = new Map(sprints.map((s) => [s.id, s]));
  const projektById = new Map(projekte.map((p) => [p.id, p]));
  const kundeById = new Map(kunden.map((k) => [k.id, k]));
  const etappenZeilen = [];

  // Lieferfähigkeit: wer arbeitet an der Etappe, ist die Person bis zum Rechnungstermin da, wie viel ist noch offen
  const personByEmail = new Map(personen.map((p) => [(p.email || '').toLowerCase(), p]));
  const verfuegbarBis = einstellungen.personal || {};
  const personName = (email) => personByEmail.get(email)?.name || email || '—';
  const istVerfuegbar = (email, datum) => {
    const p = personByEmail.get(email);
    if (!p || p.active === false) return false;
    const bis = verfuegbarBis[email];
    return !bis || bis >= datum;
  };
  const gebuchtJeTicket = new Map();
  ticketZeiten.forEach((t) => { if (t.ticket_id) gebuchtJeTicket.set(t.ticket_id, (gebuchtJeTicket.get(t.ticket_id) || 0) + num(t.duration_minutes)); });
  const ticketsJeEtappe = new Map();
  tickets.forEach((t) => {
    if (t.archiviert) return;
    const arr = ticketsJeEtappe.get(t.milestone_id) || [];
    arr.push(t);
    ticketsJeEtappe.set(t.milestone_id, arr);
  });
  const zustaendigeVon = (t) => {
    const liste = Array.isArray(t.assignee_emails) && t.assignee_emails.length ? t.assignee_emails : (t.assignee_email ? [t.assignee_email] : []);
    return liste.map((e) => String(e).toLowerCase());
  };
  const restStunden = (t) => (t.rest_stunden !== null && t.rest_stunden !== undefined && t.rest_stunden !== ''
    ? num(t.rest_stunden)
    : Math.max(0, num(t.target_hours) - (gebuchtJeTicket.get(t.id) || 0) / 60));

  const LIEFER_LABEL = {
    freigegeben: 'freigegeben',
    freigabe_fehlt: 'Aufgaben erledigt – Freigabe fehlt',
    in_arbeit: 'besetzt',
    wartet: 'wartet auf Kunde',
    unbesetzt: 'nicht besetzt',
    keine_aufgaben: 'keine Aufgaben angelegt',
  };

  etappen.forEach((m) => {
    if (num(m.milestone_amount) <= 0 || m.invoiced_at) return;
    const sprint = sprintById.get(m.sprint_id);
    const projekt = sprint ? projektById.get(sprint.project_id) : null;
    const kunde = projekt ? (kundeById.get(projekt.client_id)?.name || projekt.title) : '—';
    const plEmail = (projekt?.pm_email || '').toLowerCase();
    const geplant = m.planned_freeze || m.planned_handover || null;

    const alle = ticketsJeEtappe.get(m.id) || [];
    const offen = alle.filter((t) => t.status !== 'erledigt');
    const jePerson = new Map();
    let ohneZustaendige = 0;
    offen.forEach((t) => {
      const z = zustaendigeVon(t);
      const h = restStunden(t);
      if (!z.length) { ohneZustaendige += h; return; }
      z.forEach((em) => jePerson.set(em, (jePerson.get(em) || 0) + h / z.length));
    });
    const restGesamt = offen.reduce((s, t) => s + restStunden(t), 0);

    let rdat; let hinweis; let verzoegert = false;
    if (m.released) { rdat = heute; hinweis = 'freigegeben, noch nicht verrechnet – Rechnung sofort'; }
    else if (alle.length && !offen.length) { rdat = heute; hinweis = 'alle Aufgaben erledigt – Freigabe einholen, dann sofort verrechnen'; }
    else if (geplant && geplant >= heute) { rdat = geplant; hinweis = `Rechnung zum geplanten Freeze ${geplant}`; }
    else if (geplant) { rdat = addDays(heute, 7); verzoegert = true; hinweis = `verzögert – geplanter Freeze war ${geplant}, Rechnung frühestens in einer Woche angenommen`; }
    else { nichtEingeplant.push({ id: m.id, art: 'etappe', kunde, label: m.title, betrag: brutto(m.milestone_amount), grund: 'Etappe ohne Termin' }); return; }

    // Besetzung zum Rechnungstermin prüfen
    let status;
    const nichtVerfuegbar = [...jePerson.keys()].filter((em) => !istVerfuegbar(em, rdat));
    if (m.released) status = 'freigegeben';
    else if (!alle.length) status = 'keine_aufgaben';
    else if (!offen.length) status = 'freigabe_fehlt';
    else if (ohneZustaendige > 0 || nichtVerfuegbar.length) status = 'unbesetzt';
    else if (offen.every((t) => t.status === 'wartet')) status = 'wartet';
    else status = 'in_arbeit';

    const risiken = [];
    if (verzoegert) risiken.push('Etappe verzögert');
    if (status === 'unbesetzt' || status === 'keine_aufgaben') {
      rdat = addDays(rdat, 28);
      const grund = status === 'keine_aufgaben'
        ? 'keine Aufgaben angelegt'
        : [ohneZustaendige > 0 ? `${ohneZustaendige.toFixed(1).replace('.', ',')} h ohne Zuständige` : null,
          nichtVerfuegbar.length ? `nicht verfügbar: ${nichtVerfuegbar.map(personName).join(', ')}` : null].filter(Boolean).join(', ');
      risiken.push(`${LIEFER_LABEL[status]} (${grund}) – Rechnung um 4 Wochen verschoben`);
      hinweis = `${hinweis}; ${grund} – daher 4 Wochen später angesetzt`;
    }
    if (status === 'wartet') risiken.push('wartet auf Kunde');
    const beiDir = gfEmail ? (jePerson.get(gfEmail) || 0) : 0;
    if (beiDir > 0 && restGesamt > 0 && beiDir / restGesamt >= 0.5) risiken.push(`${beiDir.toFixed(0)} von ${restGesamt.toFixed(0)} h liegen bei dir`);

    const e = {
      id: m.id, art: 'etappe', kunde, label: `${sprint?.title ? `${sprint.title} · ` : ''}${m.title}`,
      betrag: brutto(m.milestone_amount), netto: num(m.milestone_amount), rechnungsdatum: rdat,
      datum: addDays(rdat, ZAHLUNGSZIEL_TAGE), belegstufe: 'plan', hinweis, verzoegert,
      risiko: risiken.length ? risiken.join(' · ') : null,
      quelle: { typ: 'etappe', id: m.id, sprintId: m.sprint_id }, status: m.state,
      lieferung: {
        status, label: LIEFER_LABEL[status], pl: plEmail ? personName(plEmail) : '—', plEmail,
        aufgabenOffen: offen.length, aufgabenGesamt: alle.length, restStunden: round2(restGesamt),
        ohneZustaendige: round2(ohneZustaendige), beiDir: round2(beiDir),
        jePerson: [...jePerson.entries()].map(([em, h]) => ({ email: em, name: personName(em), stunden: round2(h), verfuegbar: istVerfuegbar(em, rdat), bis: verfuegbarBis[em] || null }))
          .sort((a, b) => b.stunden - a.stunden),
      },
    };
    etappenZeilen.push(e);
    faktura.push(e);
    ein(e);
  });

  // Offene Etappenstunden je Person (nur nicht freigegebene Etappen)
  const lastJePerson = new Map();
  etappenZeilen.forEach((e) => (e.lieferung?.jePerson || []).forEach((p) => {
    const cur = lastJePerson.get(p.email) || { email: p.email, name: p.name, stunden: 0, etappen: 0, bis: p.bis };
    cur.stunden += p.stunden; cur.etappen += 1;
    lastJePerson.set(p.email, cur);
  }));
  const personenLast = [...lastJePerson.values()].map((p) => ({ ...p, stunden: round2(p.stunden), istDu: p.email === gfEmail }))
    .sort((a, b) => b.stunden - a.stunden);

  // ── 4. Offene Abrechnungsanweisungen ─────────────────────────────────────
  const anweisungsZeilen = [];
  anweisungen.forEach((a) => {
    if (!['draft', 'ready_for_backoffice', 'sent_to_backoffice'].includes(a.status)) return;
    if (a.linked_invoice_id || a.sevdesk_invoice_id) return;
    const betrag = num(a.instruction_amount_gross) > 0 ? num(a.instruction_amount_gross) : brutto(a.instruction_amount_net, a.vat_rate ?? UST_STANDARD);
    if (betrag <= 0) return;
    const basis = {
      id: a.id, art: 'anweisung', kunde: a.customer_name, label: a.project_name || 'Abrechnungsanweisung', betrag,
      quelle: { typ: 'anweisung', id: a.id }, belegstufe: 'plan',
    };
    const erstellt = (a.created_date || '').slice(0, 10);
    let rdat = null; let hinweis = '';
    if (a.planned_invoice_date && a.planned_invoice_date >= addDays(heute, -30)) {
      rdat = maxIso(a.planned_invoice_date, heute); hinweis = `geplantes Rechnungsdatum ${a.planned_invoice_date}`;
    } else if (!a.planned_invoice_date && erstellt && erstellt >= addDays(heute, -30)) {
      rdat = heute; hinweis = `angelegt ${erstellt}, ohne Rechnungsdatum – Rechnung sofort angenommen`;
    }
    if (!rdat) {
      nichtEingeplant.push({ ...basis, grund: a.planned_invoice_date ? `Rechnungsdatum ${a.planned_invoice_date} liegt über 30 Tage zurück` : `ohne Rechnungsdatum, angelegt ${erstellt || '—'}` });
      return;
    }
    const e = {
      ...basis, datum: addDays(rdat, ZAHLUNGSZIEL_TAGE), hinweis, rechnungsdatum: rdat,
      netto: num(a.instruction_amount_net) > 0 ? num(a.instruction_amount_net) : round2(betrag / (1 + UST_STANDARD / 100)),
    };
    anweisungsZeilen.push(e);
    faktura.push(e);
    ein(e);
  });

  // ── 5. Regie / Support, nicht abgerechnet ────────────────────────────────
  const regieJeMonat = new Map();
  zeiten.forEach((t) => {
    if (!['aufwand', 'support'].includes(t.kategorie)) return;
    if (t.verrechenbar === false || t.abrechnungsstatus !== 'offen' || t.billing_instruction_id) return;
    if (!t.entry_date || t.entry_date < STICHTAG_FORTBETRIEB) return;
    const satz = num(t.stundensatz) || STUNDENSATZ_STANDARD[t.kategorie] || 120;
    const wert = (num(t.duration_minutes) / 60) * satz;
    if (wert <= 0) return;
    const mk = monatVon(t.entry_date);
    const cur = regieJeMonat.get(mk) || { netto: 0, minuten: 0, buchungen: 0 };
    cur.netto += wert; cur.minuten += num(t.duration_minutes); cur.buchungen += 1;
    regieJeMonat.set(mk, cur);
  });
  const regieZeilen = [];
  regieJeMonat.forEach((v, mk) => {
    const rdat = mk < monatVon(heute) ? heute : monatsletzter(mk);
    const e = {
      id: `regie:${mk}`, art: 'regie', kunde: 'mehrere Kunden', label: `Regie & Support ${mk} · ${(v.minuten / 60).toFixed(1).replace('.', ',')} h`,
      betrag: brutto(v.netto), netto: round2(v.netto), datum: addDays(rdat, ZAHLUNGSZIEL_TAGE), belegstufe: 'schaetzung',
      hinweis: `${v.buchungen} verrechenbare Buchungen ohne Abrechnung; Sammelrechnung ${rdat}, Zahlung + ${ZAHLUNGSZIEL_TAGE} Tage (ohne Aufrundung)`,
      quelle: { typ: 'zeit', monat: mk }, rechnungsdatum: rdat,
    };
    regieZeilen.push(e);
    faktura.push(e);
    ein(e);
  });

  // ── 6. Kosten ────────────────────────────────────────────────────────────
  // Fällig ab dem Tag nach dem Kontostand: was danach fällig wurde, ist noch nicht im Kontostand.
  const ab = toDate(addDays(kontoDatum, 1)); ab.setHours(0, 0, 0, 0);
  const bis = toDate(ende); bis.setHours(0, 0, 0, 0);
  kosten.forEach((k) => {
    if (k.is_active === false) return;
    const szenario = !!k.scenario_only;
    if (szenario && !mitSzenario) return;
    outflowDueDates(k, ab, bis).forEach((d) => {
      const datum = iso(d);
      const w = wocheVon(datum);
      if (w < 0) return;
      ereignisse.push({
        id: `${k.id}:${datum}`, richtung: 'aus', art: k.category || 'sonstige_auszahlung', label: k.label,
        betrag: round2(k.amount), datum, woche: w, belegstufe: k.belegstufe || 'ist', szenario,
        hinweis: [datum < start ? 'seit dem Kontostand fällig, noch nicht im Kontostand' : null, k.derivation].filter(Boolean).join(' · '),
        ersetzenDurch: k.ersetzen_durch || null, quelle: { typ: 'kosten', id: k.id },
      });
    });
  });

  // ── Wochen ───────────────────────────────────────────────────────────────
  let saldo = kontostand;
  const zeilen = wochenListe.map((w) => {
    const ev = ereignisse.filter((e) => e.woche === w.index);
    const eingang = {}; const ausgang = {};
    ev.forEach((e) => {
      const ziel = e.richtung === 'ein' ? eingang : ausgang;
      ziel[e.art] = round2((ziel[e.art] || 0) + e.betrag);
    });
    const ein = round2(ev.filter((e) => e.richtung === 'ein').reduce((s, e) => s + e.betrag, 0));
    const aus = round2(ev.filter((e) => e.richtung === 'aus').reduce((s, e) => s + e.betrag, 0));
    const anfang = saldo;
    saldo = round2(anfang + ein - aus);
    return { ...w, anfang, ein, aus, ende: saldo, verfuegbar: round2(saldo - gesperrt), eingang, ausgang };
  });

  const tiefster = zeilen.reduce((min, z) => (min === null || z.verfuegbar < min.verfuegbar ? z : min), null);
  const tagsatzung = zeilen.find((z) => z.von <= '2027-01-20' && z.bis >= '2027-01-20') || null;
  const summe = (arr) => round2(arr.reduce((s, e) => s + num(e.betrag), 0));
  const schaetzungAus = ereignisse.filter((e) => e.richtung === 'aus' && e.belegstufe === 'schaetzung');

  const gruppen = {};
  nichtEingeplant.forEach((e) => {
    const g = gruppen[e.grund] || { grund: e.grund, summe: 0, zeilen: [] };
    g.summe = round2(g.summe + num(e.betrag)); g.zeilen.push(e); gruppen[e.grund] = g;
  });

  // ── Monatsblick: Fakturierungsbedarf gegen das, was schon gesichert ist (netto) ──
  // Näherung: Mindest-Fakturierung = Auszahlungen des Monats ohne Umsatzsteuer (die USt läuft durch).
  const ziele = einstellungen.ziele || {};
  const monatsblick = monate.map((mk) => {
    const kostenOhneUst = round2(ereignisse.filter((e) => e.richtung === 'aus' && e.art !== 'umsatzsteuer' && monatVon(e.datum) === mk)
      .reduce((s, e) => s + e.betrag, 0));
    const fakturiert = round2(rechnungen.filter((r) => r.invoice_date && monatVon(r.invoice_date) === mk
      && r.payment_status !== 'cancelled' && r.payment_status !== 'draft' && r.invoice_date >= STICHTAG_FORTBETRIEB)
      .reduce((s, r) => s + (r.is_credit_note && num(r.net_amount) > 0 ? -1 : 1) * num(r.net_amount), 0));
    const geplanteZeilen = faktura.filter((f) => f.rechnungsdatum && monatVon(f.rechnungsdatum) === mk);
    const geplant = round2(geplanteZeilen.reduce((s, f) => s + num(f.netto), 0));
    const geplantNachArt = {};
    geplanteZeilen.forEach((f) => { geplantNachArt[f.art] = round2((geplantNachArt[f.art] || 0) + num(f.netto)); });
    const gesichert = round2(fakturiert + geplant);
    const offeneDeals = deals.filter((d) => !['won', 'lost', 'declined', 'ordered'].includes(d.stage)
      && d.expected_close_date && monatVon(d.expected_close_date) === mk && num(d.value_net) > 0);
    const pipeline = round2(offeneDeals.reduce((s, d) => s + num(d.value_net) * num(d.probability_percent ?? 50) / 100, 0));
    return {
      monat: mk, kostenOhneUst, fakturiert, geplant, geplantNachArt, gesichert,
      luecke: round2(Math.max(0, kostenOhneUst - gesichert)),
      deckung: kostenOhneUst > 0 ? Math.round((gesichert / kostenOhneUst) * 100) : null,
      ziel: num(ziele[mk]), pipeline, pipelineAnzahl: offeneDeals.length,
      pipelineDeals: offeneDeals.map((d) => ({ id: d.id, titel: d.title, kunde: d.company_name, netto: num(d.value_net), wahrscheinlichkeit: num(d.probability_percent ?? 50) }))
        .sort((a, b) => b.netto - a.netto),
    };
  });

  // ── Arbeitsliste „Diese Woche" ──
  const wocheEnde = addDays(start, 6);
  const GF = 'Geschäftsführung';
  const linkFuer = (f) => {
    if (f.art === 'anweisung') return '/invoice-ready';
    if (f.art === 'regie') return '/support-billing';
    if (f.art === 'etappe') return '/sprint/rechnungsuebergabe';
    if (f.vertragsart === 'online_marketing') return '/online-marketing';
    if (f.vertragsart === 'maintenance') return '/maintenance';
    if (f.vertragsart === 'support') return '/support-billing';
    return '/hosting';
  };
  const fakturieren = faktura
    .filter((f) => f.rechnungsdatum && f.rechnungsdatum <= wocheEnde && (f.art !== 'etappe' || f.lieferung?.status === 'freigegeben'))
    .map((f) => ({
      id: `fak:${f.id}`, art: f.art, label: f.label, kunde: f.kunde, netto: round2(f.netto), datum: f.rechnungsdatum,
      link: linkFuer(f), zustaendig: GF,
      hinweis: f.art === 'vertrag' ? 'Rechnung für diesen Monat fehlt – wiederkehrende Rechnung in sevDesk prüfen' : f.hinweis,
    }))
    .sort((a, b) => b.netto - a.netto);

  const mahnStand = new Map();
  mahnungen.forEach((d) => {
    if (!d.invoice_number || ['closed_paid', 'rejected'].includes(d.status)) return;
    const cur = mahnStand.get(d.invoice_number);
    if (!cur || num(d.dunning_level) > num(cur.dunning_level)) mahnStand.set(d.invoice_number, d);
  });
  const mahnen = forderungen
    .filter((f) => f.erwartet && f.faellig && f.faellig < heute && f.liqStatus === 'normal')
    .map((f) => {
      const d = mahnStand.get(f.quelle.nummer);
      return {
        id: `mahn:${f.id}`, label: `Rechnung ${f.quelle.nummer}`, kunde: f.kunde, betrag: f.betrag, faellig: f.faellig,
        tageUeber: diffDays(heute, f.faellig), mahnstufe: d ? (d.level_label || `Stufe ${d.dunning_level}`) : null,
        link: '/receivables', zustaendig: GF,
      };
    })
    .sort((a, b) => b.tageUeber - a.tageUeber || b.betrag - a.betrag);

  const klaeren = forderungen
    .filter((f) => ['ungeklaert', 'bezahlt_wahrscheinlich'].includes(f.liqStatus)
      || (f.liqStatus === 'normal' && (f.notiz || String(f.kunde).startsWith('—'))))
    .map((f) => ({
      id: `kl:${f.id}`, rechnungId: f.id, label: `Rechnung ${f.quelle.nummer}`, kunde: f.kunde, betrag: f.betrag,
      liqStatus: f.liqStatus, notiz: f.notiz || (String(f.kunde).startsWith('—') ? 'Rechnung ohne Kundennamen' : ''), zustaendig: GF,
    }));

  const sprintGruppen = new Map();
  etappenZeilen
    .filter((e) => e.lieferung?.status !== 'freigegeben'
      && (e.verzoegert || e.rechnungsdatum <= addDays(wocheEnde, 7) || ['unbesetzt', 'keine_aufgaben', 'freigabe_fehlt'].includes(e.lieferung?.status)))
    .forEach((e) => {
      const key = e.quelle.sprintId || e.id;
      const g = sprintGruppen.get(key) || {
        id: `et:${key}`, sprintId: e.quelle.sprintId, kunde: e.kunde, titel: e.label.split(' · ')[0], positionen: 0, netto: 0,
        status: new Set(), verzoegert: 0, pl: e.lieferung?.pl || '—', restStunden: 0, beiDir: 0, link: e.quelle.sprintId ? `/sprint/sprints/${e.quelle.sprintId}` : '/sprint/projekte',
      };
      g.positionen += 1; g.netto = round2(g.netto + e.netto); g.status.add(e.lieferung?.label);
      if (e.verzoegert) g.verzoegert += 1;
      g.restStunden = round2(g.restStunden + num(e.lieferung?.restStunden)); g.beiDir = round2(g.beiDir + num(e.lieferung?.beiDir));
      sprintGruppen.set(key, g);
    });
  const etappenListe = [...sprintGruppen.values()].map((g) => ({ ...g, status: [...g.status].filter(Boolean), zustaendig: g.pl }))
    .sort((a, b) => b.netto - a.netto);

  const arbeitsliste = {
    von: start, bis: wocheEnde, kw: kwVon(start),
    fakturieren, mahnen, klaeren, etappen: etappenListe,
    kontostand: konto && diffDays(heute, kontoDatum) <= 7 ? null : { datum: konto?.balance_date || null, alterTage: konto ? diffDays(heute, kontoDatum) : null },
  };

  return {
    heute, start, ende: addDays(ende, -1), wochen: zeilen, ereignisse,
    konto: { stand: kontostand, gesperrt, verfuegbar: round2(kontostand - gesperrt), datum: kontoDatum, snapshot: konto, alterTage: konto ? diffDays(heute, kontoDatum) : null },
    kennzahlen: {
      tiefster, tagsatzung, endeHorizont: zeilen[zeilen.length - 1] || null,
      eingaengeSumme: summe(ereignisse.filter((e) => e.richtung === 'ein')),
      ausgaengeSumme: summe(ereignisse.filter((e) => e.richtung === 'aus')),
      schaetzungAusSumme: summe(schaetzungAus), schaetzungAusAnzahl: schaetzungAus.length,
      ungeklaertSumme: summe(ereignisse.filter((e) => e.risiko && e.art === 'forderung')),
      verzoegertSumme: summe(etappenZeilen.filter((e) => e.verzoegert)),
    },
    forderungen: forderungen.sort((a, b) => (a.faellig || '').localeCompare(b.faellig || '')),
    ausgebucht, vertragsZeilen, etappenZeilen, anweisungsZeilen, regieZeilen,
    nichtEingeplant: Object.values(gruppen).sort((a, b) => b.summe - a.summe),
    monatsblick, arbeitsliste, personenLast,
  };
}
