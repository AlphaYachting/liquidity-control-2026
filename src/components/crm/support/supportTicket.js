import { base44 } from '@/api/base44Client';
import { threadIdOf } from '@/components/crm/inboxDecision';
import { emailApi } from '@/components/crm/emails/emailApi';
import { ensureContainer } from '@/lib/sprint/ensureContainer';

export const SUPPORT_MODELS = ['aufwand', 'support'];
export const DEFAULT_SUPPORT_RATE = 130;

const supportTitle = (customer) => `Support — ${customer}`;

// Behälter (Sprint + offener Milestone) am Support-Projekt sicherstellen —
// ohne Liefertermin, ohne Etappenbetrag.
async function ensureSupportContainer(project) {
  const { milestone } = await ensureContainer(project, {
    sprintTitle: 'Laufender Support',
    milestoneTitle: 'Support-Anfragen',
  });
  return milestone;
}

// Ein dauerhaftes Support-Projekt je Kunde — bestehendes wird immer wiederverwendet.
// Gesucht wird nach Kunde (Client) und Abrechnungsmodell 'aufwand' oder 'support',
// erst danach wird angelegt.
export async function resolveSupportProject(customerName, options = {}) {
  const customer = String(customerName || '').trim();
  if (!customer) throw new Error('Für ein Support-Ticket braucht es einen Kunden.');

  const { pmEmail = '', contactEmail = '', stundensatz } = options;
  let client = (await base44.entities.Client.filter({ name: customer }))[0];

  let project = null;
  if (client) {
    const byClient = await base44.entities.Project.filter({ client_id: client.id });
    project = byClient.find(p => SUPPORT_MODELS.includes(p.abrechnungsmodell) && p.status !== 'abgeschlossen')
      || byClient.find(p => SUPPORT_MODELS.includes(p.abrechnungsmodell))
      || null;
  }
  if (!project) {
    project = (await base44.entities.Project.filter({ title: supportTitle(customer) }))[0] || null;
  }

  if (!project) {
    if (!client) {
      client = await base44.entities.Client.create({
        name: customer,
        contact_email: contactEmail || pmEmail,
        agb_version: 'laufend',
      });
    }
    project = await base44.entities.Project.create({
      client_id: client.id,
      title: supportTitle(customer),
      pm_email: pmEmail,
      status: 'aktiv',
      abrechnungsmodell: 'aufwand',
      stundensatz: Number(stundensatz) || DEFAULT_SUPPORT_RATE,
    });
  } else if (stundensatz && !project.stundensatz) {
    await base44.entities.Project.update(project.id, { stundensatz: Number(stundensatz) });
  }

  const milestone = await ensureSupportContainer(project);
  return { project, project_id: project.id, milestone_id: milestone.id };
}

// Support-Anfrage in ein Ticket überführen — es entsteht KEINE Rechnung.
// Rückgabe: { ticket, back: { ok, error? } }
export async function createSupportTicket({ item, projectId, milestoneId, values }) {
  const user = await base44.auth.me().catch(() => null);
  const threadId = threadIdOf(item);
  const threadLink = threadId ? `/crm/emails?thread=${threadId}` : '';

  const ticket = await base44.entities.Ticket.create({
    project_id: projectId,
    milestone_id: milestoneId,
    title: values.title,
    description: `${values.description || ''}${threadLink ? `\n\nKonversation: ${threadLink}` : ''}`.trim(),
    role: values.role,
    target_hours: Number(values.target_hours) || 0,
    assignee_email: values.assignee_email || '',
    origin: 'support',
    status: 'offen',
    source_thread_id: threadId ? String(threadId) : '',
    customer_name: values.customer || '',
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

  // Rückkanal in die E-Mail-Datenbank — der Thread verlässt „braucht Entscheidung"
  let back = { ok: true };
  if (threadId) {
    try {
      await emailApi('enrich', {
        thread_id: threadId,
        fields: {
          crm_status: 'supportticket_angelegt',
          crm_ticket_id: ticket.id,
          status: 'beantwortet',
        },
      });
    } catch (e) {
      back = { ok: false, error: e?.message || 'unbekannter Fehler' };
    }
  }

  return { ticket, back };
}