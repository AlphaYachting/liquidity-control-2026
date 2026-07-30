import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import SectionLabel from '@/components/sprint/SectionLabel';
import ZeitBuchung from '@/components/sprint/ZeitBuchung';
import HeuteAufgabenliste from '@/components/sprint/HeuteAufgabenliste';
import Fortschrittszaehler from '@/components/sprint/Fortschrittszaehler';
import { todayIso, fmtDate } from '@/components/sprint/sprintConfig';

// S1 — HEUTE: Focus-Tag-Ansicht des angemeldeten Nutzers
export default function SprintHeute() {
  const { user } = useAuth();
  const email = user?.email;
  const today = todayIso();

  const { data, isLoading } = useQuery({
    queryKey: ['sprintHeute', email, today],
    enabled: !!email,
    queryFn: async () => {
      const [focusDays, projects, clients, milestones, myTickets, settings, sprints] = await Promise.all([
        base44.entities.FocusDay.filter({ person_email: email, day: today }),
        base44.entities.Project.list('-created_date', 200),
        base44.entities.Client.list('-created_date', 200),
        base44.entities.Milestone.list('-created_date', 500),
        base44.entities.Ticket.filter({ assignee_email: email }, 'order', 500),
        base44.entities.Setting.filter({ group: 'kapazitaet' }, 'key', 50),
        base44.entities.Sprint.list('-created_date', 500),
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
      return { focusDay, projects, clients, tickets, milestones, standardHours, myProjectIds, sprints };
    },
  });

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-10 w-48 bg-[#f5f5f5]" />
        <Skeleton className="h-48 w-full bg-[#f5f5f5]" />
        <Skeleton className="h-32 w-full bg-[#f5f5f5]" />
      </div>
    );
  }

  const { focusDay, projects, clients, tickets, milestones, standardHours, myProjectIds, sprints } = data;
  const sprintProject = Object.fromEntries(sprints.map((s) => [s.id, s.project_id]));
  const focusProject = focusDay?.project_id ? projects.find((p) => p.id === focusDay.project_id) : null;
  const focusClient = focusProject ? clients.find((c) => c.id === focusProject.client_id) : null;

  // Solange die Etappe nicht beim Kunden liegt, trägt das geplante Freeze-Datum die Frist
  const doneCount = tickets.filter((t) => t.status === 'erledigt').length;
  const deadlineOf = (m) => m.feedback_deadline || m.planned_freeze;
  const deadlines = milestones
    .filter((m) => m.state !== 'freigegeben' && deadlineOf(m) && deadlineOf(m) >= today
      && myProjectIds.has(sprintProject[m.sprint_id]))
    .sort((a, b) => deadlineOf(a).localeCompare(deadlineOf(b)))
    .slice(0, 3);

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight text-[#2d2d2d]">Heute</h1>

      {focusDay?.type === 'focus' && focusProject ? (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <SectionLabel className="mb-2">Mein Focus-Tag</SectionLabel>
          <h2 className="text-xl font-extrabold uppercase text-[#2d2d2d]">{focusProject.title}</h2>
          {focusClient && <p className="text-sm text-[#6b6b6b] mt-0.5">{focusClient.name}</p>}
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
            />
          </div>
        </div>
      ) : focusDay?.type === 'reaktion' ? (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <SectionLabel className="mb-2">Reaktionstag</SectionLabel>
          <h2 className="text-xl font-extrabold uppercase text-[#2d2d2d]">Reaktionstag — kein Projektfokus</h2>
          <Fortschrittszaehler
            className="mt-4 max-w-md"
            done={doneCount}
            total={tickets.length}
            goalLabel="bis zum Tagesende"
          />
          <div className="mt-4">
            <HeuteAufgabenliste tickets={tickets} emptyText="Keine Aufgaben zugewiesen." />
          </div>
        </div>
      ) : focusDay?.type === 'abwesend' ? (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <SectionLabel className="mb-2">Abwesend</SectionLabel>
          <p className="text-sm text-[#2d2d2d]">Für heute bist du als abwesend eingetragen.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm p-10 text-center">
          <p className="text-[#2d2d2d] font-medium">Für heute ist kein Focus-Tag geplant.</p>
          <Button asChild className="mt-4 bg-[#ff3764] hover:bg-[#e62e58] text-white font-bold uppercase rounded">
            <Link to="/sprint/planung">Tag zuweisen</Link>
          </Button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm p-5">
        <SectionLabel className="mb-3">Meine nächsten drei Fristen</SectionLabel>
        {deadlines.length > 0 ? (
          <div className="space-y-1">
            {deadlines.map((m) => (
              <Link key={m.id} to={`/sprint/milestones/${m.id}`} className="flex items-center gap-3 py-1.5 hover:bg-[#f5f5f5]/60 px-2 -mx-2 rounded">
                <span className="text-sm text-[#2d2d2d] flex-1">
                  {m.title}
                  {!m.feedback_deadline && <span className="text-[11px] text-[#6b6b6b] ml-2">geplant</span>}
                </span>
                <span className="text-sm font-semibold text-[#2d2d2d]">{fmtDate(deadlineOf(m))}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#6b6b6b]">Alles im Plan — keine Frist in Sicht.</p>
        )}
      </div>

      <ZeitBuchung
        userEmail={email}
        fixedProjectId={focusDay?.type === 'focus' ? focusDay.project_id : null}
        fixedProjectTitle={focusProject?.title}
        projects={projects.filter((p) => p.status === 'aktiv')}
        standardHours={standardHours}
      />
    </div>
  );
}