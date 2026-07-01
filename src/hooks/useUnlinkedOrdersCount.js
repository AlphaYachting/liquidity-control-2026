import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Zählt Auftragsbestätigungen ab 2026, die noch keinem Projekt-Cockpit
// (LiquidityProject) zugeordnet sind (project_id leer) und nicht storniert wurden.
export function useUnlinkedOrdersCount() {
  const { data: orders = [] } = useQuery({
    queryKey: ['confirmedOrders'],
    queryFn: () => base44.entities.ConfirmedOrder.list(),
  });

  const count = orders.filter(o => {
    if (o.project_id || o.status === 'cancelled') return false;
    const d = o.confirmation_date || o.signed_date || o.created_date;
    return d ? new Date(d).getFullYear() >= 2026 : false;
  }).length;

  return count;
}