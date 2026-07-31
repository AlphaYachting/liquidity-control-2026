// S1 — Nachlass anteilig auf die Etappen verteilen.
// Rundung auf ganze Euro; die Rundungsdifferenz trägt die LETZTE Etappe,
// damit die Summe exakt dem Sprintbetrag entspricht.
export function verteileNachlass(bruttoBetraege, nachlass) {
  const brutto = bruttoBetraege.map((b) => Number(b) || 0);
  if (brutto.length === 0) return [];
  const summe = brutto.reduce((s, b) => s + b, 0);
  const rabatt = Number(nachlass) || 0;
  if (rabatt <= 0 || summe <= 0) return brutto.map((b) => Math.round(b));
  const ziel = Math.round(summe - rabatt);
  const netto = brutto.map((b) => Math.round(b - (b / summe) * rabatt));
  const diff = ziel - netto.reduce((s, n) => s + n, 0);
  netto[netto.length - 1] += diff;
  return netto;
}