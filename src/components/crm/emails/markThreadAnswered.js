import { emailApi } from '@/components/crm/emails/emailApi';
import { syncThreadIndexStatus } from '@/components/crm/emails/threadIndexSync';

// Sobald aus der E-Mail-Zentrale heraus geantwortet wird, ist der Verlauf bearbeitet:
// Status in der zentralen E-Mail-Datenbank UND im Verlaufs-Verzeichnis setzen,
// damit der Verlauf aus "Braucht Antwort" fällt.
export async function markThreadAnswered(threadId) {
  if (!threadId) return;
  await emailApi('enrich', { thread_id: threadId, fields: { status: 'erledigt' } });
  await syncThreadIndexStatus(threadId, 'erledigt');
}