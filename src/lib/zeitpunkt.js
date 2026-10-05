// Zeitpunkte aus der Datenbank richtig lesen.
//
// Base44 liefert created_date und updated_date in UTC, aber OHNE Zeitzonenangabe
// (z. B. "2026-10-05T15:45:21.694000"). `new Date(...)` liest so einen Wert als
// Ortszeit — in Wien erscheint dann alles um 2 Stunden (Winterzeit: 1 Stunde) zu früh.
// Felder, die die App selbst schreibt (toISOString, endet auf "Z"), sind nicht betroffen.
//
// alsDatum ergänzt das fehlende "Z" nur bei Datum-mit-Uhrzeit ohne Zeitzone.
// Reine Datumswerte ("2026-10-05") und Werte mit Zeitzone bleiben unverändert.
const HAT_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

export function alsDatum(wert) {
  if (!wert) return null;
  if (wert instanceof Date) return wert;
  const s = String(wert).trim();
  if (s.includes('T') && !HAT_ZONE.test(s)) return new Date(`${s}Z`);
  return new Date(s);
}
