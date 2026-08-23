import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Voreinstellungen der Rundung aus Setting (Gruppe 'abrechnung') als flache Zuordnung.
export function useRundungsSettings() {
  const { data = {} } = useQuery({
    queryKey: ['rundungsSettings'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const rows = await base44.entities.Setting.filter({ group: 'abrechnung' }, 'key', 200);
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
  });
  return data;
}