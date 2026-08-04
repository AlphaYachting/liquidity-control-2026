import { useQuery } from '@tanstack/react-query';
import { emailApi } from '@/components/crm/emails/emailApi';
import { buildTriageList, TRIAGE_PARAMS } from '@/components/crm/emails/emailTriage';

// Zähler der E-Mail-Zentrale — dieselbe Funktion und dieselben Parameter
// wie die Liste "Braucht Antwort", damit Zahl und Liste nie auseinanderlaufen.
export function useEmailTriageCount() {
  const { data } = useQuery({
    queryKey: ['email-triage-count'],
    queryFn: async () => {
      const res = await emailApi('threads', { params: TRIAGE_PARAMS });
      return buildTriageList(res?.results).length;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data || 0;
}