import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import { monatsName } from '@/lib/sprint/behaelterZahlen';

// Hinweis nach einer Buchung: Kontingent/Rahmen überschritten oder 80 % erreicht (einmal je Monat und Projekt)
export default function KontingentHinweis({ eintragId }) {
  const { data: text } = useQuery({
    queryKey: ['kontingentHinweis', eintragId],
    enabled: !!eintragId,
    staleTime: Infinity,
    queryFn: async () => {
      const eintrag = await base44.entities.TimeEntry.get(eintragId);
      const project = await base44.entities.Project.get(eintrag.project_id);
      const typ = projectTypeOf(project);
      const kontingent = Number(project.support_kontingent_stunden) || 0;
      if (!kontingent || !['container', 'support', 'regie'].includes(typ)) return null;
      const monat = String(eintrag.entry_date).slice(0, 7);
      const mName = monatsName(monat);
      if (eintrag.ueber_kontingent) {
        return typ === 'container'
          ? `Kontingent ${mName} überschritten – als Mehrleistung markiert`
          : `Monatsrahmen ${mName} überschritten – mit dem Kunden abstimmen`;
      }
      const rows = await base44.entities.TimeEntry.filter(
        { project_id: project.id, entry_date: { $gte: `${monat}-01`, $lte: `${monat}-31` } }, '-entry_date', 1000,
      );
      const summe = rows.filter((r) => String(r.entry_date || '').startsWith(monat))
        .reduce((s, r) => s + (Number(r.duration_minutes) || 0), 0);
      const key = `rahmen80:${project.id}:${monat}`;
      if (summe < kontingent * 60 * 0.8 || localStorage.getItem(key)) return null;
      localStorage.setItem(key, '1');
      return `${project.title}: 80 % des Rahmens erreicht`;
    },
  });
  if (!text) return null;
  return (
    <p className="text-[13px] mt-3 p-2 rounded" style={{ backgroundColor: STATUS_COLORS.attentionSurface, color: STATUS_COLORS.attention }}>
      {text}
    </p>
  );
}