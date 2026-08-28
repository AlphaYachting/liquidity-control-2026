// Der Kundenname steht schon im Kopf — im Projekttitel ist er Wiederholung.
const RECHTSFORM = /\s*(gmbh\s*&\s*co\.?\s*kg|ges\.?\s*m\.?\s*b\.?\s*h\.?|gesmbh|gmbh|ag|kg|og|e\.?\s*u\.?)\s*\.?$/i;
const TRENNER = /^[\s\-–—·:]+/;

export const kundeOhneRechtsform = (kunde = '') => kunde.replace(RECHTSFORM, '').trim();

// Schneidet den Kundennamen vorne ab — erst vollständig, dann nur das erste Wort.
export function kuerzeTitel(kunde, titel) {
  if (!titel) return '';
  const basis = kundeOhneRechtsform(kunde);
  const kandidaten = [basis, basis.split(/\s+/)[0]].filter((k) => k && k.length >= 3);
  for (const k of kandidaten) {
    if (titel.toLowerCase().startsWith(k.toLowerCase())) {
      const rest = titel.slice(k.length).replace(TRENNER, '').trim();
      if (rest.length >= 3) return rest;
    }
  }
  return titel;
}