// Retainer: Kontingent seit Laufzeitbeginn — eine Rechenregel für Anzeige, aWork-Altstand und Periodenabschluss.
//
// Zur Verfügung = angefangene Monate (Beginnmonat bis laufender Monat, beide voll) × Monatskontingent + Übertrag
// Gebucht       = aWork-Altstand (Beginn bis Stichtag) + App-Buchungen (ab Beginn UND nach dem Stichtag)
// Saldo         = Zur Verfügung − Gebucht
// Der Stichtag trennt aWork und App: bis einschließlich Stichtag zählt nur aWork, danach nur die App.

export const STICHTAG_STANDARD = '2026-10-04';

export const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Heutiges Datum in Wien (der Server läuft in UTC)
export const heuteWien = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });

export const tagDavor = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

// Angefangene Kalendermonate von beginn bis bis, beide Monate inklusive; 0, wenn beginn nach bis liegt
export function monateZwischen(beginn, bis) {
  if (!beginn || !bis || beginn > bis) return 0;
  const [y1, m1] = beginn.split('-').map(Number);
  const [y2, m2] = bis.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

// Stunden einer App-Buchung — wie in projektZeitSummen
export const stundenVon = (e) => Number(e.hours) || (Number(e.duration_minutes) || 0) / 60;

// Zählt eine App-Buchung für die Periode [beginn, ende]?
export function zaehltFuerLaufzeit(e, { beginn, ende, stichtag }) {
  const d = String(e.entry_date || '').slice(0, 10);
  if (!d || !beginn) return false;
  if (e.abrechnungsstatus === 'verworfen') return false;
  if (d < beginn) return false;
  if (ende && d > ende) return false;
  if (stichtag && d <= stichtag) return false;
  return true;
}

export async function ladeStichtag(db) {
  const rows = await db.Setting.filter({ key: 'awork_umstellung_stichtag' }, 'key', 1).catch(() => []);
  const wert = String(rows[0]?.value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(wert) ? wert : STICHTAG_STANDARD;
}

// Jüngste gültige Auftragsbestätigung des Projekts (hängt am Projekt-Cockpit, ersatzweise an der Projekt-Id)
export async function abDesProjekts(db, project) {
  const ids = [...new Set([project.liquidity_project_id, project.id].filter(Boolean))];
  const orders = (await Promise.all(
    ids.map((id) => db.ConfirmedOrder.filter({ project_id: id }, '-confirmation_date', 20).catch(() => []))
  )).flat();
  return orders
    .filter((o) => !['cancelled', 'draft'].includes(o.status) && (o.confirmation_date || o.signed_date))
    .sort((a, b) => String(b.confirmation_date || b.signed_date).localeCompare(String(a.confirmation_date || a.signed_date)))[0] || null;
}

// Wirksamer Laufzeitbeginn: Feld am Projekt, sonst Datum der AB
export async function wirksamerBeginn(db, project) {
  if (project.laufzeit_beginn) {
    return { beginn: String(project.laufzeit_beginn).slice(0, 10), quelle: project.laufzeit_beginn_quelle || 'manuell', ab_nummer: null };
  }
  const ab = await abDesProjekts(db, project);
  if (!ab) return { beginn: null, quelle: null, ab_nummer: null };
  return {
    beginn: String(ab.confirmation_date || ab.signed_date).slice(0, 10),
    quelle: 'ab_fallback',
    ab_nummer: ab.order_number || null,
  };
}

// aWork-Stunden eines aWork-Projekts im Zeitraum [von, bis], beide inklusive
export async function aworkStunden(db, aworkProjectId, von, bis) {
  if (!aworkProjectId || !von || !bis || von > bis) return 0;
  let summe = 0;
  let skip = 0;
  const limit = 500;
  while (true) {
    const page = await db.AworkTimeEntry.filter({ awork_project_id: aworkProjectId }, '-entry_date', limit, skip);
    for (const e of page) {
      const d = String(e.entry_date || '').slice(0, 10);
      if (d >= von && d <= bis) summe += (Number(e.duration_minutes) || 0) / 60;
    }
    if (page.length < limit) break;
    skip += limit;
  }
  return r2(summe);
}

// Alle App-Buchungen des Projekts, die für die Periode zählen
export async function appStunden(db, projectId, grenzen) {
  let summe = 0;
  let skip = 0;
  const limit = 500;
  while (true) {
    const page = await db.TimeEntry.filter({ project_id: projectId }, '-entry_date', limit, skip);
    for (const e of page) if (zaehltFuerLaufzeit(e, grenzen)) summe += stundenVon(e);
    if (page.length < limit) break;
    skip += limit;
  }
  return r2(summe);
}

// Reine Rechnung aus fertigen Summen — ohne Datenbank, damit sie testbar bleibt
export function laufzeitAusSummen({ project, beginn, quelle, ab_nummer = null, stichtag, heute, gebucht_app, mehrleistung_abgerechnet = 0 }) {
  const kontingent = Number(project.support_kontingent_stunden) || 0;
  if (!beginn) return { beginn: null, kontingent_monat: kontingent };
  const monate = monateZwischen(beginn, heute);
  const uebertrag = Number(project.kontingent_uebertrag_stunden) || 0;
  const verfuegbar = monate * kontingent + uebertrag;
  const altstandRelevant = beginn <= stichtag;
  const gebucht_awork = altstandRelevant ? Number(project.awork_altstand_stunden) || 0 : 0;
  const altstand_fehlt = altstandRelevant && (
    project.awork_altstand_stunden == null
    || String(project.awork_altstand_beginn || '').slice(0, 10) !== beginn
  );
  const gebucht = gebucht_awork + (Number(gebucht_app) || 0);
  return {
    beginn,
    beginn_quelle: quelle,
    ab_nummer,
    zukunft: beginn > heute,
    kontingent_monat: kontingent,
    monate,
    uebertrag: r2(uebertrag),
    verfuegbar: r2(verfuegbar),
    gebucht_awork: r2(gebucht_awork),
    gebucht_app: r2(gebucht_app),
    gebucht: r2(gebucht),
    saldo: r2(verfuegbar - gebucht),
    stichtag,
    altstand_fehlt,
    davon_mehrleistung_abgerechnet: r2(mehrleistung_abgerechnet),
    historie: Array.isArray(project.laufzeit_historie) ? project.laufzeit_historie : [],
  };
}

// Darf der Nutzer Retainer-Stammdaten neu berechnen lassen?
export const darfVerwalten = (user) =>
  user?.role === 'admin' || ['gf', 'pm'].includes(user?.system_role);


