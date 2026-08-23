import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Ab wann eine unbearbeitete Anfrage als überfällig gilt
const OVERDUE_HOURS = 48;

export function useCrmInboxCount() {
  const { data = [] } = useQuery({
    queryKey: ['crm-inbox-badge'],
    queryFn: () => base44.entities.CrmInboxItem.filter({ status: 'new' }, '-created_date', 100),
    refetchInterval: 60000,
  });

  const grenze = Date.now() - OVERDUE_HOURS * 3600 * 1000;
  const overdue = data.filter((item) => {
    const ts = new Date(item.received_at || item.created_date).getTime();
    return ts && ts < grenze;
  }).length;

  return { total: data.length, overdue };
}