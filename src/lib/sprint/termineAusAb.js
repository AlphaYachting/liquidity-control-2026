import { base44 } from '@/api/base44Client';
import { planSprintDeadlines } from '@/lib/sprint/deadlines';
import { SPRINT_SIZES, addWeeks, fmtDate } from '@/components/sprint/sprintConfig';

// Stellt einen Sprint auf die Termine der Auftragsbestätigung um: Start, Lieferung und die
// Plantermine aller Etappen, die noch nicht übergeben sind. Übergebene und freigegebene
// Etappen bleiben unberührt. Gerechnet wird mit derselben Fristenrechnung wie bei der Anlage.
export async function termineAusAbUebernehmen({ sprint, milestones = [], start, lieferung }) {
  const startDate = start || sprint.start_date;
  const deliveryDate = lieferung || sprint.delivery_date;
  const settings = await base44.entities.Setting.filter({ group: 'fristen' }, 'key', 100);
  const etappen = [...milestones].sort((a, b) => (a.order || 0) - (b.order || 0));
  const plan = planSprintDeadlines({
    startDate, deliveryDate, size: sprint.size, milestoneCount: etappen.length, settings,
  });
  if (!plan.deliverable) {
    throw new Error(`${plan.reason} Frühester realistischer Liefertermin: ${fmtDate(plan.suggestedDelivery)}.`);
  }

  await base44.entities.Sprint.update(sprint.id, {
    start_date: startDate,
    end_date: addWeeks(startDate, SPRINT_SIZES[sprint.size]?.weeks || 0),
    delivery_date: deliveryDate,
  });
  for (let i = 0; i < etappen.length; i++) {
    const m = etappen[i];
    if (m.handover_date || m.state === 'freigegeben') continue;
    await base44.entities.Milestone.update(m.id, {
      planned_handover: plan.plan[i].planned_handover,
      planned_freeze: plan.plan[i].planned_freeze,
      deadline_pulled_forward: plan.plan[i].pulled_forward,
    });
  }
}
