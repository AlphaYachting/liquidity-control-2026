import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lock, ArrowLeft } from 'lucide-react';
import SectionLabel from '@/components/sprint/SectionLabel';
import Zustandskette from '@/components/sprint/Zustandskette';
import {
  MILESTONE_STATES, STATE_LABELS, TICKET_STATUSES, TICKET_STATUS_LABELS, fmtEUR, fmtDate,
} from '@/components/sprint/sprintConfig';

// S5 — Milestone-Detail: Tickets, Zustandswechsel. "Freigegeben" ist Endzustand ohne Rückweg.
export default function SprintMilestoneDetail() {
  const { milestoneId } = useParams();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['milestoneDetail', milestoneId],
    queryFn: async () => {
      const milestone = await base44.entities.Milestone.get(milestoneId);
      const [sprint, tickets] = await Promise.all([
        base44.entities.Sprint.get(milestone.sprint_id).catch(() => null),
        base44.entities.Ticket.filter({ milestone_id: milestoneId }, 'order', 300),
      ]);
      return { milestone, sprint, tickets };
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

  const { milestone, sprint, tickets } = data;
  const locked = milestone.state === 'freigegeben';
  const stateIdx = MILESTONE_STATES.indexOf(milestone.state);
  const nextState = stateIdx < MILESTONE_STATES.length - 1 ? MILESTONE_STATES[stateIdx + 1] : null;

  const handleAdvance = async () => {
    if (!nextState) return;
    if (nextState === 'freigegeben') return; // Freigabe läuft über die Freigabe-Logik (Block B)
    await base44.entities.Milestone.update(milestone.id, { state: nextState });
    refresh();
  };

  const handleTicketStatus = async (ticket, status) => {
    if (locked) return;
    await base44.entities.Ticket.update(ticket.id, { status, last_status_change: new Date().toISOString() });
    refresh();
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <Link to={`/sprint/sprints/${milestone.sprint_id}`} className="inline-flex items-center gap-1.5 text-sm text-[#999999] hover:text-[#2d2d2d]">
        <ArrowLeft className="w-4 h-4" /> {sprint?.title || 'Zurück zum Sprint'}
      </Link>

      <div className={`bg-white rounded-lg shadow-sm p-6 ${locked ? 'opacity-70' : ''}`}>
        <SectionLabel className="mb-1">Milestone {milestone.order}{milestone.is_final_milestone ? ' · Final' : ''}</SectionLabel>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-[#2d2d2d] flex items-center gap-2">
          {milestone.title}
          {locked && <Lock className="w-5 h-5 text-[#999999]" />}
        </h1>
        <p className="text-sm text-[#999999] mt-1">
          Etappenbetrag {fmtEUR(milestone.milestone_amount)}
          {milestone.feedback_deadline ? ` · Feedback bis ${fmtDate(milestone.feedback_deadline)}` : ''}
        </p>
        <div className="max-w-md mt-5">
          <Zustandskette state={milestone.state} />
        </div>

        {locked ? (
          <div className="mt-5 bg-[#f5f5f5] rounded p-4 text-sm text-[#2d2d2d]">
            Am {fmtDate(milestone.updated_date)} freigegeben. Änderungen nur über Change Request.
          </div>
        ) : (
          nextState && nextState !== 'freigegeben' && (
            <Button
              className="mt-5 bg-[#ff3764] hover:bg-[#e62e58] text-white font-bold uppercase rounded"
              onClick={handleAdvance}
            >
              Weiter zu „{STATE_LABELS[nextState]}"
            </Button>
          )
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm p-5">
        <SectionLabel className="mb-3">Tickets ({tickets.length})</SectionLabel>
        <div className="space-y-2">
          {tickets.map((t) => (
            <div key={t.id} className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded px-3 py-2 ${locked ? 'bg-[#f5f5f5] opacity-60' : 'bg-[#f5f5f5]'}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#2d2d2d]">{t.title}</p>
                <p className="text-[11px] text-[#999999]">
                  {t.role || '—'}{t.assignee_email ? ` · ${t.assignee_email}` : ''} · {t.origin}
                  {t.target_hours ? ` · ${t.target_hours} h` : ''}
                </p>
              </div>
              <Select value={t.status} onValueChange={(v) => handleTicketStatus(t, v)} disabled={locked}>
                <SelectTrigger className="sm:w-36 h-8 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{TICKET_STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
          {tickets.length === 0 && <p className="text-sm text-[#999999]">Keine Tickets in diesem Milestone.</p>}
        </div>
      </div>
    </div>
  );
}