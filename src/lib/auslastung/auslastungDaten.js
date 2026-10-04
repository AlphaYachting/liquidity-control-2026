import { base44 } from '@/api/base44Client';

const SEITE = 500;

// Offene, nicht archivierte Tickets seitenweise laden, bis alle da sind.
async function alleOffenenTickets() {
  const query = { archiviert: { $ne: true }, status: { $ne: 'erledigt' } };
  const alle = [];
  for (let skip = 0; ; skip += SEITE) {
    const seite = await base44.entities.Ticket.filter(query, 'order', SEITE, skip);
    alle.push(...seite);
    if (seite.length < SEITE) break;
  }
  return alle;
}

// Zeitbuchungen nur zu den geladenen Tickets, in Blöcken abgefragt.
async function buchungenZu(ticketIds) {
  const alle = [];
  for (let i = 0; i < ticketIds.length; i += 100) {
    const ids = ticketIds.slice(i, i + 100);
    const rows = await base44.entities.TimeEntry.filter({ ticket_id: { $in: ids } }, '-entry_date', 5000);
    alle.push(...rows);
  }
  return alle;
}

export async function ladeAuslastung() {
  const [tickets, projects, clients, members, sprints] = await Promise.all([
    alleOffenenTickets(),
    base44.entities.Project.list('-created_date', 1000),
    base44.entities.Client.list('name', 2000),
    base44.entities.TeamMember.filter({ active: true }, 'name', 200),
    base44.entities.Sprint.list('-created_date', 1000),
  ]);
  const entries = await buchungenZu(tickets.map((t) => t.id));
  return { tickets, projects, clients, members, sprints, entries };
}