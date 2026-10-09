// Prüfskript für Anträge und die Aufzeichnungsseite. Ausführen: node tests/arbeitszeitAntraege.test.mjs
import assert from 'node:assert/strict';
import { wienZeitpunkt } from '../base44/shared/arbeitszeitKern.js';
import { stempelnAblauf, automatikNachziehen, ladeStempel } from '../base44/shared/arbeitszeitDaten.js';
import { antragStellen, antraegeEntscheiden, antragZurueckziehen } from '../base44/shared/arbeitszeitAntraege.js';
import { monatsAuskunft } from '../base44/shared/arbeitszeitMonat.js';

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
function speicherDb() {
  let n = 0;
  const tabellen = {};
  const tabelle = (name) => {
    tabellen[name] = tabellen[name] || [];
    const rows = tabellen[name];
    return {
      rows,
      async filter(q, sort, limit = 50) {
        let r = rows.filter((x) => passt(x, q));
        if (sort) {
          const ab = sort.startsWith('-'); const f = ab ? sort.slice(1) : sort;
          r = r.slice().sort((a, b) => String(a[f] ?? '').localeCompare(String(b[f] ?? '')) * (ab ? -1 : 1));
        }
        return r.slice(0, limit).map((x) => ({ ...x }));
      },
      async get(id) { const x = rows.find((r) => r.id === id); if (!x) throw new Error('not found'); return { ...x }; },
      async create(d) { const x = { ...d, id: `${name}${++n}`, created_date: new Date(Date.UTC(2026, 0, 1) + n).toISOString() }; rows.push(x); return { ...x }; },
      async update(id, d) { const x = rows.find((r) => r.id === id); Object.assign(x, d); return { ...x }; },
      async delete(id) { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); },
    };
  };
  const db = new Proxy({}, { get: (_, name) => tabelle(name) });
  db.Setting.rows.push(
    { key: 'arbeitszeit_neu_ab', value: '2026-10-19' },
    { key: 'arbeitszeit_modell', value: JSON.stringify({ personen: { [MAIL]: [{ gueltig_ab: '2026-10-19', stempelt: true, soll_min: { mo: 510, di: 510, mi: 510, do: 510, fr: 270 } }] } }) },
  );
  db.Project.rows.push({ id: 'p1', title: 'Regie Kunde', abrechnungsmodell: 'aufwand', client_id: 'c1', stundensatz: 120 });
  db.Client.rows.push({ id: 'c1', name: 'Kunde A' });
  return db;
}

const MAIL = 'c.rieder@rittler.co';
const ALFONS = 'a.rittler@rittler.co';
const z = (tag, uhr) => wienZeitpunkt(tag, uhr);
const zi = (tag, uhr) => z(tag, uhr).toISOString();
const TAG = '2026-10-19';
let n = 0;
const fall = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`); };
const stempeln = (db, art, uhr, tag = TAG) => stempelnAblauf(db, MAIL, null, { art, vorgang_id: `${art}${uhr}${tag}` }, z(tag, uhr));
const laeuft = (db, uhr) => db.LaufendeZeitbuchung.rows.push({ id: `l${uhr}`, person_email: MAIL, project_id: 'p1', gestartet_am: zi(TAG, uhr), projekt_titel: 'Regie Kunde', notiz: 'Abstimmung mit Kunde' });

await fall('Gehen vergessen: Gehen angeben → genehmigt → Arbeitszeit zählt, Timer-Ende → Buchung', async () => {
  const db = speicherDb();
  await stempeln(db, 'kommen', '08:00');
  laeuft(db, '13:00');
  await automatikNachziehen(db, MAIL, TAG, await ladeStempel(db, MAIL, TAG), zi(TAG, '21:00'));
  const gehenE = db.Zeitantrag.rows.find((a) => a.art === 'gehen_angeben');
  const endeE = db.Zeitantrag.rows.find((a) => a.art === 'ende_angeben');
  // Person füllt beide Entwürfe aus
  const g = await antragStellen(db, MAIL, { antrag_id: gehenE.id, nachher: { zeit: zi(TAG, '17:00') }, grund: 'Vergessen auszustempeln' }, z(TAG, '21:05'));
  assert.equal(g.antrag.status, 'offen');
  const e = await antragStellen(db, MAIL, { antrag_id: endeE.id, nachher: { bis: zi(TAG, '16:30') }, grund: 'Timer vergessen zu stoppen' }, z(TAG, '21:05'));
  assert.equal(e.antrag.status, 'offen');
  // Offene Anträge zählen nirgends
  assert.equal(db.TimeEntry.rows.length, 0);
  // Ein neuer Timer läuft inzwischen am nächsten Tag — darf beim Genehmigen nicht verschwinden
  db.LaufendeZeitbuchung.rows.push({ id: 'lneu', person_email: MAIL, project_id: 'p1', gestartet_am: zi('2026-10-20', '08:30') });
  const r = await antraegeEntscheiden(db, ALFONS, { ids: [e.antrag.id, g.antrag.id], entscheidung: 'genehmigt' }, z('2026-10-20', '09:00'));
  assert.deepEqual(r.ergebnis.map((x) => x.status), ['genehmigt', 'genehmigt']);
  assert.equal(db.TimeEntry.rows.length, 1);
  assert.equal(db.TimeEntry.rows[0].duration_minutes, 210);
  assert.equal(db.LaufendeZeitbuchung.rows.length, 1, 'laufender Timer bleibt');
  const nw = db.Tagesnachweis.rows.find((x) => x.tag === TAG);
  assert.equal(nw.arbeitszeit_min, 540);
  assert.equal(nw.projektzeit_min, 210);
  assert.ok(!nw.hinweise.includes('gehen_unklar'));
  assert.equal(db.Stempel.rows.find((s) => s.quelle === 'auto').status, 'storniert');
});

await fall('Buchung kürzen: genehmigt, protokolliert, Dauer neu', async () => {
  const db = speicherDb();
  await stempeln(db, 'kommen', '08:00');
  laeuft(db, '09:00');
  await stempeln(db, 'gehen', '12:00');
  const b = db.TimeEntry.rows[0];
  const a = await antragStellen(db, MAIL, { ziel: 'buchung', art: 'aendern', ziel_id: b.id, tag: TAG, nachher: { started_at: b.started_at, ended_at: zi(TAG, '11:00') }, grund: 'Timer zu spät gestoppt' }, z(TAG, '13:00'));
  assert.ok(!a.fehler, a.fehler);
  assert.equal(db.TimeEntry.rows[0].duration_minutes, 180, 'vor Genehmigung unverändert');
  await antraegeEntscheiden(db, ALFONS, { ids: [a.antrag.id], entscheidung: 'genehmigt' }, z(TAG, '14:00'));
  assert.equal(db.TimeEntry.rows[0].duration_minutes, 120);
  assert.equal(db.TimeEntry.rows[0].source, 'korrigiert');
  assert.equal(db.AuditLog.rows.length, 1);
});

await fall('Abgelehnt: nichts ändert sich, Begründung Pflicht', async () => {
  const db = speicherDb();
  await stempeln(db, 'kommen', '08:00');
  const k = db.Stempel.rows[0];
  const a = await antragStellen(db, MAIL, { ziel: 'stempel', art: 'aendern', ziel_id: k.id, tag: TAG, nachher: { zeit: zi(TAG, '07:00') }, grund: 'Früher da gewesen' }, z(TAG, '09:00'));
  const ohne = await antraegeEntscheiden(db, ALFONS, { ids: [a.antrag.id], entscheidung: 'abgelehnt' }, z(TAG, '10:00'));
  assert.ok(ohne.fehler);
  await antraegeEntscheiden(db, ALFONS, { ids: [a.antrag.id], entscheidung: 'abgelehnt', kommentar: 'Tool erst 07:55 geöffnet' }, z(TAG, '10:00'));
  assert.equal(db.Stempel.rows[0].zeit, zi(TAG, '08:00'));
  assert.equal(db.Zeitantrag.rows[0].status, 'abgelehnt');
});

await fall('Prüfungen: Zukunft, falscher Tag, Reihenfolge, außerhalb Anwesenheit, doppelt, abgerechnet', async () => {
  const db = speicherDb();
  await stempeln(db, 'kommen', '08:00');
  laeuft(db, '09:00');
  await stempeln(db, 'gehen', '12:00');
  const [k, g] = db.Stempel.rows;
  const b = db.TimeEntry.rows[0];
  const t = z(TAG, '13:00');
  assert.ok((await antragStellen(db, MAIL, { ziel: 'stempel', art: 'aendern', ziel_id: g.id, tag: TAG, nachher: { zeit: zi(TAG, '15:00') }, grund: 'länger da' }, t)).fehler, 'Zukunft');
  assert.ok((await antragStellen(db, MAIL, { ziel: 'stempel', art: 'aendern', ziel_id: k.id, tag: TAG, nachher: { zeit: zi(TAG, '12:30') }, grund: 'falsch' }, t)).fehler, 'Kommen nach Gehen');
  assert.ok((await antragStellen(db, MAIL, { ziel: 'buchung', art: 'aendern', ziel_id: b.id, tag: TAG, nachher: { started_at: zi(TAG, '07:00'), ended_at: zi(TAG, '10:00') }, grund: 'früher begonnen' }, t)).fehler, 'vor dem Kommen');
  assert.ok((await antragStellen(db, MAIL, { ziel: 'stempel', art: 'aendern', ziel_id: k.id, tag: TAG, nachher: { zeit: zi(TAG, '07:30') }, grund: 'x' }, t)).fehler, 'Grund zu kurz');
  const ok = await antragStellen(db, MAIL, { ziel: 'stempel', art: 'aendern', ziel_id: k.id, tag: TAG, nachher: { zeit: zi(TAG, '07:30') }, grund: 'Früher da gewesen' }, t);
  assert.ok(!ok.fehler);
  assert.ok((await antragStellen(db, MAIL, { ziel: 'stempel', art: 'loeschen', ziel_id: k.id, tag: TAG, grund: 'doch nicht da' }, t)).fehler, 'schon offen');
  db.TimeEntry.rows[0].abrechnungsstatus = 'abgerechnet';
  assert.ok((await antragStellen(db, MAIL, { ziel: 'buchung', art: 'loeschen', ziel_id: b.id, tag: TAG, grund: 'falsch gebucht' }, t)).fehler, 'abgerechnet');
  assert.ok((await antragStellen(db, MAIL, { ziel: 'buchung', art: 'nachtragen', tag: TAG, nachher: {}, grund: 'nachtragen' }, t)).fehler, 'kein Nachtragen von Projektzeit');
});

await fall('Fehlendes Kommen per Antrag; Wiederholung mit gleicher Vorgangsnummer legt nichts doppelt an', async () => {
  const db = speicherDb();
  const e = { ziel: 'stempel', art: 'nachtragen', tag: TAG, nachher: { art: 'kommen', zeit: zi(TAG, '08:00') }, grund: 'Kommen vergessen', vorgang_id: 'v1' };
  const a1 = await antragStellen(db, MAIL, e, z(TAG, '10:00'));
  const a2 = await antragStellen(db, MAIL, e, z(TAG, '10:00'));
  assert.equal(a2.wiederholt, true);
  assert.equal(db.Zeitantrag.rows.length, 1);
  await antraegeEntscheiden(db, ALFONS, { ids: [a1.antrag.id, a1.antrag.id], entscheidung: 'genehmigt' }, z(TAG, '10:30'));
  assert.equal(db.Stempel.rows.length, 1);
  assert.equal(db.Stempel.rows[0].quelle, 'antrag');
});

await fall('Nur Genehmiger entscheiden; Zurückziehen nur offen und nur eigene', async () => {
  const db = speicherDb();
  await stempeln(db, 'kommen', '08:00');
  const k = db.Stempel.rows[0];
  const a = await antragStellen(db, MAIL, { ziel: 'stempel', art: 'aendern', ziel_id: k.id, tag: TAG, nachher: { zeit: zi(TAG, '07:45') }, grund: 'Früher da gewesen' }, z(TAG, '09:00'));
  assert.ok((await antraegeEntscheiden(db, MAIL, { ids: [a.antrag.id], entscheidung: 'genehmigt' })).fehler);
  assert.ok((await antragZurueckziehen(db, 'j.soliman@rittler.co', a.antrag.id)).fehler);
  assert.equal((await antragZurueckziehen(db, MAIL, a.antrag.id)).antrag.status, 'zurueckgezogen');
});

await fall('Aufzeichnungsseite: Monat mit Tagen, Summen, Anträgen; Fremde sehen nur Genehmiger', async () => {
  const db = speicherDb();
  await stempeln(db, 'kommen', '08:00');
  laeuft(db, '08:30');
  await stempeln(db, 'pause_start', '12:00');
  await stempeln(db, 'pause_ende', '12:30');
  await stempeln(db, 'gehen', '17:00');
  const m = await monatsAuskunft(db, MAIL, { monat: '2026-10' }, z('2026-10-20', '08:00'));
  const t = m.tage.find((x) => x.tag === TAG);
  assert.equal(t.arbeitszeitMin, 510);
  assert.equal(t.projektzeitMin, 210);
  assert.equal(t.buchungen[0].projekt, 'Regie Kunde');
  assert.equal(t.buchungen[0].kunde, 'Kunde A');
  assert.equal(m.tage[0].tag, '2026-10-20', 'neuester Tag oben');
  assert.equal(m.summe.arbeitszeitMin, 510);
  const fremd = await monatsAuskunft(db, 'j.soliman@rittler.co', { monat: '2026-10', person_email: MAIL }, z('2026-10-20', '08:00'));
  assert.equal(fremd.person_email, 'j.soliman@rittler.co');
  const chef = await monatsAuskunft(db, ALFONS, { monat: '2026-10', person_email: MAIL }, z('2026-10-20', '08:00'));
  assert.equal(chef.person_email, MAIL);
});

console.log(`\n${n} Fälle bestanden`);
