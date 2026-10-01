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
import { BrainCircuit, Plus } from 'lucide-react';
import BehaelterKopf from '@/components/sprint/projekt/BehaelterKopf';
import ProjektBearbeitenKnopf from '@/components/sprint/projekt/ProjektBearbeitenKnopf';
import BehaelterInhalt from '@/components/sprint/projekt/BehaelterInhalt';
import NeueAufgabeDialog from '@/components/sprint/NeueAufgabeDialog';
const ProjectIntelligenceSheet = React.lazy(() =>
  import('@/components/projects/ProjectIntelligenceSheet'));
import KundenaktTab from '@/components/projects/kundenakt/KundenaktTab';
import useKundenaktProjektId from '@/hooks/useKundenaktProjektId';
import { useMeldeZeitKontext } from '@/lib/sprint/ZeitKontext';
import { usePrefetchProjektKontext } from '@/lib/sprint/useProjektKontext';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import ModulHinzufuegenKnopf from '@/components/sprint/ModulHinzufuegenKnopf';
import CockpitLeiste from '@/components/projekt/CockpitLeiste';

// S4 — Sprint-Übersicht: ein Kopf mit Kennzahlen, Etappen als Zeilen in einer Karte.
export default function SprintDetail() {
  const { sprintId } = useParams();
  const [intelligenzOffen, setIntelligenzOffen] = React.useState(false);
  const [schonGeoeffnet, setSchonGeoeffnet] = React.useState(false);
  if (intelligenzOffen && !schonGeoeffnet) setSchonGeoeffnet(true);
  const [addOpen, setAddOpen] = React.useState(false);
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
      const milestoneIds = milestones.map((m) => m.id);
      const [client, tickets, timeEntries, focusDays, vertrag] = await Promise.all([
        project ? base44.entities.Client.get(project.client_id).catch(() => null) : Promise.resolve(null),
        milestoneIds.length
          ? base44.entities.Ticket.filter({ milestone_id: { $in: milestoneIds } }, 'order', 1000)
          : Promise.resolve([]),
        base44.entities.TimeEntry.filter({ project_id: sprint.project_id }, '-entry_date', 1000),
        base44.entities.FocusDay.filter({ project_id: sprint.project_id, type: 'focus' }, 'day', 500),
        project?.recurring_contract_id
          ? base44.entities.RecurringContract.get(project.recurring_contract_id).catch(() => null)
          : Promise.resolve(null),
      ]);
      return { sprint, project, client, milestones, tickets, members, timeEntries, focusDays, vertrag };
    },
  });

  const { projektId: aktProjektId } = useKundenaktProjektId({
    customer: data?.client?.name,
    title: data?.project?.title,
    fallbackId: data?.sprint?.project_id,
    liquidityProjectId: data?.project?.liquidity_project_id,
  });

  useMeldeZeitKontext({ project_id: data?.sprint?.project_id, quelle: 'sprint' });
  usePrefetchProjektKontext(data?.sprint?.project_id);

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-40 w-full bg-muted" />
        <Skeleton className="h-40 w-full bg-muted" />
      </div>
    );
  }

  const { sprint, project, client, milestones, tickets, members, timeEntries, focusDays, vertrag } = data;
  const istSprint = projectTypeOf(project) === 'sprint';

  const offenerMilestone = milestones.find((m) => !m.released);
  const status = sprintStatus({ sprint, milestones, tickets, timeEntries, focusDays });

  const peopleOf = (milestoneId) => {
    const emails = [...new Set(
      tickets.filter((t) => t.milestone_id === milestoneId && t.assignee_email).map((t) => t.assignee_email)
    )];
    return emails.map((e) => members.find((m) => m.email === e) || { email: e, name: e });
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="relative">
      {me?.role === 'admin' && (
        <div className="absolute top-3 right-3 z-10">
          <ProjektBearbeitenKnopf project={project} onSaved={refetch} />
        </div>
      )}
      {istSprint ? (
        <SprintKopf
          sprint={sprint}
          project={project}
          client={client}
          milestones={milestones}
          status={status}
        />
      ) : (
        <BehaelterKopf project={project} client={client} tickets={tickets} timeEntries={timeEntries} members={members} vertrag={vertrag} />
      )}
      </div>
      <CockpitLeiste project={project} client={client} istAdmin={me?.role === 'admin'} onSaved={refetch} />

      <Tabs defaultValue="uebersicht">
        <div className="flex items-center justify-between gap-3 border-b border-border">
          <TabsList className="bg-transparent p-0 h-auto rounded-none -mb-px [&>button]:rounded-none [&>button]:border-b-2 [&>button]:border-transparent [&>button]:px-3 [&>button]:pb-2 [&>button]:pt-1 [&>button[data-state=active]]:border-primary [&>button[data-state=active]]:bg-transparent [&>button[data-state=active]]:shadow-none">
            <TabsTrigger value="uebersicht">Projektübersicht</TabsTrigger>
            <TabsTrigger value="kundenakt">Kundenakt</TabsTrigger>
            <TabsTrigger value="abrechnung">Abrechnung</TabsTrigger>
            <TabsTrigger value="kommentare">Kommentare & Notizen</TabsTrigger>
            <TabsTrigger value="kommunikation">Kommunikation</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 shrink-0">
            {projectTypeOf(project) === 'container' && me?.email && me.email === project?.pm_email && offenerMilestone && (
              <ModulHinzufuegenKnopf project={project} milestone={offenerMilestone} tickets={tickets} onAdded={refetch} />
            )}
            {!istSprint && offenerMilestone && (
              <Button variant="outline" size="sm" className="rounded" onClick={() => setAddOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Aufgabe hinzufügen
              </Button>
            )}
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
            zeigeStunden={istSprint}
          />

          {!istSprint ? (
            <BehaelterInhalt project={project} tickets={tickets} members={members} timeEntries={timeEntries} myEmail={me?.email} onRefresh={refetch} />
          ) : (
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
          )}
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

      {!istSprint && offenerMilestone && (
        <NeueAufgabeDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          milestone={offenerMilestone}
          tickets={tickets}
          members={members}
          previousMilestone={null}
          onCreated={refetch}
        />
      )}

      {schonGeoeffnet && (
        <React.Suspense fallback={null}>
          <ProjectIntelligenceSheet
            open={intelligenzOffen}
            startModus={intelligenzModus}
            onClose={() => setIntelligenzOffen(false)}
            projectId={aktProjektId}
            projectName={project?.title}
            customer={client?.name}
          />
        </React.Suspense>
      )}
    </div>
  );
}