import { addWorkdays } from '@/lib/sprint/deadlines';

// Letzter Tag, an dem die Aufgabe noch nicht überfällig ist.
export function fensterEnde(ticket) {
  if (!ticket?.planned_for) return null;
  return addWorkdays(ticket.planned_for, Number(ticket.fenster_tage) || 0);
}

export function istUeberfaellig(ticket, heuteIso) {
  const ende = fensterEnde(ticket);
  return ticket.status !== 'erledigt' && !!ende && ende < heuteIso;
}

export function istFaellig(ticket, heuteIso) {
  return ticket.status !== 'erledigt' && !!ticket.planned_for
    && ticket.planned_for <= heuteIso && !istUeberfaellig(ticket, heuteIso);
}