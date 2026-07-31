import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Download, Check } from 'lucide-react';
import SectionLabel from '@/components/sprint/SectionLabel';
import { RITTLER, STATUS_COLORS, fmtEUR, fmtDate } from '@/components/sprint/sprintConfig';

// S2 — Rechnungsübergabe: freigegebene Etappen, die noch nicht in SEF erfasst sind.
export default function SprintRechnungsuebergabe() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sprintRechnungsuebergabe'],
    queryFn: async () => {
      const [milestones, sprints, projects, clients] = await Promise.all([
        base44.entities.Milestone.filter({ released: true }, '-released_at', 500),
        base44.entities.Sprint.list('-created_date', 300),
        base44.entities.Project.list('-created_date', 300),
        base44.entities.Client.list('name', 300),
      ]);
      return { milestones, sprints, projects, clients };
    },
  });

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-10 w-64 bg-[#f5f5f5]" />
        <Skeleton className="h-64 w-full bg-[#f5f5f5]" />
      </div>
    );
  }

  const sprintById = Object.fromEntries(data.sprints.map((s) => [s.id, s]));
  const projectById = Object.fromEntries(data.projects.map((p) => [p.id, p]));
  const clientById = Object.fromEntries(data.clients.map((c) => [c.id, c]));

  const rows = data.milestones
    .filter((m) => !m.invoiced_at)
    .map((m) => {
      const sprint = sprintById[m.sprint_id];
      const project = sprint ? projectById[sprint.project_id] : null;
      const client = project ? clientById[project.client_id] : null;
      return { milestone: m, sprint, project, client };
    });

  const summe = rows.reduce((s, r) => s + (r.milestone.milestone_amount || 0), 0);

  const markErfasst = async (m) => {
    await base44.entities.Milestone.update(m.id, { invoiced_at: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: ['sprintRechnungsuebergabe'] });
  };

  const exportCsv = () => {
    const header = 'Kunde;Projekt;Etappe;Betrag;Freigabedatum';
    const lines = rows.map((r) =>
      [r.client?.name || '', r.project?.title || '', r.milestone.title,
        r.milestone.milestone_amount || 0, fmtDate(r.milestone.released_at)].join(';')
    );
    const blob = new Blob(['\uFEFF' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rechnungsuebergabe.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight" style={{ color: RITTLER.black }}>
            Rechnungsübergabe
          </h1>
          <p className="text-[15px] font-bold mt-1" style={{ color: rows.length > 0 ? '#9c5b00' : RITTLER.black }}>
            {rows.length} {rows.length === 1 ? 'Etappe' : 'Etappen'} freigegeben, noch nicht fakturiert · {fmtEUR(summe)}
          </p>
        </div>
        <Button variant="outline" className="rounded border-[1.5px] border-[#2d2d2d] text-[#2d2d2d]" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="w-4 h-4" /> CSV-Export
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-[#e0e0e0] overflow-hidden">
        {rows.map(({ milestone, project, client }) => (
          <div key={milestone.id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#eeeeee] last:border-0">
            <div className="flex-1 min-w-[220px]">
              <p className="text-base font-bold uppercase" style={{ color: RITTLER.black }}>{client?.name || 'Kunde'}</p>
              <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>
                {project?.title || 'Projekt'} · {milestone.title}
              </p>
            </div>
            <div className="text-right w-[130px] shrink-0">
              <p className="text-[15px] font-bold" style={{ color: RITTLER.black }}>{fmtEUR(milestone.milestone_amount)}</p>
              <p className="text-xs" style={{ color: RITTLER.textSecondary }}>freigegeben am {fmtDate(milestone.released_at)}</p>
            </div>
            <Button
              size="sm"
              className="bg-[#ff3764] hover:bg-[#d12d52] text-white font-bold rounded"
              onClick={() => markErfasst(milestone)}
            >
              <Check className="w-4 h-4" /> als in SEF erfasst markieren
            </Button>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="p-10 text-center">
            <Check className="w-6 h-6 mx-auto mb-2" style={{ color: STATUS_COLORS.doneText }} />
            <p className="text-sm" style={{ color: RITTLER.textSecondary }}>
              Alle freigegebenen Etappen sind in SEF erfasst.
            </p>
          </div>
        )}
      </div>

      <SectionLabel>Freigegeben heißt abrechnungsbereit — die Rechnung entsteht in SEF.</SectionLabel>
    </div>
  );
}