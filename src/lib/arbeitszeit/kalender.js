// Kalender der Arbeitszeitauswertung: Datumsrechnung, gesetzliche Feiertage
// in Österreich und die wählbaren Zeiträume. Rein rechnend, ohne Datenzugriff.

const zwei = (n) => String(n).padStart(2, '0');
export const isoVon = (d) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
const datumVon = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const plusTage = (iso, n) => { const d = datumVon(iso); d.setDate(d.getDate() + n); return isoVon(d); };
export const wochentag = (iso) => datumVon(iso).getDay(); // 0 = Sonntag
export const istWochenende = (iso) => { const w = wochentag(iso); return w === 0 || w === 6; };

export function tageZwischen(von, bis) {
  const out = [];
  for (let t = von; t <= bis; t = plusTage(t, 1)) out.push(t);
  return out;
}

// Ostersonntag nach dem gregorianischen Algorithmus (Meeus/Jones/Butcher)
export function ostersonntag(jahr) {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return `${jahr}-${zwei(monat)}-${zwei(tag)}`;
}

const cache = {};
// Die 13 gesetzlichen Feiertage in Österreich (ohne Landesfeiertage, ohne 24./31.12.)
export function feiertageAT(jahr) {
  if (cache[jahr]) return cache[jahr];
  const ostern = ostersonntag(jahr);
  const liste = {
    [`${jahr}-01-01`]: 'Neujahr',
    [`${jahr}-01-06`]: 'Heilige Drei Könige',
    [plusTage(ostern, 1)]: 'Ostermontag',
    [`${jahr}-05-01`]: 'Staatsfeiertag',
    [plusTage(ostern, 39)]: 'Christi Himmelfahrt',
    [plusTage(ostern, 50)]: 'Pfingstmontag',
    [plusTage(ostern, 60)]: 'Fronleichnam',
    [`${jahr}-08-15`]: 'Mariä Himmelfahrt',
    [`${jahr}-10-26`]: 'Nationalfeiertag',
    [`${jahr}-11-01`]: 'Allerheiligen',
    [`${jahr}-12-08`]: 'Mariä Empfängnis',
    [`${jahr}-12-25`]: 'Christtag',
    [`${jahr}-12-26`]: 'Stefanitag',
  };
  cache[jahr] = liste;
  return liste;
}
export const feiertag = (iso) => feiertageAT(Number(iso.slice(0, 4)))[iso] || null;
export const istArbeitstag = (iso) => !istWochenende(iso) && !feiertag(iso);

// Wählbare Zeiträume. Ausgewertet wird immer nur bis gestern: der laufende Tag
// ist noch nicht fertig gebucht und würde jede Quote verzerren.
export const ZEITRAEUME = [
  { key: 'woche', label: 'Diese Woche' },
  { key: 'vorwoche', label: 'Vorwoche' },
  { key: 'monat', label: 'Dieser Monat' },
  { key: 'vormonat', label: 'Vormonat' },
  { key: 'quartal', label: 'Dieses Quartal' },
  { key: 'vorquartal', label: 'Vorquartal' },
];

const montagVon = (iso) => plusTage(iso, -((wochentag(iso) + 6) % 7));
const monatsEnde = (j, m) => isoVon(new Date(j, m + 1, 0)); // m 0-basiert

export function zeitraum(key, heute) {
  const d = datumVon(heute);
  const j = d.getFullYear(), m = d.getMonth();
  let von, bis;
  if (key === 'woche') { von = montagVon(heute); bis = plusTage(von, 6); }
  else if (key === 'vorwoche') { von = plusTage(montagVon(heute), -7); bis = plusTage(von, 6); }
  else if (key === 'vormonat') { const v = new Date(j, m - 1, 1); von = isoVon(v); bis = monatsEnde(v.getFullYear(), v.getMonth()); }
  else if (key === 'quartal') { const q = Math.floor(m / 3) * 3; von = isoVon(new Date(j, q, 1)); bis = monatsEnde(j, q + 2); }
  else if (key === 'vorquartal') { const v = new Date(j, Math.floor(m / 3) * 3 - 3, 1); von = isoVon(v); bis = monatsEnde(v.getFullYear(), v.getMonth() + 2); }
  else { von = isoVon(new Date(j, m, 1)); bis = monatsEnde(j, m); }
  const gestern = plusTage(heute, -1);
  const auswertungBis = bis < gestern ? bis : gestern;
  return { key, von, bis, auswertungBis, leer: auswertungBis < von };
}

export const fmtDatum = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '—');
export const fmtKurz = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : '—');
