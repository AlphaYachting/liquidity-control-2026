import { base44 } from '@/api/base44Client';

// Laufender Behälter: ein Sprint OHNE Liefertermin und ein offener Milestone
// OHNE Etappenbetrag und Freeze-Datum. Genügt, damit Tickets abgelegt werden können.
export async function ensureContainer(project, options = {}) {
  const { sprintTitle = 'Laufende Arbeit', milestoneTitle = 'Anfragen' } = options;

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
  }
  return { sprint, milestone };
}