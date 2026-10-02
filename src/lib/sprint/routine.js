import { base44 } from '@/api/base44Client';
import { projectTypeOf } from '@/components/sprint/projectTypes';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s) => new Date(`${s}T00:00:00`);

// Rhythmen in Monaten — alle anderen laufen in Tagen
export const RHYTHMUS_MONATE = { monatlich: 1, '2monatlich': 2, quartalsweise: 3, halbjaehrlich: 6, jaehrlich: 12 };

function terminK(anker, rhythmus, k) {
  const a = parse(anker);
  const monate = RHYTHMUS_MONATE[rhythmus];
  if (monate) {
    const y = a.getFullYear();
    const m = a.getMonth() + k * monate;
    const letzter = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(a.getDate(), letzter));
  }
  const tage = rhythmus === '14taegig' ? 14 : 7;
  return new Date(a.getFullYear(), a.getMonth(), a.getDate() + k * tage);
}

function aufWerktag(d) {
  const r = new Date(d);
  if (r.getDay() === 6) r.setDate(r.getDate() + 2);
  if (r.getDay() === 0) r.setDate(r.getDate() + 1);
  return iso(r);
}

// Kleinster Termin anker + k × Intervall (k ≥ 1) nach heute und nach der bisherigen Fälligkeit.
export function naechsterTermin(ticket, heuteIso) {
  const { rhythmus } = ticket;
  if (!rhythmus || rhythmus === 'manuell') return null;
  const anker = ticket.rhythmus_anker || ticket.planned_for || heuteIso;
  const grenze = [heuteIso, ticket.planned_for].filter(Boolean).sort().pop();
  for (let k = 1; k < 2000; k++) {
    const roh = iso(terminK(anker, rhythmus, k));
    if (roh > grenze) return aufWerktag(parse(roh));
  }
  return null;
}

export async function ticketStatusSetzen(ticket, status, { folgetermin } = {}) {
  await base44.entities.Ticket.update(ticket.id, { status, last_status_change: new Date().toISOString() });
  if (!ticket.rhythmus) return;
  if (ticket.status === 'erledigt' && (status === 'offen' || status === 'in_arbeit')) {
    const folge = await base44.entities.Ticket.filter({ vorgaenger_id: ticket.id, archiviert: { $ne: true } }, 'order', 10);
    await Promise.all(folge.filter((f) => f.status === 'offen').map((f) => base44.entities.Ticket.delete(f.id)));
    return;
  }
  if (status !== 'erledigt' || ticket.archiviert) return;
  // Routinen laufen nur in Container-Projekten weiter
  const project = await base44.entities.Project.get(ticket.project_id).catch(() => null);
  if (projectTypeOf(project) !== 'container') return;
  const vorhanden = await base44.entities.Ticket.filter({ vorgaenger_id: ticket.id }, 'order', 1);
  if (vorhanden.length) return;
  const felder = ['milestone_id', 'project_id', 'order', 'title', 'description', 'role', 'assignee_email',
    'milestone_state', 'target_hours', 'origin', 'module_template_id', 'ticket_template_id',
    'rhythmus', 'fenster_tage', 'rhythmus_anker'];
  const neu = {};
  felder.forEach((f) => { if (ticket[f] !== undefined && ticket[f] !== null) neu[f] = ticket[f]; });
  await base44.entities.Ticket.create({
    ...neu,
    checklist: (ticket.checklist || []).map((c) => ({ ...c, done: false })),
    status: 'offen',
    vorgaenger_id: ticket.id,
    planned_for: folgetermin,
    last_status_change: new Date().toISOString(),
  });
}