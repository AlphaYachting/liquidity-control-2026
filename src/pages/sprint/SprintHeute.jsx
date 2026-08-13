import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import SectionLabel from '@/components/sprint/SectionLabel';
import HeuteGebucht from '@/components/sprint/HeuteGebucht';
import HeuteAufgabenliste from '@/components/sprint/HeuteAufgabenliste';
import HeuteFristen from '@/components/sprint/HeuteFristen';
import HeutePmBlock from '@/components/sprint/HeutePmBlock';
import Fortschrittszaehler from '@/components/sprint/Fortschrittszaehler';
import { todayIso } from '@/components/sprint/sprintConfig';

// S1 — HEUTE: Focus-Tag-Ansicht des angemeldeten Nutzers
export default function SprintHeute() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const email = user?.email;
  const today = todayIso();

  const { data, isLoading } = useQuery({
    queryKey: ['sprintHeute', email, today],
    enabled: !!email,
    queryFn: async () => {
      const [focusDays, projects, clients, milestones, myTickets, settings, sprints, todayEntries] = await Promise.all([
        base44.entities.FocusDay.filter({ person_email: email, day: today }),
        base44.entities.Project.list('-created_date', 200),
        base44.entities.Client.list('-created_date', 200),
        base44.entities.Milestone.list('-created_date', 500),
        base44.entities.Ticket.filter({ assignee_email: email }, 'order', 500),
        base44.entities.Setting.filter({ group: 'kapazitaet' }, 'key', 50),
        base44.entities.Sprint.list('-created_date', 500),
        base44.entities.TimeEntry.filter({ person_email: email, entry_date: today }),
      ]);
      const focusDay = focusDays[0] || null;
      let tickets = [];
      if (focusDay?.type === 'focus' && focusDay.project_id) {
        const all = await base44.entities.Ticket.filter({ project_id: focusDay.project_id }, 'order', 500);
        tickets = all.filter((t) => !t.assignee_email || t.assignee_email === email);
      } else if (focusDay?.type === 'reaktion') {
        tickets = myTickets;
      }
      const standardHours = Number(settings.find((s) => s.key === 'standard_day_hours')?.value) || 8;
      const myProjectIds = new Set([
        ...myTickets.map((t) => t.project_id),
        ...projects.filter((p) => p.pm_email === email).map((p) => p.id),
      ]);
      return { focusDay, projects, clients, tickets, milestones, standardHours, myProjectIds, sprints, todayEntries };
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sprintHeute'] });

  const handleStatusChange = async (ticket, status) => {
    await base44.entities.Ticket.update(ticket.id, { status, last_status_change: new Date().toISOString() });
    refresh();
  };

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-10 w-48 bg-muted" />
        <Skeleton className="h-48 w-full bg-muted" />
        <Skeleton className="h-32 w-full bg-muted" />
      </div>
    );
  }

  const { focusDay, projects, clients, tickets, milestones, standardHours, myProjectIds, sprints, todayEntries } = data;
  const sprintProject = Object.fromEntries(sprints.map((s) => [s.id, s.project_id]));
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const milestoneById = Object.fromEntries(milestones.map((m) => [m.id, m]));
  const projectTitleById = Object.fromEntries(projects.map((p) => [p.id, p.title]));
  const focusProject = focusDay?.project_id ? projectById[focusDay.project_id] : null;
  const focusClient = focusProject ? clientById[focusProject.client_id] : null;

  // Solange die Etappe nicht beim Kunden liegt, trägt das geplante Freeze-Datum die Frist
  const doneCount = tickets.filter((t) => t.status === 'erledigt').length;
  const deadlineOf = (m) => m.feedback_deadline || m.planned_freeze;
  const daysUntil = (d) => Math.round((new Date(d) - new Date(today)) / 86400000);
  const deadlines = milestones
    .filter((m) => m.state !== 'freigegeben' && deadlineOf(m) && deadlineOf(m) >= today
      && myProjectIds.has(sprintProject[m.sprint_id]))
    .sort((a, b) => deadlineOf(a).localeCompare(deadlineOf(b)))
    .slice(0, 3)
    .map((m) => {
      const project = projectById[sprintProject[m.sprint_id]];
      return {
        m,
        project,
        client: project ? clientById[project.client_id] : null,
        days: daysUntil(deadlineOf(m)),
        planned: !m.feedback_deadline,
        deadline: deadlineOf(m),
      };
    });

  const listeProps = {
    milestoneById,
    projectById,
    onStatusChange: handleStatusChange,
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Heute</h1>

      {focusDay?.type === 'focus' && focusProject ? (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <SectionLabel className="mb-2">Mein Focus-Tag</SectionLabel>
          <h2 className="text-xl font-extrabold uppercase text-foreground">{focusProject.title}</h2>
          {focusClient && <p className="text-sm text-muted-foreground mt-0.5">{focusClient.name}</p>}
          <Fortschrittszaehler
            className="mt-4 max-w-md"
            done={doneCount}
            total={tickets.length}
            goalLabel="bis zum Tagesende"
          />
          <div className="mt-4">
            <HeuteAufgabenliste
              tickets={tickets}
              projectTitle={focusProject.title}
              emptyText="Keine Aufgaben in diesem Projekt."
              {...listeProps}
            />
          </div>
        </div>
      ) : focusDay?.type === 'reaktion' ? (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <SectionLabel className="mb-2">Reaktionstag</SectionLabel>
          <h2 className="text-xl font-extrabold uppercase text-foreground">Reaktionstag — kein Projektfokus</h2>
          <Fortschrittszaehler
            className="mt-4 max-w-md"
            done={doneCount}
            total={tickets.length}
            goalLabel="bis zum Tagesende"
          />
          <div className="mt-4">
            <HeuteAufgabenliste
              tickets={tickets}
              emptyText="Keine Aufgaben zugewiesen."
              showProject
              {...listeProps}
            />
          </div>
        </div>
      ) : focusDay?.type === 'abwesend' ? (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <SectionLabel className="mb-2">Abwesend</SectionLabel>
          <p className="text-sm text-foreground">Für heute bist du als abwesend eingetragen.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm p-10 text-center">
          <p className="text-foreground font-medium">Für heute ist kein Focus-Tag geplant.</p>
          <Button asChild className="mt-4 bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded">
            <Link to="/sprint/planung">Tag zuweisen</Link>
          </Button>
        </div>
      )}

      <HeutePmBlock
        email={email}
        milestones={milestones}
        sprints={sprints}
        projects={projects}
        clients={clients}
        today={today}
      />

      <HeuteFristen deadlines={deadlines} />

      <HeuteGebucht entries={todayEntries} projectTitleById={projectTitleById} />
    </div>
  );
}