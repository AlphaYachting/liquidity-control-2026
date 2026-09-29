import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Loader2 } from 'lucide-react';
import StepContainerModule from '@/components/sprint/assistent/StepContainerModule';
import { modulTicketsAnlegen } from '@/lib/sprint/ensureContainer';

// Weiteres Modul in einen laufenden Container-Behälter aufnehmen.
export default function ModulHinzufuegenKnopf({ project, milestone, tickets, onAdded }) {
  const [offen, setOffen] = useState(false);
  const [auswahl, setAuswahl] = useState([]);
  const [busy, setBusy] = useState(false);
  const vorhanden = [...new Set(tickets.map((t) => t.module_template_id).filter(Boolean))];

  const { data } = useQuery({
    queryKey: ['modulKatalogFuerBehaelter'],
    enabled: offen,
    queryFn: async () => {
      const [modules, ticketTemplates, members] = await Promise.all([
        base44.entities.ModuleTemplate.filter({ active: true }, 'name', 300),
        base44.entities.TicketTemplate.list('order', 2000),
        base44.entities.TeamMember.filter({ active: true }, 'name', 200),
      ]);
      return { modules, ticketTemplates, members };
    },
  });

  const hinzufuegen = async () => {
    setBusy(true);
    await modulTicketsAnlegen(project, milestone, auswahl);
    setBusy(false);
    setOffen(false);
    setAuswahl([]);
    onAdded?.();
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOffen(true)}>
        <Plus className="w-4 h-4" /> Modul hinzufügen
      </Button>
      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Modul hinzufügen</DialogTitle></DialogHeader>
          {!data ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : (
            <StepContainerModule
              key={vorhanden.join(',')}
              modules={data.modules}
              ticketTemplates={data.ticketTemplates}
              projektTyp="container"
              standardBetreuer={project.pm_email}
              members={data.members}
              bereitsVorhandeneModulIds={vorhanden}
              value={auswahl}
              onChange={setAuswahl}
            />
          )}
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setOffen(false)}>Abbrechen</Button>
            <Button disabled={busy || !auswahl.length} onClick={hinzufuegen}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Hinzufügen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}