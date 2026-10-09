// Arbeitszeit — reiner Rechenkern (ohne Datenzugriff), gemeinsam für alle Funktionen
// und das Prüfskript (base44/shared/arbeitszeitKern.test.mjs).
// Konzept: claude/Konzept-Arbeitszeit-und-Projektzeit-2026-10-09.md (Fassung 2),
// Umsetzungsplan: claude/Umsetzungsplan-Arbeitszeit-2026-10-09.md.
//
// Grundsätze:
// - Der Server läuft in UTC. Jeder Kalendertag wird in Europe/Vienna bestimmt, nie mit festem Versatz
//   (Zeitumstellung!).
// - Der Zustand (weg/da/pause) ergibt sich IMMER aus den gültigen Stempeln eines Tages. Es gibt
//   keinen gespeicherten Zustand, der davon abweichen könnte.
// - Ein Stempel, der nicht zum Zustand davor passt (Doppelklick, zwei Tabs), zählt nicht.
// - „Gehen unklar“ wird beim Lesen berechnet; die Automatik schreibt es nur fest.

export const TZ = 'Europe/Vienna';
export const MAX_ANWESENHEIT_MIN = 12 * 60;
export const AUTO_GEHEN_UHR = 22 * 60; // 22:00
export const TAGESENDE_UHR = 23 * 60 + 59; // 23:59
export const PAUSE_HINWEIS_AB_MIN = 6 * 60;
export const PAUSE_MINDEST_MIN = 30;

const zwei = (n) => String(n).padStart(2, '0');

const teileFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

// Wiener Ortszeit-Bestandteile eines Zeitpunkts
export function wienTeile(zeit) {
  const d = zeit instanceof Date ? zeit : new Date(zeit);
  const t = {};
  for (const p of teileFormat.formatToParts(d)) if (p.type !== 'literal') t[p.type] = Number(p.value);
  return { jahr: t.year, monat: t.month, tag: t.day, stunde: t.hour, minute: t.minute, sekunde: t.second };
}

export const wienTag = (zeit) => {
  const t = wienTeile(zeit);
  return `${t.jahr}-${zwei(t.monat)}-${zwei(t.tag)}`;
};

export const wienMinute = (zeit) => {
  const t = wienTeile(zeit);
  return t.stunde * 60 + t.minute;
};

export const wienUhr = (zeit) => {
  const t = wienTeile(zeit);
  return `${zwei(t.stunde)}:${zwei(t.minute)}`;
};

// Zeitpunkt (Date) für einen Wiener Tag und eine Uhrzeit „HH:MM“ — auch an Tagen der Zeitumstellung.
// Eine Uhrzeit, die es wegen der Umstellung nicht gibt (02:30 im März), wird auf die nächste gültige geschoben.
export function wienZeitpunkt(tag, uhr) {
  const [y, m, d] = tag.split('-').map(Number);
  const [h, mi] = String(uhr).split(':').map(Number);
  const wunsch = Date.UTC(y, m - 1, d, h, mi || 0, 0);
  let kandidat = wunsch;
  for (let i = 0; i < 3; i += 1) {
    const t = wienTeile(new Date(kandidat));
    const alsUtc = Date.UTC(t.jahr, t.monat - 1, t.tag, t.stunde, t.minute, t.sekunde);
    const diff = alsUtc - wunsch;
    if (diff === 0) break;
    kandidat -= diff;
  }
  return new Date(kandidat);
}

export function plusTage(tag, n) {
  const [y, m, d] = tag.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${zwei(dt.getUTCMonth() + 1)}-${zwei(dt.getUTCDate())}`;
}

const WT = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
export function wochentagKey(tag) {
  const [y, m, d] = tag.split('-').map(Number);
  return WT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// Gesetzliche Feiertage Österreich — dieselbe Liste wie src/lib/arbeitszeit/kalender.js
export function ostersonntag(jahr) {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tg = ((h + l - 7 * m + 114) % 31) + 1;
  return `${jahr}-${zwei(monat)}-${zwei(tg)}`;
}
const feiertagCache = {};
export function feiertageAT(jahr) {
  if (feiertagCache[jahr]) return feiertagCache[jahr];
  const o = ostersonntag(jahr);
  feiertagCache[jahr] = {
    [`${jahr}-01-01`]: 'Neujahr', [`${jahr}-01-06`]: 'Heilige Drei Könige', [plusTage(o, 1)]: 'Ostermontag',
    [`${jahr}-05-01`]: 'Staatsfeiertag', [plusTage(o, 39)]: 'Christi Himmelfahrt', [plusTage(o, 50)]: 'Pfingstmontag',
    [plusTage(o, 60)]: 'Fronleichnam', [`${jahr}-08-15`]: 'Mariä Himmelfahrt', [`${jahr}-10-26`]: 'Nationalfeiertag',
    [`${jahr}-11-01`]: 'Allerheiligen', [`${jahr}-12-08`]: 'Mariä Empfängnis', [`${jahr}-12-25`]: 'Christtag',
    [`${jahr}-12-26`]: 'Stefanitag',
  };
  return feiertagCache[jahr];
}
export const feiertag = (tag) => feiertageAT(Number(tag.slice(0, 4)))[tag] || null;

// ---------------------------------------------------------------------------
// Einstellungen und Modus je Person

const istDatum = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

export function leseEinstellungen(settingRows = []) {
  const wert = (k) => settingRows.find((s) => s.key === k)?.value;
  let modell = { personen: {} };
  try {
    const roh = JSON.parse(wert('arbeitszeit_modell') || '{}');
    if (roh && typeof roh === 'object' && roh.personen) modell = roh;
  } catch { /* kaputtes Modell = keine Personen, nie ein Absturz */ }
  const neuAb = String(wert('arbeitszeit_neu_ab') || '').slice(0, 10);
  const liste = (k) => String(wert(k) || '')
    .split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const pilot = liste('arbeitszeit_pilot');
  // Wer Anträge entscheiden darf — Standard der Inhaber; eine Vertretung wird hier ergänzt.
  const genehmiger = liste('arbeitszeit_genehmiger');
  return { neuAb: istDatum(neuAb) ? neuAb : null, pilot, modell, genehmiger: genehmiger.length ? genehmiger : [INHABER_EMAIL] };
}

export const INHABER_EMAIL = 'a.rittler@rittler.co';
export const EINSTELLUNG_KEYS = ['arbeitszeit_neu_ab', 'arbeitszeit_pilot', 'arbeitszeit_modell', 'arbeitszeit_genehmiger'];
export const darfGenehmigen = (email, einst) => einst.genehmiger.includes(String(email || '').toLowerCase());

// Modus einer Person an einem Tag:
//   neu      — neue Erfassung aktiv (Pilot oder ab Stichtag)
//   stempelt — Kommen/Pause/Gehen wird erfasst (Pilot vor dem Stichtag stempelt immer, zum Testen)
//   sollMin  — Soll-Minuten des Tages laut Modell (null = kein Soll hinterlegt)
export function modusFuer(email, tag, einst) {
  const mail = String(email || '').toLowerCase();
  const imPilot = einst.pilot.includes(mail);
  const abStichtag = !!einst.neuAb && tag >= einst.neuAb;
  const neu = imPilot || abStichtag;
  const eintraege = (einst.modell.personen?.[mail] || [])
    .filter((e) => istDatum(e.gueltig_ab) && e.gueltig_ab <= tag)
    .sort((a, b) => b.gueltig_ab.localeCompare(a.gueltig_ab));
  const gilt = eintraege[0] || null;
  const pilotTest = imPilot && !abStichtag;
  const stempelt = pilotTest ? true : gilt ? gilt.stempelt !== false : true;
  const sollWert = gilt?.soll_min?.[wochentagKey(tag)];
  const sollMin = Number.isFinite(Number(sollWert)) && sollWert !== null ? Number(sollWert) : null;
  return { neu, stempelt, sollMin, imPilot, modellFehlt: !gilt };
}

// ---------------------------------------------------------------------------
// Zustandsmaschine

export const UEBERGAENGE = {
  weg: { kommen: 'da' },
  da: { pause_start: 'pause', gehen: 'weg' },
  pause: { pause_ende: 'da', gehen: 'weg' },
};

export const erlaubt = (zustand, art) => !!UEBERGAENGE[zustand]?.[art];

// Reihenfolge: Zeitpunkt, dann Anlagezeitpunkt, dann Id — überall gleich, damit jede
// Funktion denselben „ersten“ Stempel sieht.
export const stempelOrdnung = (a, b) => (String(a.zeit).localeCompare(String(b.zeit)))
  || String(a.created_date || '').localeCompare(String(b.created_date || ''))
  || String(a.id || '').localeCompare(String(b.id || ''));

// Spielt die gültigen Stempel eines Tages ab.
// Ergebnis: zustand, seit (Zeit des letzten wirksamen Stempels), wirksam (Liste), konflikte (Ids,
// die nicht zum Zustand passten), letztesKommen.
export function spieleAb(stempel = []) {
  const gueltig = stempel.filter((s) => (s.status || 'gueltig') === 'gueltig').slice().sort(stempelOrdnung);
  let zustand = 'weg';
  let seit = null;
  let letztesKommen = null;
  const wirksam = [];
  const konflikte = [];
  const vorgaenge = new Set();
  for (const s of gueltig) {
    if (s.vorgang_id && vorgaenge.has(s.vorgang_id)) { konflikte.push(s.id); continue; }
    if (!erlaubt(zustand, s.art)) { konflikte.push(s.id); continue; }
    if (s.vorgang_id) vorgaenge.add(s.vorgang_id);
    zustand = UEBERGAENGE[zustand][s.art];
    seit = s.zeit;
    if (s.art === 'kommen') letztesKommen = s.zeit;
    wirksam.push(s);
  }
  return { zustand, seit, wirksam, konflikte, letztesKommen };
}

// Bis wann eine Anwesenheit ohne Gehen-Stempel spätestens dauert:
// 12 h nach Kommen, höchstens bis 22:00 — wer erst ab 22:00 kommt, höchstens bis 23:59 desselben Tages.
export function autoGehenAm(kommenIso) {
  const kommen = new Date(kommenIso);
  const tag = wienTag(kommen);
  const grenzeUhr = wienMinute(kommen) < AUTO_GEHEN_UHR ? '22:00' : '23:59';
  const grenze = wienZeitpunkt(tag, grenzeUhr);
  const zwoelf = new Date(kommen.getTime() + MAX_ANWESENHEIT_MIN * 60000);
  return (zwoelf < grenze ? zwoelf : grenze).toISOString();
}

// Zustand eines Tages zum Zeitpunkt „jetzt“ inkl. berechnetem „Gehen unklar“.
export function zustandJetzt(stempel, jetztIso) {
  const ab = spieleAb(stempel);
  const res = { ...ab, gehenUnklar: false, autoGehenFaellig: null };
  if (ab.zustand !== 'weg' && ab.letztesKommen) {
    const faellig = autoGehenAm(ab.letztesKommen);
    res.autoGehenFaellig = faellig;
    if (String(jetztIso) >= faellig) {
      res.zustand = 'weg';
      res.gehenUnklar = true;
      res.seit = faellig;
    }
  }
  // Ein Tag, an dem schon einmal automatisch ausgestempelt wurde und der nicht per Antrag geklärt ist
  if (ab.wirksam.some((s) => s.art === 'gehen' && s.quelle === 'auto')) res.gehenUnklar = true;
  return res;
}

// ---------------------------------------------------------------------------
// Tagesauswertung

const minZwischen = (a, b) => Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 60000));

// Anwesenheitsblöcke und Pausen aus den wirksamen Stempeln; ein offener Block endet bei `bisOffen`.
export function bloeckeUndPausen(wirksam, bisOffen) {
  const bloecke = [];
  const pausen = [];
  let block = null;
  let pause = null;
  for (const s of wirksam) {
    if (s.art === 'kommen') block = { von: s.zeit, bis: null };
    else if (s.art === 'pause_start') pause = { von: s.zeit, bis: null };
    else if (s.art === 'pause_ende' && pause) { pause.bis = s.zeit; pausen.push(pause); pause = null; }
    else if (s.art === 'gehen' && block) {
      if (pause) { pause.bis = s.zeit; pausen.push(pause); pause = null; }
      block.bis = s.zeit; bloecke.push(block); block = null;
    }
  }
  if (block) {
    const ende = bisOffen && bisOffen > block.von ? bisOffen : block.von;
    if (pause) { pausen.push({ von: pause.von, bis: ende > pause.von ? ende : pause.von, offen: true }); }
    bloecke.push({ von: block.von, bis: ende, offen: true });
  }
  return { bloecke, pausen };
}

// Projektzeit eines Tages: Buchungen der Person mit entry_date = tag (ohne Korrekturbuchungen-Altbestand).
export const projektMinuten = (buchungen = []) => buchungen
  .reduce((s, b) => s + (Number(b.duration_minutes) || 0), 0);

// Auswertung eines Tages. `jetztIso` begrenzt einen offenen Block; ist „Gehen unklar“, zählt der
// offene Block NICHT (die Arbeitszeit des Tages zählt erst nach genehmigtem Gehen).
export function werteTagAus({ tag, stempel = [], buchungen = [], jetztIso, sollMin = null, abwesend = false, offeneAntraege = 0, stempelt = true }) {
  const z = zustandJetzt(stempel, jetztIso);
  const heute = wienTag(jetztIso) === tag;
  const bisOffen = z.gehenUnklar && z.autoGehenFaellig ? z.autoGehenFaellig : jetztIso;
  const { bloecke, pausen } = bloeckeUndPausen(z.wirksam, bisOffen);
  const zaehlendeBloecke = z.gehenUnklar ? bloecke.filter((b) => !b.offen) : bloecke;
  const brutto = zaehlendeBloecke.reduce((s, b) => s + minZwischen(b.von, b.bis), 0);
  const pauseMin = pausen
    .filter((p) => zaehlendeBloecke.some((b) => p.von >= b.von && p.von <= b.bis))
    .reduce((s, p) => s + minZwischen(p.von, p.bis), 0);
  const arbeitszeitMin = stempelt ? Math.max(0, brutto - pauseMin) : null;
  const projektzeitMin = projektMinuten(buchungen);
  const soll = abwesend || feiertag(tag) ? 0 : sollMin;
  const hinweise = [];
  if (z.gehenUnklar) hinweise.push('gehen_unklar');
  if (stempelt && arbeitszeitMin > PAUSE_HINWEIS_AB_MIN && pauseMin < PAUSE_MINDEST_MIN) hinweise.push('pause_fehlt');
  if (stempelt && arbeitszeitMin !== null && projektzeitMin > arbeitszeitMin + 1) hinweise.push('projektzeit_ueber_arbeitszeit');
  const status = z.gehenUnklar ? 'gehen_unklar' : z.zustand === 'weg' ? 'abgeschlossen' : 'laeuft';
  return {
    tag,
    heute,
    zustand: z.zustand,
    seit: z.seit,
    gehenUnklar: z.gehenUnklar,
    autoGehenFaellig: z.autoGehenFaellig,
    konflikte: z.konflikte,
    kommen: z.wirksam.find((s) => s.art === 'kommen')?.zeit || null,
    gehen: [...z.wirksam].reverse().find((s) => s.art === 'gehen')?.zeit || null,
    bloecke: bloecke.map(({ von, bis }) => ({ von, bis })),
    pausen: pausen.map(({ von, bis }) => ({ von, bis })),
    arbeitszeitMin,
    pauseMin,
    projektzeitMin,
    ohneProjektMin: arbeitszeitMin === null ? null : Math.max(0, arbeitszeitMin - projektzeitMin),
    sollMin: soll,
    saldoMin: soll === null || arbeitszeitMin === null ? null : arbeitszeitMin - soll,
    status,
    hinweise,
    offeneAntraege,
  };
}

// ---------------------------------------------------------------------------
// Beschreibungspflicht — dieselbe Regel wie src/lib/zeit/beschreibungPflicht.js

const NACH_AUFWAND = ['aufwand', 'support'];
export const BESCHREIBUNG_MIN_ZEICHEN = 12;
export function beschreibungReicht(note) {
  const text = String(note || '').trim();
  if (text.length < BESCHREIBUNG_MIN_ZEICHEN) return false;
  return text.split(/\s+/).filter((w) => w.length > 1).length >= 2;
}
export function brauchtBeschreibung(eintrag, projekt) {
  if (!eintrag || eintrag.korrektur_zu) return false;
  if ((Number(eintrag.duration_minutes) || 0) <= 0) return false;
  if (eintrag.ticket_id) return false;
  if (eintrag.verrechenbar === false) return false;
  if (!projekt || !NACH_AUFWAND.includes(projekt.abrechnungsmodell)) return false;
  return !beschreibungReicht(eintrag.note);
}
