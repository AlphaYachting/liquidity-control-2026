import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useCrmInboxCount() {
  const { data = [] } = useQuery({
    queryKey: ['crm-inbox-badge'],
    queryFn: () => base44.entities.CrmInboxItem.filter({ status: 'new' }, '-created_date', 100),
    refetchInterval: 60000,
  });
  return data.length;
}