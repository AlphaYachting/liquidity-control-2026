import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import SectionLabel from '@/components/sprint/SectionLabel';
import SprintKopf from '@/components/sprint/SprintKopf';
import EtappenZeile from '@/components/sprint/EtappenZeile';
import ProjektUebersicht from '@/components/sprint/uebersicht/ProjektUebersicht';
import KommentarStrang from '@/components/sprint/kommentare/KommentarStrang';
import CustomerEmailSection from '@/components/crm/emails/CustomerEmailSection';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AbrechnungSektion from '@/components/sprint/abrechnung/AbrechnungSektion';
import { sprintStatus } from '@/lib/sprint/status';
import { Button } from '@/components/ui/button';
import { BrainCircuit } from 'lucide-react';
import ProjectIntelligenceSheet from '@/components/projects/ProjectIntelligenceSheet';
import KundenaktTab from '@/components/projects/kundenakt/KundenaktTab';
import useKundenaktProjektId from '@/hooks/useKundenaktProjektId';

// S4 — Sprint-Übersicht: ein Kopf mit Kennzahlen, Etappen als Zeilen in einer Karte.
export default function SprintDetail() {
  const { sprintId } = useParams();
  const [intelligenzOffen, setIntelligenzOffen] = React.useState(false);
  const [intelligenzModus, setIntelligenzModus] = React.useState('frage');
  const oeffneIntelligenz = (modus) => { setIntelligenzModus(modus); setIntelligenzOffen(true); };

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sprintDetail', sprintId],
    queryFn: async () => {
      const sprint = await base44.entities.Sprint.get(sprintId);
      const [project, milestones, members] = await Promise.all([
        base44.entities.Project.get(sprint.project_id).catch(() => null),
        base44.entities.Milestone.filter({ sprint_id: sprintId }, 'order', 100),
        base44.entities.TeamMember.filter({ active: true }, 'name', 100),
      ]);
      const client = project ? await base44.entities.Client.get(project.client_id).catch(() => null) : null;
      const milestoneIds = milestones.map((m) => m.id);
      const [tickets, timeEntries, focusDays] = await Promise.all([
        milestoneIds.length
          ? base44.entities.Ticket.filter({ milestone_id: { $in: milestoneIds } }, 'order', 1000)
          : Promise.resolve([]),
        base44.entities.TimeEntry.filter({ project_id: sprint.project_id }, '-entry_date', 1000),
        base44.entities.FocusDay.filter({ project_id: sprint.project_id, type: 'focus' }, 'day', 500),
      ]);
      return { sprint, project, client, milestones, tickets, members, timeEntries, focusDays };
    },
  });

  const { projektId: aktProjektId } = useKundenaktProjektId({
    customer: data?.client?.name,
    title: data?.project?.title,
    fallbackId: data?.sprint?.project_id,
  });

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-40 w-full bg-muted" />
        <Skeleton className="h-40 w-full bg-muted" />
      </div>
    );
  }

  const { sprint, project, client, milestones, tickets, members, timeEntries, focusDays } = data;

  const status = sprintStatus({ sprint, milestones, tickets, timeEntries, focusDays });

  const peopleOf = (milestoneId) => {
    const emails = [...new Set(
      tickets.filter((t) => t.milestone_id === milestoneId && t.assignee_email).map((t) => t.assignee_email)
    )];
    return emails.map((e) => members.find((m) => m.email === e) || { email: e, name: e });
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <SprintKopf
        sprint={sprint}
        project={project}
        client={client}
        milestones={milestones}
        status={status}
      />

      <Tabs defaultValue="uebersicht">
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="uebersicht">Projektübersicht</TabsTrigger>
            <TabsTrigger value="kundenakt">Kundenakt</TabsTrigger>
            <TabsTrigger value="abrechnung">Abrechnung</TabsTrigger>
            <TabsTrigger value="kommentare">Kommentare & Notizen</TabsTrigger>
            <TabsTrigger value="kommunikation">Kommunikation</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" className="shadow-sm shrink-0" onClick={() => oeffneIntelligenz('frage')}>
              <BrainCircuit className="w-4 h-4 mr-1.5" /> Projektintelligenz
            </Button>
          </div>
        </div>

        <TabsContent value="uebersicht" className="mt-4">
          <ProjektUebersicht
            project={project}
            client={client}
            sprint={sprint}
            timeEntries={timeEntries}
            onChanged={refetch}
          />

          <div className="mt-5">
            <SectionLabel className="mb-2">Etappen</SectionLabel>
            <div className="bg-white rounded-lg border border-border overflow-hidden">
              {milestones.map((m) => (
                <EtappenZeile
                  key={m.id}
                  milestone={m}
                  tickets={tickets.filter((t) => t.milestone_id === m.id)}
                  people={peopleOf(m.id)}
                  currentUserEmail={me?.email}
                />
              ))}
              {milestones.length === 0 && (
                <p className="p-10 text-center text-sm text-muted-foreground">Dieser Sprint hat keine Milestones.</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="kundenakt" className="mt-4">
          <KundenaktTab
            projectId={aktProjektId}
            projectName={project?.title}
            customer={client?.name}
            onFesthalten={() => oeffneIntelligenz('erfassung')}
          />
        </TabsContent>

        <TabsContent value="abrechnung" className="mt-4">
          <AbrechnungSektion project={project} milestones={milestones} tickets={tickets} />
        </TabsContent>

        <TabsContent value="kommentare" className="mt-4">
          <div className="bg-white rounded-lg border border-border p-4">
            <KommentarStrang projectId={sprint.project_id} />
          </div>
        </TabsContent>

        <TabsContent value="kommunikation" className="mt-4">
          {client?.name ? (
            <CustomerEmailSection customer={client.name} />
          ) : (
            <div className="bg-white rounded-lg border border-border p-4 text-sm text-muted-foreground">
              Kein Kunde verknüpft — keine E-Mails zuordenbar.
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ProjectIntelligenceSheet
        open={intelligenzOffen}
        startModus={intelligenzModus}
        onClose={() => setIntelligenzOffen(false)}
        projectId={aktProjektId}
        projectName={project?.title}
        customer={client?.name}
      />
    </div>
  );
}