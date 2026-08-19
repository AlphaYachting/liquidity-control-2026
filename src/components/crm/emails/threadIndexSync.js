import { base44 } from '@/api/base44Client';

// Der Verlaufs-Index ist die Quelle der Arbeitsliste "Braucht Antwort".
// Entscheidungen in der E-Mail-Zentrale (erledigt / wieder öffnen) müssen dort
// sofort mitgeschrieben werden — sonst taucht ein längst erledigter Verlauf beim
// nächsten Laden wieder auf, weil der Index erst beim nächsten Detailabruf
// nachzieht (bei älteren Verläufen praktisch nie).
export async function syncThreadIndexStatus(threadId, status) {
  if (!threadId) return;
  const rows = await base44.entities.EmailThreadIndex.filter({ thread_id: String(threadId) }, '-last_message_at', 1);
  const row = rows[0];
  if (!row) return;
  await base44.entities.EmailThreadIndex.update(row.id, {
    status,
    needs_reply: status === 'offen' ? row.needs_reply : false,
  });
}