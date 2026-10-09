// Prüfskript für den Arbeitszeit-Rechenkern. Ausführen: node tests/arbeitszeitKern.test.mjs
import assert from 'node:assert/strict';
import {
  wienTag, wienUhr, wienZeitpunkt, autoGehenAm, spieleAb, zustandJetzt, werteTagAus,
  modusFuer, leseEinstellungen, wochentagKey, feiertag, beschreibungReicht,
} from '../base44/shared/arbeitszeitKern.js';

let n = 0;
const fall = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const z = (tag, uhr) => wienZeitpunkt(tag, uhr).toISOString();
let id = 0;
const st = (art, tag, uhr, extra = {}) => ({ id: `s${++id}`, art, tag, zeit: z(tag, uhr), quelle: 'knopf', status: 'gueltig', created_date: z(tag, uhr), ...extra });

// --- Zeitzone
fall('Wiener Tag vor Mitternacht UTC', () => {
  assert.equal(wienTag('2026-10-18T22:30:00Z'), '2026-10-19'); // 00:30 Sommerzeit
  assert.equal(wienTag('2026-10-18T21:30:00Z'), '2026-10-18');
});
fall('Zeitumstellung 25.10.2026: 08:00 ist vorher UTC+2, danach UTC+1', () => {
  assert.equal(z('2026-10-24', '08:00'), '2026-10-24T06:00:00.000Z');
  assert.equal(z('2026-10-26', '08:00'), '2026-10-26T07:00:00.000Z');
  assert.equal(wienUhr('2026-10-26T07:00:00Z'), '08:00');
});
fall('Zeitumstellung März: 02:30 existiert nicht und wird verschoben, nicht verdoppelt', () => {
  const t = wienZeitpunkt('2027-03-28', '02:30');
  assert.ok(['03:30', '01:30'].includes(wienUhr(t)));
});
fall('Wochentag und Feiertag', () => {
  assert.equal(wochentagKey('2026-10-19'), 'mo');
  assert.equal(wochentagKey('2026-10-23'), 'fr');
  assert.equal(feiertag('2026-10-26'), 'Nationalfeiertag');
  assert.equal(feiertag('2026-10-27'), null);
});

// --- Zustandsmaschine
fall('normaler Tag', () => {
  const s = [st('kommen', '2026-10-19', '07:52'), st('pause_start', '2026-10-19', '12:00'),
    st('pause_ende', '2026-10-19', '12:30'), st('gehen', '2026-10-19', '17:00')];
  const r = werteTagAus({ tag: '2026-10-19', stempel: s, jetztIso: z('2026-10-19', '18:00'), sollMin: 510 });
  assert.equal(r.zustand, 'weg');
  assert.equal(r.arbeitszeitMin, 9 * 60 + 8 - 30);
  assert.equal(r.pauseMin, 30);
  assert.equal(r.saldoMin, 518 - 510);
  assert.equal(r.status, 'abgeschlossen');
});
fall('Doppelklick: zweites Kommen zählt nicht', () => {
  const s = [st('kommen', '2026-10-19', '08:00'), st('kommen', '2026-10-19', '08:00')];
  const r = spieleAb(s);
  assert.equal(r.zustand, 'da');
  assert.equal(r.konflikte.length, 1);
  assert.equal(r.konflikte[0], s[1].id);
});
fall('zwei Tabs: Pause und Gehen im selben Moment — erster gewinnt, Folgestempel passt nicht', () => {
  const s = [st('kommen', '2026-10-19', '08:00'), st('pause_start', '2026-10-19', '12:00'), st('pause_start', '2026-10-19', '12:00')];
  const r = spieleAb(s);
  assert.equal(r.zustand, 'pause');
  assert.equal(r.konflikte.length, 1);
});
fall('gleiche Vorgangsnummer zweimal gespeichert: zählt einmal', () => {
  const a = st('kommen', '2026-10-19', '08:00', { vorgang_id: 'v1' });
  const b = st('gehen', '2026-10-19', '08:00', { vorgang_id: 'v1' });
  const r = spieleAb([a, b]);
  assert.equal(r.zustand, 'da');
  assert.deepEqual(r.konflikte, [b.id]);
});
fall('stornierte Stempel zählen nicht', () => {
  const s = [st('kommen', '2026-10-19', '08:00', { status: 'storniert' }), st('kommen', '2026-10-19', '08:30')];
  const r = werteTagAus({ tag: '2026-10-19', stempel: s, jetztIso: z('2026-10-19', '09:30') });
  assert.equal(r.arbeitszeitMin, 60);
});
fall('zweites Kommen am Nachmittag', () => {
  const s = [st('kommen', '2026-10-19', '08:00'), st('gehen', '2026-10-19', '12:00'),
    st('kommen', '2026-10-19', '19:00'), st('gehen', '2026-10-19', '20:30')];
  const r = werteTagAus({ tag: '2026-10-19', stempel: s, jetztIso: z('2026-10-19', '21:00') });
  assert.equal(r.arbeitszeitMin, 240 + 90);
  assert.equal(r.bloecke.length, 2);
});
fall('Gehen während der Pause beendet die Pause', () => {
  const s = [st('kommen', '2026-10-19', '08:00'), st('pause_start', '2026-10-19', '12:00'), st('gehen', '2026-10-19', '12:20')];
  const r = werteTagAus({ tag: '2026-10-19', stempel: s, jetztIso: z('2026-10-19', '15:00') });
  assert.equal(r.zustand, 'weg');
  assert.equal(r.arbeitszeitMin, 240);
  assert.equal(r.pauseMin, 20);
});

// --- vergessenes Gehen, unbedienter Browser
fall('offener Tag läuft bis jetzt', () => {
  const s = [st('kommen', '2026-10-19', '08:00')];
  const r = werteTagAus({ tag: '2026-10-19', stempel: s, jetztIso: z('2026-10-19', '10:15') });
  assert.equal(r.zustand, 'da');
  assert.equal(r.arbeitszeitMin, 135);
});
fall('Kommen 07:00: automatisch Gehen unklar ab 19:00 (12 h)', () => {
  assert.equal(autoGehenAm(z('2026-10-19', '07:00')), z('2026-10-19', '19:00'));
  const s = [st('kommen', '2026-10-19', '07:00')];
  const r = werteTagAus({ tag: '2026-10-19', stempel: s, jetztIso: z('2026-10-19', '19:01') });
  assert.equal(r.zustand, 'weg');
  assert.equal(r.gehenUnklar, true);
  assert.equal(r.arbeitszeitMin, 0); // zählt erst nach genehmigtem Gehen
  assert.equal(r.status, 'gehen_unklar');
});
fall('Kommen 14:00: automatisch um 22:00', () => {
  assert.equal(autoGehenAm(z('2026-10-19', '14:00')), z('2026-10-19', '22:00'));
});
fall('Kommen 22:30: automatisch um 23:59', () => {
  assert.equal(autoGehenAm(z('2026-10-19', '22:30')), z('2026-10-19', '23:59'));
});
fall('Browser über Nacht offen: am Folgetag beginnt der Tag bei „weg“', () => {
  const r = werteTagAus({ tag: '2026-10-20', stempel: [], jetztIso: z('2026-10-20', '08:00') });
  assert.equal(r.zustand, 'weg');
});
fall('über die Zeitumstellung: Kommen 25.10. ist Sonntag, 12 h korrekt', () => {
  assert.equal(autoGehenAm(z('2026-10-25', '08:00')), z('2026-10-25', '20:00'));
});

// --- Soll, Feiertag, Abwesenheit, Hinweise
fall('Feiertag senkt das Soll auf 0', () => {
  const r = werteTagAus({ tag: '2026-10-26', stempel: [], jetztIso: z('2026-10-27', '08:00'), sollMin: 510 });
  assert.equal(r.sollMin, 0);
});
fall('Abwesenheit senkt das Soll auf 0', () => {
  const r = werteTagAus({ tag: '2026-10-20', stempel: [], jetztIso: z('2026-10-21', '08:00'), sollMin: 510, abwesend: true });
  assert.equal(r.sollMin, 0);
});
fall('Pausenhinweis nach 6 h ohne 30 min Pause', () => {
  const s = [st('kommen', '2026-10-19', '08:00'), st('gehen', '2026-10-19', '15:00')];
  const r = werteTagAus({ tag: '2026-10-19', stempel: s, jetztIso: z('2026-10-19', '16:00') });
  assert.ok(r.hinweise.includes('pause_fehlt'));
});
fall('Projektzeit und Arbeitszeit ohne Projekt', () => {
  const s = [st('kommen', '2026-10-19', '08:00'), st('gehen', '2026-10-19', '12:00')];
  const r = werteTagAus({ tag: '2026-10-19', stempel: s, buchungen: [{ duration_minutes: 150 }], jetztIso: z('2026-10-19', '13:00') });
  assert.equal(r.projektzeitMin, 150);
  assert.equal(r.ohneProjektMin, 90);
});

// --- Modus je Person
const einst = leseEinstellungen([
  { key: 'arbeitszeit_neu_ab', value: '2026-10-19' },
  { key: 'arbeitszeit_pilot', value: 'a.rittler@rittler.co' },
  { key: 'arbeitszeit_modell', value: JSON.stringify({ personen: {
    'm.galler@rittler.co': [{ gueltig_ab: '2026-10-19', stempelt: true, soll_min: { mo: 510, di: 510, mi: 510, do: 510, fr: 0 } }],
    'a.rittler@rittler.co': [{ gueltig_ab: '2026-10-19', stempelt: false, soll_min: null }],
    'g.sinella@rittler.co': [{ gueltig_ab: '2026-10-19', stempelt: false, soll_min: null }],
  } }) },
]);
fall('vor dem Stichtag: Kollegen im alten Modus', () => {
  assert.equal(modusFuer('m.galler@rittler.co', '2026-10-16', einst).neu, false);
});
fall('vor dem Stichtag: Pilot im neuen Modus und stempelt zum Testen', () => {
  const m = modusFuer('a.rittler@rittler.co', '2026-10-12', einst);
  assert.equal(m.neu, true);
  assert.equal(m.stempelt, true);
});
fall('ab Stichtag: Alfons und Gerhard stempeln nicht, Mathias Freitag Soll 0', () => {
  assert.equal(modusFuer('a.rittler@rittler.co', '2026-10-19', einst).stempelt, false);
  assert.equal(modusFuer('g.sinella@rittler.co', '2026-10-19', einst).stempelt, false);
  assert.equal(modusFuer('m.galler@rittler.co', '2026-10-23', einst).sollMin, 0);
  assert.equal(modusFuer('M.Galler@rittler.co', '2026-10-19', einst).sollMin, 510);
});
fall('leere oder kaputte Einstellungen schalten nichts ein', () => {
  const leer = leseEinstellungen([{ key: 'arbeitszeit_modell', value: '{kaputt' }]);
  assert.equal(modusFuer('m.galler@rittler.co', '2026-12-01', leer).neu, false);
});

// --- Beschreibung
fall('Beschreibungspflicht wie bisher', () => {
  assert.equal(beschreibungReicht('Minuten'), false);
  assert.equal(beschreibungReicht('Kontaktformular repariert'), true);
});

console.log(`\n${n} Fälle bestanden`);
