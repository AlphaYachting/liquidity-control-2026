import { berechneTagNull, alleSeiten } from './tagNullRechnung.js';
import { heuteWien } from './kontingentLaufzeit.js';
import { zustaendigeVon } from './zustaendige.js';

// Finanzlage — die EINE Rechenstelle der KI-Finanzanalyse und des Wochenberichts.
// Leitfragen: Was ist noch zu tun, was kommt dafür noch herein, wird es wirtschaftlich fertig,
// wann wird es fertig, wer ist der Engpass, reicht das Geld?
//
// Grundsätze
// - Projekte und Restbudget kommen unverändert aus der Tag-Null-Rechnung (tagNullRechnung.js).
// - Die Zukunft wird aus der Vergangenheit abgeleitet: Erfahrungswerte aus erledigten Aufgaben
//   (aWork-Historie bis zur Umstellung, danach App) — wie stark weicht Ist von Plan ab, wie viel
//   Aufwand hat eine Aufgabe je Art typischerweise. Diese Werte werden wöchentlich neu gerechnet
//   und in der Einstellung finanz_kalibrierung zwischengespeichert (einzige Schreibstelle).
// - Jede abgeleitete Zahl trägt ihre Herkunft (ist / hochrechnung / annahme) in der Ausgabe.
// - aWork-Tabellen werden nur als HISTORIE gelesen (bis zum Umstellungsstichtag), nie als Ist-Stand danach.

const TAG = 86400000;
const KAL_VERSION = 2;
const r0 = (v) => Math.round(Number(v) || 0);
const r1 = (v) => Math.round((Number(v) || 0) * 10) / 10;
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const datum = (v) => String(v || '').slice(0, 10);
const istDatum = (v) => /^\d{4}-\d{2}-\d{2}$/.test(datum(v));
const plusTage = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(n));
  return d.toISOString().slice(0, 10);
};
const tageZwischen = (von, bis) => Math.round((Date.parse(`${bis}T12:00:00Z`) - Date.parse(`${von}T12:00:00Z`)) / TAG);
const montagVon = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const isoKw = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const ersterDo = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - ersterDo) / TAG - 3 + ((ersterDo.getUTCDay() + 6) % 7)) / 7);
};
const monatPlus = (ym, n) => {
  let [y, m] = ym.split('-').map(Number);
  m += n;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
};
const monateDiff = (a, b) => {
  const [y1, m1] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
};
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const minutenVon = (e) => Number(e.duration_minutes) || (Number(e.hours) || 0) * 60;
const fmtDatum = (iso) => (istDatum(iso) ? iso.split('-').reverse().join('.') : '—');
const eur = (v) => `${r0(v).toLocaleString('de-AT')} €`;
const std = (v) => `${r1(v).toLocaleString('de-AT')} Std.`;

// ---------- Aufgabenarten ----------

// Verwaltungsaufgaben (Rechnungen, Anlage) tragen keinen Leistungsaufwand
const VERWALTUNG = /(anzahlung|teilrechnung|schlussrechnung|endrechnung|\brechnung\b|verrechnung|abrechnung|liquidity|zusatzkosten)/i;

// Art einer Aufgabe aus Listen- oder Ticketname — gleiche Einteilung für aWork-Historie und App
export function artAusText(text) {
  const t = norm(text);
  if (!t) return 'sonstiges';
  if (/(support|wartung|laufende|betreuung|routine)/.test(t)) return 'laufend';
  if (/(organisation|projektmanagement|rechnung|export|verrechnung|abrechnung|interne absprache|infosammlung)/.test(t)) return 'organisation';
  if (/(design|grafik|\bcd\b|drucksorten|layout|logo|brand|illustration|shooting|visual|rendering|3d)/.test(t)) return 'grafik';
  if (/(programmier|website|webseite|\bweb\b|cms|wordpress|shop|entwicklung|implementierung|tracking|consent|technik|go live|golive|final|testing|\bqs\b|hosting)/.test(t)) return 'web';
  if (/(online marketing|marketing|\bsea\b|\bseo\b|ads|social|newsletter|kampagne|\bom\b|datenanalyse|content)/.test(t)) return 'marketing';
  if (/(konzept|analyse|strategie|positionierung|workshop|audit|beratung|interview|markenkern|pitch|ausschreibung)/.test(t)) return 'konzept';
  if (/(text|redaktion|copy|lektorat)/.test(t)) return 'text';
  return 'sonstiges';
}

const ROLLE_ZU_ART = { Grafik: 'grafik', Web: 'web', Media: 'marketing', Text: 'text', Konzept: 'konzept', Beratung: 'konzept', QS: 'web' };
const artDesTickets = (t) => ROLLE_ZU_ART[t.role] || artAusText(t.title);

// ---------- Erfahrungswerte (Kalibrierung) ----------

export async function berechneKalibrierung(db, { heute, umstellung, appZeiten }) {
  const toepfe = {};
  const topf = (k) => (toepfe[k] = toepfe[k] || { plan: 0, ist: 0, n_plan: 0, aufwand: [] });
  const nimm = (art, planMin, istMin) => {
    if (!(istMin > 0)) return;
    const p = topf(art);
    if (istMin >= 15 && istMin <= 60 * 60) p.aufwand.push(istMin / 60);
    if (planMin >= 30) {
      const q = istMin / planMin;
      // offensichtliche Erfassungsfehler (Faktor unter 0,2 oder über 5) zählen nicht
      if (q >= 0.2 && q <= 5) { p.plan += planMin; p.ist += istMin; p.n_plan += 1; }
    }
  };

  // a) aWork-Historie: erledigte Aufgaben mit Plan- und Ist-Zeit
  const aufgaben = await alleSeiten((l, s) => db.AworkTaskSnapshot.filter({ is_done: true, tracked_duration_minutes: { $gt: 0 } }, 'id', l, s)).catch(() => []);
  for (const t of aufgaben) {
    let art = artAusText(t.task_list_name);
    if (art === 'sonstiges') art = artAusText(t.task_title);
    nimm(art, Number(t.planned_duration_minutes) || 0, Number(t.tracked_duration_minutes) || 0);
  }

  // b) App: seit der Umstellung angelegte und erledigte Tickets mit Sollstunden
  const erledigt = await alleSeiten((l, s) => db.Ticket.filter({ status: 'erledigt', created_date: { $gt: `${umstellung}T23:59:59` } }, 'id', l, s)).catch(() => []);
  const minNachTicket = {};
  for (const e of appZeiten) {
    if (!e.ticket_id || e.abrechnungsstatus === 'verworfen') continue;
    minNachTicket[e.ticket_id] = (minNachTicket[e.ticket_id] || 0) + minutenVon(e);
  }
  let nApp = 0;
  for (const t of erledigt) {
    if (t.rhythmus || VERWALTUNG.test(t.title || '')) continue;
    const ist = minNachTicket[t.id] || 0;
    if (!ist) continue;
    nApp += 1;
    nimm(artDesTickets(t), (Number(t.target_hours) || 0) * 60, ist);
  }

  const gesamt = { plan: 0, ist: 0, n_plan: 0, aufwand: [] };
  for (const [k, p] of Object.entries(toepfe)) {
    if (k === 'laufend' || k === 'organisation') continue;
    gesamt.plan += p.plan; gesamt.ist += p.ist; gesamt.n_plan += p.n_plan; gesamt.aufwand.push(...p.aufwand);
  }
  const je_art = {};
  for (const [k, p] of Object.entries(toepfe)) {
    je_art[k] = {
      faktor: p.n_plan >= 15 && p.plan > 0 ? r2(p.ist / p.plan) : null,
      n_plan: p.n_plan,
      median_std: p.aufwand.length >= 15 ? r2(median(p.aufwand)) : null,
      n_aufwand: p.aufwand.length,
    };
  }
  return {
    version: KAL_VERSION,
    stand: heute,
    quelle: `${aufgaben.length} erledigte aWork-Aufgaben (Historie bis ${fmtDatum(umstellung)}) und ${nApp} erledigte App-Tickets seit der Umstellung`,
    gesamt: {
      faktor: gesamt.n_plan >= 15 && gesamt.plan > 0 ? r2(gesamt.ist / gesamt.plan) : 1,
      n_plan: gesamt.n_plan,
      median_std: gesamt.aufwand.length ? r2(median(gesamt.aufwand)) : null,
      n_aufwand: gesamt.aufwand.length,
    },
    je_art,
  };
}

async function ladeKalibrierung(db, ctx) {
  const rows = await db.Setting.filter({ key: 'finanz_kalibrierung' }, '-updated_date', 1).catch(() => []);
  try {
    const k = JSON.parse(rows[0]?.value || '');
    if (k?.version === KAL_VERSION && istDatum(k.stand) && tageZwischen(k.stand, ctx.heute) <= 7) return k;
  } catch (_) { /* neu rechnen */ }
  const k = await berechneKalibrierung(db, ctx);
  const value = JSON.stringify(k);
  try {
    if (rows[0]) await db.Setting.update(rows[0].id, { value });
    else await db.Setting.create({ key: 'finanz_kalibrierung', value, group: 'kapazitaet', label: 'KI-Finanzanalyse: Erfahrungswerte (automatisch, wöchentlich)' });
  } catch (_) { /* Zwischenspeicher ist optional */ }
  return k;
}

// ---------- Restaufwand eines Tickets ----------

function restDesTickets(t, gebuchtStd, kal) {
  if (t.rhythmus) return { art: 'routine', std: 0 };
  if (VERWALTUNG.test(t.title || '')) return { art: 'verwaltung', std: 0 };
  const aufgabenart = artDesTickets(t);
  const faktor = kal.je_art?.[aufgabenart]?.faktor ?? kal.gesamt?.faktor ?? 1;
  const erfahrung = kal.je_art?.[aufgabenart]?.median_std ?? kal.gesamt?.median_std ?? null;
  if (Number(t.rest_stunden) > 0) return { art: 'einschaetzung', std: Number(t.rest_stunden), aufgabenart };
  const soll = Number(t.target_hours) || 0;
  if (soll > 0) {
    if (gebuchtStd < soll) return { art: 'soll_mal_faktor', std: (soll - gebuchtStd) * faktor, aufgabenart };
    return { art: 'soll_ueberschritten', std: soll * 0.25 * faktor, aufgabenart };
  }
  if (erfahrung == null) return { art: 'unbekannt', std: 0, aufgabenart };
  return { art: 'erfahrungswert', std: Math.max(erfahrung - gebuchtStd, erfahrung * 0.25), aufgabenart };
}

// ---------- Hauptrechnung ----------

export async function berechneFinanzLage(db, { wochen = 13 } = {}) {
  const heute = heuteWien();
  const t = await berechneTagNull(db);
  const umstellung = t.umstellung;
  const fix = t._roh.projekte;
  const fixIds = new Set(fix.map((p) => p.id));
  const seit56 = plusTage(heute, -55);
  const seit28 = plusTage(heute, -27);
  const seit365 = plusTage(heute, -365);

  const [
    sollRows, team, clients, alleProjekte, offeneTickets, appNachUmstellung, aworkLetzte8,
    sprints, offeneRechnungen, bezahlte, anweisungen, planungen, cockpits, vertraege,
    bankRows, auszahlungenAlle, restrRows, etappen,
  ] = await Promise.all([
    db.Setting.filter({ key: 'arbeitszeit_soll_wochenstunden' }, '-updated_date', 1).catch(() => []),
    db.TeamMember.list('name', 200).catch(() => []),
    alleSeiten((l, s) => db.Client.list('id', l, s)).catch(() => []),
    alleSeiten((l, s) => db.Project.filter({ status: { $ne: 'abgeschlossen' } }, 'id', l, s)),
    alleSeiten((l, s) => db.Ticket.filter({ status: { $ne: 'erledigt' }, archiviert: { $ne: true } }, 'id', l, s)),
    alleSeiten((l, s) => db.TimeEntry.filter({ entry_date: { $gt: umstellung } }, 'id', l, s)),
    alleSeiten((l, s) => db.AworkTimeEntry.filter({ entry_date: { $gte: seit56, $lte: umstellung } }, 'id', l, s)).catch(() => []),
    fix.length ? alleSeiten((l, s) => db.Sprint.filter({ project_id: { $in: fix.map((p) => p.id) } }, 'id', l, s)).catch(() => []) : [],
    alleSeiten((l, s) => db.InvoiceRecord.filter({ payment_status: { $in: ['open', 'partially_paid', 'overdue'] } }, 'id', l, s)),
    alleSeiten((l, s) => db.InvoiceRecord.filter({ payment_status: 'paid', payment_date: { $gte: seit365 } }, 'id', l, s)).catch(() => []),
    alleSeiten((l, s) => db.BillingInstruction.filter({ status: { $in: ['draft', 'ready_for_backoffice', 'sent_to_backoffice'] } }, 'id', l, s)).catch(() => []),
    alleSeiten((l, s) => db.MonthlyBillingPlan.filter({ billing_status: { $in: ['open', 'planned', 'in_review', 'ready_for_invoice', 'sent_to_backoffice', 'postponed', 'on_hold'] } }, 'id', l, s)).catch(() => []),
    alleSeiten((l, s) => db.LiquidityProject.list('id', l, s)).catch(() => []),
    alleSeiten((l, s) => db.RecurringContract.filter({ status: 'active' }, 'id', l, s)).catch(() => []),
    db.BankBalanceSnapshot.list('-balance_date', 1).catch(() => []),
    alleSeiten((l, s) => db.CashOutflowItem.list('id', l, s)).catch(() => []),
    db.RestructuringSetting.list('-updated_date', 1).catch(() => []),
    alleSeiten((l, s) => db.Milestone.filter({ released: true }, 'id', l, s)).catch(() => []),
  ]);

  // App-Buchungen zusammenführen (Tag-Null-Satz der Festpreisprojekte + alle Buchungen nach der Umstellung)
  const appZeitenMap = new Map();
  for (const e of [...t._roh.appZeiten, ...appNachUmstellung]) if (e.abrechnungsstatus !== 'verworfen') appZeitenMap.set(e.id, e);
  const appZeiten = [...appZeitenMap.values()];

  const kal = await ladeKalibrierung(db, { heute, umstellung, appZeiten });

  const clientName = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const projektNachId = Object.fromEntries(alleProjekte.map((p) => [p.id, p]));
  for (const p of fix) projektNachId[p.id] = p;
  const cockpitNachId = Object.fromEntries(cockpits.map((c) => [c.id, c]));
  const nameVon = (email) => team.find((m) => norm(m.email) === norm(email))?.name || email;
  const emailVonName = (name) => {
    const n = norm(name);
    if (!n) return null;
    const exakt = team.find((m) => norm(m.name) === n);
    if (exakt) return norm(exakt.email);
    const vorname = n.split(' ')[0];
    const treffer = team.filter((m) => norm(m.name).split(' ')[0] === vorname);
    return treffer.length === 1 ? norm(treffer[0].email) : null;
  };

  // Gebuchte App-Stunden je Ticket
  const stdNachTicket = {};
  for (const e of appZeiten) if (e.ticket_id) stdNachTicket[e.ticket_id] = (stdNachTicket[e.ticket_id] || 0) + minutenVon(e) / 60;

  // Restaufwand je offenem Ticket
  const restNachTicket = {};
  for (const tk of offeneTickets) restNachTicket[tk.id] = restDesTickets(tk, stdNachTicket[tk.id] || 0, kal);

  // ---------- Projekte ----------
  // Tempo: dieselbe Trennung wie in der Tag-Null-Rechnung (aWork bis Umstellung, danach App)
  const tempo = {};
  const tempoAdd = (pid, d, min) => {
    if (!pid) return;
    const x = (tempo[pid] = tempo[pid] || { a: 0, b: 0 });
    if (d >= seit28 && d <= heute) x.a += min;
    else if (d >= seit56 && d < seit28) x.b += min;
  };
  for (const e of t._roh.aworkZeiten) tempoAdd(t._roh.projektVonAwork[e.awork_project_id], datum(e.entry_date), Number(e.duration_minutes) || 0);
  for (const e of appZeiten) {
    const p = projektNachId[e.project_id];
    const d = datum(e.entry_date);
    if (!p || !fixIds.has(p.id) || (p.awork_project_id && d <= umstellung)) continue;
    tempoAdd(p.id, d, minutenVon(e));
  }

  const sollTermin = {};
  for (const s of sprints) {
    if (['abgeschlossen', 'geliefert'].includes(s.status) || !istDatum(s.delivery_date)) continue;
    if (!sollTermin[s.project_id] || s.delivery_date > sollTermin[s.project_id]) sollTermin[s.project_id] = datum(s.delivery_date);
  }

  const ticketsNachProjekt = {};
  for (const tk of offeneTickets) (ticketsNachProjekt[tk.project_id] = ticketsNachProjekt[tk.project_id] || []).push(tk);

  const projekte = [];
  let unauffaellig = 0;
  for (const p of fix) {
    const tn = t.projekte[p.id];
    const tks = ticketsNachProjekt[p.id] || [];
    const aufschl = { einschaetzung: 0, soll_mal_faktor: 0, soll_ueberschritten: 0, erfahrungswert: 0, unbekannt: 0, verwaltung: 0 };
    let rest = 0;
    let restErfahrung = 0;
    let ohneSoll = 0;
    let wartetKunde = 0;
    let laengsteWartezeit = null;
    for (const tk of tks) {
      const r = restNachTicket[tk.id];
      if (!r || r.art === 'routine') continue;
      aufschl[r.art] = (aufschl[r.art] || 0) + 1;
      rest += r.std;
      if (r.art === 'erfahrungswert') { restErfahrung += r.std; ohneSoll += 1; }
      if (r.art === 'unbekannt') ohneSoll += 1;
      const wartet = tk.milestone_state === 'kundenfeedback' || (tk.status === 'wartet' && tk.wartet_auf === 'kunde');
      if (wartet) {
        wartetKunde += 1;
        const seit = datum(tk.wartet_seit) || datum(tk.last_status_change);
        const tage = istDatum(seit) ? tageZwischen(seit, heute) : null;
        if (tage != null && (laengsteWartezeit == null || tage > laengsteWartezeit)) laengsteWartezeit = tage;
      }
    }
    const tp = tempo[p.id] || { a: 0, b: 0 };
    const tempo4 = tp.a / 60;
    const tempoVor = tp.b / 60;
    const trend = tempoVor === 0 && tempo4 === 0 ? 'still'
      : tempoVor === 0 ? 'steigend'
        : Math.abs(tempo4 - tempoVor) / tempoVor < 0.2 ? 'gleich' : (tempo4 > tempoVor ? 'steigend' : 'fallend');
    let fertig = null;
    let fertigGrund = null;
    if (rest <= 0.05) {
      fertigGrund = tn.offene_aufgaben ? 'nur Verwaltungsaufgaben offen' : 'keine offenen Aufgaben';
    } else if (tempo4 <= 0.05) {
      fertigGrund = 'kein Tempo in den letzten 4 Wochen';
    } else {
      fertig = plusTage(heute, Math.ceil((rest / (tempo4 / 4)) * 7));
    }
    const soll = sollTermin[p.id] || null;
    const verzug = fertig && soll && fertig > soll ? tageZwischen(soll, fertig) : null;
    const hatMassstab = tn.ampel !== 'kein_massstab';
    const ungedeckt = hatMassstab ? Math.max(0, rest - Math.max(0, tn.gedeckt_std || 0)) : null;
    const satz = tn.stundensatz || t.stundensatz;
    const tageSeit = tn.letzte_buchung ? tageZwischen(tn.letzte_buchung, heute) : null;

    const steuerbar = tn.offene_aufgaben > 0 || (tn.noch_zu_verrechnen || 0) > 0 || tn.ampel === 'kein_massstab';
    if (!steuerbar) { unauffaellig += 1; continue; }

    projekte.push({
      project_id: p.id,
      cockpit_id: p.liquidity_project_id || null,
      kunde: clientName[p.client_id] || cockpitNachId[p.liquidity_project_id]?.customer || '',
      projekt: p.title || cockpitNachId[p.liquidity_project_id]?.project_name || '',
      verantwortlich: p.pm_email || null,
      status: p.status,
      ampel: tn.ampel,
      aussage: tn.aussage,
      auftrag: tn.auftrag,
      rest_budget: tn.rest_budget ?? null,
      gedeckt_std: tn.gedeckt_std ?? null,
      std_seit_tag_null: tn.std_seit,
      noch_zu_verrechnen: tn.noch_zu_verrechnen ?? null,
      offene_aufgaben: tn.offene_aufgaben,
      rest_realistisch_std: r1(rest),
      rest_aus_erfahrungswert_std: r1(restErfahrung),
      rest_grundlage: aufschl,
      tempo_4w_std: r1(tempo4),
      tempo_vorher_std: r1(tempoVor),
      trend,
      letzte_buchung: tn.letzte_buchung || null,
      tage_seit_buchung: tageSeit,
      soll_termin: soll,
      fertig_hochrechnung: fertig,
      fertig_grund: fertigGrund,
      verzug_tage: verzug,
      ungedeckt_std: ungedeckt == null ? null : r1(ungedeckt),
      ungedeckt_euro: ungedeckt == null ? null : r0(ungedeckt * satz),
      stundensatz: satz,
      wartet_auf_kunde: wartetKunde,
      laengste_wartezeit_tage: laengsteWartezeit,
      tickets_ohne_soll: ohneSoll,
      hinweise: tn.hinweise || [],
    });
  }
  projekte.sort((a, b) => (b.ungedeckt_euro || 0) - (a.ungedeckt_euro || 0) || (b.noch_zu_verrechnen || 0) - (a.noch_zu_verrechnen || 0));

  // ---------- Einnahmen (13 Wochen) ----------
  const rs = restrRows[0] || {};
  const quote = {
    q0_30: Number(rs.collect_rate_0_30) || 90, q31_60: Number(rs.collect_rate_31_60) || 70,
    q61_90: Number(rs.collect_rate_61_90) || 40, q90: Number(rs.collect_rate_90_plus) || 15,
  };
  const quoteAusSetting = !!restrRows[0];
  const wochenSpanne = (von, bis, stdVon, stdBis) => [Number(von) || stdVon, Number(bis) || stdBis];
  const spanne = {
    s0_30: wochenSpanne(rs.collect_week_from_0_30, rs.collect_week_to_0_30, 1, 2),
    s31_60: wochenSpanne(rs.collect_week_from_31_60, rs.collect_week_to_31_60, 1, 4),
    s61_90: wochenSpanne(rs.collect_week_from_61_90, rs.collect_week_to_61_90, 2, 6),
    s90: wochenSpanne(rs.collect_week_from_90_plus, rs.collect_week_to_90_plus, 4, 8),
  };

  const wochenStart = montagVon(heute);
  const liste = Array.from({ length: wochen }, (_, i) => {
    const von = plusTage(wochenStart, 7 * i);
    return { kw: isoKw(von), von, bis: plusTage(von, 6), sicher: 0, wahrscheinlich: 0, fraglich: 0, summe: 0 };
  });
  let nachHorizont = 0;

  // Üblicher Zahlungsverzug je Kunde (Tage nach Fälligkeit, letzte 12 Monate)
  const verzugListe = {};
  for (const r of bezahlte) {
    if (r.is_credit_note || !istDatum(r.due_date) || !istDatum(r.payment_date)) continue;
    const k = norm(r.customer_name);
    (verzugListe[k] = verzugListe[k] || []).push(Math.max(0, tageZwischen(datum(r.due_date), datum(r.payment_date))));
  }
  const verzugVon = (kunde) => {
    const l = verzugListe[norm(kunde)];
    if (!l || !l.length) return { tage: 0, historie: false };
    return { tage: Math.min(90, Math.round(l.reduce((a, b) => a + b, 0) / l.length)), historie: true };
  };

  const posten = [];
  const buche = (p) => {
    for (const v of p.verteilung) {
      const betrag = p.brutto * v.anteil;
      const idx = Math.floor(tageZwischen(wochenStart, v.datum < wochenStart ? wochenStart : v.datum) / 7);
      if (idx >= wochen) { nachHorizont += betrag; continue; }
      liste[idx][p.stufe] += betrag;
      liste[idx].summe += betrag;
    }
    posten.push(p);
  };
  const verteile = ([von, bis]) => {
    const n = Math.max(1, bis - von + 1);
    return Array.from({ length: n }, (_, i) => ({ datum: plusTage(wochenStart, 7 * (von - 1 + i)), anteil: 1 / n }));
  };

  const gezaehlteRechnungen = new Set();
  const gezaehlteSevdesk = new Set();
  const ueberfaelligNachKunde = {};
  for (const r of offeneRechnungen) {
    if (r.is_credit_note) continue;
    if (r.is_sent !== true && !['overdue', 'partially_paid'].includes(r.payment_status)) continue;
    const brutto = Number(r.open_amount) || 0;
    if (brutto < 1) continue;
    gezaehlteRechnungen.add(r.id);
    if (r.sevdesk_id) gezaehlteSevdesk.add(String(r.sevdesk_id));
    const nettoAnteil = Number(r.gross_amount) > 0 ? (Number(r.net_amount) || 0) / Number(r.gross_amount) : 1 / 1.2;
    const faellig = istDatum(r.due_date) ? datum(r.due_date) : plusTage(datum(r.invoice_date) || heute, 14);
    const ueber = tageZwischen(faellig, heute);
    const kunde = r.customer_name || '';
    const vz = verzugVon(kunde);
    const basis = { kunde, quelle: `Rechnung ${r.invoice_number || ''}`.trim(), rechnung_vom: datum(r.invoice_date), faellig, tage_ueberfaellig: Math.max(0, ueber), alt: !!(r.invoice_date && datum(r.invoice_date) < t.tag_null) };
    if (ueber > 0) {
      const u = (ueberfaelligNachKunde[norm(kunde)] = ueberfaelligNachKunde[norm(kunde)] || { kunde, brutto: 0, anzahl: 0, max_tage: 0 });
      u.brutto += brutto; u.anzahl += 1; u.max_tage = Math.max(u.max_tage, ueber);
    }
    if (ueber <= 0) {
      buche({ ...basis, stufe: 'sicher', brutto, netto: brutto * nettoAnteil, art: 'ist', verteilung: [{ datum: plusTage(faellig, vz.tage), anteil: 1 }],
        annahme: vz.historie ? `übliche ${vz.tage} Tage Verzug dieses Kunden` : null });
    } else if (ueber <= 60) {
      const q = ueber <= 30 ? quote.q0_30 : quote.q31_60;
      buche({ ...basis, stufe: 'wahrscheinlich', brutto: brutto * q / 100, netto: brutto * nettoAnteil * q / 100, art: 'hochrechnung',
        verteilung: verteile(ueber <= 30 ? spanne.s0_30 : spanne.s31_60), annahme: `Einbringlichkeit ${q} %${quoteAusSetting ? '' : ' (Standardwert)'}` });
    } else {
      const q = ueber <= 90 ? quote.q61_90 : quote.q90;
      buche({ ...basis, stufe: 'fraglich', brutto: brutto * q / 100, netto: brutto * nettoAnteil * q / 100, art: 'hochrechnung',
        verteilung: verteile(ueber <= 90 ? spanne.s61_90 : spanne.s90), annahme: `Einbringlichkeit ${q} %${quoteAusSetting ? '' : ' (Standardwert)'}` });
    }
  }
  for (const r of bezahlte) { gezaehlteRechnungen.add(r.id); if (r.sevdesk_id) gezaehlteSevdesk.add(String(r.sevdesk_id)); }

  // Aktive Abrechnungsanweisungen (noch keine gestellte Rechnung)
  const geplantNachCockpit = {};
  for (const b of anweisungen) {
    if (b.linked_invoice_id && gezaehlteRechnungen.has(b.linked_invoice_id)) continue;
    if (b.sevdesk_invoice_id && gezaehlteSevdesk.has(String(b.sevdesk_invoice_id))) continue;
    const netto = Number(b.instruction_amount_net) || 0;
    if (netto <= 0) continue;
    const brutto = Number(b.instruction_amount_gross) || netto * (1 + (Number(b.vat_rate) || 20) / 100);
    const rd = istDatum(b.planned_invoice_date) && datum(b.planned_invoice_date) > heute ? datum(b.planned_invoice_date) : heute;
    const vz = verzugVon(b.customer_name);
    geplantNachCockpit[b.project_id] = (geplantNachCockpit[b.project_id] || 0) + netto;
    buche({ stufe: 'wahrscheinlich', kunde: b.customer_name || '', quelle: `Abrechnungsanweisung (${b.status})`, projekt: b.project_name || '',
      brutto, netto, art: 'hochrechnung', rechnungsdatum: rd,
      verteilung: [{ datum: plusTage(rd, 14 + vz.tage), anteil: 1 }], annahme: 'Zahlungsziel 14 Tage' + (vz.historie ? ` + ${vz.tage} Tage üblicher Verzug` : '') });
  }

  // Verrechnungsplanungen ohne Anweisung
  const aktuellerMonat = heute.slice(0, 7);
  for (const m of planungen) {
    if (m.linked_billing_instruction_id || m.linked_invoice_id || !/^\d{4}-\d{2}$/.test(m.planning_month || '')) continue;
    const netto = Number(m.planned_amount_net) || 0;
    if (netto <= 0) continue;
    const brutto = Number(m.planned_amount_gross) || netto * 1.2;
    const erster = `${m.planning_month}-01`;
    const rd = erster > heute ? erster : heute;
    const cp = cockpitNachId[m.project_id];
    const kunde = cp?.customer || '';
    const vz = verzugVon(kunde);
    geplantNachCockpit[m.project_id] = (geplantNachCockpit[m.project_id] || 0) + netto;
    buche({ stufe: m.billing_status === 'on_hold' ? 'fraglich' : 'wahrscheinlich', kunde, projekt: cp?.project_name || '',
      quelle: `Verrechnungsplanung ${m.planning_month}${m.planning_month < aktuellerMonat ? ' (überfällig)' : ''}`,
      brutto, netto, art: 'hochrechnung', rechnungsdatum: rd,
      verteilung: [{ datum: plusTage(rd, 14 + vz.tage), anteil: 1 }], annahme: 'Rechnung im geplanten Monat, Zahlungsziel 14 Tage' });
  }

  // Wiederkehrende Verträge (Retainer, Wartung) ab dem nächsten Monat
  const horizontEnde = plusTage(wochenStart, 7 * wochen - 1);
  for (const v of vertraege) {
    const monatlich = Number(v.monthly_fixed_price) || 0;
    if (v.billing_interval !== 'monthly' || monatlich <= 0) continue;
    const vz = verzugVon(v.customer);
    for (let i = 1; i <= 4; i += 1) {
      const rd = `${monatPlus(aktuellerMonat, i)}-01`;
      if (rd > horizontEnde) break;
      buche({ stufe: 'wahrscheinlich', kunde: v.customer || '', projekt: v.project_name || v.contract_type || '', quelle: `Wiederkehrender Vertrag (${v.contract_type})`,
        brutto: monatlich * 1.2, netto: monatlich, art: 'annahme', rechnungsdatum: rd,
        verteilung: [{ datum: plusTage(rd, 14 + vz.tage), anteil: 1 }], annahme: 'Rechnung am Monatsersten, Zahlungsziel 14 Tage' });
    }
  }

  // Sofort abrechenbar, noch ohne Anweisung oder Planung (nicht terminiert, nicht in den Wochen)
  const nichtTerminiert = [];
  for (const p of projekte) {
    if (p.ampel !== 'abrechnen') continue;
    const geplant = (geplantNachCockpit[p.cockpit_id] || 0) + (geplantNachCockpit[p.project_id] || 0);
    const netto = Math.max(0, (p.noch_zu_verrechnen || 0) - geplant);
    if (netto < 1) continue;
    nichtTerminiert.push({ project_id: p.project_id, kunde: p.kunde, projekt: p.projekt, netto: r0(netto), verantwortlich: p.verantwortlich });
  }
  nichtTerminiert.sort((a, b) => b.netto - a.netto);
  const etappenOffen = etappen.filter((m) => !m.invoiced_at && Number(m.milestone_amount) > 0)
    .map((m) => ({ etappe: m.title, freigegeben_am: datum(m.released_at), netto: r0(m.milestone_amount), sprint_id: m.sprint_id }))
    .sort((a, b) => b.netto - a.netto);

  const sumStufe = (n, stufe) => liste.slice(0, n).reduce((s, w) => s + w[stufe], 0);
  const top = (stufe) => posten.filter((p) => p.stufe === stufe)
    .sort((a, b) => b.brutto - a.brutto).slice(0, 5)
    .map((p) => ({ kunde: p.kunde, projekt: p.projekt || undefined, quelle: p.quelle, brutto: r0(p.brutto), netto: r0(p.netto),
      erwartet: p.verteilung.length === 1 ? p.verteilung[0].datum : `${p.verteilung[0].datum} bis ${p.verteilung[p.verteilung.length - 1].datum}`,
      tage_ueberfaellig: p.tage_ueberfaellig || undefined, annahme: p.annahme || undefined }));

  const einnahmen = {
    hinweis: 'Zahlungseingänge brutto (so kommen sie aufs Konto). sicher = gestellte, nicht fällige Rechnungen; wahrscheinlich = bis 60 Tage überfällig (mit Einbringlichkeitsquote), Anweisungen, Planungen, wiederkehrende Verträge; fraglich = über 60 Tage überfällig oder Planung on hold.',
    wochen: liste.map((w) => ({ kw: w.kw, von: w.von, bis: w.bis, sicher: r0(w.sicher), wahrscheinlich: r0(w.wahrscheinlich), fraglich: r0(w.fraglich), summe: r0(w.summe) })),
    summen_4_wochen: { sicher: r0(sumStufe(4, 'sicher')), wahrscheinlich: r0(sumStufe(4, 'wahrscheinlich')), fraglich: r0(sumStufe(4, 'fraglich')) },
    summen_13_wochen: { sicher: r0(sumStufe(wochen, 'sicher')), wahrscheinlich: r0(sumStufe(wochen, 'wahrscheinlich')), fraglich: r0(sumStufe(wochen, 'fraglich')) },
    nach_horizont: r0(nachHorizont),
    groesste_posten: { sicher: top('sicher'), wahrscheinlich: top('wahrscheinlich'), fraglich: top('fraglich') },
    nicht_terminiert: { summe_netto: r0(nichtTerminiert.reduce((s, x) => s + x.netto, 0)), projekte: nichtTerminiert.slice(0, 15) },
    etappen_freigegeben_nicht_verrechnet: { summe_netto: r0(etappenOffen.reduce((s, x) => s + x.netto, 0)), etappen: etappenOffen.slice(0, 10) },
  };
  const ueberfaellig = Object.values(ueberfaelligNachKunde).sort((a, b) => b.brutto - a.brutto);
  const ueberfaelligSumme = ueberfaellig.reduce((s, u) => s + u.brutto, 0);

  // ---------- Kasse ----------
  const bank = bankRows[0] || null;
  const aktiveAus = auszahlungenAlle.filter((a) => a.is_active !== false && Number(a.amount) > 0);
  const bankAlter = bank && istDatum(bank.balance_date) ? tageZwischen(datum(bank.balance_date), heute) : null;
  let kasse;
  if (!bank || bankAlter > 14 || !aktiveAus.length) {
    kasse = {
      beurteilbar: false,
      grund: `Bankstand ${bank ? `zuletzt ${fmtDatum(datum(bank.balance_date))}` : 'fehlt'}, ${aktiveAus.length} aktive Auszahlungsposten — eingeben unter Sanierungs-Reporting → Einrichtung.`,
      bankstand: bank ? r0(bank.amount) : null,
      bankstand_datum: bank ? datum(bank.balance_date) : null,
    };
  } else {
    const ausWoche = Array(wochen).fill(0);
    const szenarioWoche = Array(wochen).fill(0);
    for (const a of aktiveAus) {
      const erster = /^\d{4}-\d{2}$/.test(a.first_due_month || '') ? a.first_due_month : (/^\d{4}-\d{2}$/.test(a.start_month || '') ? a.start_month : wochenStart.slice(0, 7));
      const tagImMonat = Math.min(28, Math.max(1, Number(a.due_day_of_month) || 1));
      for (let i = -1; i <= 4; i += 1) {
        const mm = monatPlus(wochenStart.slice(0, 7), i);
        if (a.start_month && mm < a.start_month) continue;
        if (a.end_month && mm > a.end_month) continue;
        const d = monateDiff(erster, mm);
        const faellt = a.interval === 'monthly' ? d >= 0 || !a.first_due_month
          : a.interval === 'quarterly' ? d >= 0 && d % 3 === 0
            : a.interval === 'yearly' ? d >= 0 && d % 12 === 0
              : a.interval === 'once' ? d === 0 : false;
        if (!faellt) continue;
        const tag = `${mm}-${String(tagImMonat).padStart(2, '0')}`;
        if (tag < wochenStart || tag > horizontEnde) continue;
        const idx = Math.floor(tageZwischen(wochenStart, tag) / 7);
        if (a.scenario_only) szenarioWoche[idx] += Number(a.amount) || 0;
        else ausWoche[idx] += Number(a.amount) || 0;
      }
    }
    let stand = Number(bank.amount) || 0;
    let tiefster = { stand: Infinity, kw: null };
    const verlauf = liste.map((w, i) => {
      stand = stand + w.sicher + w.wahrscheinlich - ausWoche[i];
      if (stand < tiefster.stand) tiefster = { stand, kw: w.kw };
      return { kw: w.kw, einzahlungen: r0(w.sicher + w.wahrscheinlich), auszahlungen: r0(ausWoche[i]), szenario_auszahlungen: r0(szenarioWoche[i]), endbestand: r0(stand) };
    });
    kasse = {
      beurteilbar: true,
      hinweis: 'Endbestand = Bankstand + sichere und wahrscheinliche Eingänge − feste Auszahlungen. Fragliche Eingänge und Szenario-Posten nicht enthalten.',
      bankstand: r0(bank.amount), bankstand_datum: datum(bank.balance_date),
      wochen: verlauf, tiefster_stand: { betrag: r0(tiefster.stand), kw: tiefster.kw },
    };
  }

  // ---------- Kapazität ----------
  let sollMap = {};
  try { sollMap = JSON.parse(sollRows[0]?.value || '{}'); } catch (_) { sollMap = {}; }
  const personen = {};
  const person = (email) => {
    const e = norm(email);
    return (personen[e] = personen[e] || { email: e, name: nameVon(e), soll_std_woche: Number(sollMap[e] ?? sollMap[email]) || 0, min_8w: 0, min_grundlast_8w: 0, rest_fix: 0, rest_erfahrung: 0, tickets: 0, ohne_soll: 0 });
  };
  for (const [e, h] of Object.entries(sollMap)) if (Number(h) > 1) person(e);
  // Grundlast = gebuchte Stunden außerhalb der Festpreisprojekte (Support, Retainer, Regie, intern), letzte 8 Wochen
  const aworkProjekt = {};
  for (const p of alleProjekte) if (p.awork_project_id && !aworkProjekt[p.awork_project_id]) aworkProjekt[p.awork_project_id] = p.id;
  for (const p of fix) if (p.awork_project_id) aworkProjekt[p.awork_project_id] = p.id;
  for (const e of aworkLetzte8) {
    const mail = emailVonName(e.user_name);
    if (!mail) continue;
    const pr = person(mail);
    const min = Number(e.duration_minutes) || 0;
    pr.min_8w += min;
    if (!fixIds.has(aworkProjekt[e.awork_project_id])) pr.min_grundlast_8w += min;
  }
  for (const e of appNachUmstellung) {
    if (e.abrechnungsstatus === 'verworfen' || !e.person_email || datum(e.entry_date) < seit56) continue;
    const pr = person(e.person_email);
    const min = minutenVon(e);
    pr.min_8w += min;
    if (!fixIds.has(e.project_id)) pr.min_grundlast_8w += min;
  }
  const nichtZugewiesen = { rest_std: 0, tickets: 0 };
  for (const tk of offeneTickets) {
    if (!fixIds.has(tk.project_id)) continue;
    const r = restNachTicket[tk.id];
    if (!r || ['routine', 'verwaltung'].includes(r.art)) continue;
    const zust = zustaendigeVon(tk);
    if (!zust.length) { nichtZugewiesen.rest_std += r.std; nichtZugewiesen.tickets += 1; continue; }
    // Mehrere Zuständige teilen sich den Rest gleichmäßig; bei einer Person wie bisher
    const anteil = 1 / zust.length;
    for (const mail of zust) {
      const pr = person(mail);
      pr.rest_fix += r.std * anteil;
      pr.tickets += 1;
      if (r.art === 'erfahrungswert') pr.rest_erfahrung += r.std * anteil;
      if (r.art === 'erfahrungswert' || r.art === 'unbekannt') pr.ohne_soll += 1;
    }
  }
  const kapazitaet = Object.values(personen)
    .filter((pr) => pr.soll_std_woche > 1 || pr.rest_fix > 0)
    .map((pr) => {
      const grundlast = pr.min_grundlast_8w / 60 / 8;
      const frei = Math.max(0, pr.soll_std_woche - grundlast);
      const wochenBisFrei = pr.rest_fix > 0 && frei > 0.5 ? pr.rest_fix / frei : null;
      return {
        email: pr.email, name: pr.name,
        soll_std_woche: r1(pr.soll_std_woche),
        gebucht_std_woche_8w: r1(pr.min_8w / 60 / 8),
        grundlast_std_woche: r1(grundlast),
        frei_std_woche: pr.soll_std_woche > 1 ? r1(frei) : null,
        rest_festpreis_std: r1(pr.rest_fix),
        davon_erfahrungswert_std: r1(pr.rest_erfahrung),
        offene_tickets: pr.tickets,
        tickets_ohne_soll: pr.ohne_soll,
        wochen_bis_frei: wochenBisFrei == null ? null : r1(wochenBisFrei),
        frei_ab: wochenBisFrei == null ? null : plusTage(heute, Math.ceil(wochenBisFrei * 7)),
        engpass: (wochenBisFrei != null && wochenBisFrei > 8) || (pr.rest_fix > 8 && frei <= 0.5),
        grund: pr.soll_std_woche <= 1 ? 'keine Wochen-Sollstunden hinterlegt'
          : pr.rest_fix > 0 && frei <= 0.5 ? 'Grundlast füllt die Sollzeit — keine freie Zeit für Festpreisprojekte' : null,
      };
    })
    .sort((a, b) => (b.wochen_bis_frei ?? (b.engpass ? 99 : -1)) - (a.wochen_bis_frei ?? (a.engpass ? 99 : -1)));

  // ---------- Warnungen ----------
  const warnungen = [];
  for (const p of projekte) {
    const basis = { project_id: p.project_id, kunde: p.kunde, projekt: p.projekt, verantwortlich: p.verantwortlich };
    if (p.ampel === 'rot' || (p.ungedeckt_std || 0) > 10) {
      warnungen.push({ ...basis, art: 'ungedeckt', schwere: 'kritisch', stunden: p.ungedeckt_std, betrag_euro: p.ungedeckt_euro,
        text: `${std(p.ungedeckt_std || 0)} Restarbeit ohne Deckung (Hochrechnung) — ${p.aussage}` });
    }
    if (p.verzug_tage) {
      warnungen.push({ ...basis, art: 'verzug', schwere: p.verzug_tage >= 14 ? 'kritisch' : 'warnung', tage: p.verzug_tage,
        text: `Hochrechnung fertig am ${fmtDatum(p.fertig_hochrechnung)}, zugesagt ${fmtDatum(p.soll_termin)} — ${p.verzug_tage} Tage Verzug beim aktuellen Tempo.` });
    }
    if (p.offene_aufgaben > 0 && (p.noch_zu_verrechnen || 0) > 0 && (p.tage_seit_buchung == null || p.tage_seit_buchung > 21)) {
      warnungen.push({ ...basis, art: 'stillstand', schwere: 'warnung', betrag_euro: p.noch_zu_verrechnen,
        text: p.tage_seit_buchung == null ? `Seit Tag Null keine Buchung, ${eur(p.noch_zu_verrechnen)} netto noch zu verrechnen.` : `${p.tage_seit_buchung} Tage keine Buchung, ${eur(p.noch_zu_verrechnen)} netto noch zu verrechnen.` });
    }
    if ((p.laengste_wartezeit_tage || 0) > 14) {
      warnungen.push({ ...basis, art: 'wartet_auf_kunde', schwere: p.laengste_wartezeit_tage >= 30 ? 'kritisch' : 'warnung', tage: p.laengste_wartezeit_tage, betrag_euro: p.noch_zu_verrechnen,
        text: `${p.wartet_auf_kunde} Aufgabe(n) warten auf den Kunden, längste seit ${p.laengste_wartezeit_tage} Tagen.` });
    }
    if (p.ampel === 'abrechnen') {
      warnungen.push({ ...basis, art: 'abrechnen', schwere: 'warnung', betrag_euro: p.noch_zu_verrechnen,
        text: `Keine Leistungsaufgaben offen — ${eur(p.noch_zu_verrechnen)} netto noch nicht verrechnet.` });
    }
  }
  for (const u of ueberfaellig) {
    if (u.max_tage <= 30 || u.brutto < 500) continue;
    warnungen.push({ art: 'ueberfaellig', kunde: u.kunde, schwere: u.max_tage > 90 ? 'kritisch' : 'warnung', betrag_euro: r0(u.brutto),
      text: `${eur(u.brutto)} brutto in ${u.anzahl} Rechnung(en) überfällig, älteste seit ${u.max_tage} Tagen.` });
  }
  for (const k of kapazitaet) {
    if (!k.engpass) continue;
    warnungen.push({ art: 'engpass', kunde: '', projekt: '', person: k.name, schwere: 'warnung', stunden: k.rest_festpreis_std,
      text: k.wochen_bis_frei != null ? `${k.name}: ${std(k.rest_festpreis_std)} Restarbeit in Festpreisprojekten, frei erst in ${k.wochen_bis_frei} Wochen.` : `${k.name}: ${k.grund}.` });
  }
  const gewicht = (w) => (w.schwere === 'kritisch' ? 2 : 1) * 1e9 + (Number(w.betrag_euro) || (Number(w.stunden) || 0) * t.stundensatz);
  warnungen.sort((a, b) => gewicht(b) - gewicht(a));

  // ---------- Datenqualität ----------
  const ohneAuftrag = projekte.filter((p) => p.ampel === 'kein_massstab' && p.status !== 'pausiert');
  const ohneSollTermin = projekte.filter((p) => p.offene_aufgaben > 0 && !p.soll_termin && p.status !== 'pausiert');
  const ohneSollTop = projekte.filter((p) => p.tickets_ohne_soll > 0).sort((a, b) => b.tickets_ohne_soll - a.tickets_ohne_soll).slice(0, 10)
    .map((p) => ({ kunde: p.kunde, projekt: p.projekt, tickets_ohne_soll: p.tickets_ohne_soll, verantwortlich: p.verantwortlich }));
  const ohneZuordnung = [...offeneRechnungen, ...bezahlte].filter((r) => !r.project_id && !r.confirmed_order_id && !r.is_credit_note
    && datum(r.invoice_date) >= seit365);
  const datenqualitaet = {
    projekte_ohne_auftrag: { anzahl: ohneAuftrag.length, projekte: ohneAuftrag.slice(0, 15).map((p) => ({ kunde: p.kunde, projekt: p.projekt, verantwortlich: p.verantwortlich })) },
    tickets_ohne_sollstunden: { anzahl: projekte.reduce((s, p) => s + p.tickets_ohne_soll, 0), projekte: ohneSollTop,
      folge: 'Restaufwand dieser Tickets ist mit dem Erfahrungswert der Aufgabenart geschätzt.' },
    projekte_ohne_soll_termin: { anzahl: ohneSollTermin.length, folge: 'Für diese Projekte gibt es nur eine Hochrechnung aus dem Tempo, keine Verzugswarnung.' },
    rechnungen_ohne_projektzuordnung_12m: { anzahl: ohneZuordnung.length, summe_netto: r0(ohneZuordnung.reduce((s, r) => s + (Number(r.net_amount) || 0), 0)) },
    bankstand_alter_tage: bankAlter,
    nicht_zugewiesene_restarbeit_std: r1(nichtZugewiesen.rest_std),
    nicht_zugewiesene_tickets: nichtZugewiesen.tickets,
  };

  // ---------- Stand und Summen ----------
  const letzteSync = [...offeneRechnungen, ...bezahlte].reduce((m, r) => (String(r.updated_date || '') > m ? String(r.updated_date) : m), '');
  const letzteBuchung = appZeiten.reduce((m, e) => (datum(e.entry_date) > m ? datum(e.entry_date) : m), '');
  const lauf = t.summen?.laufend || {};
  const summen = {
    ...lauf,
    pausiert: t.summen?.pausiert || null,
    ohne_auftrag: t.ohne_auftrag || 0,
    projekte_unauffaellig: unauffaellig,
    rest_realistisch_std: r1(projekte.filter((p) => p.status !== 'pausiert').reduce((s, p) => s + p.rest_realistisch_std, 0)),
    ungedeckte_reststunden: r1(projekte.filter((p) => p.status !== 'pausiert').reduce((s, p) => s + (p.ungedeckt_std || 0), 0)),
    ungedeckt_euro: r0(projekte.filter((p) => p.status !== 'pausiert').reduce((s, p) => s + (p.ungedeckt_euro || 0), 0)),
    ueberfaellig_brutto: r0(ueberfaelligSumme),
    ueberfaellig_rechnungen: ueberfaellig.reduce((s, u) => s + u.anzahl, 0),
    engpass_personen: kapazitaet.filter((k) => k.engpass).length,
  };

  return {
    stand: {
      heute, tag_null: t.tag_null, umstellung, stundensatz_standard: t.stundensatz,
      letzte_rechnung_sync: letzteSync ? letzteSync.slice(0, 16).replace('T', ' ') : null,
      letzte_app_buchung: letzteBuchung || null,
    },
    methodik: {
      restaufwand: 'Je offenem Ticket: Einschätzung der zuständigen Person (rest_stunden), sonst (Sollstunden − gebuchte Stunden) × historischer Faktor Ist/Plan der Aufgabenart, sonst Erfahrungswert (Median erledigter Aufgaben derselben Art). Verwaltungsaufgaben zählen 0.',
      fertigstellung: 'Restaufwand ÷ Wochentempo der letzten 4 Wochen. Ohne Tempo kein Termin.',
      kalibrierung: kal,
    },
    summen,
    projekte,
    warnungen,
    einnahmen,
    ueberfaellig_je_kunde: ueberfaellig.slice(0, 15).map((u) => ({ kunde: u.kunde, brutto: r0(u.brutto), rechnungen: u.anzahl, aelteste_tage: u.max_tage })),
    kasse,
    kapazitaet,
    datenqualitaet,
  };
}

// ---------- Wochenbericht (deterministisch, ohne KI-Text) ----------

export function berichtAusLage(lage) {
  const s = lage.summen;
  const e = lage.einnahmen;
  const z = [];
  z.push('## Lage');
  z.push(`- **Restgeschäft:** ${s.projekte || 0} laufende Festpreisprojekte, noch zu verrechnen ${eur(s.noch_zu_verrechnen)} netto · rot ${s.rot || 0}, gelb ${s.gelb || 0}, abrechnen ${s.abrechnen || 0}.`);
  z.push(`- **Restarbeit (Hochrechnung):** ${std(s.rest_realistisch_std)}, davon ungedeckt ${std(s.ungedeckte_reststunden)} ≈ ${eur(s.ungedeckt_euro)} netto.`);
  z.push(`- **Eingänge nächste 4 Wochen (brutto):** sicher ${eur(e.summen_4_wochen.sicher)}, wahrscheinlich ${eur(e.summen_4_wochen.wahrscheinlich)}, fraglich ${eur(e.summen_4_wochen.fraglich)}.`);
  z.push(`- **Überfällig:** ${eur(s.ueberfaellig_brutto)} brutto in ${s.ueberfaellig_rechnungen} Rechnungen.`);
  z.push(`- **Kasse:** ${lage.kasse.beurteilbar ? `tiefster Stand in 13 Wochen ${eur(lage.kasse.tiefster_stand.betrag)} (KW ${lage.kasse.tiefster_stand.kw}).` : `nicht beurteilbar — ${lage.kasse.grund}`}`);
  z.push('');

  z.push('## Diese Woche zu tun');
  const tun = [];
  for (const p of e.nicht_terminiert.projekte.slice(0, 2)) tun.push(`**Abrechnen** — ${p.kunde} · ${p.projekt}: ${eur(p.netto)} netto${p.verantwortlich ? ` (${p.verantwortlich})` : ''}`);
  for (const u of lage.ueberfaellig_je_kunde.slice(0, 2)) tun.push(`**Nachfassen** — ${u.kunde}: ${eur(u.brutto)} brutto, älteste Rechnung ${u.aelteste_tage} Tage überfällig`);
  for (const w of lage.warnungen.filter((x) => ['ungedeckt', 'verzug'].includes(x.art)).slice(0, 5 - tun.length)) {
    tun.push(`**${w.art === 'verzug' ? 'Termin sichern' : 'Umfang klären'}** — ${w.kunde} · ${w.projekt}: ${w.text}${w.verantwortlich ? ` (${w.verantwortlich})` : ''}`);
  }
  if (!tun.length) z.push('Keine dringenden Handlungen.');
  tun.slice(0, 5).forEach((x, i) => z.push(`${i + 1}. ${x}`));
  z.push('');

  z.push('## Geld nächste 4 Wochen (brutto)');
  z.push('| KW | sicher | wahrscheinlich | fraglich |');
  z.push('| --- | ---: | ---: | ---: |');
  for (const w of e.wochen.slice(0, 4)) z.push(`| ${w.kw} | ${eur(w.sicher)} | ${eur(w.wahrscheinlich)} | ${eur(w.fraglich)} |`);
  z.push(`Nicht terminiert, sofort abrechenbar: ${eur(e.nicht_terminiert.summe_netto)} netto.`);
  z.push('');

  z.push('## Warnungen');
  const ws = lage.warnungen.slice(0, 8);
  if (!ws.length) z.push('Keine.');
  else {
    z.push('| Kunde · Projekt | Art | Lage |');
    z.push('| --- | --- | --- |');
    for (const w of ws) z.push(`| ${[w.kunde, w.projekt].filter(Boolean).join(' · ') || w.person || '—'} | ${w.art} | ${w.text.replace(/\|/g, '/')} |`);
  }
  z.push('');

  z.push('## Kapazität');
  const kp = lage.kapazitaet.filter((k) => k.soll_std_woche > 1).slice(0, 8);
  if (kp.length) {
    z.push('| Person | frei Std./Woche | Restarbeit Festpreis | frei ab |');
    z.push('| --- | ---: | ---: | --- |');
    for (const k of kp) z.push(`| ${k.name} | ${k.frei_std_woche == null ? '—' : r1(k.frei_std_woche).toLocaleString('de-AT')} | ${std(k.rest_festpreis_std)} | ${k.frei_ab ? fmtDatum(k.frei_ab) : (k.grund || '—')} |`);
  }
  z.push('');

  z.push('## Nachpflege');
  const d = lage.datenqualitaet;
  z.push(`- Offene Tickets ohne Sollstunden: ${d.tickets_ohne_sollstunden.anzahl} (mit Erfahrungswert geschätzt).`);
  z.push(`- Laufende Projekte ohne Auftragswert: ${d.projekte_ohne_auftrag.anzahl}.`);
  if (d.nicht_zugewiesene_tickets) z.push(`- Offene Tickets ohne Zuständigen: ${d.nicht_zugewiesene_tickets} (${std(d.nicht_zugewiesene_restarbeit_std)}).`);
  z.push('');
  const k = lage.methodik.kalibrierung;
  z.push(`_Stand ${fmtDatum(lage.stand.heute)} · Tag Null ${fmtDatum(lage.stand.tag_null)} · Rechnungen synchronisiert ${lage.stand.letzte_rechnung_sync || '—'} · Erfahrungswerte: ${k.quelle}, Faktor Ist/Plan gesamt ${k.gesamt.faktor}._`);
  return z.join('\n');
}

export function kpisAusLage(lage) {
  const s = lage.summen;
  const e = lage.einnahmen;
  return {
    version: 2,
    stand: lage.stand.heute,
    eingang_sicher_4w: e.summen_4_wochen.sicher,
    eingang_wahrscheinlich_4w: e.summen_4_wochen.wahrscheinlich,
    eingang_fraglich_4w: e.summen_4_wochen.fraglich,
    noch_zu_verrechnen: s.noch_zu_verrechnen || 0,
    sofort_abrechenbar: e.nicht_terminiert.summe_netto,
    ueberfaellig_summe: s.ueberfaellig_brutto,
    ueberfaellig_anzahl: s.ueberfaellig_rechnungen,
    projekte_rot: s.rot || 0,
    ungedeckte_reststunden: s.ungedeckte_reststunden,
    ungedeckt_euro: s.ungedeckt_euro,
    engpass_personen: s.engpass_personen,
    kasse_beurteilbar: lage.kasse.beurteilbar,
  };
}
