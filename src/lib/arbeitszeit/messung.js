// „Gebucht“ und „nachgetragen“ — wie viel einer Buchung der Timer tatsächlich gemessen hat.
//
//   Gebucht       Minuten, die der Timer wirklich gelaufen ist (höchstens die Dauer der Buchung).
//   Nachgetragen  der Rest: von Hand eingetragen (Lücke, Eingabezeile, Spur) oder bei einer
//                 Timer-Buchung die Minuten, um die sie länger ist, als der Timer lief.
//
// Laufzeit des Timers: Start = Anlage des laufenden Timers (steckt in seiner Kennung
// `laufende_id`, die der Server vergibt), Ende = Anlage der Buchung beim Stoppen
// (`created_date`). Beides setzt der Server; ein späteres Ändern der Uhrzeiten im Dialog
// „Buchung ändern“ ändert daran nichts. Eine Pause im Timer verkürzt die Buchung — sie zählt
// dann voll als gebucht.
//
// Nur für die Arbeitszeitauswertung (Geschäftsführung). Rein rechnend, ohne Datenzugriff.
import { alsDatum } from '../zeitpunkt.js';

const KENNUNG = /^[0-9a-f]{24}$/i;

// Anlagezeitpunkt aus einer Datenbank-Kennung (die ersten 8 Zeichen sind Sekunden seit 1970)
export function zeitAusKennung(id) {
  const s = String(id || '');
  if (!KENNUNG.test(s)) return null;
  const sek = parseInt(s.slice(0, 8), 16);
  return Number.isFinite(sek) && sek > 0 ? new Date(sek * 1000) : null;
}

// Wie lange der Timer dieser Buchung lief, in Minuten (mit Bruchteil) — oder null
export function timerLaufMinuten(e) {
  if (!e || e.quelle !== 'timer' || !e.laufende_id) return null;
  const start = zeitAusKennung(e.laufende_id);
  const ende = alsDatum(e.created_date);
  if (!start || !ende || Number.isNaN(ende.getTime())) return null;
  const m = (ende.getTime() - start.getTime()) / 60000;
  return m >= 0 && m < 24 * 60 ? m : null;
}

// { gebucht, nachgetragen, laufMin } in Minuten. Korrekturbuchungen und Buchungen ohne
// Dauer zählen in keine der beiden Spalten.
export function messung(e) {
  const dauer = Number(e?.duration_minutes) || 0;
  if (dauer <= 0 || e.korrektur_zu) return { gebucht: 0, nachgetragen: 0, laufMin: null };
  const lauf = timerLaufMinuten(e);
  if (lauf === null) return { gebucht: 0, nachgetragen: dauer, laufMin: null };
  const gebucht = Math.min(dauer, Math.round(lauf));
  return { gebucht, nachgetragen: dauer - gebucht, laufMin: lauf };
}

// Laufzeit lesbar: unter einer Minute in Sekunden
export function laufText(laufMin) {
  if (laufMin === null || laufMin === undefined) return null;
  if (laufMin < 1) return `${Math.max(1, Math.round(laufMin * 60))} Sek.`;
  const m = Math.round(laufMin);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
}
