import { base44 } from '@/api/base44Client';
import { todayIso } from '@/components/sprint/sprintConfig';

const WORK_PHASES = ['input', 'produktion', 'pruefung'];

// X3 — Voraussetzungen der Freigabe. Punkt 4 warnt, alle anderen sperren.
export function freigabeVoraussetzungen({ milestone, tickets = [], notifications = [], feedbacks = [], source = '' }) {
  const today = todayIso();
  const freeze = milestone.feedback_deadline || milestone.planned_freeze;
  const offeneArbeit = tickets.filter(
    (t) => WORK_PHASES.includes(t.milestone_state || 'produktion') && t.status !== 'erledigt'
  ).length;

  return [
    {
      key: 'state',
      text: 'Etappe steht im Kundenfeedback',
      ok: milestone.state === 'kundenfeedback',
      blocking: true,
    },
    {
      key: 'handover',
      text: 'Übergabe an den Kunden ist erfolgt',
      ok: notifications.some((n) => n.type === 'A1'),
      blocking: true,
    },
    {
      key: 'deliverables',
      text: 'Lieferstand ist hinterlegt',
      ok: (milestone.deliverable_links || []).length > 0,
      blocking: true,
    },
    {
      key: 'tickets',
      text: 'Alle Aufgaben aus Input, Produktion und Prüfung sind erledigt',
      ok: offeneArbeit === 0,
      blocking: false,
      hint: offeneArbeit > 0 ? `${offeneArbeit} ${offeneArbeit === 1 ? 'Aufgabe' : 'Aufgaben'} noch offen` : null,
    },
    {
      key: 'feedback',
      text: 'Feedback liegt vor oder Freeze-Datum ist erreicht',
      ok: feedbacks.length > 0 || (!!freeze && freeze <= today),
      blocking: true,
    },
    {
      key: 'source',
      text: 'Freigabequelle ist angegeben',
      ok: source.trim().length > 2,
      blocking: true,
    },
  ];
}

// Alles Folgende läuft ohne weiteren Klick. Eine Rücknahme gibt es nicht.
export async function performFreigabe({ milestone, sprint, client, siblings = [], tickets = [], source, approvalType = 'aktiv' }) {
  const now = new Date().toISOString();

  await base44.entities.Approval.create({
    milestone_id: milestone.id,
    approved_at: now,
    approval_type: approvalType,
    source,
    frozen_state: JSON.stringify({
      titel: milestone.title,
      lieferstand: milestone.deliverable_links || [],
      aufgaben: tickets.map((t) => ({ titel: t.title, status: t.status, rolle: t.role })),
    }),
    approved_amount: milestone.milestone_amount || 0,
    agb_version: client?.agb_version || '',
  });

  await base44.entities.Milestone.update(milestone.id, {
    state: 'freigegeben',
    invoice_triggered: true,
    invoiced_at: now,
  });

  // A4 — Freigabebestätigung an den Kunden: wird vorgeschlagen, ein Mensch versendet sie.
  await base44.entities.NotificationLog.create({
    type: 'A4',
    milestone_id: milestone.id,
    sprint_id: sprint?.id,
    project_id: sprint?.project_id,
    recipient: client?.contact_email || '',
    sent_at: now,
    subject: `Freigabe bestätigt: ${milestone.title}`,
    body: `Die Etappe "${milestone.title}" wurde am ${new Date(now).toLocaleDateString('de-AT')} freigegeben. Quelle: ${source}. Die Lieferung folgt wie vereinbart.`,
    status: 'vorgeschlagen',
  });

  const restOffen = siblings.filter((m) => m.id !== milestone.id && m.state !== 'freigegeben').length;
  if (restOffen === 0 && sprint && sprint.status !== 'abgeschlossen') {
    await base44.entities.Sprint.update(sprint.id, { status: 'geliefert' });
  }
}