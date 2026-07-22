import { useQuery } from '@tanstack/react-query';
import { emailApi } from '@/components/crm/emails/emailApi';

// Zentraler, rein lesender Hook: E-Mail-Threads eines Kunden (letzte 90 Tage).
// Gemeinsamer Query-Key → eine Abfrage pro Kunde, gecacht für alle Komponenten.
export function useCustomerEmailThreads(customer) {
  return useQuery({
    queryKey: ['customer-emails', customer],
    queryFn: () => emailApi('threads', { params: { customer, days: 90, limit: 20 } }),
    enabled: !!customer,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

// Leitet einen Kommunikations-Status aus den Threads ab (rein abgeleitet, keine Writes).
export function deriveCommunicationStatus(threads) {
  if (!threads || threads.length === 0) return { level: 'none', label: 'Keine E-Mails (90 Tage)' };
  const escalated = threads.filter((t) => Number(t.eskalation) === 1);
  if (escalated.length > 0) return { level: 'critical', label: `Eskalation (${escalated.length})`, threads: escalated };
  const waiting = threads.filter((t) => t.status === 'offen' || t.status === 'wartet_auf_kunde');
  if (waiting.length > 0) return { level: 'attention', label: `${waiting.length} offene Konversation${waiting.length > 1 ? 'en' : ''}`, threads: waiting };
  return { level: 'ok', label: 'Kommunikation unauffällig' };
}