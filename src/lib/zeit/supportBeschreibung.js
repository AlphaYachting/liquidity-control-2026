import { projectTypeOf } from '@/components/sprint/projectTypes';

// Support ohne Ticket (Entscheidung Alfons 21.10.2026): keine Ticketpflicht — es wird auf
// den Kunden gebucht, aber Zeit UND Beschreibung sind Pflicht. Sonst lässt sich die Zeit
// in der Support-Abrechnung nicht verrechnen. Dieselbe Regel gilt serverseitig in zeitStoppen.
export const BESCHREIBUNG_FEHLT = 'Support ohne Ticket: Bitte kurz beschreiben, was gemacht wurde — sonst lässt sich die Zeit nicht verrechnen.';

export const istSupportOhneTicket = (project, ticketId) => !!project && projectTypeOf(project) === 'support' && !ticketId;

export function brauchtBeschreibung({ project, ticketId, note, minuten, quelle }) {
  if (quelle === 'korrektur') return false;
  if (!(Number(minuten) > 0)) return false;
  if (String(note || '').trim()) return false;
  return istSupportOhneTicket(project, ticketId);
}
