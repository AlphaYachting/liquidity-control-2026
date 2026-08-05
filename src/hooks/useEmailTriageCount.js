import { useQuery } from '@tanstack/react-query';
import { buildTriageList } from '@/components/crm/emails/emailTriage';
import { loadWorkQueueThreads } from '@/components/crm/emails/emailWorkQueueSource';

// Zähler der E-Mail-Zentrale — dieselbe Quelle und dieselbe Regel
// wie die Liste "Braucht Antwort", damit Zahl und Liste nie auseinanderlaufen.
export function useEmailTriageCount() {
  const { data } = useQuery({
    queryKey: ['email-triage-count'],
    queryFn: async () => buildTriageList(await loadWorkQueueThreads('30')).length,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data || 0;
}