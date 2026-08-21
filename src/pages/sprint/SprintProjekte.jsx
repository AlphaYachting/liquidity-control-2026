import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Pencil, LayoutTemplate, Plus } from 'lucide-react';
import ProjektZeile from '@/components/sprint/uebersicht/ProjektZeile';
import ProjektZeileOhneSprint from '@/components/sprint/uebersicht/ProjektZeileOhneSprint';
import ClientFormDialog from '@/components/sprint/ClientFormDialog';
import ProjectFormDialog from '@/components/sprint/ProjectFormDialog';
import { sprintStatus } from '@/lib/sprint/status';

// S3 — Projektliste + Stammdaten für Client und Project (gleicher Informationsgehalt wie die Übersicht)
export default function SprintProjekte() {
  const qc = useQueryClient();
  const [clientDialog, setClientDialog] = useState({ open: false, client: null });
  const [projectDialog, setProjectDialog] = useState({ open: false, project: null });

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });

  const { data, isLoading } = useQuery({
    queryKey: ['sprintProjekte'],
    queryFn: async () => {
      const [clients, projects, sprints, milestones, tickets, members, signals, timeEntries, focusDays] = await Promise.all([
        base44.entities.Client.list('name', 300),
        base44.entities.Project.list('-created_date', 300),
        base44.entities.Sprint.list('-created_date', 500),
        base44.entities.Milestone.list('order', 1000),
        base44.entities.Ticket.list('order', 3000),
        base44.entities.TeamMember.filter({ active: true }, 'name', 100),
        base44.entities.IntelligenceSignal.filter({ resolved: false }, '-triggered_at', 100),
        base44.entities.TimeEntry.list('-entry_date', 3000),
        base44.entities.FocusDay.list('-day', 2000),
      ]);
      return { clients, projects, sprints, milestones, tickets, members, signals, timeEntries, focusDays };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['sprintProjekte'] });

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-10 w-48 bg-muted" />
        <Skeleton className="h-64 w-full bg-muted" />
      </div>
    );
  }

  const { clients, projects, sprints, milestones, tickets, members, signals, timeEntries, focusDays } = data;
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));

  const zeilen = projects.map((project) => {
    const projectSprints = sprints.filter((s) => s.project_id === project.id);
    const sprint = projectSprints.find((s) => s.status === 'laufend') || projectSprints.find((s) => s.status === 'geplant');
    if (!sprint) return { project, client: clientById[project.client_id], sprint: null, projectSprints };

    const sprintMilestones = milestones.filter((m) => m.sprint_id === sprint.id);
    const ids = sprintMilestones.map((m) => m.id);
    const sprintTickets = tickets.filter((t) => ids.includes(t.milestone_id));
    const status = sprintStatus({
      sprint,
      milestones: sprintMilestones,
      tickets: sprintTickets,
      timeEntries: timeEntries.filter((t) => t.project_id === project.id),
      focusDays: focusDays.filter((f) => f.project_id === project.id && f.type === 'focus'),
      signals: signals.filter((s) => s.sprint_id === sprint.id || s.project_id === project.id),
    });
    const emails = [...new Set(sprintTickets.filter((t) => t.assignee_email).map((t) => t.assignee_email))];
    return {
      project,
      client: clientById[project.client_id],
      sprint,
      projectSprints,
      milestones: sprintMilestones,
      status,
      people: emails.map((e) => members.find((m) => m.email === e) || { email: e, name: e }),
    };
  })
    // gleiche Sortierung wie die Übersicht: Dringlichkeit, dann Liefertermin; Projekte ohne Sprint zuletzt
    .sort((a, b) => {
      if (!a.sprint && !b.sprint) return (a.project.title || '').localeCompare(b.project.title || '');
      if (!a.sprint) return 1;
      if (!b.sprint) return -1;
      return a.status.urgency - b.status.urgency
        || (a.sprint.delivery_date || '').localeCompare(b.sprint.delivery_date || '');
    });

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Projekte</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded" asChild>
            <Link to="/sprint/katalog"><LayoutTemplate className="w-4 h-4 mr-1.5" /> Modul-Katalog</Link>
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded" asChild>
            <Link to="/sprint/neu"><Plus className="w-4 h-4 mr-1" /> Neu anlegen</Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="projekte">
        <TabsList>
          <TabsTrigger value="projekte">Projekte ({projects.length})</TabsTrigger>
          <TabsTrigger value="kunden">Kunden ({clients.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="projekte" className="mt-4">
          <div className="bg-white rounded-lg border border-border overflow-hidden">
            {zeilen.map((z) => (
              <div key={z.project.id} className="border-b border-[#eeeeee] last:border-0">
                {z.sprint ? (
                  <ProjektZeile
                    sprint={z.sprint}
                    project={z.project}
                    client={z.client}
                    milestones={z.milestones}
                    status={z.status}
                    people={z.people}
                    currentUserEmail={me?.email}
                    onEdit={() => setProjectDialog({ open: true, project: z.project })}
                  />
                ) : (
                  <ProjektZeileOhneSprint
                    project={z.project}
                    client={z.client}
                    onEdit={() => setProjectDialog({ open: true, project: z.project })}
                  />
                )}
                {z.projectSprints.length > 1 && (
                  <div className="flex flex-wrap gap-2 px-4 pb-3 pl-12">
                    {z.projectSprints.map((s) => (
                      <Link
                        key={s.id}
                        to={`/sprint/sprints/${s.id}`}
                        className="text-[11px] px-2 py-0.5 rounded bg-muted text-foreground hover:bg-border"
                      >
                        {s.title || s.size} · {s.status}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {projects.length === 0 && (
              <p className="p-10 text-center text-sm text-muted-foreground">
                Noch kein Projekt — oben rechts über „Neu anlegen" starten.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="kunden" className="space-y-3 mt-4">
          <div className="flex justify-end">
            <Button variant="outline" className="rounded" onClick={() => setClientDialog({ open: true, client: null })}>
              <Plus className="w-4 h-4 mr-1" /> Kunde anlegen
            </Button>
          </div>
          {clients.map((c) => (
            <div key={c.id} className="bg-white rounded-lg shadow-sm p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.contact_person ? `${c.contact_person} · ` : ''}{c.contact_email}
                  {c.agb_version ? ` · ${c.agb_version}` : ''}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setClientDialog({ open: true, client: c })}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          {clients.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm p-10 text-center text-sm text-muted-foreground">
              Noch kein Kunde — hier oben anlegen.
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ClientFormDialog
        open={clientDialog.open} client={clientDialog.client}
        onOpenChange={(o) => setClientDialog((d) => ({ ...d, open: o }))} onSaved={refresh}
      />
      <ProjectFormDialog
        open={projectDialog.open} project={projectDialog.project} clients={clients}
        onOpenChange={(o) => setProjectDialog((d) => ({ ...d, open: o }))} onSaved={refresh}
      />
    </div>
  );
}