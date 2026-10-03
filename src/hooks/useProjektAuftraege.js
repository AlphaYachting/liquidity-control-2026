import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { finanzIdVon } from '@/lib/projekt/cockpitSicherstellen';

// Aufträge (AB) eines Projekts, neuester zuerst — eine Abfrage für den
// Terminhinweis im Kopf und die Projektbeschreibung.
export default function useProjektAuftraege(project) {
  const finanzId = finanzIdVon(project);
  return useQuery({
    queryKey: ['projektAbrechnung', 'auftraege', finanzId],
    enabled: Boolean(project?.id),
    queryFn: () => base44.entities.ConfirmedOrder.filter({ project_id: finanzId }, '-created_date', 20),
  });
}
