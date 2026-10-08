import { base44 } from '@/api/base44Client';
import { PFLICHT_AB } from '@/lib/zeit/offeneTage';
import { plusTage } from './kalender';

// Daten der Arbeitszeitauswertung in zwei Runden:
//   1. Einstellungen und Stammdaten (parallel)
//   2. Buchungen, aWork-Buchungen, Tagesabschlüsse, Abwesenheiten — nur im Zeitraum (parallel)
// Keine ungefilterten Listen auf wachsenden Entitäten.

const SEITE = 5000;
const MAX_SEITEN = 4;
export const SOLL_KEY = 'arbeitszeit_soll_wochenstunden';
const KEYS = ['zeit_pflicht_ab', 'standard_day_hours', 'awork_umstellung_stichtag', SOLL_KEY];

async function imZeitraum(entity, query, sort) {
  const alle = [];
  for (let s = 0; s < MAX_SEITEN; s += 1) {
    const seite = await entity.filter(query, sort, SEITE, s * SEITE);
    alle.push(...seite);
    if (seite.length < SEITE) return { rows: alle, abgeschnitten: false };
  }
  return { rows: alle, abgeschnitten: true };
}

const datum = (v) => { const s = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

function leseWochenSoll(wert) {
  try {
    const roh = JSON.parse(wert || '{}');
    return roh && typeof roh === 'object' ? roh : {};
  } catch { return {}; }
}

export async function ladeArbeitszeit({ von, auswertungBis: bis, tageBis, leer }) {
  // App-Daten bis einschließlich heute laden (für die Tagesansicht); die Auswertung
  // selbst filtert weiter bis gestern.
  const appBis = tageBis && tageBis > bis ? tageBis : bis;
  const [settings, members, projects, clients] = await Promise.all([
    base44.entities.Setting.filter({ key: { $in: KEYS } }, 'key', 20).catch(() => []),
    base44.entities.TeamMember.list('name', 300),
    base44.entities.Project.list('-created_date', 1000),
    base44.entities.Client.list('name', 2000),
  ]);
  const wert = (k) => settings.find((s) => s.key === k)?.value;
  const pflichtAb = datum(wert('zeit_pflicht_ab')) || PFLICHT_AB;
  const stichtag = datum(wert('awork_umstellung_stichtag'));
  // App-Buchungen zählen ab dem Pflichtstart (bzw. nach dem aWork-Stichtag, falls später) —
  // davor gilt aWork. So wird kein Tag doppelt gezählt.
  const nachStichtag = stichtag ? plusTage(stichtag, 1) : null;
  const appAb = nachStichtag && nachStichtag > pflichtAb ? nachStichtag : pflichtAb;
  const basis = {
    members, projects, clients, pflichtAb, appAb,
    standardStdTag: Number(wert('standard_day_hours')) || 8,
    wochenSoll: leseWochenSoll(wert(SOLL_KEY)),
    sollSetting: settings.find((s) => s.key === SOLL_KEY) || null,
  };
  if (leer) return { ...basis, eintraege: [], awork: [], abschluesse: [], focusDays: [], arbeitstage: [], abgeschnitten: false };

  const aworkBis = plusTage(appAb, -1);
  const [app, awork, abschluesse, focus, arbeitstage] = await Promise.all([
    bis >= appAb
      ? imZeitraum(base44.entities.TimeEntry, { entry_date: { $gte: von > appAb ? von : appAb, $lte: appBis } }, 'entry_date')
      : { rows: [], abgeschnitten: false },
    von <= aworkBis
      ? imZeitraum(base44.entities.AworkTimeEntry, { entry_date: { $gte: von, $lte: bis < aworkBis ? bis : aworkBis } }, 'entry_date')
      : { rows: [], abgeschnitten: false },
    base44.entities.Tagesabschluss.filter({ tag: { $gte: von, $lte: appBis } }, 'tag', 5000).catch(() => []),
    // Abwesenheiten, die im Zeitraum liegen oder bis zu zwei Monate vorher begonnen haben
    base44.entities.FocusDay.filter({ type: 'abwesend', day: { $gte: plusTage(von, -62), $lte: bis } }, 'day', 2000).catch(() => []),
    // Zeitstempel „Tool geöffnet“ — nur für die Tagesansicht
    base44.entities.Arbeitstag.filter({ tag: { $gte: von, $lte: appBis } }, 'tag', 5000).catch(() => []),
  ]);
  return {
    ...basis,
    eintraege: app.rows,
    awork: awork.rows,
    abschluesse,
    focusDays: focus,
    arbeitstage,
    abgeschnitten: app.abgeschnitten || awork.abgeschnitten,
  };
}

// Änderungsprotokoll einer Person im Zeitraum — nur für die Tagesansicht (erste und letzte
// Aktion im Tool). Einen Tag Rand auf beiden Seiten, weil das Protokoll in UTC speichert;
// die Zuordnung zum Kalendertag passiert danach in Ortszeit.
export async function ladeAktionen(email, von, bis) {
  if (!email) return [];
  const rows = await base44.entities.AuditLog.filter(
    { user_email: email, created_date: { $gte: `${plusTage(von, -1)}T00:00:00`, $lte: `${plusTage(bis, 1)}T23:59:59` } },
    'created_date',
    5000,
  ).catch(() => null);
  return rows ? rows.map((r) => ({ created_date: r.created_date, entity_type: r.entity_type, action: r.action })) : null;
}

// Individuelle Sollstunden je Woche (Teilzeit) speichern. Leerer Wert = Standard.
export async function speichereWochenSoll(sollSetting, wochenSoll) {
  const sauber = Object.fromEntries(Object.entries(wochenSoll)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)))
    .map(([k, v]) => [k, Math.max(0, Math.min(60, Number(v)))]));
  const value = JSON.stringify(sauber);
  if (sollSetting?.id) return base44.entities.Setting.update(sollSetting.id, { value });
  return base44.entities.Setting.create({
    key: SOLL_KEY,
    value,
    group: 'kapazitaet',
    label: 'Arbeitszeitauswertung: individuelle Sollstunden je Woche (E-Mail → Stunden)',
  });
}
