import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Zusatzkontext für die Projektintelligenz: Stillstand, Statuslage, weitere
// Aufträge/Projekte desselben Kunden. Nur lesend.
export default function useProjektIntelligenzKontext({ projectId, customer, aworkProjectId, aworkTasks = [] }) {
  const { data: zeitbuchungen = [] } = useQuery({
    queryKey: ['awork-times-project', aworkProjectId],
    queryFn: () => base44.entities.AworkTimeEntry.filter({ awork_project_id: aworkProjectId }, '-entry_date', 500),
    enabled: !!aworkProjectId
  });

  const { data: kundenProjekte = [] } = useQuery({
    queryKey: ['kunden-projekte', customer],
    queryFn: () => base44.entities.LiquidityProject.filter({ customer }),
    enabled: !!customer
  });

  const { data: kundenAuftraege = [] } = useQuery({
    queryKey: ['kunden-auftraege', customer],
    queryFn: () => base44.entities.ConfirmedOrder.filter({ customer }),
    enabled: !!customer
  });

  const letzteZeitbuchung = zeitbuchungen
    .map(e => e.entry_date)
    .filter(Boolean)
    .sort()
    .reverse()[0] || null;

  const tageSeitZeitbuchung = letzteZeitbuchung
    ? Math.floor((Date.now() - new Date(letzteZeitbuchung).getTime()) / 86400000)
    : null;

  return {
    letzteZeitbuchung,
    tageSeitZeitbuchung,
    hatBlockiertStatus: aworkTasks.some(t => t.task_status_type === 'blocked'),
    weitereProjekteDesKunden: kundenProjekte
      .filter(p => p.id !== projectId)
      .map(p => ({ id: p.id, project_name: p.project_name })),
    weitereAuftraegeDesKunden: kundenAuftraege
      .filter(o => o.project_id !== projectId)
      .map(o => ({ order_number: o.order_number, project_name: o.project_name, total_net_amount: o.total_net_amount })),
  };
}