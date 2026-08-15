import { base44 } from '@/api/base44Client';
import { threadIdOf } from '@/components/crm/inboxDecision';
import { emailApi } from '@/components/crm/emails/emailApi';

const FAR_FUTURE = '2099-12-31';

// Dauerhaftes Support-Projekt je Kunde: Abrechnung nach Aufwand, ein offener
// Support-Milestone als Behälter für alle Support-Tickets.
export async function ensureSupportProject({ customer, pmEmail, contactEmail, stundensatz }) {
  const title = `Support — ${customer}`;
  const existing = (await base44.entities.Project.filter({ title }))[0];
  let project = existing;

  if (!project) {
    let client = (await base44.entities.Client.filter({ name: customer }))[0];
    if (!client) {
      client = await base44.entities.Client.create({
        name: customer,
        contact_email: contactEmail || pmEmail,
        agb_version: 'laufend',
      });
    }
    project = await base44.entities.Project.create({
      client_id: client.id,
      title,
      pm_email: pmEmail,
      status: 'aktiv',
      abrechnungsmodell: 'aufwand',
      stundensatz: stundensatz || 0,
    });
  } else if (stundensatz && !project.stundensatz) {
    await base44.entities.Project.update(project.id, { stundensatz });
  }

  let sprint = (await base44.entities.Sprint.filter({ project_id: project.id }))[0];
  if (!sprint) {
    sprint = await base44.entities.Sprint.create({
      project_id: project.id,
      title: 'Laufender Support',
      size: 'S',
      start_date: new Date().toISOString().slice(0, 10),
      delivery_date: FAR_FUTURE,
      status: 'laufend',
    });
  }

  let milestone = (await base44.entities.Milestone.filter({ sprint_id: sprint.id }))
    .find(m => !m.released);
  if (!milestone) {
    milestone = await base44.entities.Milestone.create({
      sprint_id: sprint.id,
      order: 1,
      title: 'Support-Anfragen',
      state: 'produktion',
      milestone_amount: 0,
      planned_freeze: FAR_FUTURE,
    });
  }

  return { project, milestone };
}

// Support-Anfrage in ein Ticket überführen — es entsteht KEINE Rechnung.
// Rückgabe: { ticket, back: { ok, error? } }
export async function createSupportTicket({ item, projectId, milestoneId, values }) {
  const user = await base44.auth.me().catch(() => null);
  const threadId = threadIdOf(item);

  const ticket = await base44.entities.Ticket.create({
    project_id: projectId,
    milestone_id: milestoneId,
    title: values.title,
    description: `${values.description || ''}${threadId ? `\n\nKonversation: /crm/emails?thread=${threadId}` : ''}`.trim(),
    role: values.role,
    target_hours: Number(values.target_hours) || 0,
    assignee_email: values.assignee_email || '',
    origin: 'support',
    status: 'offen',
  });

  // Nur wenn die Anfrage aus dem Posteingang stammt — Threads aus der E-Mail-Zentrale
  // haben keinen Posteingangs-Eintrag.
  if (item.id) {
    await base44.entities.CrmInboxItem.update(item.id, {
      status: 'converted',
      decision: 'zugeordnet',
      linked_ticket_id: ticket.id,
      decided_by: user?.email || '',
      decided_at: new Date().toISOString(),
    });
  }

  let back = { ok: true };
  if (threadId) {
    try {
      await emailApi('enrich', {
        thread_id: threadId,
        fields: { crm_status: 'in Bearbeitung als Support-Ticket', status: 'erledigt' },
      });
    } catch (e) {
      back = { ok: false, error: e?.message || 'unbekannter Fehler' };
    }
  }

  return { ticket, back };
}