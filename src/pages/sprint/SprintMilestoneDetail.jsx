import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import SectionLabel from '@/components/sprint/SectionLabel';
import Kontextleiste from '@/components/sprint/Kontextleiste';
import Zustandskette from '@/components/sprint/Zustandskette';
import Planlinie from '@/components/sprint/Planlinie';
import CountdownLeiste from '@/components/sprint/CountdownLeiste';
import Fortschrittszaehler from '@/components/sprint/Fortschrittszaehler';
import TicketPhasenGruppe from '@/components/sprint/TicketPhasenGruppe';
import AufgabenFilter from '@/components/sprint/AufgabenFilter';
import MilestoneAktionsleiste from '@/components/sprint/MilestoneAktionsleiste';
import { STATE_LABELS, RITTLER, STATUS_COLORS, fmtEUR, fmtDate, todayIso } from '@/components/sprint/sprintConfig';
import { computeFeedbackDeadline } from '@/lib/sprint/deadlines';
import { sprintStatus } from '@/lib/sprint/status';

const PHASES = ['input', 'produktion', 'pruefung', 'kundenfeedback'];
const WORK_PHASES = ['input', 'produktion', 'pruefung'];

// S5 — Etappenseite: Kontextleiste, kompakter Kopf, ruhige Aufgabenliste, Aktionsleiste.
export default function SprintMilestoneDetail() {
  const { milestoneId } = useParams();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('alle');

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });

  const { data, isLoading } = useQuery({
    queryKey: ['milestoneDetail', milestoneId],
    queryFn: async () => {
      const milestone = await base44.entities.Milestone.get(milestoneId);
      const [sprint, tickets, members, settings, siblings] = await Promise.all([
        base44.entities.Sprint.get(milestone.sprint_id).catch(() => null),
        base44.entities.Ticket.filter({ milestone_id: milestoneId }, 'order', 300),
        base44.entities.TeamMember.filter({ active: true }, 'name', 100),
        base44.entities.Setting.filter({ group: 'fristen' }, 'key', 100),
        base44.entities.Milestone.filter({ sprint_id: milestone.sprint_id }, 'order', 50),
      ]);
      const project = sprint ? await base44.entities.Project.get(sprint.project_id).catch(() => null) : null;
      const client = project ? await base44.entities.Client.get(project.client_id).catch(() => null) : null;
      return { milestone, sprint, tickets, members, settings, siblings, project, client };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['milestoneDetail', milestoneId] });

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-24 w-full bg-[#f5f5f5]" />
        <Skeleton className="h-64 w-full bg-[#f5f5f5]" />
      </div>
    );
  }

  const { milestone, sprint, tickets, members, settings, siblings, project, client } = data;
  const locked = milestone.state === 'freigegeben';
  const showCountdown = milestone.state === 'kundenfeedback' || locked;

  // U12/B4 — Zähler und Balken beziehen sich auf ALLE Arbeitsaufgaben der Etappe
  const workTickets = tickets.filter((t) => WORK_PHASES.includes(t.milestone_state || 'produktion'));
  const workDone = workTickets.filter((t) => t.status === 'erledigt').length;

  // V4 — Filter verändert nie den Fortschrittszähler, nur die sichtbaren Zeilen.
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
  const openBefore = PHASES.slice(0, currentPhaseIdx + 1)
    .map((phase) => ({
      phase,
      count: tickets.filter((t) => (t.milestone_state || 'produktion') === phase && t.status !== 'erledigt').length,
    }))
    .find((p) => p.count > 0) || null;

  const handleStateChange = async (target) => {
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
    refresh();
  };

  const handleTicketStatus = async (ticket, status) => {
    await base44.entities.Ticket.update(ticket.id, { status, last_status_change: new Date().toISOString() });
    refresh();
  };

  const handleAssignee = async (ticket, email) => {
    await base44.entities.Ticket.update(ticket.id, { assignee_email: email });
    refresh();
  };

  return (
    <div className="-m-4 md:-m-6 flex flex-col min-h-[calc(100vh-2rem)]">
      <Kontextleiste
        sprint={sprint}
        project={project}
        client={client}
        milestones={siblings}
        currentMilestoneId={milestone.id}
        status={sprintStatus({ sprint, milestones: siblings })}
      />

      <div className="flex-1 max-w-[1200px] w-full mx-auto px-4 py-5 space-y-4">
        <div className="bg-white rounded-lg border border-[#e0e0e0] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel className="mb-1">
                Milestone {milestone.order}{milestone.is_final_milestone ? ' · Final' : ''}
              </SectionLabel>
              <h1 className="text-2xl font-extrabold uppercase tracking-tight" style={{ color: RITTLER.black }}>
                {milestone.title}
              </h1>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold" style={{ color: RITTLER.black }}>{fmtEUR(milestone.milestone_amount)}</p>
              <p className="text-[13px]" style={{ color: locked ? STATUS_COLORS.doneText : RITTLER.textSecondary }}>
                {locked ? `am ${fmtDate(milestone.invoiced_at || milestone.updated_date)} fakturiert` : 'wird bei Freigabe fällig'}
              </p>
            </div>
          </div>

          <div className="mt-5 max-w-xl">
            <Zustandskette state={milestone.state} />
          </div>

          <div className="mt-5">
            {showCountdown ? (
              <div className="max-w-xl">
                <CountdownLeiste
                  handoverDate={milestone.handover_date || milestone.planned_handover}
                  deadline={milestone.feedback_deadline || milestone.planned_freeze}
                  state={milestone.state}
                  approvedAt={milestone.updated_date}
                />
                {milestone.deadline_pulled_forward && (
                  <p className="text-xs mt-1" style={{ color: RITTLER.textSecondary }}>
                    Frist auf den Liefertermin vorgezogen.
                  </p>
                )}
              </div>
            ) : (
              <Planlinie
                className="max-w-xl"
                handover={milestone.planned_handover}
                freeze={milestone.planned_freeze}
                delivery={sprint?.delivery_date}
              />
            )}
          </div>

          {openBefore && !locked && PHASES.indexOf(openBefore.phase) < currentPhaseIdx && (
            <p className="flex items-center gap-2 text-sm mt-4" style={{ color: STATUS_COLORS.attention }}>
              <AlertTriangle className="w-4 h-4" />
              {openBefore.count} {openBefore.count === 1 ? 'Aufgabe' : 'Aufgaben'} aus {STATE_LABELS[openBefore.phase]} offen
            </p>
          )}

          {locked && (
            <div className="mt-4 rounded p-4 text-sm border-l-4" style={{ borderColor: STATUS_COLORS.doneText, backgroundColor: STATUS_COLORS.doneSurface, color: RITTLER.black }}>
              Am {fmtDate(milestone.updated_date)} freigegeben. Inhalte bleiben lesbar; Aufgaben der Phase
              Kundenfeedback bleiben abschließbar, damit der Livegang möglich ist.
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-[#e0e0e0] p-5">
          <SectionLabel className="mb-3">Aufgaben</SectionLabel>
          <Fortschrittszaehler
            className="mb-3"
            done={workDone}
            total={workTickets.length}
            goalLabel="bis zur Übergabe"
          />
          <AufgabenFilter value={filter} onChange={setFilter} counts={counts} />
          <div className="mt-4">
            {PHASES.map((phase) => {
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
                />
              );
            })}
          </div>
          {tickets.length === 0 && (
            <p className="text-sm mt-2" style={{ color: RITTLER.textSecondary }}>Keine Aufgaben in diesem Milestone.</p>
          )}
        </div>
      </div>

      {!locked && (
        <MilestoneAktionsleiste
          state={milestone.state}
          openBefore={openBefore}
          onChange={handleStateChange}
        />
      )}
    </div>
  );
}