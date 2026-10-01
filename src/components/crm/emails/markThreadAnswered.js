import { emailApi } from '@/components/crm/emails/emailApi';

// Sobald aus der App heraus geantwortet wird, ist der Verlauf bearbeitet.
// Die Backend-Funktion setzt den Status in der E-Mail-Datenbank und zieht das
// Verlaufs-Verzeichnis (Quelle des Posteingangs) samt Parallel-Verläufen nach.
export async function markThreadAnswered(threadId) {
  if (!threadId) return;
  await emailApi('enrich', { thread_id: threadId, fields: { status: 'erledigt' } });
}
