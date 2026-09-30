import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Namen aller Leistungsbereiche — einmal geladen, von allen Buchungszeilen geteilt.
export function useBereichNamen() {
  const { data = {} } = useQuery({
    queryKey: ['zeitBereichNamen'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const rows = await base44.entities.ModuleTemplate.list('name', 500);
      return Object.fromEntries(rows.map((m) => [m.id, m.name]));
    },
  });
  return data;
}