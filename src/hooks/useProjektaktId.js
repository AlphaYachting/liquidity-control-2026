import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Der Projektakt hängt immer am Arbeitsprojekt (Project.id) — nie am Projekt-Cockpit.
// Aus dem Cockpit heraus wird das verknüpfte Arbeitsprojekt gesucht; ohne
// verknüpftes Arbeitsprojekt gibt es keinen Projektakt (projektId = null).
export default function useProjektaktId({ cockpitId }) {
  const { data: projekte = [], isLoading } = useQuery({
    queryKey: ['projektakt-arbeitsprojekt', cockpitId || null],
    queryFn: () => base44.entities.Project.filter({ liquidity_project_id: cockpitId }, 'created_date', 5),
    enabled: !!cockpitId,
    staleTime: 5 * 60 * 1000,
  });
  return { projektId: projekte[0]?.id || null, isLoading: !!cockpitId && isLoading };
}
