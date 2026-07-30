import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import SectionLabel from '@/components/sprint/SectionLabel';
import SprintKopf from '@/components/sprint/SprintKopf';
import EtappenZeile from '@/components/sprint/EtappenZeile';

// S4 — Sprint-Übersicht: ein Kopf mit Kennzahlen, Etappen als Zeilen in einer Karte.
export default function SprintDetail() {
  const { sprintId } = useParams();

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });

  const { data, isLoading } = useQuery({
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

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-40 w-full bg-[#f5f5f5]" />
        <Skeleton className="h-40 w-full bg-[#f5f5f5]" />
      </div>
    );
  }

  const { sprint, project, client, milestones, tickets, members, timeEntries, focusDays } = data;

  const inRange = (d) =>
    d && (!sprint.start_date || d >= sprint.start_date) && (!sprint.delivery_date || d <= sprint.delivery_date);
  const bookedHours = timeEntries.filter((t) => inRange(t.entry_date)).reduce((s, t) => s + (t.hours || 0), 0);
  const plannedFocusUsed = focusDays.filter((f) => inRange(f.day)).length;

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
        bookedHours={bookedHours}
        plannedFocusUsed={plannedFocusUsed}
      />

      <div>
        <SectionLabel className="mb-2">Etappen</SectionLabel>
        <div className="bg-white rounded-lg border border-[#e0e0e0] overflow-hidden">
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
            <p className="p-10 text-center text-sm text-[#6b6b6b]">Dieser Sprint hat keine Milestones.</p>
          )}
        </div>
      </div>
    </div>
  );
}