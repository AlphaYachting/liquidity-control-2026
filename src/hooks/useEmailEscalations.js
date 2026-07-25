import { useQuery } from '@tanstack/react-query';
import { emailApi } from '@/components/crm/emails/emailApi';

// Lädt kritische E-Mail-Threads (KI-Auswertung) aus der zentralen E-Mail-Datenbank:
// Eskalationen UND offene Reklamationen — beides erfordert Handeln.
export function useEmailEscalations(days = 60) {
  return useQuery({
    queryKey: ['email-escalations', days],
    queryFn: async () => {
      const data = await emailApi('threads', { params: { days, limit: 200 } });
      return (data?.results || []).filter(
        (t) => Number(t.eskalation) === 1 || (t.category === 'reklamation' && t.status !== 'erledigt')
      );
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}