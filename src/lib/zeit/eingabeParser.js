// Zerlegt eine Zeile wie "ami 2,5 Wireframes überarbeitet" in Zeitfenster,
// Dauer, Projektwort und Notiz — die Reihenfolge der Teile ist frei.

const FENSTER = /^(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?$/;
const MINUTEN = /^(\d{1,3})(?:m|min)$/i;
const UHRZEIT = /^(\d{1,2}):(\d{2})$/;
const STUNDEN = /^(\d{1,2}(?:[.,]\d{1,2})?)h?$/i;

const minutenVon = (h, m) => Number(h) * 60 + Number(m || 0);

export function parseEingabe(text = '') {
  const teile = text.trim().split(/\s+/).filter(Boolean);
  let fenster = null;
  let minuten = 0;
  let projektWort = '';
  const notizTeile = [];

  for (const teil of teile) {
    let m;
    if (!fenster && (m = teil.match(FENSTER))) {
      const von = minutenVon(m[1], m[2]);
      const bis = minutenVon(m[3], m[4]);
      if (bis > von) {
        fenster = { vonMinute: von, bisMinute: bis };
        minuten = bis - von;
        continue;
      }
    }
    if (!minuten && (m = teil.match(MINUTEN))) {
      minuten = Number(m[1]);
      continue;
    }
    if (!minuten && (m = teil.match(UHRZEIT))) {
      minuten = minutenVon(m[1], m[2]);
      continue;
    }
    if (!minuten && (m = teil.match(STUNDEN))) {
      minuten = Math.round(Number(m[1].replace(',', '.')) * 60);
      continue;
    }
    if (!projektWort) {
      projektWort = teil;
      continue;
    }
    notizTeile.push(teil);
  }

  return { fenster, minuten, projektWort, notiz: notizTeile.join(' ') };
}

export const zeitfensterLabel = (fenster) => {
  if (!fenster) return '';
  const f = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  return `${f(fenster.vonMinute)}–${f(fenster.bisMinute)}`;
};

export const dauerLabel = (minuten) =>
  `${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, '0')} h`;