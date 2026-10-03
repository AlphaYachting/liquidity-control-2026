import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import SprintKopf from '@/components/sprint/SprintKopf';
import EtappenListe from '@/components/sprint/etappen/EtappenListe';
import ProjektUebersicht from '@/components/sprint/uebersicht/ProjektUebersicht';
import KommentarStrang from '@/components/sprint/kommentare/KommentarStrang';
import CustomerEmailSection from '@/components/crm/emails/CustomerEmailSection';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AbrechnungSektion from '@/components/sprint/abrechnung/AbrechnungSektion';
import { sprintStatus } from '@/lib/sprint/status';
import { Button } from '@/components/ui/button';
import { BrainCircuit, Plus, Check, X } from 'lucide-react';
import BehaelterKopf from '@/components/sprint/projekt/BehaelterKopf';
import ProjektVerwaltung from '@/components/sprint/projekt/ProjektVerwaltung';
import BehaelterInhalt from '@/components/sprint/projekt/BehaelterInhalt';
import NeueAufgabeDialog from '@/components/sprint/NeueAufgabeDialog';
const ProjectIntelligenceSheet = React.lazy(() =>
  import('@/components/projects/ProjectIntelligenceSheet'));
import KundenaktTab from '@/components/projects/kundenakt/KundenaktTab';
import useKundenaktProjektId from '@/hooks/useKundenaktProjektId';
import { useMeldeZeitKontext } from '@/lib/sprint/ZeitKontext';
import { usePrefetchProjektKontext } from '@/lib/sprint/useProjektKontext';
import { usePrefetchCustomerEmails } from '@/hooks/useCustomerEmailThreads';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import ModulHinzufuegenKnopf from '@/components/sprint/ModulHinzufuegenKnopf';
import AbTerminHinweis from '@/components/sprint/AbTerminHinweis';
import { ohneArchiv } from '@/lib/sprint/aktivFilter';
import { darfBereinigen } from '@/lib/sprint/ticketBereinigen';
import AufgabenBereinigen from '@/components/sprint/projekt/AufgabenBereinigen';
import { useZugriff } from '@/lib/useZugriff';

const REITER = ['uebersicht', 'kundenakt', 'abrechnung', 'kommentare', 'kommunikation'];

// S4 — Projektdetail: Kopf mit Kennzahlen, Verwaltung oben rechts, Reiter für die tägliche Arbeit.
// Direktlinks: ?reiter=abrechnung öffnet einen Reiter, ?beschreibung=offen klappt die Projektbeschreibung auf.
export default function SprintDetail() {
  const { sprintId } = useParams();
  const [suchParameter] = useSearchParams();
  const startReiter = REITER.includes(suchParameter.get('reiter')) ? suchParameter.get('reiter') : 'uebersicht';
  const { darf } = useZugriff();
  const [intelligenzOffen, setIntelligenzOffen] = React.useState(false);
  const [schonGeoeffnet, setSchonGeoeffnet] = React.useState(false);
  if (intelligenzOffen && !schonGeoeffnet) setSchonGeoeffnet(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [bereinigenOffen, setBereinigenOffen] = React.useState(false);
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
          ? base44.entities.Ticket.filter(ohneArchiv({ milestone_id: { $in: milestoneIds } }), 'order', 1000)
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
  // E-Mails des Kunden kurz nach dem Öffnen vorladen — der Reiter „Kommunikation" öffnet dann ohne Wartezeit
  usePrefetchCustomerEmails(data?.client?.name);

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-40 w-full bg-muted" />
        <Skeleton className="h-40 w-full bg-muted" />
      </div>
    );
  }

  const { sprint, project, client, milestones, tickets, members, timeEntries, focusDays, vertrag } = data;
  const typ = projectTypeOf(project);
  const istSprint = typ === 'sprint';
  const istAdmin = me?.role === 'admin';
  // „Aufgaben bereinigen“ (Sammelfunktion) ist Führungskräften vorbehalten — Admins zählen dazu.
  const darfAufraeumen = darf('fuehrung');
  // Termine aus der AB übernehmen: Projektverantwortliche, Führung und Admins
  const darfTermine = darfAufraeumen || darfBereinigen(me, project);
  const pm = members.find((m) => m.email === project?.pm_email)
    || (project?.pm_email ? { email: project.pm_email, name: project.pm_email } : null);

  const offenerMilestone = milestones.find((m) => !m.released);
  const status = sprintStatus({ sprint, milestones, tickets, timeEntries, focusDays });

  const verwaltung = (
    <ProjektVerwaltung
      project={project}
      client={client}
      istAdmin={istAdmin}
      darfCockpit={darf('geld')}
      darfAufraeumen={darfAufraeumen}
      onBereinigen={() => setBereinigenOffen(true)}
      onSaved={refetch}
    />
  );

  // Arbeitsknöpfe für Nicht-Sprint-Projekte — direkt über der Aufgabenliste
  const aufgabenAktionen = !istSprint && offenerMilestone ? (
    <div className="flex flex-wrap items-center gap-2">
      {typ === 'container' && me?.email && me.email === project?.pm_email && (
        <ModulHinzufuegenKnopf project={project} milestone={offenerMilestone} tickets={tickets} onAdded={refetch} />
      )}
      <Button variant="outline" size="sm" className="rounded" onClick={() => setAddOpen(true)}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Aufgabe hinzufügen
      </Button>
    </div>
  ) : null;

  return (
    <Tabs defaultValue={startReiter}>
      {/* Kopf: eigene weiße Fläche über die volle Breite, Reiter an der Unterkante */}
      <header className="-mx-4 md:-mx-6 lg:-mx-8 -mt-4 md:-mt-6 lg:-mt-8 border-b border-[#E2E2E2] bg-card px-4 md:px-6 lg:px-8">
        <div className="max-w-[1200px] mx-auto pt-6 flex flex-col gap-[18px]">
          {istSprint ? (
            <SprintKopf
              sprint={sprint}
              project={project}
              client={client}
              milestones={milestones}
              status={status}
              pm={pm}
              aktionen={verwaltung}
            />
          ) : (
            <BehaelterKopf project={project} client={client} tickets={tickets} timeEntries={timeEntries} members={members} vertrag={vertrag} aktionen={verwaltung} />
          )}

          {istSprint && (
            <AbTerminHinweis
              sprint={sprint}
              project={project}
              milestones={milestones}
              darfAendern={darfTermine}
              onUmgestellt={(text) => { setMeldung(text); refetch(); }}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="bg-transparent p-0 h-auto rounded-none flex-wrap justify-start gap-0.5 [&>button]:rounded-none [&>button]:px-3 [&>button]:pt-3 [&>button]:pb-[13px] [&>button]:text-sm [&>button]:font-medium [&>button]:text-muted-foreground [&>button[data-state=active]]:bg-transparent [&>button[data-state=active]]:font-semibold [&>button[data-state=active]]:text-foreground [&>button[data-state=active]]:shadow-[inset_0_-2px_0_hsl(var(--foreground))]">
              <TabsTrigger value="uebersicht">Projektübersicht</TabsTrigger>
              <TabsTrigger value="kundenakt">Kundenakt</TabsTrigger>
              <TabsTrigger value="abrechnung">Abrechnung</TabsTrigger>
              <TabsTrigger value="kommentare">Kommentare & Notizen</TabsTrigger>
              <TabsTrigger value="kommunikation">Kommunikation</TabsTrigger>
            </TabsList>
            <Button size="sm" className="mb-1.5 h-9 shrink-0 rounded bg-[#D6245A] px-4 font-semibold text-white hover:bg-[#C01F50]" onClick={() => oeffneIntelligenz('frage')}>
              <BrainCircuit className="w-4 h-4 mr-1.5" /> Projektintelligenz
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto pt-6 flex flex-col gap-4">
        {meldung && (
          <div role="status" className="flex items-center gap-3 rounded border border-[#BFE3CF] bg-status-done-surface px-3.5 py-2.5 text-[13px] text-[#1F5F41]">
            <Check className="w-4 h-4 shrink-0" />
            <span className="flex-1">{meldung}</span>
            <button type="button" onClick={() => setMeldung('')} aria-label="Meldung schließen" className="p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <TabsContent value="uebersicht" className="mt-0 flex flex-col gap-4">
          <ProjektUebersicht
            project={project}
            client={client}
            onChanged={refetch}
            ohneStatus={istSprint}
            startOffen={suchParameter.get('beschreibung') === 'offen'}
          />

          {!istSprint ? (
            <BehaelterInhalt
              project={project}
              tickets={tickets}
              members={members}
              timeEntries={timeEntries}
              myEmail={me?.email}
              onRefresh={refetch}
              aktionen={aufgabenAktionen}
            />
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

      {darfAufraeumen && (
        <AufgabenBereinigen
          project={project}
          me={me}
          open={bereinigenOffen}
          onOpenChange={setBereinigenOffen}
          onDone={refetch}
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
