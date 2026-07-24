import { useQuery } from '@tanstack/react-query';
import { emailApi } from '@/components/crm/emails/emailApi';

// Zählt E-Mail-Threads mit Handlungsbedarf (offen oder Eskalation) der letzten 14 Tage.
export function useEmailActionCount() {
  const { data } = useQuery({
    queryKey: ['email-action-count'],
    queryFn: async () => {
      const res = await emailApi('threads', { params: { days: 14, limit: 200 } });
      return (res?.results || []).filter(
        (t) => t.status === 'offen' || Number(t.eskalation) === 1
      ).length;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data || 0;
}