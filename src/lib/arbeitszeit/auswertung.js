// Arbeitszeitauswertung: Soll gegen erfasste und verrechenbare Zeit.
// Rein rechnend — bekommt geladene Daten und liefert Zahlen, ohne Datenzugriff.
//
// Begriffe
//   Soll        Arbeitstage (Mo–Fr, ohne österr. Feiertage, ohne Abwesenheit) × Tagessoll
//   Erfasst     gebuchte Zeit inkl. Korrekturbuchungen (die als Differenz gebucht sind).
//               Es ist NICHT die Anwesenheit — Kommen/Gehen gibt es noch nicht.
//   Verrechenbar  Buchungen mit verrechenbar ≠ false (aWork: is_billable)
// Gegen Doppelzählung: vor appAb zählt nur aWork, ab appAb nur die App.
// Gründe für nicht Verrechenbares gibt es nur für die Firma, nie je Person.
import { ARTEN, artVon } from '../auslastung/arbeitsart.js';
import { tageZwischen, istArbeitstag, istWochenende, feiertag, plusTage, fmtKurz, wochentag } from './kalender.js';
import { messung } from './messung.js';

export const TAETIGKEIT = [
  { key: 'beratung', label: 'Beratung', farbe: 'hsl(var(--chart-1))' },
  { key: 'umsetzung', label: 'Umsetzung', farbe: 'hsl(var(--chart-2))' },
  { key: 'vertrieb', label: 'Vertrieb', farbe: 'hsl(var(--chart-3))' },
  { key: 'meeting', label: 'Meeting', farbe: 'hsl(var(--chart-5))' },
];
export const NV_GRUND = {
  kulanz: 'Kulanz',
  interne_nacharbeit: 'Interne Nacharbeit',
  fehler: 'Fehler von uns',
  einarbeitung: 'Einarbeitung',
  akquise: 'Akquise',
  intern: 'Intern',
  ohne: 'Ohne Grund',
};
export const ART_UNKLAR = { key: 'unklar', label: 'Nicht zuordenbar', farbe: 'hsl(var(--border))' };

const norm = (s) => String(s || '').trim().toLowerCase();
const min = (e) => Number(e.duration_minutes) || 0;
const quote = (a, b) => (b > 0 ? a / b : null);

// ISO-Kalenderwoche
function kw(iso) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  const tag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tag);
  const jahresanfang = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - jahresanfang) / 86400000 + 1) / 7);
}

const leerePerson = (key, name, email, aktiv) => ({
  key, name, email, aktiv,
  sollMin: 0, sollTage: 0, abwesendTage: 0, offeneTage: 0,
  erfasstMin: 0, verrMin: 0, nvMin: 0, mehrMin: 0, ueberMin: 0,
  gemessenMin: 0, nachMin: 0, // nur App: vom Timer gemessen („gebucht“) bzw. nachgetragen
  taetigkeit: { beratung: 0, umsetzung: 0, vertrieb: 0, meeting: 0 },
  wochenStd: null, individuell: false,
});

export function werteAus({
  zeitraum, appAb, pflichtAb, heute,
  eintraege = [], awork = [], members = [], projects = [], clients = [],
  abschluesse = [], focusDays = [], standardStdTag = 8, wochenSoll = {},
}) {
  const von = zeitraum.von;
  const bis = zeitraum.auswertungBis;
  const tage = zeitraum.leer ? [] : tageZwischen(von, bis);
  const imZeitraum = (t) => t >= von && t <= bis;

  const projById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const projByAwork = Object.fromEntries(projects.filter((p) => p.awork_project_id).map((p) => [p.awork_project_id, p]));
  const kundeById = Object.fromEntries(clients.map((c) => [c.id, c.name]));

  // Personen: alle aktiven Teammitglieder, dazu jede Person mit Buchungen im Zeitraum
  const personen = {};
  const keyVonName = {};
  members.forEach((m) => {
    if (!m.email) return;
    const key = norm(m.email);
    if (m.name) keyVonName[norm(m.name)] = key;
    if (m.active !== false) personen[key] = leerePerson(key, m.name || m.email, m.email, true);
  });
  const personFuer = (key, name, email) => personen[key]
    || (personen[key] = leerePerson(key, name || email || key, email || '', false));
  const nameVon = Object.fromEntries(members.filter((m) => m.email).map((m) => [norm(m.email), m.name]));

  // Abwesenheit je Person und Tag
  const abwesend = {};
  const markiere = (key, tag) => { (abwesend[key] || (abwesend[key] = new Set())).add(tag); };
  focusDays.filter((f) => f.type === 'abwesend' && f.person_email && f.day).forEach((f) => {
    const ende = f.until && f.until >= f.day ? f.until : f.day;
    tageZwischen(f.day > von ? f.day : von, ende < bis ? ende : bis).forEach((t) => markiere(norm(f.person_email), t));
  });
  const bestaetigt = {};
  abschluesse.forEach((a) => {
    const key = norm(a.person_email);
    if (!key || !a.tag) return;
    if (a.grund === 'frei' || a.grund === 'abwesend') markiere(key, a.tag);
    if (a.bestaetigt_am || a.woche_bestaetigt_am) (bestaetigt[key] || (bestaetigt[key] = new Set())).add(a.tag);
  });

  // Soll und offene Tage — nur für aktive Teammitglieder
  const arbeitstage = tage.filter(istArbeitstag);
  Object.values(personen).filter((p) => p.aktiv).forEach((p) => {
    const roh = wochenSoll[p.key];
    p.individuell = roh !== undefined && roh !== null && roh !== '' && Number.isFinite(Number(roh));
    p.wochenStd = p.individuell ? Number(roh) : standardStdTag * 5;
    const tagesSoll = (p.wochenStd * 60) / 5;
    arbeitstage.forEach((t) => {
      if (abwesend[p.key]?.has(t)) { p.abwesendTage += 1; return; }
      p.sollTage += 1;
      p.sollMin += tagesSoll;
      if (t >= pflichtAb && !bestaetigt[p.key]?.has(t)) p.offeneTage += 1;
    });
  });

  // Verlauf: täglich bis 31 Tage, sonst je Kalenderwoche
  const taeglich = tage.length <= 31;
  const verlauf = {};
  const eimer = (t) => {
    const k = taeglich ? t : `KW ${kw(t)}`;
    const ord = taeglich ? t : plusTage(t, -((wochentag(t) + 6) % 7));
    return verlauf[k] || (verlauf[k] = { key: k, ord, label: taeglich ? fmtKurz(t) : k, sollMin: 0, erfasstMin: 0, verrMin: 0, wochenende: taeglich && istWochenende(t), feiertag: taeglich ? feiertag(t) : null });
  };
  tage.forEach((t) => {
    if (taeglich && istWochenende(t)) return; // Wochenenden nur, wenn gebucht wurde (siehe unten)
    const e = eimer(t);
    Object.values(personen).filter((p) => p.aktiv).forEach((p) => {
      if (istArbeitstag(t) && !abwesend[p.key]?.has(t)) e.sollMin += (p.wochenStd * 60) / 5;
    });
  });

  const arten = {};
  const nv = {};
  const taetigkeit = { beratung: 0, umsetzung: 0, vertrieb: 0, meeting: 0 };
  const projekte = {};
  const gesamt = { erfasstMin: 0, verrMin: 0, nvMin: 0, mehrMin: 0, ueberMin: 0, appMin: 0, aworkMin: 0, wochenendMin: 0, feiertagMin: 0 };

  const zaehle = ({ person, tag, minuten, verrechenbar, art, taet, projektKey, projektLabel, grund, mehr, ueber, quelle, gemessen = 0, nach = 0 }) => {
    if (!minuten) return;
    person.erfasstMin += minuten;
    person.gemessenMin += gemessen;
    person.nachMin += nach;
    gesamt.erfasstMin += minuten;
    gesamt[quelle === 'app' ? 'appMin' : 'aworkMin'] += minuten;
    if (!istArbeitstag(tag)) gesamt[feiertag(tag) && !istWochenende(tag) ? 'feiertagMin' : 'wochenendMin'] += minuten;
    if (verrechenbar) { person.verrMin += minuten; gesamt.verrMin += minuten; }
    else {
      person.nvMin += minuten; gesamt.nvMin += minuten;
      if (quelle === 'app') nv[grund || 'ohne'] = (nv[grund || 'ohne'] || 0) + minuten;
    }
    if (mehr) { person.mehrMin += minuten; gesamt.mehrMin += minuten; }
    if (ueber) { person.ueberMin += minuten; gesamt.ueberMin += minuten; }
    const t = TAETIGKEIT.some((x) => x.key === taet) ? taet : 'umsetzung';
    person.taetigkeit[t] += minuten;
    taetigkeit[t] += minuten;
    const a = arten[art || 'unklar'] || (arten[art || 'unklar'] = { minuten: 0, verrMin: 0 });
    a.minuten += minuten;
    if (verrechenbar) a.verrMin += minuten;
    const pr = projekte[projektKey] || (projekte[projektKey] = { key: projektKey, label: projektLabel, minuten: 0, verrMin: 0, personen: new Set() });
    pr.minuten += minuten;
    if (verrechenbar) pr.verrMin += minuten;
    pr.personen.add(person.key);
    const v = eimer(tag);
    v.erfasstMin += minuten;
    if (verrechenbar) v.verrMin += minuten;
  };

  const projektLabel = (p) => {
    if (!p) return 'Ohne Projekt';
    const kunde = kundeById[p.client_id];
    return kunde ? `${kunde} · ${p.title || p.name || ''}` : (p.title || p.name || 'Projekt');
  };

  eintraege.forEach((e) => {
    const tag = e.entry_date;
    if (!tag || !imZeitraum(tag) || tag < appAb) return;
    const key = norm(e.person_email);
    if (!key) return;
    const p = projById[e.project_id];
    const m = messung(e);
    zaehle({
      gemessen: m.gebucht,
      nach: m.nachgetragen,
      person: personFuer(key, nameVon[key], e.person_email),
      tag,
      minuten: min(e),
      verrechenbar: e.verrechenbar !== false,
      art: artVon(p) || (e.kategorie === 'intern' ? 'intern' : null),
      taet: e.taetigkeit,
      projektKey: e.project_id || 'ohne',
      projektLabel: projektLabel(p),
      grund: e.nicht_verrechenbar_grund,
      mehr: !!e.mehrleistung,
      ueber: !!e.ueber_kontingent,
      quelle: 'app',
    });
  });

  const ohneZuordnung = new Set();
  awork.forEach((e) => {
    const tag = e.entry_date;
    if (!tag || !imZeitraum(tag) || tag >= appAb) return;
    const name = norm(e.user_name);
    const key = keyVonName[name] || `awork:${name || 'unbekannt'}`;
    if (!keyVonName[name]) ohneZuordnung.add(e.user_name || 'unbekannt');
    const p = projByAwork[e.awork_project_id];
    zaehle({
      person: personFuer(key, e.user_name, ''),
      tag,
      minuten: min(e),
      verrechenbar: e.is_billable !== false,
      art: artVon(p),
      taet: e.taetigkeit,
      projektKey: p ? p.id : `awork:${e.awork_project_id || e.project_name}`,
      projektLabel: p ? projektLabel(p) : (e.project_name || 'aWork-Projekt'),
      mehr: false,
      ueber: false,
      quelle: 'awork',
    });
  });

  const liste = Object.values(personen)
    .filter((p) => p.aktiv || p.erfasstMin)
    .map((p) => ({
      ...p,
      erfassungsquote: quote(p.erfasstMin, p.sollMin),
      verrQuote: quote(p.verrMin, p.erfasstMin),
      produktiv: quote(p.verrMin, p.sollMin),
      schnittTag: p.sollTage ? p.erfasstMin / p.sollTage : null,
      saldoMin: p.aktiv ? p.erfasstMin - p.sollMin : null,
      nachQuote: quote(p.nachMin, p.gemessenMin + p.nachMin),
    }))
    .sort((a, b) => (b.aktiv - a.aktiv) || a.name.localeCompare(b.name, 'de'));

  const sollMin = liste.reduce((s, p) => s + p.sollMin, 0);
  const offeneTage = liste.reduce((s, p) => s + p.offeneTage, 0);
  const artenListe = [...ARTEN, ART_UNKLAR]
    .map((a) => ({ ...a, minuten: arten[a.key]?.minuten || 0, verrMin: arten[a.key]?.verrMin || 0 }))
    .filter((a) => a.minuten);

  return {
    tage,
    arbeitstage: arbeitstage.length,
    feiertage: tage.filter((t) => feiertag(t) && !istWochenende(t)).map((t) => ({ tag: t, name: feiertag(t) })),
    personen: liste,
    gesamt: {
      ...gesamt,
      sollMin,
      offeneTage,
      erfassungsquote: quote(gesamt.erfasstMin, sollMin),
      verrQuote: quote(gesamt.verrMin, gesamt.erfasstMin),
      produktiv: quote(gesamt.verrMin, sollMin),
    },
    arten: artenListe,
    taetigkeit: TAETIGKEIT.map((t) => ({ ...t, minuten: taetigkeit[t.key] })).filter((t) => t.minuten),
    nvGruende: Object.entries(nv).map(([k, m]) => ({ key: k, label: NV_GRUND[k] || k, minuten: m })).sort((a, b) => b.minuten - a.minuten),
    projekte: Object.values(projekte).map((p) => ({ ...p, personen: p.personen.size })).sort((a, b) => b.minuten - a.minuten),
    verlauf: Object.values(verlauf).sort((a, b) => a.ord.localeCompare(b.ord)),
    taeglich,
    quellen: {
      awork: !zeitraum.leer && von < appAb,
      app: !zeitraum.leer && bis >= appAb,
      aworkBis: plusTage(appAb, -1),
      appAb,
      pflichtAb,
      ohneZuordnung: [...ohneZuordnung],
      heute,
      wochentagHeute: wochentag(heute),
    },
  };
}

// Stunden und Quoten für die Anzeige
export const fmtStd = (minuten) => new Intl.NumberFormat('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format((minuten || 0) / 60);
export const fmtQuote = (q) => (q === null || q === undefined ? '—' : `${Math.round(q * 100)} %`);
