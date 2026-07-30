import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock } from 'lucide-react';
import SectionLabel from '@/components/sprint/SectionLabel';
import Zustandskette from '@/components/sprint/Zustandskette';
import { fmtDate, fmtEUR, todayIso, SPRINT_SIZES } from '@/components/sprint/sprintConfig';

// S4 — Sprint-Detail: Kopf + Milestones als Karten mit Zustandskette
export default function SprintDetail() {
  const { sprintId } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['sprintDetail', sprintId],
    queryFn: async () => {
      const sprint = await base44.entities.Sprint.get(sprintId);
      const [project, milestones] = await Promise.all([
        base44.entities.Project.get(sprint.project_id).catch(() => null),
        base44.entities.Milestone.filter({ sprint_id: sprintId }, 'order', 100),
      ]);
      const client = project ? await base44.entities.Client.get(project.client_id).catch(() => null) : null;
      return { sprint, project, client, milestones };
    },
  });

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-24 w-full bg-[#f5f5f5]" />
        <Skeleton className="h-40 w-full bg-[#f5f5f5]" />
      </div>
    );
  }

  const { sprint, project, client, milestones } = data;
  const today = todayIso();
  const restDays = sprint.delivery_date
    ? Math.ceil((new Date(sprint.delivery_date) - new Date(today)) / 86400000)
    : null;

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <SectionLabel className="mb-1">{client?.name || 'Kunde'}</SectionLabel>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-[#2d2d2d]">
          {project?.title || 'Projekt'}
        </h1>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-[#6b6b6b]">
          <span>Sprint <strong className="text-[#2d2d2d]">{sprint.size}</strong> ({SPRINT_SIZES[sprint.size]?.subtitle})</span>
          <span>Liefertermin <strong className="text-[#2d2d2d]">{fmtDate(sprint.delivery_date)}</strong></span>
          {restDays !== null && (
            <span>Restlaufzeit <strong className={restDays < 0 ? 'text-[#c8003a]' : restDays < 7 ? 'text-[#9c5b00]' : 'text-[#2d2d2d]'}>{restDays} Tage</strong></span>
          )}
          <span>Sprintbetrag <strong className="text-[#2d2d2d]">{fmtEUR(sprint.sprint_amount)}</strong></span>
          <span>Sollstunden <strong className="text-[#2d2d2d]">{sprint.target_hours || 0} h</strong></span>
          <span>Focus-Tage <strong className="text-[#2d2d2d]">{sprint.planned_focus_days || 0}</strong></span>
          <span>Status: {sprint.status}</span>
        </div>
      </div>

      <div className="space-y-3">
        {milestones.map((m) => {
          const locked = m.state === 'freigegeben';
          return (
            <Link
              key={m.id} to={`/sprint/milestones/${m.id}`}
              className={`block bg-white rounded-lg shadow-sm p-5 hover:shadow-md transition-shadow ${locked ? 'opacity-60' : ''}`}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#2d2d2d] flex items-center gap-2">
                    <span className="text-xs text-[#ff3764]">{m.order}</span>
                    {m.title}
                    {locked && <Lock className="w-3.5 h-3.5 text-[#2d2d2d]" />}
                    {m.is_final_milestone && <span className="text-[10px] uppercase tracking-wide text-[#6b6b6b]">Final</span>}
                  </p>
                  <p className="text-xs text-[#6b6b6b] mt-0.5">
                    {fmtEUR(m.milestone_amount)}
                    {m.planned_handover ? ` · Plan-Übergabe ${fmtDate(m.planned_handover)}` : ''}
                    {m.feedback_deadline
                      ? ` · Feedback bis ${fmtDate(m.feedback_deadline)}`
                      : m.planned_freeze ? ` · Plan-Freeze ${fmtDate(m.planned_freeze)}` : ''}
                  </p>
                </div>
                <div className="md:w-[340px]">
                  <Zustandskette state={m.state} />
                </div>
              </div>
            </Link>
          );
        })}
        {milestones.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm p-10 text-center text-sm text-[#6b6b6b]">
            Dieser Sprint hat keine Milestones.
          </div>
        )}
      </div>
    </div>
  );
}