import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ModulPaketEditor from '@/components/sprint/paket/ModulPaketEditor';
import { zaehle } from '@/components/sprint/paket/paketZaehler';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import { modulTicketsAnlegen } from '@/lib/sprint/ensureContainer';
import { ohneArchiv } from '@/lib/sprint/aktivFilter';

export default function SprintModuleHinzufuegen() {
  const { sprintId } = useParams();
  const navigate = useNavigate();
  const [auswahl, setAuswahl] = useState([]);
  const [busy, setBusy] = useState(false);
  const zurueck = `/sprint/sprints/${sprintId}`;

  const { data } = useQuery({
    queryKey: ['moduleHinzufuegen', sprintId],
    queryFn: async () => {
      const [me, sprint] = await Promise.all([base44.auth.me(), base44.entities.Sprint.get(sprintId)]);
      const [project, milestones, modules, ticketTemplates, members] = await Promise.all([
        base44.entities.Project.get(sprint.project_id),
        base44.entities.Milestone.filter({ sprint_id: sprintId }, 'order', 50),
        base44.entities.ModuleTemplate.filter({ active: true }, 'name', 300),
        base44.entities.TicketTemplate.list('order', 2000),
        base44.entities.TeamMember.filter({ active: true }, 'name', 200),
      ]);
      const milestone = milestones.find((m) => !m.released) || null;
      const tickets = milestone ? await base44.entities.Ticket.filter(ohneArchiv({ milestone_id: milestone.id }), 'order', 1000) : [];
      return { me, project, milestone, modules, ticketTemplates, members, tickets };
    },
  });

  const erlaubt = data && data.milestone && projectTypeOf(data.project) === 'container' && data.me?.email === data.project.pm_email;
  useEffect(() => { if (data && !erlaubt) navigate(zurueck, { replace: true }); }, [data, erlaubt]);

  if (!erlaubt) return <Skeleton className="h-64 w-full bg-muted max-w-[1200px] mx-auto" />;
  const { project, milestone, modules, ticketTemplates, members, tickets } = data;
  const vorhanden = [...new Set(tickets.map((t) => t.module_template_id).filter(Boolean))];
  const z = zaehle(auswahl, ticketTemplates);

  const hinzufuegen = async () => {
    setBusy(true);
    await modulTicketsAnlegen(project, milestone, auswahl);
    navigate(`/sprint/milestones/${milestone.id}`);
  };

  return (
    <div className="-m-4 md:-m-6 flex flex-col min-h-[calc(100vh-2rem)]">
      <div className="flex-1 max-w-[1200px] w-full mx-auto px-4 py-5 space-y-4">
        <Link to={zurueck} className="text-sm text-muted-foreground hover:text-foreground">← {project.title}</Link>
        <h1 className="text-page uppercase">Module hinzufügen</h1>
        <div className="bg-white rounded-lg border border-border p-5">
          <ModulPaketEditor
            modules={modules}
            ticketTemplates={ticketTemplates}
            projektTyp="container"
            standardBetreuer={project.pm_email}
            members={members}
            bereitsVorhandeneModulIds={vorhanden}
            value={auswahl}
            onChange={setAuswahl}
          />
        </div>
      </div>
      <div className="sticky bottom-0 bg-white border-t border-border px-4 py-3">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            legt {z.routinen} {z.routinen === 1 ? 'Routine' : 'Routinen'} und {z.setup} Aufgaben an
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(zurueck)}>Abbrechen</Button>
            <Button disabled={busy || !auswahl.length} onClick={hinzufuegen}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Hinzufügen
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}