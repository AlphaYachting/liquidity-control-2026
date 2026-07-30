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
      const [profiles, projects, focusDays] = await Promise.all([
        base44.entities.TeamMemberProfile.filter({ is_active: true }, 'display_name', 100),
        base44.entities.Project.list('-created_date', 200),
        base44.entities.FocusDay.filter({ day: { $gte: days[0], $lte: days[4] } }, 'day', 500),
      ]);
      return { profiles, projects, focusDays };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['sprintPlanung', days[0]] });

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-10 w-48 bg-[#f5f5f5]" />
        <Skeleton className="h-64 w-full bg-[#f5f5f5]" />
      </div>
    );
  }

  const { profiles, projects, focusDays } = data;
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const entryFor = (email, day) => focusDays.find((f) => f.person_email === email && f.day === day);

  const fmtHeader = (isoDay) => {
    const d = new Date(isoDay);
    return `${d.getDate()}.${d.getMonth() + 1}.`;
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-[#2d2d2d]">Planung</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 rounded" onClick={() => setWeekOffset(weekOffset - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold text-[#2d2d2d] min-w-[130px] text-center">
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
              <th className="text-left text-[11px] font-bold uppercase tracking-[2px] text-[#ff3764] px-2 pb-2">Person</th>
              {days.map((d, i) => (
                <th key={d} className="text-center text-xs font-semibold text-[#2d2d2d] pb-2">
                  {DAY_LABELS[i]} <span className="text-[#999999] font-normal">{fmtHeader(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td className="text-sm font-medium text-[#2d2d2d] px-2 whitespace-nowrap">
                  {p.display_name || p.user_email}
                </td>
                {days.map((day) => {
                  const entry = entryFor(p.user_email, day);
                  const project = entry?.project_id ? projectById[entry.project_id] : null;
                  return (
                    <td key={day}>
                      <button
                        type="button"
                        onClick={() => setDialog({ personEmail: p.user_email, day, existing: entry })}
                        className={`w-full h-14 rounded text-[11px] font-semibold px-1 transition-colors ${
                          entry?.type === 'focus'
                            ? 'bg-[#ff3764]/10 text-[#2d2d2d] border border-[#ff3764]/40 hover:bg-[#ff3764]/20'
                            : entry?.type === 'reaktion'
                            ? 'bg-[repeating-linear-gradient(45deg,#f5f5f5,#f5f5f5_6px,#e8e8e8_6px,#e8e8e8_12px)] text-[#999999] border border-gray-200'
                            : entry?.type === 'abwesend'
                            ? 'bg-[#f5f5f5] text-[#999999] border border-gray-200 line-through'
                            : 'bg-white border border-dashed border-gray-200 text-[#999999] hover:border-[#ff3764]/50'
                        }`}
                      >
                        {entry?.type === 'focus' ? (project?.title || 'Focus') : entry?.type === 'reaktion' ? 'Reaktion' : entry?.type === 'abwesend' ? 'Abwesend' : '+'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {profiles.length === 0 && (
              <tr>
                <td colSpan={6} className="text-sm text-[#999999] text-center py-8">
                  Keine aktiven Teammitglieder — in den Einstellungen unter Team anlegen.
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