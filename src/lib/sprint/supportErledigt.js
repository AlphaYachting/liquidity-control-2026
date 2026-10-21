import { base44 } from '@/api/base44Client';
import { projectTypeOf } from '@/components/sprint/projectTypes';

// Gründe, warum ein Support-Ticket ohne Zeitbuchung erledigt wird (21.10.2026).
// Sie entscheiden NICHT über die Verrechnung — das macht die Führung in der Support-Abrechnung.
export const OHNE_ZEIT_GRUENDE = [
  { wert: 'zeit_in_awork', label: 'Arbeit vor dem Umstieg — Zeit liegt in aWork' },
  { wert: 'kein_aufwand', label: 'Kein Aufwand (nur beantwortet oder weitergeleitet)' },
  { wert: 'doppelt', label: 'Doppeltes Ticket — die Zeit liegt auf einem anderen Ticket' },
  { wert: 'anderer_auftrag', label: 'Gehört zu einem anderen Auftrag oder Projekt' },
  { wert: 'sonstiges', label: 'Sonstiges' },
];
export const OHNE_ZEIT_LABEL = Object.fromEntries(OHNE_ZEIT_GRUENDE.map((g) => [g.wert, g.label]));

// Braucht das Erledigen dieses Tickets erst eine Zeit oder einen Grund?
// Nur Support-Projekte; nicht, wenn schon Zeit gebucht ist (auch nicht verrechenbare),
// aWork-Vorleistung zugeordnet ist, ein Timer auf dem Ticket läuft oder die Führung
// es bereits bewusst auf „nicht verrechnen" gesetzt hat. Rückgabe: { project } oder null.
export async function supportOhneZeit(ticket) {
  if (!ticket?.id || ticket.status === 'erledigt' || ticket.archiviert) return null;
  if (Number(ticket.awork_vorleistung_minuten) > 0) return null;
  if (ticket.verrechnung_status === 'nicht_verrechnen' || ticket.verrechnung_status === 'verrechnet') return null;
  const project = await base44.entities.Project.get(ticket.project_id).catch(() => null);
  if (!project || projectTypeOf(project) !== 'support') return null;
  const [zeiten, laufend] = await Promise.all([
    base44.entities.TimeEntry.filter({ ticket_id: ticket.id }, '-entry_date', 50).catch(() => []),
    base44.entities.LaufendeZeitbuchung.filter({ ticket_id: ticket.id }, '-gestartet_am', 5).catch(() => []),
  ]);
  if (laufend.length) return null;
  const summe = zeiten.reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0);
  return summe > 0 ? null : { project };
}
