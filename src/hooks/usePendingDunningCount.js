import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Zählt Mahnungsentwürfe, die noch auf Freigabe/Ablehnung warten.
export function usePendingDunningCount() {
  const { data: records = [] } = useQuery({
    queryKey: ['dunningRecords'],
    queryFn: () => base44.entities.DunningRecord.list('-created_date', 200),
  });

  return records.filter(r => r.status === 'draft_created').length;
}