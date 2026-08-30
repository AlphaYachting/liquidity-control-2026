// Verdichtet eine Anfrage auf ihren Inhalt: Anrede, Zitate, Grußformel und
// alles danach (Signatur, Telefonnummer, Firmenzeile) entfallen.
const ANREDE = /^(sehr geehrte|guten (tag|morgen|abend)|hallo|liebe[rs]?\b|servus|grüß)/i;
const GRUSS = /^(mit freundlichen|beste grüße|liebe grüße|freundliche grüße|viele grüße|lg\b|mfg\b)/i;

export function anfrageKurz(text) {
  const zeilen = String(text || '').split('\n');
  const inhalt = [];
  for (const roh of zeilen) {
    const zeile = roh.trim();
    if (!zeile) continue;
    if (zeile.startsWith('>')) continue;
    if (ANREDE.test(zeile)) continue;
    if (GRUSS.test(zeile)) break;
    inhalt.push(zeile);
  }
  const satz = inhalt.join(' ').trim();
  return satz ? satz.charAt(0).toUpperCase() + satz.slice(1) : '';
}