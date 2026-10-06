// Die Tage einer Person im Zeitraum — so, wie sie die Person beim Buchen sieht,
// plus Hinweise auf Auffälligkeiten (Timer über Nacht, Überschneidungen, sehr lange Tage).
// Rein rechnend: nutzt die schon geladenen Daten der Arbeitszeitauswertung.
import { werteTagAus } from '../zeit/tagesAuswertung.js';
import { tageZwischen, istWochenende, feiertag, istArbeitstag } from './kalender.js';

const norm = (s) => String(s || '').trim().toLowerCase();
const min = (e) => Number(e.duration_minutes) || 0;
const lokalerTag = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const minuteVon = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const tagesEnde = (iso) => { const d = new Date(iso); d.setHours(23, 59, 0, 0); return d.toISOString(); };

export const LANGE_BUCHUNG = 10 * 60; // eine einzelne Buchung über 10 h
export const LANGER_TAG = 12 * 60;    // ein Tag über 12 h

// Hinweise je Buchung
export function hinweiseZu(e, ueberschneidet) {
  const out = [];
  if (min(e) >= LANGE_BUCHUNG) out.push('über 10 h am Stück');
  if (e.started_at && e.ended_at && lokalerTag(e.started_at) !== lokalerTag(e.ended_at)) out.push('läuft über Mitternacht');
  if (e.started_at && e.entry_date && lokalerTag(e.started_at) !== e.entry_date) out.push('Start liegt an einem anderen Tag');
  if (ueberschneidet) out.push('überschneidet sich');
  return out;
}

export function tageDerPerson({ person, zeitraum, appAb, pflichtAb, eintraege = [], awork = [], members = [], abschluesse = [], focusDays = [], arbeitstage = [] }) {
  if (!person || zeitraum.leer) return [];
  const von = zeitraum.von;
  const bis = zeitraum.auswertungBis;
  const keyVonName = {};
  members.forEach((m) => { if (m.email && m.name) keyVonName[norm(m.name)] = norm(m.email); });
  const aworkKey = (e) => keyVonName[norm(e.user_name)] || `awork:${norm(e.user_name) || 'unbekannt'}`;

  const appEintraege = eintraege.filter((e) => norm(e.person_email) === person.key && e.entry_date >= appAb);
  const aworkEintraege = awork.filter((e) => aworkKey(e) === person.key && e.entry_date < appAb);
  const abschlussVon = Object.fromEntries(abschluesse.filter((a) => norm(a.person_email) === person.key).map((a) => [a.tag, a]));
  const abwesendAm = (t) => focusDays.some((f) => f.type === 'abwesend' && norm(f.person_email) === person.key
    && f.day <= t && (f.until && f.until >= f.day ? f.until : f.day) >= t);
  // Erster Aufruf des Tools je Tag (bei mehreren Datensätzen der früheste)
  const geoeffnetAm = {};
  arbeitstage.filter((r) => norm(r.person_email) === person.key && r.tag && r.erster_aufruf_am).forEach((r) => {
    if (!geoeffnetAm[r.tag] || r.erster_aufruf_am < geoeffnetAm[r.tag]) geoeffnetAm[r.tag] = r.erster_aufruf_am;
  });
  const tagesSoll = person.aktiv && person.wochenStd !== null ? (person.wochenStd * 60) / 5 : 0;

  return tageZwischen(von, bis).map((tag) => {
    const quelle = tag < appAb ? 'awork' : 'app';
    const liste = (quelle === 'app' ? appEintraege : aworkEintraege)
      .filter((e) => e.entry_date === tag)
      .sort((a, b) => (a.started_at || '').localeCompare(b.started_at || ''));
    const abschluss = abschlussVon[tag];
    const abwesend = abwesendAm(tag) || abschluss?.grund === 'frei' || abschluss?.grund === 'abwesend';
    const arbeitstag = istArbeitstag(tag);
    // Streifen und Überschneidung: ohne Korrekturbuchungen (sie tragen das Zeitfenster des
    // Originals und nur die Differenz); eine Buchung über Mitternacht endet am Ende ihres Starttags.
    // Die Summen kommen aus allen Buchungen, die gebuchte Dauer bleibt unverändert.
    const fuerStreifen = liste.filter((e) => !e.korrektur_zu).map((e) => (e.started_at && e.ended_at && lokalerTag(e.started_at) !== lokalerTag(e.ended_at)
      ? { ...e, ended_at: tagesEnde(e.started_at) } : e));
    // Lücken beginnen beim ersten Aufruf des Tools (falls vorhanden), sonst wie bisher um 09:00.
    const geoeffnet = geoeffnetAm[tag] || null;
    const streifen = werteTagAus({
      tag, eintraege: fuerStreifen, tagesbeginnMinute: geoeffnet ? minuteVon(geoeffnet) : null,
      abgeschlossen: !!abschluss?.bestaetigt_am,
    });
    const summen = werteTagAus({ tag, eintraege: liste });
    const auswertung = {
      ...streifen,
      gebuchtMinuten: summen.gebuchtMinuten,
      verrechenbarMinuten: summen.verrechenbarMinuten,
      nichtVerrechenbarMinuten: summen.nichtVerrechenbarMinuten,
      nichtVerrechenbarAnteil: summen.nichtVerrechenbarAnteil,
      betrag: summen.betrag,
      anzahl: summen.anzahl,
    };
    const ueberschneidend = new Set(auswertung.blocks.filter((b) => b.ueberschneidet).map((b) => b.entry.id));
    const buchungen = liste.map((e) => ({ ...e, hinweise: quelle === 'app' ? hinweiseZu(e, ueberschneidend.has(e.id)) : (min(e) >= LANGE_BUCHUNG ? ['über 10 h am Stück'] : []) }));
    const gebucht = auswertung.gebuchtMinuten;

    const hinweise = [];
    if (gebucht >= LANGER_TAG) hinweise.push('mehr als 12 h an einem Tag');
    if (buchungen.some((b) => b.hinweise.includes('über 10 h am Stück'))) hinweise.push('Einzelbuchung über 10 h — Timer nicht gestoppt?');
    if (buchungen.some((b) => b.hinweise.includes('läuft über Mitternacht'))) hinweise.push('Buchung läuft über Mitternacht');
    if (ueberschneidend.size) hinweise.push(`${ueberschneidend.size} Buchungen überschneiden sich`);
    if (gebucht > 0 && (!arbeitstag || abwesend)) hinweise.push(abwesend ? 'gebucht trotz Abwesenheit' : feiertag(tag) && !istWochenende(tag) ? 'am Feiertag gebucht' : 'am Wochenende gebucht');

    const soll = arbeitstag && !abwesend ? tagesSoll : 0;
    const abgeschlossen = !!(abschluss?.bestaetigt_am || abschluss?.woche_bestaetigt_am);
    let status = 'normal';
    if (!arbeitstag) status = feiertag(tag) && !istWochenende(tag) ? 'feiertag' : 'wochenende';
    else if (abwesend) status = 'abwesend';
    else if (quelle === 'app' && tag >= pflichtAb) status = abgeschlossen ? 'abgeschlossen' : 'offen';

    return {
      tag, quelle, status, soll, abwesend, arbeitstag, geoeffnet,
      feiertag: feiertag(tag),
      gebucht,
      verr: auswertung.verrechenbarMinuten,
      nv: auswertung.nichtVerrechenbarMinuten,
      mehr: buchungen.filter((b) => b.mehrleistung).reduce((s, b) => s + min(b), 0),
      offenMinuten: quelle === 'app' && arbeitstag && !abwesend ? auswertung.offenMinuten : 0,
      anzahl: buchungen.length,
      ohneUhrzeit: buchungen.filter((b) => !(b.started_at && b.ended_at)).length,
      auswertung,
      buchungen,
      hinweise,
    };
  }).filter((t) => t.arbeitstag || t.gebucht);
}
