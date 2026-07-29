import { useQuery } from '@tanstack/react-query';
import { emailApi } from '@/components/crm/emails/emailApi';
import { deriveCustomerFromEmail, isInternalSender } from '@/components/crm/emails/emailConfig';

// Lädt kritische E-Mail-Threads (KI-Auswertung) aus der zentralen E-Mail-Datenbank:
// Eskalationen UND offene Reklamationen — beides erfordert Handeln.
// with_reply_state liefert die echten Absender-/Empfängerdaten des Threads mit,
// damit der Alert ohne Öffnen der E-Mail-Zentrale beurteilbar ist.
export function useEmailEscalations(days = 60) {
  return useQuery({
    queryKey: ['email-escalations', days],
    queryFn: async () => {
      const data = await emailApi('threads', { params: { days, limit: 200, with_reply_state: 1 } });
      return (data?.results || [])
        .filter((t) => Number(t.eskalation) === 1 || (t.category === 'reklamation' && t.status !== 'erledigt'))
        .map((t) => {
          const externalFrom = t.last_inbound_from || (isInternalSender(t.last_from) ? '' : t.last_from) || '';
          return {
            ...t,
            external_from: externalFrom,
            customer_label:
              t.customer_normalized || t.customer || deriveCustomerFromEmail(externalFrom) || null,
          };
        });
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}