import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock, ArrowLeft } from 'lucide-react';
import SectionLabel from '@/components/sprint/SectionLabel';
import MilestoneZustandssteuerung from '@/components/sprint/MilestoneZustandssteuerung';
import TicketPhasenGruppe from '@/components/sprint/TicketPhasenGruppe';
import CountdownLeiste from '@/components/sprint/CountdownLeiste';
import Fortschrittszaehler from '@/components/sprint/Fortschrittszaehler';
import { STATE_LABELS, fmtEUR, fmtDate, todayIso } from '@/components/sprint/sprintConfig';
import { computeFeedbackDeadline } from '@/lib/sprint/deadlines';

const PHASES = ['input', 'produktion', 'pruefung', 'kundenfeedback'];

// S5 — Milestone-Detail: Zustandssteuerung, Fristenrechnung, Tickets nach Phase.
export default function SprintMilestoneDetail() {
  const { milestoneId } = useParams();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['milestoneDetail', milestoneId],
    queryFn: async () => {
      const milestone = await base44.entities.Milestone.get(milestoneId);
      const [sprint, tickets, members, settings] = await Promise.all([
        base44.entities.Sprint.get(milestone.sprint_id).catch(() => null),
        base44.entities.Ticket.filter({ milestone_id: milestoneId }, 'order', 300),
        base44.entities.TeamMember.filter({ active: true }, 'name', 100),
        base44.entities.Setting.filter({ group: 'fristen' }, 'key', 100),
      ]);
      return { milestone, sprint, tickets, members, settings };
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

  const { milestone, sprint, tickets, members, settings } = data;
  const locked = milestone.state === 'freigegeben';

  const phaseTickets = tickets.filter((t) => (t.milestone_state || 'produktion') === milestone.state);
  const phaseDone = phaseTickets.length > 0 && phaseTickets.every((t) => t.status === 'erledigt');

  const handleStateChange = async (target) => {
    const patch = { state: target };
    // Beim Wechsel nach "kundenfeedback" läuft die Fristenrechnung
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
    <div className="max-w-[1200px] mx-auto space-y-5">
      <Link to={`/sprint/sprints/${milestone.sprint_id}`} className="inline-flex items-center gap-1.5 text-sm text-[#6b6b6b] hover:text-[#2d2d2d]">
        <ArrowLeft className="w-4 h-4" /> {sprint?.title || 'Zurück zum Sprint'}
      </Link>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <SectionLabel className="mb-1">Milestone {milestone.order}{milestone.is_final_milestone ? ' · Final' : ''}</SectionLabel>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-[#2d2d2d] flex items-center gap-2">
          {milestone.title}
          {locked && <Lock className="w-5 h-5 text-[#6b6b6b]" />}
        </h1>
        <p className="text-sm text-[#6b6b6b] mt-1">
          Etappenbetrag {fmtEUR(milestone.milestone_amount)} · Plan-Übergabe {fmtDate(milestone.planned_handover)} · Plan-Freeze {fmtDate(milestone.planned_freeze)}
        </p>
        <div className="mt-4 max-w-xl">
          <CountdownLeiste
            handoverDate={milestone.handover_date || milestone.planned_handover}
            deadline={milestone.feedback_deadline || milestone.planned_freeze}
            state={milestone.state}
            approvedAt={milestone.updated_date}
          />
          {milestone.deadline_pulled_forward && (
            <p className="text-xs text-[#6b6b6b] mt-1">Frist auf den Liefertermin vorgezogen.</p>
          )}
        </div>

        <div className="mt-5">
          {locked ? (
            <div className="rounded p-4 text-sm text-[#2d2d2d] border-l-4" style={{ borderColor: '#1e7a4c', backgroundColor: '#e9f9f0' }}>
              Am {fmtDate(milestone.updated_date)} freigegeben. Inhalte sind gesperrt; Aufgaben der Phase
              Kundenfeedback bleiben abschließbar, damit der Livegang möglich ist.
            </div>
          ) : (
            <MilestoneZustandssteuerung
              state={milestone.state}
              phaseDone={phaseDone}
              onChange={handleStateChange}
            />
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-5">
        <SectionLabel className="mb-3">Aufgaben</SectionLabel>
        <Fortschrittszaehler
          className="mb-4 max-w-md"
          done={phaseTickets.filter((t) => t.status === 'erledigt').length}
          total={phaseTickets.length}
          goalLabel="bis zur Übergabe"
        />
        <div className="space-y-2">
          {PHASES.map((phase) => (
            <TicketPhasenGruppe
              key={phase}
              phase={phase}
              currentState={milestone.state}
              tickets={tickets.filter((t) => (t.milestone_state || 'produktion') === phase)}
              members={members}
              locked={locked}
              onStatus={handleTicketStatus}
              onAssignee={handleAssignee}
            />
          ))}
        </div>
        {tickets.length === 0 && <p className="text-sm text-[#6b6b6b] mt-2">Keine Aufgaben in diesem Milestone.</p>}
      </div>

      {milestone.state === 'kundenfeedback' && (
        <p className="text-xs text-[#6b6b6b]">
          Freigabe, Fristmails und Teilrechnung folgen in Block B. Aktueller Zustand: {STATE_LABELS[milestone.state]}.
        </p>
      )}
    </div>
  );
}