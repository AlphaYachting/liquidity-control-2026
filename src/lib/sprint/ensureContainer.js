import { base44 } from '@/api/base44Client';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import { resolveAssignee } from '@/lib/sprint/assignment';
import { addWorkdays, isWeekend } from '@/lib/sprint/deadlines';
import { todayIso } from '@/components/sprint/sprintConfig';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Erster Termin einer Routine, falls niemand einen gewählt hat.
export function standardTermin(rhythmus, heuteIso = todayIso()) {
  if (rhythmus === 'manuell') return null;
  const d = new Date(`${heuteIso}T00:00:00`);
  if (rhythmus === 'monatlich' || ['2monatlich', 'quartalsweise', 'halbjaehrlich', 'jaehrlich'].includes(rhythmus)) {
    const erster = iso(new Date(d.getFullYear(), d.getMonth() + 1, 1));
    return isWeekend(erster) ? addWorkdays(erster, 1) : erster;
  }
  const bisMontag = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + bisMontag);
  return iso(d);
}

// Standardauswahl eines Moduls: alle nicht-optionalen Vorlagen (Routinen nur bei Container).
export function standardAuswahl(moduleId, templates, istContainer, standardBetreuer) {
  const eigene = templates.filter((t) => t.module_template_id === moduleId && !t.optional
    && (t.art !== 'routine' || istContainer));
  const erste_termine = {};
  eigene.filter((t) => t.art === 'routine').forEach((t) => { erste_termine[t.id] = standardTermin(t.rhythmus); });
  return { module_template_id: moduleId, template_ids: eigene.map((t) => t.id), erste_termine, betreuer_email: standardBetreuer || null };
}

// Laufender Behälter: ein Sprint OHNE Liefertermin und ein offener Milestone
// OHNE Etappenbetrag und Freeze-Datum. Die Tickets stammen ausschließlich aus
// den TicketTemplate-Zeilen der übergebenen Module — keine freien Ticketnamen.
export async function ensureContainer(project, options = {}) {
  const {
    sprintTitle = 'Laufende Arbeit',
    milestoneTitle = 'Anfragen',
    module_ids = [],
  } = options;
  let { auswahl } = options;

  let sprint = (await base44.entities.Sprint.filter({ project_id: project.id }))[0];
  if (!sprint) {
    sprint = await base44.entities.Sprint.create({
      project_id: project.id,
      title: sprintTitle,
      size: 'S',
      start_date: new Date().toISOString().slice(0, 10),
      status: 'laufend',
    });
  }

  let milestone = (await base44.entities.Milestone.filter({ sprint_id: sprint.id }))
    .find((m) => !m.released);
  if (!milestone) {
    milestone = await base44.entities.Milestone.create({
      sprint_id: sprint.id,
      order: 1,
      title: milestoneTitle,
      state: 'produktion',
    });
    if (!auswahl && module_ids.length) {
      const templates = await base44.entities.TicketTemplate.filter({ module_template_id: { $in: module_ids } }, 'order', 500);
      const istContainer = projectTypeOf(project) === 'container';
      auswahl = module_ids.map((id) => standardAuswahl(id, templates, istContainer, project.pm_email));
    }
    await modulTicketsAnlegen(project, milestone, auswahl || []);
  }
  return { sprint, milestone };
}

export async function modulTicketsAnlegen(project, milestone, auswahl = []) {
  const ids = auswahl.flatMap((a) => a.template_ids || []);
  if (!ids.length) return;
  const [templates, members] = await Promise.all([
    base44.entities.TicketTemplate.filter({ id: { $in: ids } }, 'order', 500),
    base44.entities.TeamMember.filter({ active: true }, 'name', 200),
  ]);
  const istContainer = projectTypeOf(project) === 'container';
  const origin = project.abrechnungsmodell === 'support' ? 'support' : 'pflicht';
  const now = new Date().toISOString();
  const tickets = [];

  for (const a of auswahl) {
    const eigene = templates
      .filter((t) => (a.template_ids || []).includes(t.id))
      .sort((x, y) => (x.order || 0) - (y.order || 0));
    for (const t of eigene) {
      const routine = t.art === 'routine';
      if (routine && !istContainer) continue;
      const ticket = {
        milestone_id: milestone.id,
        project_id: project.id,
        order: tickets.length + 1,
        title: t.title,
        role: t.role,
        milestone_state: t.milestone_state || 'produktion',
        target_hours: t.target_hours || 0,
        blocks_others: t.blocks_others || false,
        status: 'offen',
        origin,
        last_status_change: now,
        module_template_id: a.module_template_id,
        ticket_template_id: t.id,
      };
      const person = routine
        ? a.betreuer_email || project.pm_email
        : resolveAssignee(t.role, members) || a.betreuer_email || project.pm_email;
      if (person) ticket.assignee_email = person;
      if (routine) {
        const termin = a.erste_termine?.[t.id] || standardTermin(t.rhythmus);
        Object.assign(ticket, {
          rhythmus: t.rhythmus || 'manuell',
          fenster_tage: t.fenster_tage || 0,
          ...(termin ? { planned_for: termin, rhythmus_anker: termin } : {}),
        });
      }
      tickets.push(ticket);
    }
  }

  if (tickets.length) await base44.entities.Ticket.bulkCreate(tickets);
}