import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();

// Der Kundenakt hängt am Projekt-Cockpit (LiquidityProject). Ist das Cockpit
// fest verknüpft (liquidityProjectId), gilt es direkt; sonst Rückfall auf den
// Abgleich über Kunde und Projekttitel.
export default function useKundenaktProjektId({ customer, title, fallbackId, liquidityProjectId }) {
  const { data: projekte = [], isLoading } = useQuery({
    queryKey: ['kundenakt-projekt', customer],
    queryFn: () => base44.entities.LiquidityProject.filter({ customer }),
    enabled: !!customer && !liquidityProjectId,
  });

  if (liquidityProjectId) {
    return { projektId: liquidityProjectId, cockpitProjekt: null, isLoading: false };
  }

  const t = norm(title);
  const treffer = projekte.find((p) => norm(p.project_name) === t)
    || projekte.find((p) => t && (norm(p.project_name).includes(t) || t.includes(norm(p.project_name))))
    || null;

  return {
    projektId: treffer?.id || fallbackId,
    cockpitProjekt: treffer,
    isLoading: !!customer && isLoading,
  };
}