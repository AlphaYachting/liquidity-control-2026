// Beschreibungspflicht für Buchungen, die nach Aufwand verrechnet werden (Regie, Support).
// Entscheidung Alfons 05.10.2026: Was auf die Rechnung kommt, muss beschrieben sein —
// entweder hängt die Buchung an einem Ticket, oder sie trägt eine Beschreibung, was gemacht wurde.
// Geprüft wird beim Tagesabschluss (eine Stelle), nicht beim Buchen selbst: ein Timer, der
// automatisch stoppt (Projektwechsel), darf nie an einer Pflichtangabe scheitern.

const NACH_AUFWAND = ['aufwand', 'support'];
export const BESCHREIBUNG_MIN_ZEICHEN = 12;

// Mindestens zwei Wörter und 12 Zeichen — „Minuten" oder „auf haas" reichen nicht.
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

export function fehlendeBeschreibungen(eintraege = [], projekteById = {}) {
  return eintraege.filter((e) => brauchtBeschreibung(e, projekteById[e.project_id]));
}
