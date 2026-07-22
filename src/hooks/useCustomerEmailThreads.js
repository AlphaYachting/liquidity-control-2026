import { useQuery } from '@tanstack/react-query';
import { emailApi } from '@/components/crm/emails/emailApi';

const STOPWORDS = new Set(['der', 'die', 'das', 'und', 'the']);
const LEGAL_FORMS = /\b(gmbh|ag|kg|og|se|holding|gesellschaft|m\.b\.h\.?|mbh|d\.o\.o\.?|co)\b/gi;

// Kernname der Firma für die Volltextsuche (Rechtsform & Füllwörter entfernt).
export function coreCustomerName(name) {
  const cleaned = (name || '').replace(LEGAL_FORMS, ' ').replace(/[.,&]/g, ' ').replace(/\s+/g, ' ').trim();
  const word = cleaned.split(' ').find((w) => w.length >= 3 && !STOPWORDS.has(w.toLowerCase()));
  return word || null;
}

// Zentraler, rein lesender Hook: E-Mail-Threads eines Kunden (letzte 90 Tage).
// 1. Direkte Kundenzuordnung (KI-angereichert). 2. Fallback: Volltextsuche nach dem Firmennamen.
export function useCustomerEmailThreads(customer) {
  return useQuery({
    queryKey: ['customer-emails', customer],
    queryFn: async () => {
      const direct = await emailApi('threads', { params: { customer, days: 90, limit: 20 } });
      if (direct?.results?.length) return { mode: 'direct', results: direct.results };

      const core = coreCustomerName(customer);
      if (!core) return { mode: 'direct', results: [] };
      const search = await emailApi('search', { params: { q: core, days: 90, limit: 25 } });
      const byThread = new Map();
      for (const m of search?.results || []) {
        const from = (m.from || '').toLowerCase();
        if (from.includes('no-reply') || from.includes('noreply')) continue;
        const existing = byThread.get(m.thread_id);
        if (!existing || (m.received_at || '') > (existing.last_message_at || '')) {
          byThread.set(m.thread_id, {
            id: m.thread_id,
            subject: m.subject,
            summary: null,
            category: null,
            status: null,
            eskalation: 0,
            last_message_at: m.received_at,
          });
        }
      }
      const stubs = [...byThread.values()].sort((a, b) => (b.last_message_at || '').localeCompare(a.last_message_at || ''));

      // KI-Bewertungen (Kategorie, Status, Eskalation) für die neuesten Treffer nachladen,
      // damit auch ohne direkte Kundenzuordnung die Kommunikationsqualität sichtbar ist.
      const enriched = await Promise.all(
        stubs.slice(0, 8).map(async (stub) => {
          try {
            const detail = await emailApi('thread', { params: { id: stub.id, msgs: 1 } });
            const t = detail?.thread || {};
            return { ...stub, summary: t.summary || null, category: t.category || null, status: t.status || null, eskalation: Number(t.eskalation) || 0 };
          } catch {
            return stub;
          }
        })
      );
      return { mode: 'search', search_term: core, results: [...enriched, ...stubs.slice(8)] };
    },
    enabled: !!customer,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

// Leitet die Kommunikationsqualität aus den Threads ab (rein abgeleitet, keine Writes):
// Rot = Eskalation (eingreifen), Gelb = Reklamation (prüfen), Grün = Kommunikation gut.
export function deriveCommunicationStatus(data) {
  const threads = data?.results || [];
  if (threads.length === 0) return { level: 'none', label: 'Keine E-Mails (90 Tage)' };
  const escalated = threads.filter((t) => Number(t.eskalation) === 1);
  if (escalated.length > 0) return { level: 'critical', label: `Eingreifen erforderlich (${escalated.length})`, threads: escalated };
  const complaints = threads.filter((t) => t.category === 'reklamation');
  if (complaints.length > 0) return { level: 'attention', label: `Reklamation — prüfen (${complaints.length})`, threads: complaints };
  if (threads.every((t) => !t.category)) return { level: 'pending', label: 'KI-Auswertung ausstehend' };
  return { level: 'ok', label: 'Kommunikation gut' };
}