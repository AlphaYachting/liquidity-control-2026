import { emailApi } from '@/components/crm/emails/emailApi';
import { formatMailDate } from '@/components/crm/emails/emailConfig';

const clip = (s, max = 1200) => {
  const t = String(s || '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

// Vollständiger Verlauf als Text — Quelldokument für das Angebots-Studio.
export async function threadTranscript(threadId) {
  if (!threadId) return '';
  // Gleicher Aufruf wie in der E-Mail-Zentrale: Parameter liegen unter params, full=1 liefert den ganzen Text
  const data = await emailApi('thread', { params: { id: threadId, msgs: 50, full: 1 } }).catch(() => null);
  const messages = data?.messages || [];
  if (messages.length === 0) return '';
  const subject = data?.thread?.subject ? `Betreff: ${data.thread.subject}\n\n` : '';
  return subject + [...messages].reverse().map((m) => {
    const head = `${m.from_name || m.from || 'Unbekannt'} <${m.from || ''}> · ${formatMailDate(m.received_at)} · ${m.direction === 'in' ? 'eingehend' : 'ausgehend'}`;
    return `${head}\n${String(m.text || m.preview || '').trim()}`;
  }).join('\n\n---\n\n');
}

// Baut die Ticket-Beschreibung aus dem echten E-Mail-Verlauf (jüngste Kundennachricht zuerst).
export async function descriptionFromThread(threadId) {
  if (!threadId) return '';
  const data = await emailApi('thread', { params: { id: threadId, msgs: 15, full: 1 } }).catch(() => null);
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