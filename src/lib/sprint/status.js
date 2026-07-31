import { todayIso } from '@/components/sprint/sprintConfig';

// X1 — Die einzige Statusquelle des Sprint-Moduls.
// Kein Screen berechnet Fortschritt, Beträge, Fristen oder Ampel selbst.

const dayDiff = (iso, from) => Math.ceil((new Date(iso) - new Date(from)) / 86400000);

// Arbeitstage zwischen heute und einem Datum (Wochenenden zählen nicht).
const workdaysUntil = (iso, from) => {
  if (!iso) return null;
  const start = new Date(from);
  const end = new Date(iso);
  const sign = end < start ? -1 : 1;
  let count = 0;
  const cur = new Date(sign > 0 ? start : end);
  const stop = sign > 0 ? end : start;
  while (cur < stop) {
    cur.setDate(cur.getDate() + 1);
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) count += 1;
  }
  return sign * count;
};

const DEADLINE_LABEL = { handover: 'Übergabe', freeze: 'Freeze' };

export function sprintStatus({ sprint, milestones = [], tickets = [], timeEntries = [], focusDays = [], signals = [] }) {
  const today = todayIso();
  const ordered = [...milestones].sort((a, b) => (a.order || 0) - (b.order || 0));
  const open = ordered.filter((m) => m.state !== 'freigegeben');
  const beyondInput = open.filter((m) => m.state !== 'input');
  const multipleActive = beyondInput.length > 1;

  let activeMilestone = open[0] || null;
  if (multipleActive) {
    activeMilestone = [...beyondInput].sort((a, b) =>
      (a.feedback_deadline || a.planned_freeze || '9999').localeCompare(b.feedback_deadline || b.planned_freeze || '9999')
    )[0];
  }

  const released = ordered.filter((m) => m.state === 'freigegeben');
  const milestoneIndex = activeMilestone ? ordered.findIndex((m) => m.id === activeMilestone.id) + 1 : ordered.length;

  // Nächste Frist: frühestes noch offenes Übergabe- oder Freeze-Datum
  const candidates = open
    .flatMap((m) => [
      m.handover_date ? null : { art: 'handover', datum: m.planned_handover, milestoneId: m.id },
      { art: 'freeze', datum: m.feedback_deadline || m.planned_freeze, milestoneId: m.id },
    ])
    .filter((d) => d && d.datum)
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const nd = candidates[0];
  const nextDeadline = nd
    ? { ...nd, label: DEADLINE_LABEL[nd.art], tageRest: dayDiff(nd.datum, today), arbeitstageRest: workdaysUntil(nd.datum, today) }
    : null;

  const inRange = (d) =>
    d && (!sprint?.start_date || d >= sprint.start_date) && (!sprint?.delivery_date || d <= sprint.delivery_date);

  const hoursBooked = timeEntries.filter((t) => inRange(t.entry_date)).reduce((s, t) => s + (t.hours || 0), 0);
  const hoursTarget = sprint?.target_hours || 0;
  const focusDaysPlanned = focusDays.filter((f) => inRange(f.day)).length;

  const openSignals = signals.filter((s) => !s.resolved);
  const critical = openSignals.find((s) => s.severity === 'kritisch');
  const warning = openSignals.find((s) => s.severity === 'warnung');
  const overrun = hoursTarget > 0 && hoursBooked > 0.7 * hoursTarget && released.length < ordered.length / 2;
  const overdue = nextDeadline && nextDeadline.tageRest < 0;
  const deliveryOverdue = sprint?.delivery_date && dayDiff(sprint.delivery_date, today) < 0;

  let ampel = 'plan';
  let ampelGrund = 'Alles im Plan.';
  if (critical || overdue || deliveryOverdue) {
    ampel = 'action';
    ampelGrund = critical
      ? critical.recommendation
      : overdue
        ? `${nextDeadline.label} seit ${-nextDeadline.tageRest} Tagen überschritten.`
        : 'Liefertermin überschritten.';
  } else if ((nextDeadline && nextDeadline.arbeitstageRest <= 3) || warning || overrun) {
    ampel = 'attention';
    ampelGrund = warning
      ? warning.recommendation
      : overrun
        ? `${Math.round((hoursBooked / hoursTarget) * 100)} % der Zeit verbraucht, ${released.length} von ${ordered.length} Etappen freigegeben.`
        : `${nextDeadline.label} läuft in ${nextDeadline.tageRest} Tagen ab.`;
  } else if (nextDeadline) {
    ampelGrund = `Nächste Frist: ${nextDeadline.label} in ${nextDeadline.tageRest} Tagen.`;
  }

  let urgency = 5;
  if (critical || overdue || deliveryOverdue) urgency = 1;
  else if (nextDeadline && nextDeadline.arbeitstageRest <= 3) urgency = 2;
  else if (warning || overrun) urgency = 3;
  else if (nextDeadline && nextDeadline.arbeitstageRest <= 7) urgency = 4;

  const milestoneTickets = (id) => tickets.filter((t) => t.milestone_id === id);

  return {
    activeMilestone,
    multipleActive,
    milestoneIndex,
    milestoneCount: ordered.length,
    releasedCount: released.length,
    releasedAmount: released.reduce((s, m) => s + (m.milestone_amount || 0), 0),
    sprintAmount: sprint?.sprint_amount || 0,
    nextDeadline,
    daysToDelivery: sprint?.delivery_date ? dayDiff(sprint.delivery_date, today) : null,
    hoursBooked,
    hoursTarget,
    focusDaysPlanned,
    focusDaysTotal: sprint?.planned_focus_days || 0,
    ticketsDone: tickets.filter((t) => t.status === 'erledigt').length,
    ticketsTotal: tickets.length,
    milestoneTickets,
    ampel,
    ampelGrund,
    urgency,
  };
}

export { workdaysUntil };