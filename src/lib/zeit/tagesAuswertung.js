// Auswertung eines Arbeitstages: Blöcke mit Spuren, Löcher, Summen.
export const STRIP_VON = 7 * 60;
export const STRIP_BIS = 20 * 60;
const TAGESBEGINN = 9 * 60;
const MIN_ENDE = 17 * 60;
export const MIN_LOCH = 20;

export const minuteVonIso = (iso) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

export const isoVonMinute = (tag, minute) => {
  const [y, m, d] = tag.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(minute / 60), minute % 60, 0).toISOString();
};

export const uhr = (minute) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(Math.max(0, minute) % 60).padStart(2, '0')}`;

export const dauerText = (minuten) => {
  const m = Math.round(minuten);
  if (m <= 0) return '0 min';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
};

const pauseZuMinuten = (p) => {
  const zu = (s) => {
    const [h, m] = String(s || '').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return { von: zu(p.von), bis: zu(p.bis) };
};

const verschmelze = (intervalle) => {
  const sortiert = [...intervalle].sort((a, b) => a.von - b.von);
  const out = [];
  for (const i of sortiert) {
    const letzter = out[out.length - 1];
    if (letzter && i.von <= letzter.bis) letzter.bis = Math.max(letzter.bis, i.bis);
    else out.push({ ...i });
  }
  return out;
};

export function werteTagAus({ tag, eintraege = [], pausen = [], istHeute = false, jetztMinute = 0 }) {
  const mitZeit = eintraege
    .filter((e) => e.started_at && e.ended_at && (e.duration_minutes || 0) > 0)
    .map((e) => ({ entry: e, von: minuteVonIso(e.started_at), bis: minuteVonIso(e.ended_at) }))
    .sort((a, b) => a.von - b.von);

  // Überschneidungen werden gestapelt, nicht übereinandergelegt.
  const spurEnden = [];
  const blocks = mitZeit.map((b) => {
    let spur = spurEnden.findIndex((ende) => b.von >= ende);
    if (spur === -1) { spurEnden.push(b.bis); spur = spurEnden.length - 1; }
    else spurEnden[spur] = b.bis;
    const ueberschneidet = mitZeit.some((o) => o !== b && o.von < b.bis && b.von < o.bis);
    return { ...b, spur, ueberschneidet };
  });

  const pausenMin = pausen.map(pauseZuMinuten).filter((p) => p.bis > p.von);
  const belegt = verschmelze([...blocks.map((b) => ({ von: b.von, bis: b.bis })), ...pausenMin]);

  const letztesEnde = blocks.length ? Math.max(...blocks.map((b) => b.bis)) : 0;
  const grenze = istHeute
    ? Math.min(STRIP_BIS, Math.max(jetztMinute, TAGESBEGINN))
    : Math.min(STRIP_BIS, Math.max(letztesEnde, MIN_ENDE));
  const beginn = blocks.length ? Math.min(TAGESBEGINN, blocks[0].von) : TAGESBEGINN;

  const loecher = [];
  let cursor = beginn;
  for (const b of belegt) {
    if (b.von > cursor) loecher.push({ von: cursor, bis: Math.min(b.von, grenze) });
    cursor = Math.max(cursor, b.bis);
  }
  if (cursor < grenze) loecher.push({ von: cursor, bis: grenze });

  const echteLoecher = loecher
    .map((l) => ({ ...l, minuten: l.bis - l.von }))
    .filter((l) => l.minuten >= MIN_LOCH);

  const gebuchtMinuten = eintraege.reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0);
  const verrechenbarMinuten = eintraege
    .filter((e) => e.verrechenbar !== false)
    .reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0);
  const nichtVerrechenbarMinuten = gebuchtMinuten - verrechenbarMinuten;
  const betrag = eintraege
    .filter((e) => e.verrechenbar !== false && e.kategorie === 'aufwand' && e.stundensatz)
    .reduce((s, e) => s + ((Number(e.duration_minutes) || 0) / 60) * e.stundensatz, 0);

  return {
    tag,
    blocks,
    spuren: Math.max(1, spurEnden.length),
    loecher: echteLoecher,
    pausen: pausenMin,
    grenze,
    gebuchtMinuten,
    anzahl: eintraege.length,
    verrechenbarMinuten,
    nichtVerrechenbarMinuten,
    nichtVerrechenbarAnteil: gebuchtMinuten ? Math.round((nichtVerrechenbarMinuten / gebuchtMinuten) * 100) : 0,
    betrag: Math.round(betrag),
    offenMinuten: echteLoecher.reduce((s, l) => s + l.minuten, 0),
  };
}

// Montag bis Freitag der Woche, in der das Datum liegt
export function wochentage(isoDatum) {
  const [y, m, d] = isoDatum.split('-').map(Number);
  const basis = new Date(y, m - 1, d);
  const versatz = (basis.getDay() + 6) % 7;
  const montag = new Date(y, m - 1, d - versatz);
  return Array.from({ length: 5 }, (_, i) => {
    const t = new Date(montag.getFullYear(), montag.getMonth(), montag.getDate() + i);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  });
}

export const verschiebeTage = (isoDatum, tage) => {
  const [y, m, d] = isoDatum.split('-').map(Number);
  const t = new Date(y, m - 1, d + tage);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

export const MODELL_FARBE = {
  sprint: '#1D4ED8',
  support: '#0E9488',
  aufwand: '#CA8A04',
  paket: '#9333EA',
  intern: '#475569',
};

export const MODELL_TEXT = {
  sprint: 'Sprintprojekt',
  support: 'Supportprojekt',
  aufwand: 'Nach Aufwand',
  paket: 'Pauschalpaket',
  intern: 'Interne Arbeit',
};