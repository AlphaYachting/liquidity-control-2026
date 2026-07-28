import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { isClosedStage } from '@/components/crm/stages';

// Offene Deals, die noch nie geöffnet wurden (seen_at leer) = NEU in der Pipeline
export function useNewDeals() {
  const { data = [] } = useQuery({
    queryKey: ['crm-new-deals'],
    queryFn: () => base44.entities.CrmDeal.list('-created_date', 500),
    refetchInterval: 60000,
  });
  return data.filter((d) => !d.seen_at && !isClosedStage(d.stage));
}

export function useNewDealsCount() {
  return useNewDeals().length;
}