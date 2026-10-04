import React, { useState } from 'react';
import { useParams, Navigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { BrainCircuit, Plus, Layers, Check, X } from 'lucide-react';
import EtappeKopf from '@/components/sprint/etappe/EtappeKopf';
import EtappeAblauf from '@/components/sprint/etappe/EtappeAblauf';
import EtappeUmfang from '@/components/sprint/etappe/EtappeUmfang';
import EtappeBearbeitenDialog from '@/components/sprint/etappe/EtappeBearbeitenDialog';
import TicketPhasenGruppe from '@/components/sprint/TicketPhasenGruppe';
import AufgabenFilter from '@/components/sprint/AufgabenFilter';
import FreigabePanel from '@/components/sprint/FreigabePanel';
import AufgabeAnlegenDialog from '@/components/sprint/etappen/AufgabeAnlegenDialog';
import AufgabensetDialog from '@/components/sprint/etappen/AufgabensetDialog';
import { performFreigabe } from '@/lib/sprint/freigabe';
import useTicketStatus from '@/hooks/useTicketStatus';
import { todayIso } from '@/components/sprint/sprintConfig';
import { computeFeedbackDeadline } from '@/lib/sprint/deadlines';
import { etappeKennzahlen } from '@/lib/sprint/etappeKennzahlen';
import { useMeldeZeitKontext } from '@/lib/sprint/ZeitKontext';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import { ohneArchiv } from '@/lib/sprint/aktivFilter';
import { darfBereinigen } from '@/lib/sprint/ticketBereinigen';
import useKundenaktProjektId from '@/hooks/useKundenaktProjektId';
const ProjectIntelligenceSheet = React.lazy(() =>
  import('@/components/projects/ProjectIntelligenceSheet'));

const PHASES = ['input', 'produktion', 'pruefung', 'kundenfeedback'];

// S5 — Etappenseite im Aufbau der Projektseite: Kopf mit Projektkontext und Kennzahlen,
// Etappen als Reiter, darunter Ablauf, Umfang laut AB, Aufgaben und — im Kundenfeedback — die Freigabe.
// Direktlink ?aufgabe=id öffnet die Aufgabe im Panel (z. B. aus „Mein Tag“).
export default function SprintMilestoneDetail() {
  const { milestoneId } = useParams();
  const [suchParameter] = useSearchParams();
  const aufgabeId = suchParameter.get('aufgabe');
  const qc = useQueryClient();
  const [filter, setFilter] = useState('alle');
  const [dialog, setDialog] = useState(null); // 'aufgabe' | 'set' | 'bearbeiten'
  const [meldung, setMeldung] = useState('');
  const [intelligenzOffen, setIntelligenzOffen] = useState(false);
  const [schonGeoeffnet, setSchonGeoeffnet] = useState(false);
  if (intelligenzOffen && !schonGeoeffnet) setSchonGeoeffnet(true);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });

  const { data, isLoading } = useQuery({
    queryKey: ['milestoneDetail', milestoneId],
    queryFn: async () => {
      const milestone = await base44.entities.Milestone.get(milestoneId);
      const [sprint, tickets, members, settings, siblings, notifications, feedbacks] = await Promise.all([
        base44.entities.Sprint.get(milestone.sprint_id).catch(() => null),
        base44.entities.Ticket.filter(ohneArchiv({ milestone_id: milestoneId }), 'order', 1000),
        base44.entities.TeamMember.filter({ active: true }, 'name', 100),
        base44.entities.Setting.filter({ group: 'fristen' }, 'key', 100),
        base44.entities.Milestone.filter({ sprint_id: milestone.sprint_id }, 'order', 50),
        base44.entities.NotificationLog.filter({ milestone_id: milestoneId }, '-sent_at', 50),
        base44.entities.Feedback.filter({ milestone_id: milestoneId }, '-received_at', 50),
      ]);
      const project = sprint ? await base44.entities.Project.get(sprint.project_id).catch(() => null) : null;
      const client = project ? await base44.entities.Client.get(project.client_id).catch(() => null) : null;
      return { milestone, sprint, tickets, members, settings, siblings, project, client, notifications, feedbacks };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['milestoneDetail', milestoneId] });
  const { setStatus: handleTicketStatus, dialog: routineDialog } = useTicketStatus(refresh);

  useMeldeZeitKontext({ project_id: data?.sprint?.project_id, quelle: 'sprint' });
  const { projektId: aktProjektId } = useKundenaktProjektId({
    customer: data?.client?.name,
    title: data?.project?.title,
    fallbackId: data?.sprint?.project_id,
    liquidityProjectId: data?.project?.liquidity_project_id,
  });

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-48 w-full bg-muted" />
        <Skeleton className="h-64 w-full bg-muted" />
      </div>
    );
  }

  const { milestone, sprint, tickets, members, settings, siblings, project, client, notifications, feedbacks } = data;
  // Behälter-Etappen haben keine eigene Seite — direkt zur Projektseite
  if (project && projectTypeOf(project) !== 'sprint') {
    return <Navigate to={`/sprint/sprints/${milestone.sprint_id}${window.location.hash}`} replace />;
  }
  const locked = milestone.state === 'freigegeben';
  const istSprint = !!project && projectTypeOf(project) === 'sprint';
  const darfBearbeiten = darfBereinigen(me, project);
  const kennzahlen = etappeKennzahlen({ milestone, tickets });

  // V4 — Filter verändert nie die Zähler, nur die sichtbaren Zeilen.
  const myEmail = me?.email;
  const counts = {
    alle: tickets.length,
    meine: tickets.filter((t) => t.assignee_email && t.assignee_email === myEmail).length,
    offen_zuweisung: tickets.filter((t) => !t.assignee_email).length,
  };
  const matchesFilter = (t) => {
    if (filter === 'meine') return t.assignee_email && t.assignee_email === myEmail;
    if (filter === 'offen_zuweisung') return !t.assignee_email;
    return true;
  };

  // B5/U13 — offene Aufgaben der aktuellen oder einer früheren Phase
  const currentPhaseIdx = PHASES.indexOf(milestone.state);
  const offenProPhase = (phase) =>
    tickets.filter((t) => (t.milestone_state || 'produktion') === phase && t.status !== 'erledigt').length;
  const openBefore = PHASES.slice(0, currentPhaseIdx + 1)
    .map((phase) => ({ phase, count: offenProPhase(phase) }))
    .find((p) => p.count > 0) || null;
  const aufgabePhase = aufgabeId ? tickets.find((t) => t.id === aufgabeId)?.milestone_state || 'produktion' : null;
  // Offen: aktuelle Phase, Phasen mit laufender Arbeit, frühere Phasen mit offenen Aufgaben,
  // die Phase einer direkt angesprungenen Aufgabe.
  const inArbeit = (phase) => tickets.some(
    (t) => (t.milestone_state || 'produktion') === phase && ['in_arbeit', 'wartet'].includes(t.status),
  );
  const phaseStartOffen = (phase, idx) =>
    phase === milestone.state
    || phase === aufgabePhase
    || inArbeit(phase)
    || (idx < currentPhaseIdx && offenProPhase(phase) > 0)
    || (locked && phase === 'kundenfeedback');

  const handleStateChange = async (target) => {
    // Zustandswechsel (Frist, Übergabemail) nur bei echten Sprintprojekten
    if (!istSprint) return;
    const patch = { state: target };
    if (target === 'kundenfeedback' && sprint) {
      const res = computeFeedbackDeadline({
        handoverDate: todayIso(),
        size: sprint.size,
        settings,
        isFinal: milestone.is_final_milestone,
        deliveryDate: sprint.delivery_date,
      });
      if (res.error) {
        window.alert(`${res.error}. Bitte Liefertermin im Sprint anpassen.`);
        return;
      }
      patch.handover_date = res.handover_date;
      patch.feedback_deadline = res.feedback_deadline;
      patch.prewarning_date = res.prewarning_date || null;
      patch.deadline_pulled_forward = res.deadline_pulled_forward;
    }
    await base44.entities.Milestone.update(milestone.id, patch);
    // A1 — Übergabemail wird vorgeschlagen und protokolliert; sie trägt Punkt 2 der Freigabe.
    if (target === 'kundenfeedback' && !notifications.some((n) => n.type === 'A1')) {
      await base44.entities.NotificationLog.create({
        type: 'A1',
        milestone_id: milestone.id,
        sprint_id: sprint?.id,
        project_id: sprint?.project_id,
        recipient: client?.contact_email || '',
        sent_at: new Date().toISOString(),
        subject: `Übergabe: ${milestone.title}`,
        body: `Der Stand zu "${milestone.title}" liegt zur Durchsicht vor. Rückmeldung bitte bis ${patch.feedback_deadline || '—'}.`,
        status: 'vorgeschlagen',
      });
    }
    refresh();
  };

  const handleLinks = async (links) => {
    await base44.entities.Milestone.update(milestone.id, { deliverable_links: links });
    refresh();
  };

  const handleFreigabe = async (source) => {
    const res = await performFreigabe({ milestone, sprint, client, siblings, tickets, source, approvalType: 'aktiv' });
    refresh();
    return res;
  };

  const handleAssignee = async (ticket, email) => {
    await base44.entities.Ticket.update(ticket.id, { assignee_email: email });
    refresh();
  };

  const angelegt = (text) => {
    setMeldung(text);
    refresh();
  };

  return (
    <>
      {/* Kopf: eigene weiße Fläche über die volle Breite — gleicher Aufbau wie die Projektseite */}
      <header className="-mx-4 md:-mx-6 lg:-mx-8 -mt-4 md:-mt-6 lg:-mt-8 border-b border-[#E2E2E2] bg-card px-4 md:px-6 lg:px-8">
        <div className="max-w-[1200px] mx-auto pt-[18px] flex flex-col gap-4">
          <EtappeKopf
            milestone={milestone}
            siblings={siblings}
            sprint={sprint}
            project={project}
            client={client}
            tickets={tickets}
            members={members}
            me={me}
            darfBearbeiten={darfBearbeiten}
            onBearbeiten={() => setDialog('bearbeiten')}
            rechts={(
              <Button
                size="sm"
                className="mb-1.5 h-9 shrink-0 rounded bg-[#D6245A] px-4 font-semibold text-white hover:bg-[#C01F50]"
                onClick={() => setIntelligenzOffen(true)}
              >
                <BrainCircuit className="w-4 h-4 mr-1.5" /> Projektintelligenz
              </Button>
            )}
          />
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto pt-6 pb-16 flex flex-col gap-4">
        {meldung && (
          <div role="status" className="flex items-center gap-3 rounded border border-[#BFE3CF] bg-status-done-surface px-3.5 py-2.5 text-[13px] text-[#1F5F41]">
            <Check className="w-4 h-4 shrink-0" />
            <span className="flex-1">{meldung}</span>
            <button type="button" onClick={() => setMeldung('')} aria-label="Meldung schließen" className="p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {istSprint && (
          <EtappeAblauf
            milestone={milestone}
            sprint={sprint}
            openBefore={openBefore}
            editierbar={!locked}
            onChange={handleStateChange}
          />
        )}

        <EtappeUmfang project={project} sprint={sprint} milestone={milestone} anzahlEtappen={siblings.length} />

        <section className="rounded border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
            <div className="flex items-baseline gap-3">
              <h2 className="m-0 text-section uppercase text-muted-foreground">Aufgaben</h2>
              <span className="text-meta text-muted-foreground">
                {tickets.length} {tickets.length === 1 ? 'Aufgabe' : 'Aufgaben'}
                {!locked && tickets.length > 0 && ` · noch ${kennzahlen.aufgaben.bisUebergabe} bis zur Übergabe`}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded h-8 font-semibold" onClick={() => setDialog('aufgabe')}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Aufgabe
              </Button>
              <Button variant="outline" size="sm" className="rounded h-8 font-semibold" onClick={() => setDialog('set')}>
                <Layers className="w-3.5 h-3.5 mr-1" /> Aufgabenset
              </Button>
            </div>
          </div>
          <div className="px-5 pb-3.5">
            <AufgabenFilter value={filter} onChange={setFilter} counts={counts} />
          </div>

          {PHASES.map((phase, idx) => {
            const phaseTickets = tickets.filter((t) => (t.milestone_state || 'produktion') === phase);
            return (
              <TicketPhasenGruppe
                key={phase}
                phase={phase}
                currentState={milestone.state}
                tickets={phaseTickets}
                visibleTickets={phaseTickets.filter(matchesFilter)}
                members={members}
                currentUserEmail={myEmail}
                locked={locked}
                onStatus={handleTicketStatus}
                onAssignee={handleAssignee}
                startOffen={phaseStartOffen(phase, idx)}
                aufgabeId={aufgabeId}
              />
            );
          })}
        </section>

        {istSprint && milestone.state === 'kundenfeedback' && (
          <FreigabePanel
            milestone={milestone}
            tickets={tickets}
            notifications={notifications}
            feedbacks={feedbacks}
            onLinksChange={handleLinks}
            onFreigeben={handleFreigabe}
          />
        )}
      </div>

      <AufgabeAnlegenDialog
        open={dialog === 'aufgabe'}
        onOpenChange={(o) => !o && setDialog(null)}
        milestones={siblings}
        tickets={tickets}
        members={members}
        projectId={project?.id}
        startEtappeId={milestone.id}
        onCreated={angelegt}
      />
      <AufgabensetDialog
        open={dialog === 'set'}
        onOpenChange={(o) => !o && setDialog(null)}
        milestones={siblings}
        tickets={tickets}
        members={members}
        projectId={project?.id}
        pmEmail={project?.pm_email}
        startEtappeId={milestone.id}
        onCreated={angelegt}
      />
      {darfBearbeiten && (
        <EtappeBearbeitenDialog
          open={dialog === 'bearbeiten'}
          onOpenChange={(o) => !o && setDialog(null)}
          milestone={milestone}
          onSaved={() => { setMeldung('Etappe gespeichert.'); refresh(); }}
        />
      )}

      {schonGeoeffnet && (
        <React.Suspense fallback={null}>
          <ProjectIntelligenceSheet
            open={intelligenzOffen}
            startModus="frage"
            onClose={() => setIntelligenzOffen(false)}
            projectId={aktProjektId}
            appProjektId={data?.sprint?.project_id}
            cockpitId={project?.liquidity_project_id || (aktProjektId && aktProjektId !== data?.sprint?.project_id ? aktProjektId : null)}
            projectName={project?.title}
            customer={client?.name}
          />
        </React.Suspense>
      )}
      {routineDialog}
    </>
  );
}
