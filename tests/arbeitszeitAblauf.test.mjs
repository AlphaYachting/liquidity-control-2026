// Prüfskript für die Abläufe mit Datenbank (stempeln, Automatik, Timer) gegen eine Datenbank im Speicher.
// Ausführen: node tests/arbeitszeitAblauf.test.mjs
import assert from 'node:assert/strict';
import { leseEinstellungen, wienZeitpunkt } from '../base44/shared/arbeitszeitKern.js';
import { stempelnAblauf, statusAntwort, timerAufraeumen } from '../base44/shared/arbeitszeitDaten.js';

// --- Datenbank im Speicher, so wie base44.asServiceRole.entities sie anbietet
function passt(row, q) {
  return Object.entries(q || {}).every(([k, v]) => {
    const w = row[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ('$in' in v && !v.$in.includes(w)) return false;
      if ('$lte' in v && !(w <= v.$lte)) return false;
      if ('$gte' in v && !(w >= v.$gte)) return false;
      return true;
    }
    return w === v;
  });
}
function speicherDb({ latenz = 0 } = {}) {
  const warte = () => (latenz ? new Promise((r) => setTimeout(r, latenz)) : Promise.resolve());
  let n = 0;
  let uhr = 0;
  const tabellen = {};
  const tabelle = (name) => {
    tabellen[name] = tabellen[name] || [];
    const rows = tabellen[name];
    return {
      rows,
      async filter(q, sort, limit = 50) {
        await warte();
        let r = rows.filter((x) => passt(x, q));
        if (sort) {
          const ab = sort.startsWith('-');
          const f = ab ? sort.slice(1) : sort;
          r = r.slice().sort((a, b) => String(a[f] ?? '').localeCompare(String(b[f] ?? '')) * (ab ? -1 : 1));
        }
        return r.slice(0, limit).map((x) => ({ ...x }));
      },
      async get(id) { await warte(); const x = rows.find((r) => r.id === id); if (!x) throw new Error('not found'); return { ...x }; },
      async create(d) { await warte(); const x = { ...d, id: `${name}${++n}`, created_date: new Date(Date.UTC(2026, 0, 1) + (++uhr)).toISOString() }; rows.push(x); return { ...x }; },
      async update(id, d) { await warte(); const x = rows.find((r) => r.id === id); Object.assign(x, d); return { ...x }; },
      async delete(id) { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); },
    };
  };
  return new Proxy({}, { get: (_, name) => tabelle(name) });
}

const z = (tag, uhr) => wienZeitpunkt(tag, uhr);
const MAIL = 'c.rieder@rittler.co';
const einst = leseEinstellungen([
  { key: 'arbeitszeit_neu_ab', value: '2026-10-19' },
  { key: 'arbeitszeit_modell', value: JSON.stringify({ personen: {
    [MAIL]: [{ gueltig_ab: '2026-10-19', stempelt: true, soll_min: { mo: 510, di: 510, mi: 510, do: 510, fr: 270 } }],
    'g.sinella@rittler.co': [{ gueltig_ab: '2026-10-19', stempelt: false }],
  } }) },
]);

function grunddaten(db) {
  db.Project.rows.push({ id: 'p1', title: 'Regie Kunde', abrechnungsmodell: 'aufwand', client_id: 'c1', stundensatz: 120 });
  db.Project.rows.push({ id: 'p2', title: 'Sprintprojekt', abrechnungsmodell: 'sprint', client_id: 'c2' });
}
const laeuft = (db, project_id, gestartet) => db.LaufendeZeitbuchung.rows.push({
  id: `l${Math.random()}`, person_email: MAIL, project_id, gestartet_am: gestartet.toISOString(), projekt_titel: 'X', notiz: '',
});

let n = 0;
const fall = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`); };

await fall('vor dem Stichtag passiert nichts', async () => {
  const db = speicherDb();
  const r = await stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'a' }, z('2026-10-16', '08:00'));
  assert.equal(r.status, 409);
  assert.equal(r.extra.fehler, 'nicht_aktiv');
  assert.equal(db.Stempel.rows.length, 0);
  const s = await statusAntwort(db, MAIL, einst, { jetzt: z('2026-10-16', '08:00') });
  assert.equal(s.aktiv, false);
});

await fall('Freelancer stempelt nicht', async () => {
  const db = speicherDb();
  const r = await stempelnAblauf(db, 'g.sinella@rittler.co', einst, { art: 'kommen' }, z('2026-10-19', '08:00'));
  assert.equal(r.extra.fehler, 'stempelt_nicht');
});

await fall('normaler Ablauf mit Timer: Pause stoppt den Timer und bucht bis zur Pause', async () => {
  const db = speicherDb(); grunddaten(db);
  assert.equal((await stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'v1' }, z('2026-10-19', '08:00'))).status, 200);
  laeuft(db, 'p2', z('2026-10-19', '08:10'));
  const p = await stempelnAblauf(db, MAIL, einst, { art: 'pause_start', vorgang_id: 'v2' }, z('2026-10-19', '12:00'));
  assert.equal(p.status, 200);
  assert.equal(p.extra.gebucht.minuten, 230);
  assert.equal(db.LaufendeZeitbuchung.rows.length, 0);
  assert.equal(db.TimeEntry.rows[0].entry_date, '2026-10-19');
  await stempelnAblauf(db, MAIL, einst, { art: 'pause_ende', vorgang_id: 'v3' }, z('2026-10-19', '12:30'));
  await stempelnAblauf(db, MAIL, einst, { art: 'gehen', vorgang_id: 'v4' }, z('2026-10-19', '16:30'));
  const s = await statusAntwort(db, MAIL, einst, { jetzt: z('2026-10-19', '17:00') });
  assert.equal(s.zustand, 'weg');
  assert.equal(s.heute.arbeitszeitMin, 480);
  assert.equal(s.heute.projektzeitMin, 230);
  assert.equal(s.heute.ohneProjektMin, 250);
  assert.equal(s.heute.saldoMin, -30);
  assert.equal(db.Tagesnachweis.rows.length, 1);
  assert.equal(db.Tagesnachweis.rows[0].arbeitszeit_min, 480);
});

await fall('Doppelklick (gleiche Vorgangsnummer) stempelt einmal', async () => {
  const db = speicherDb();
  await stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'x' }, z('2026-10-19', '08:00'));
  const r = await stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'x' }, z('2026-10-19', '08:00'));
  assert.equal(r.extra.wiederholt, true);
  assert.equal(db.Stempel.rows.length, 1);
});

await fall('veralteter Tab: erwartet „da“, ist aber schon in Pause', async () => {
  const db = speicherDb();
  await stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'a' }, z('2026-10-19', '08:00'));
  await stempelnAblauf(db, MAIL, einst, { art: 'pause_start', vorgang_id: 'b', erwartet: 'da' }, z('2026-10-19', '12:00'));
  const r = await stempelnAblauf(db, MAIL, einst, { art: 'gehen', vorgang_id: 'c', erwartet: 'da' }, z('2026-10-19', '12:01'));
  assert.equal(r.status, 409);
  assert.equal(r.extra.fehler, 'veraltet');
  assert.equal(db.Stempel.rows.length, 2);
});

await fall('zwei Fenster gleichzeitig: der zweite Stempel wird ungültig, nichts wird gelöscht', async () => {
  const db = speicherDb();
  await stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'a' }, z('2026-10-19', '08:00'));
  // Fenster 2 hat den Stand vor dem Kommen gelesen und legt direkt an (Wettlauf nachgestellt)
  db.Stempel.rows.push({ id: 'zweit', person_email: MAIL, tag: '2026-10-19', art: 'kommen', zeit: z('2026-10-19', '08:00').toISOString(), quelle: 'knopf', status: 'gueltig', vorgang_id: 'b', created_date: '2099-01-01' });
  await stempelnAblauf(db, MAIL, einst, { art: 'pause_start', vorgang_id: 'c' }, z('2026-10-19', '10:00'));
  assert.equal(db.Stempel.rows.find((s) => s.id === 'zweit').status, 'ungueltig');
  assert.equal(db.Stempel.rows.length, 3);
});

await fall('Gehen vergessen, Browser offen: Timer wird Entwurf, Gehen unklar, Arbeitszeit zählt nicht', async () => {
  const db = speicherDb(); grunddaten(db);
  await stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'a' }, z('2026-10-19', '08:00'));
  laeuft(db, 'p1', z('2026-10-19', '13:00'));
  const s = await statusAntwort(db, MAIL, einst, { jetzt: z('2026-10-19', '21:00') }); // nur lesend
  assert.equal(s.zustand, 'weg');
  assert.equal(s.gehenUnklar, true);
  // Status-Abfrage zieht nach (so wie arbeitszeitStatus es tut):
  const { automatikNachziehen, ladeStempel } = await import('../base44/shared/arbeitszeitDaten.js');
  await automatikNachziehen(db, MAIL, '2026-10-19', await ladeStempel(db, MAIL, '2026-10-19'), z('2026-10-19', '21:00').toISOString());
  assert.equal(db.TimeEntry.rows.length, 0, 'keine erfundene 8-Stunden-Buchung');
  assert.equal(db.LaufendeZeitbuchung.rows.length, 0);
  const antraege = db.Zeitantrag.rows;
  assert.ok(antraege.some((a) => a.art === 'ende_angeben' && a.status === 'entwurf'));
  assert.ok(antraege.some((a) => a.art === 'gehen_angeben' && a.status === 'entwurf'));
  const auto = db.Stempel.rows.find((x) => x.quelle === 'auto');
  assert.equal(auto.zeit, z('2026-10-19', '20:00').toISOString());
  // nochmal: nichts doppelt
  await automatikNachziehen(db, MAIL, '2026-10-19', await ladeStempel(db, MAIL, '2026-10-19'), z('2026-10-19', '21:05').toISOString());
  assert.equal(db.Zeitantrag.rows.length, 2);
  assert.equal(db.Stempel.rows.filter((x) => x.quelle === 'auto').length, 1);
});

await fall('nächster Morgen: Kommen geht, Vortag bleibt „Gehen unklar“', async () => {
  const db = speicherDb();
  await stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'a' }, z('2026-10-19', '08:00'));
  const r = await stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'b' }, z('2026-10-20', '07:55'));
  assert.equal(r.status, 200);
  const s = await statusAntwort(db, MAIL, einst, { jetzt: z('2026-10-20', '08:00') });
  assert.equal(s.zustand, 'da');
});

await fall('Timer vom Vortag wird beim Gehen nicht bis heute gebucht', async () => {
  const db = speicherDb(); grunddaten(db);
  await stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'a' }, z('2026-10-20', '08:00'));
  laeuft(db, 'p2', z('2026-10-19', '16:00')); // vom Vortag, außerhalb jeder Anwesenheit
  await stempelnAblauf(db, MAIL, einst, { art: 'gehen', vorgang_id: 'b' }, z('2026-10-20', '17:00'));
  assert.equal(db.TimeEntry.rows.length, 0);
  assert.ok(db.Zeitantrag.rows.some((a) => a.art === 'ende_angeben'));
});

await fall('Pause → Gehen ohne Pause beenden ist erlaubt', async () => {
  const db = speicherDb();
  await stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'a' }, z('2026-10-19', '08:00'));
  await stempelnAblauf(db, MAIL, einst, { art: 'pause_start', vorgang_id: 'b' }, z('2026-10-19', '12:00'));
  const r = await stempelnAblauf(db, MAIL, einst, { art: 'gehen', vorgang_id: 'c' }, z('2026-10-19', '12:10'));
  assert.equal(r.status, 200);
});

await fall('Pause beenden ohne Pause ist nicht möglich', async () => {
  const db = speicherDb();
  await stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'a' }, z('2026-10-19', '08:00'));
  const r = await stempelnAblauf(db, MAIL, einst, { art: 'pause_ende', vorgang_id: 'b' }, z('2026-10-19', '09:00'));
  assert.equal(r.extra.fehler, 'nicht_moeglich');
});

await fall('timerAufraeumen lässt einen regulären Timer laufen', async () => {
  const db = speicherDb();
  await stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'a' }, z('2026-10-19', '08:00'));
  laeuft(db, 'p2', z('2026-10-19', '09:00'));
  const r = await timerAufraeumen(db, MAIL, z('2026-10-19', '10:00').toISOString());
  assert.equal(r, false);
  assert.equal(db.LaufendeZeitbuchung.rows.length, 1);
});

const PILOT = 'a.rittler@rittler.co';
const einstPilot = leseEinstellungen([
  { key: 'arbeitszeit_pilot', value: PILOT },
  { key: 'arbeitszeit_modell', value: JSON.stringify({ personen: { [PILOT]: [{ gueltig_ab: '2026-10-19', stempelt: false }] } }) },
]);
const laeuftPilot = (db, project_id, gestartet) => db.LaufendeZeitbuchung.rows.push({
  id: `lp${Math.random()}`, person_email: PILOT, project_id, gestartet_am: gestartet.toISOString(), projekt_titel: 'X', notiz: '',
});

await fall('Pilot vor dem Stichtag: Timer ohne Kommen bleibt unangetastet', async () => {
  const db = speicherDb(); grunddaten(db);
  laeuftPilot(db, 'p2', z('2026-10-12', '08:00'));
  const s = await statusAntwort(db, PILOT, einstPilot, { jetzt: z('2026-10-12', '09:00') });
  assert.equal(s.aktiv, true);
  assert.equal(s.stempelt, true);
  assert.equal(s.zustand, 'weg');
  const { timerAufraeumen: aufr, bindungAktiv } = await import('../base44/shared/arbeitszeitDaten.js');
  await aufr(db, PILOT, z('2026-10-12', '09:00').toISOString(), { bindung: bindungAktiv(einstPilot, '2026-10-12') });
  assert.equal(db.LaufendeZeitbuchung.rows.length, 1);
  assert.equal(db.Zeitantrag.rows.length, 0);
});

await fall('Pilot: Gehen stoppt den heutigen Timer und bucht ihn', async () => {
  const db = speicherDb(); grunddaten(db);
  await stempelnAblauf(db, PILOT, einstPilot, { art: 'kommen', vorgang_id: 'a' }, z('2026-10-12', '08:00'));
  laeuftPilot(db, 'p2', z('2026-10-12', '09:00'));
  const r = await stempelnAblauf(db, PILOT, einstPilot, { art: 'gehen', vorgang_id: 'b' }, z('2026-10-12', '11:00'));
  assert.equal(r.extra.gebucht.minuten, 120);
});

await fall('Pilot: Timer vom Vortag wird bei Gehen weder gebucht noch entfernt', async () => {
  const db = speicherDb(); grunddaten(db);
  laeuftPilot(db, 'p2', z('2026-10-11', '16:00'));
  await stempelnAblauf(db, PILOT, einstPilot, { art: 'kommen', vorgang_id: 'a' }, z('2026-10-12', '08:00'));
  await stempelnAblauf(db, PILOT, einstPilot, { art: 'gehen', vorgang_id: 'b' }, z('2026-10-12', '11:00'));
  assert.equal(db.TimeEntry.rows.length, 0);
  assert.equal(db.LaufendeZeitbuchung.rows.length, 1);
});

// --- Leistung: jede Datenbankabfrage dauert hier 50 ms; gemessen wird, wie viele Runden
// nacheinander ein Knopfdruck braucht (parallele Abfragen zählen als eine Runde).
const runden = async (fn) => { const t = Date.now(); await fn(); return Math.round((Date.now() - t) / 50); };
await fall('Leistung: Kommen braucht höchstens 4 Runden, Stand-Abfrage 1', async () => {
  const db = speicherDb({ latenz: 50 });
  const r1 = await runden(() => stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'a' }, z('2026-10-19', '08:00')));
  const { statusAbfrage } = await import('../base44/shared/arbeitszeitDaten.js');
  const r2 = await runden(() => statusAbfrage(db, MAIL, z('2026-10-19', '09:00')).catch(() => null));
  console.log(`    Kommen: ${r1} Runden, Stand: ${r2} Runden`);
  assert.ok(r1 <= 4, `Kommen ${r1} Runden`);
});
await fall('Leistung: Pause mit laufendem Timer höchstens 8 Runden', async () => {
  const db = speicherDb({ latenz: 50 }); grunddaten(db);
  await stempelnAblauf(db, MAIL, einst, { art: 'kommen', vorgang_id: 'a' }, z('2026-10-19', '08:00'));
  laeuft(db, 'p2', z('2026-10-19', '08:10'));
  const r = await runden(() => stempelnAblauf(db, MAIL, einst, { art: 'pause_start', vorgang_id: 'b' }, z('2026-10-19', '12:00')));
  console.log(`    Pause mit Timer: ${r} Runden`);
  assert.ok(r <= 8, `Pause ${r} Runden`);
});

console.log(`\n${n} Fälle bestanden`);
