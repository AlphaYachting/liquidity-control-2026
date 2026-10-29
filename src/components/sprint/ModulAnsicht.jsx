import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import TicketZeile from '@/components/sprint/TicketZeile';
import ModulKarte from '@/components/sprint/modul/ModulKarte';

// Container-Etappe: je Modul eine Karte statt Phasengruppen.
export default function ModulAnsicht({ tickets, matches, members, myEmail, project, onStatus, onAssignee, onRefresh, darfRoutine = false }) {
  const ids = [...new Set(tickets.map((t) => t.module_template_id).filter(Boolean))];
  const { data: module = [] } = useQuery({
    queryKey: ['modulAnsichtModule', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: () => base44.entities.ModuleTemplate.filter({ id: { $in: ids } }, 'name', 200),
  });
  // Sprung aus „Heute“: #modul-{id} nach dem Laden der Module anfahren
  React.useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && module.length) document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [module.length]);
  // Über „Routine beenden“ archivierte Instanzen: deren Vorgänger markieren die Kette als beendet
  const { data: beendetIds } = useQuery({
    queryKey: ['modulAnsichtBeendet', project?.id],
    enabled: !!project?.id,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const rows = await base44.entities.Ticket.filter({ project_id: project.id, archiviert: true, archiv_grund: 'routine_beendet' }, 'order', 200).catch(() => []);
      return new Set(rows.map((t) => t.vorgaenger_id).filter(Boolean));
    },
  });
  const weitere = tickets.filter((t) => !t.module_template_id || !module.some((m) => m.id === t.module_template_id));
  const weitereSichtbar = weitere.filter(matches);

  return (
    <div className="space-y-3">
      {module.map((m) => {
        const eigene = tickets.filter((t) => t.module_template_id === m.id);
        if (!eigene.some(matches)) return null;
        return (
          <div key={m.id} id={`modul-${m.id}`} className="scroll-mt-4">
          <ModulKarte
            name={m.name}
            tickets={eigene}
            alleTickets={tickets}
            beendetIds={beendetIds}
            matches={matches}
            members={members}
            myEmail={myEmail}
            onStatus={onStatus}
            onAssignee={onAssignee}
            onRefresh={onRefresh}
            darfRoutine={darfRoutine}
          />
          </div>
        );
      })}
      {weitereSichtbar.length > 0 && (
        <div className="bg-white rounded-lg border border-border p-5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-foreground mb-2">Weitere Aufgaben</h3>
          {weitereSichtbar.map((t) => (
            <TicketZeile key={t.id} ticket={t} members={members} currentUserEmail={myEmail} editable onStatus={onStatus} onAssignee={onAssignee} />
          ))}
        </div>
      )}
    </div>
  );
}