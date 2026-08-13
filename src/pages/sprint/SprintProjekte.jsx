import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Pencil, LayoutTemplate, Plus } from 'lucide-react';
import Ampelpunkt from '@/components/sprint/Ampelpunkt';
import ClientFormDialog from '@/components/sprint/ClientFormDialog';
import ProjectFormDialog from '@/components/sprint/ProjectFormDialog';
import { fmtDate, fmtEUR, todayIso } from '@/components/sprint/sprintConfig';

// S3 — Projektliste + Stammdaten für Client und Project
export default function SprintProjekte() {
  const qc = useQueryClient();
  const [clientDialog, setClientDialog] = useState({ open: false, client: null });
  const [projectDialog, setProjectDialog] = useState({ open: false, project: null });

  const { data, isLoading } = useQuery({
    queryKey: ['sprintProjekte'],
    queryFn: async () => {
      const [clients, projects, sprints] = await Promise.all([
        base44.entities.Client.list('-created_date', 200),
        base44.entities.Project.list('-created_date', 200),
        base44.entities.Sprint.list('-created_date', 500),
      ]);
      return { clients, projects, sprints };
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

  const { clients, projects, sprints } = data;
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const today = todayIso();

  // Statusachse: leerer Kreis = nichts zu tun, Dreieck = Aufmerksamkeit, Quadrat = Handlung nötig
  const ampelFor = (projectSprints) => {
    const running = projectSprints.find((s) => s.status === 'laufend');
    if (!running || !running.delivery_date) return { status: 'plan', hint: 'Im Plan' };
    const rest = Math.round((new Date(running.delivery_date) - new Date(today)) / 86400000);
    if (rest < 0) return { status: 'critical', hint: 'Liefertermin überschritten' };
    if (rest <= 7) return { status: 'attention', hint: `Liefertermin in ${rest} Tagen` };
    return { status: 'plan', hint: 'Im Plan' };
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Projekte</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded" asChild>
            <Link to="/sprint/katalog"><LayoutTemplate className="w-4 h-4 mr-1.5" /> Modul-Katalog</Link>
          </Button>
          <Button variant="outline" className="rounded" onClick={() => setClientDialog({ open: true, client: null })}>
            <Plus className="w-4 h-4 mr-1" /> Kunde
          </Button>
          <Button variant="outline" className="rounded" onClick={() => setProjectDialog({ open: true, project: null })}>
            <Plus className="w-4 h-4 mr-1" /> Projekt
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded" asChild>
            <Link to="/sprint/neu">Sprint anlegen</Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="projekte">
        <TabsList>
          <TabsTrigger value="projekte">Projekte ({projects.length})</TabsTrigger>
          <TabsTrigger value="kunden">Kunden ({clients.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="projekte" className="space-y-3 mt-4">
          {projects.map((p) => {
            const projectSprints = sprints.filter((s) => s.project_id === p.id);
            const active = projectSprints.find((s) => s.status === 'laufend') || projectSprints.find((s) => s.status === 'geplant');
            const ampel = ampelFor(projectSprints);
            return (
              <div key={p.id} className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex items-center gap-3">
                  <Ampelpunkt status={ampel.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold uppercase text-foreground truncate">
                      {clientById[p.client_id]?.name || 'Kunde'}
                    </p>
                    <p className="text-[13px] text-muted-foreground truncate">
                      {p.title}{active ? ` · ${active.title || `Sprint ${active.size}`} · ${active.size}` : ''} · PM: {p.pm_email} · {ampel.hint}
                    </p>
                  </div>
                  {active ? (
                    <Link to={`/sprint/sprints/${active.id}`} className="text-sm font-semibold text-primary/90 hover:underline">
                      Sprint {active.size} · bis {fmtDate(active.delivery_date)}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">Kein laufender Sprint</span>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setProjectDialog({ open: true, project: p })}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {projectSprints.length > 1 && (
                  <div className="flex flex-wrap gap-2 mt-2 pl-5">
                    {projectSprints.map((s) => (
                      <Link key={s.id} to={`/sprint/sprints/${s.id}`} className="text-[11px] px-2 py-0.5 rounded bg-muted text-foreground hover:bg-border">
                        {s.title || `Sprint ${s.size}`} · {s.status}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {projects.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm p-10 text-center text-sm text-muted-foreground">
              Noch kein Projekt — oben rechts anlegen.
            </div>
          )}
        </TabsContent>

        <TabsContent value="kunden" className="space-y-3 mt-4">
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
              Noch kein Kunde — oben rechts anlegen.
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