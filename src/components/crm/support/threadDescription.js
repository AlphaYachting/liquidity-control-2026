import { emailApi } from '@/components/crm/emails/emailApi';
import { formatMailDate } from '@/components/crm/emails/emailConfig';

const clip = (s, max = 1200) => {
  const t = String(s || '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

// Baut die Ticket-Beschreibung aus dem echten E-Mail-Verlauf (jüngste Kundennachricht zuerst).
export async function descriptionFromThread(threadId) {
  if (!threadId) return '';
  const data = await emailApi('thread', { thread_id: threadId }).catch(() => null);
  const messages = data?.messages || [];
  if (messages.length === 0) return '';

  const inbound = messages.filter((m) => m.direction === 'in');
  const relevant = (inbound.length > 0 ? inbound : messages).slice(0, 3);

  return relevant
    .map((m) => {
      const head = `${m.from_name || m.from || 'Unbekannt'} · ${formatMailDate(m.received_at)}`;
      return `${head}\n${clip(m.text || m.preview || '')}`;
    })
    .join('\n\n---\n\n');
}