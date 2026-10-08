// Beginn und Ende eines Arbeitstages — gebucht gegen tatsächlich im Tool belegt.
//
//   Gebucht ab / bis   frühester Beginn und spätestes Ende der Buchungen des Tages.
//   Erste Aktion       frühester belegter Moment im Tool an diesem Kalendertag:
//                      Tool geöffnet, Timer gestartet, Buchung angelegt, jede Änderung im Tool.
//   Letzte Aktion      spätester belegter Moment an diesem Kalendertag:
//                      jede Änderung im Tool, Timer gestoppt (Buchung vom Server angelegt),
//                      Tag abgeschlossen.
//
// Quellen sind Zeitstempel, die Server bzw. Protokoll setzen (Kennung des laufenden Timers,
// created_date der Buchung, Änderungsprotokoll, Tagesabschluss) — nicht die Uhrzeiten, die
// jemand in eine Buchung schreibt. Gezählt wird nur, was am selben Kalendertag geschah;
// ein Nachtrag am nächsten Morgen ist keine Aktion dieses Tages.
//
// Nur für die Arbeitszeitauswertung (Geschäftsführung). Rein rechnend.
import { alsDatum } from '../zeitpunkt.js';
import { zeitAusKennung } from './messung.js';

export const TOLERANZ_MIN = 5;

const zwei = (n) => String(n).padStart(2, '0');
const lokalerTag = (d) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
const gueltig = (d) => d instanceof Date && !Number.isNaN(d.getTime());

const ART = {
  Tagesabschluss: 'Tag abgeschlossen',
  TimeEntry: { create: 'Buchung angelegt', update: 'Buchung geändert', delete: 'Buchung gelöscht' },
  LaufendeZeitbuchung: { create: 'Timer gestartet', update: 'Timer geändert', delete: 'Timer beendet' },
  Arbeitstag: 'Tool geöffnet',
};
const artVon = (a) => {
  const x = ART[a.entity_type];
  if (!x) return 'Aktion im Tool';
  return typeof x === 'string' ? x : (x[a.action] || 'Aktion im Tool');
};

// Alle belegten Momente einer Person, gruppiert nach Kalendertag: { tag: [{ zeit, art }] }
export function aktionenJeTag({ aktionen = [], eintraege = [], abschluesse = [], arbeitstage = [] }) {
  const jeTag = {};
  const merke = (wert, art) => {
    const d = alsDatum(wert);
    if (!gueltig(d)) return;
    (jeTag[lokalerTag(d)] || (jeTag[lokalerTag(d)] = [])).push({ zeit: d, art });
  };
  aktionen.forEach((a) => merke(a.created_date, artVon(a)));
  eintraege.forEach((e) => {
    if (e.quelle === 'timer' && e.laufende_id) {
      const start = zeitAusKennung(e.laufende_id);
      if (start) merke(start, 'Timer gestartet');
      merke(e.created_date, 'Timer gestoppt');
    } else {
      merke(e.created_date, 'Buchung angelegt');
    }
  });
  abschluesse.forEach((a) => { if (a.bestaetigt_am) merke(a.bestaetigt_am, 'Tag abgeschlossen'); });
  arbeitstage.forEach((r) => { if (r.erster_aufruf_am) merke(r.erster_aufruf_am, 'Tool geöffnet'); });
  return jeTag;
}

// Grenzen eines Tages: gebucht ab/bis gegen erste/letzte Aktion, Abweichungen in Minuten
export function tagesgrenzen({ buchungen = [], momente = [] }) {
  const mitZeit = buchungen.filter((b) => !b.korrektur_zu && b.started_at && b.ended_at && (Number(b.duration_minutes) || 0) > 0);
  const starts = mitZeit.map((b) => alsDatum(b.started_at)).filter(gueltig);
  const enden = mitZeit.map((b) => alsDatum(b.ended_at)).filter(gueltig);
  const gebuchtAb = starts.length ? new Date(Math.min(...starts)) : null;
  const gebuchtBis = enden.length ? new Date(Math.max(...enden)) : null;

  const sortiert = [...momente].sort((a, b) => a.zeit - b.zeit);
  const erste = sortiert[0] || null;
  const letzte = sortiert[sortiert.length - 1] || null;

  const min = (a, b) => Math.round((a - b) / 60000);
  const vorBeginn = gebuchtAb && erste ? min(erste.zeit, gebuchtAb) : null;   // > 0: gebucht, bevor im Tool etwas geschah
  const nachEnde = gebuchtBis && letzte ? min(gebuchtBis, letzte.zeit) : null; // > 0: gebucht über die letzte Aktion hinaus

  return {
    gebuchtAb,
    gebuchtBis,
    ersteAktion: erste?.zeit || null,
    ersteArt: erste?.art || null,
    letzteAktion: letzte?.zeit || null,
    letzteArt: letzte?.art || null,
    vorBeginn,
    nachEnde,
    zuFrueh: vorBeginn !== null && vorBeginn > TOLERANZ_MIN,
    zuSpaet: nachEnde !== null && nachEnde > TOLERANZ_MIN,
  };
}
