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
  const [entries, snapshots, liquidity] = await Promise.all([
    buchungenZu(tickets.map((t) => t.id)),
    aworkSnapshots([...new Set(projects.map((p) => p.awork_project_id).filter(Boolean))]),
    base44.entities.LiquidityProject.list('-created_date', 2000),
  ]);
  return { tickets, projects, clients, members, sprints, entries, aworkMinuten: aworkZuordnung(tickets, projects, snapshots), liquidity };
}

async function aworkSnapshots(aworkIds) {
  const alle = [];
  for (let i = 0; i < aworkIds.length; i += 50) {
    const query = { awork_project_id: { $in: aworkIds.slice(i, i + 50) } };
    for (let skip = 0; ; skip += SEITE) {
      const seite = await base44.entities.AworkTaskSnapshot.filter(query, '-last_synced_at', SEITE, skip);
      alle.push(...seite);
      if (seite.length < SEITE) break;
    }
  }
  return alle;
}

// Ticket → in aWork gebuchte Minuten; über aWork-Projekt und Titel (bzw. letzten Abschnitt nach „ › "), jüngster Snapshot gewinnt
function aworkZuordnung(tickets, projects, snapshots) {
  const norm = (s) => (s || '').trim().toLowerCase();
  const index = {};
  snapshots.forEach((s) => {
    const k = `${s.awork_project_id}|${norm(s.task_title)}`;
    if (!index[k] || (s.last_synced_at || '') > (index[k].last_synced_at || '')) index[k] = s;
  });
  const aworkVon = Object.fromEntries(projects.map((p) => [p.id, p.awork_project_id]));
  const out = {};
  tickets.forEach((t) => {
    const aw = aworkVon[t.project_id];
    if (!aw) return;
    const teile = (t.title || '').split(' › ');
    const treffer = index[`${aw}|${norm(t.title)}`] || (teile.length > 1 ? index[`${aw}|${norm(teile[teile.length - 1])}`] : null);
    if (treffer) out[t.id] = treffer.tracked_duration_minutes || 0;
  });
  return out;
}