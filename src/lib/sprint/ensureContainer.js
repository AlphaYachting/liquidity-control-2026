import { base44 } from '@/api/base44Client';

// Laufender Behälter: ein Sprint OHNE Liefertermin und ein offener Milestone
// OHNE Etappenbetrag und Freeze-Datum. Die Tickets stammen ausschließlich aus
// den TicketTemplate-Zeilen der übergebenen Module — keine freien Ticketnamen.
export async function ensureContainer(project, options = {}) {
  const {
    sprintTitle = 'Laufende Arbeit',
    milestoneTitle = 'Anfragen',
    module_ids = [],
  } = options;

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
    await createTemplateTickets(project, milestone, module_ids);
  }
  return { sprint, milestone };
}

async function createTemplateTickets(project, milestone, module_ids) {
  if (!module_ids.length) return;
  const origin = project.abrechnungsmodell === 'support' ? 'support' : 'pflicht';
  const now = new Date().toISOString();
  const tickets = [];

  for (const moduleId of module_ids) {
    const templates = await base44.entities.TicketTemplate.filter({ module_template_id: moduleId }, 'order', 200);
    templates.forEach((t) => {
      tickets.push({
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
      });
    });
  }

  if (tickets.length) await base44.entities.Ticket.bulkCreate(tickets);
}