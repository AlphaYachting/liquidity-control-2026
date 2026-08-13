import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import FocusDayDialog from '@/components/sprint/FocusDayDialog';

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

function mondayOf(offsetWeeks = 0) {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1 + offsetWeeks * 7);
  return d;
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// S8 — Planungskalender: Zeilen = Personen, Spalten = Wochentage, Zelle per Klick zuweisbar
export default function SprintPlanung() {
  const qc = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [dialog, setDialog] = useState(null); // { personEmail, day, existing }

  const monday = mondayOf(weekOffset);
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return iso(d);
  });

  const { data, isLoading } = useQuery({
    queryKey: ['sprintPlanung', days[0]],
    queryFn: async () => {
      const [members, projects, focusDays] = await Promise.all([
        base44.entities.TeamMember.filter({ active: true }, 'name', 100),
        base44.entities.Project.list('-created_date', 200),
        base44.entities.FocusDay.filter({ day: { $gte: days[0], $lte: days[4] } }, 'day', 500),
      ]);
      return { members, projects, focusDays };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['sprintPlanung', days[0]] });

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-10 w-48 bg-muted" />
        <Skeleton className="h-64 w-full bg-muted" />
      </div>
    );
  }

  const { members, projects, focusDays } = data;
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const entryFor = (email, day) => focusDays.find((f) => f.person_email === email && f.day === day);

  // Keine Projektfarben: das Projekt erscheint als Kürzel in Text, die Farbachse bleibt dem Status
  const kuerzel = (title = '') =>
    (title.split(/\s+/).filter(Boolean).map((w) => w[0]).join('') || title.slice(0, 4)).toUpperCase().slice(0, 4);

  const fmtHeader = (isoDay) => {
    const d = new Date(isoDay);
    return `${d.getDate()}.${d.getMonth() + 1}.`;
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Planung</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 rounded" onClick={() => setWeekOffset(weekOffset - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground min-w-[130px] text-center">
            KW ab {fmtHeader(days[0])}{days[0].slice(0, 4)}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8 rounded" onClick={() => setWeekOffset(weekOffset + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="text-left text-[11px] font-bold uppercase tracking-[2px] text-primary/90 px-2 pb-2">Person</th>
              {days.map((d, i) => (
                <th key={d} className="text-center text-xs font-semibold text-foreground pb-2">
                  {DAY_LABELS[i]} <span className="text-muted-foreground font-normal">{fmtHeader(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((p) => {
              // S3 — Focus + Reaktion binden Kapazität; Abwesenheiten verkleinern den Nenner.
              const assigned = days.filter((d) => ['focus', 'reaktion'].includes(entryFor(p.email, d)?.type)).length;
              const absent = days.filter((d) => entryFor(p.email, d)?.type === 'abwesend').length;
              const capacity = Math.max(0, (p.weekly_focus_days || 4) - absent);
              return (
              <tr key={p.id}>
                <td className="text-sm font-medium text-foreground px-2 whitespace-nowrap">
                  {p.name}
                </td>
                {days.map((day) => {
                  const entry = entryFor(p.email, day);
                  const project = entry?.project_id ? projectById[entry.project_id] : null;
                  return (
                    <td key={day}>
                      <button
                        type="button"
                        onClick={() => setDialog({ personEmail: p.email, day, existing: entry })}
                        title={entry?.type === 'focus' ? project?.title : undefined}
                        className={`w-full h-14 rounded text-[11px] font-semibold px-1 transition-colors ${
                          entry?.type === 'focus'
                            ? 'bg-muted text-foreground font-bold border border-border hover:bg-border'
                            : entry?.type === 'reaktion'
                            ? 'bg-border text-muted-foreground uppercase tracking-wide'
                            : entry?.type === 'abwesend'
                            ? 'bg-white text-muted-foreground uppercase tracking-wide border border-dashed border-border'
                            : 'bg-white border border-dashed border-border text-muted-foreground hover:border-foreground'
                        }`}
                      >
                        {entry?.type === 'focus'
                          ? (project ? kuerzel(project.title) : 'Focus')
                          : entry?.type === 'reaktion' ? 'Reaktion' : entry?.type === 'abwesend' ? 'Abwesend' : '+'}
                        {/* U9: Projekte werden über Text unterschieden, nicht über Farbe */}
                      </button>
                    </td>
                  );
                })}
                <td className="text-center text-xs font-semibold whitespace-nowrap px-2">
                  <span className={assigned > capacity ? 'text-status-critical' : 'text-foreground'}>
                    {assigned} von {capacity}
                  </span>
                </td>
              </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={7} className="text-sm text-muted-foreground text-center py-8">
                  Kein aktives Teammitglied im Personenstamm.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {dialog && (
        <FocusDayDialog
          open={!!dialog}
          onOpenChange={(o) => !o && setDialog(null)}
          personEmail={dialog.personEmail}
          day={dialog.day}
          existing={dialog.existing}
          projects={projects.filter((p) => p.status === 'aktiv')}
          onSaved={refresh}
        />
      )}
    </div>
  );
}