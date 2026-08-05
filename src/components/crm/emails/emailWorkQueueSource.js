import { base44 } from '@/api/base44Client';

// Quelle der Arbeitsliste: der eigene Verlaufs-Index der App.
// Die zentrale E-Mail-Datenbank liefert nur die 100 neuesten Verläufe ohne
// Blätterfunktion — der Index kennt dagegen jeden je gesehenen Verlauf.
export async function loadWorkQueueThreads(days = '30') {
  const rows = await base44.entities.EmailThreadIndex.filter({ needs_reply: true }, '-last_message_at', 300);
  const cutoff = days === 'all' ? null : Date.now() - Number(days) * 86400000;
  return rows
    .map((r) => ({ ...r, id: Number(r.thread_id) }))
    .filter((r) => {
      if (!cutoff) return true;
      const t = new Date(String(r.last_message_at || '').slice(0, 19).replace(' ', 'T') + 'Z').getTime();
      return !t || t >= cutoff;
    });
}