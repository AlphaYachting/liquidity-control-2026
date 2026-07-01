import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Zählt Auftragsbestätigungen, die noch keinem Projekt-Cockpit (LiquidityProject)
// zugeordnet sind (project_id leer) und nicht storniert wurden.
export function useUnlinkedOrdersCount() {
  const { data: orders = [] } = useQuery({
    queryKey: ['confirmedOrders'],
    queryFn: () => base44.entities.ConfirmedOrder.list(),
  });

  const count = orders.filter(
    o => !o.project_id && o.status !== 'cancelled'
  ).length;

  return count;
}