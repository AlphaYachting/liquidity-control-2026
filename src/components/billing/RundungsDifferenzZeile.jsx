import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { verrechneteMinuten } from '@/lib/zeit/rundung';
import { useRundungsSettings } from '@/lib/zeit/useRundungsregeln';

const stunden = (min) => `${(Math.round((min / 60) * 100) / 100).toLocaleString('de-AT')} h`;

// Rundungsdifferenz der noch offenen Stunden — wird vor der Bestätigung des Betrags gezeigt.
export default function RundungsDifferenzZeile({ projectId }) {
  const settings = useRundungsSettings();

  const { data } = useQuery({
    queryKey: ['rundungOffeneStunden', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const [entries, projekt] = await Promise.all([
        base44.entities.TimeEntry.filter({ project_id: projectId, abrechnungsstatus: 'offen' }, '-entry_date', 500),
        base44.entities.Project.get(projectId).catch(() => null),
      ]);
      return { entries, projekt };
    },
  });

  if (!data?.entries?.length) return null;
  const werte = verrechneteMinuten(data.entries, data.projekt, settings);
  if (!werte.erfasst) return null;

  return (
    <div className="p-3 rounded-xl bg-muted/40 text-xs space-y-1">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Offene Stunden erfasst</span>
        <span>{stunden(werte.erfasst)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Verrechnet nach Rundung</span>
        <span className="font-semibold">{stunden(werte.verrechnet)}</span>
      </div>
      <div className="flex justify-between border-t pt-1">
        <span className="text-muted-foreground">Rundungsdifferenz</span>
        <span className={werte.delta > 0 ? 'text-amber-600 font-medium' : ''}>
          {werte.delta > 0 ? '+' : ''}{Math.round(werte.delta)} min
        </span>
      </div>
      {werte.geschaetztAnzahl > 0 && (
        <p className="text-muted-foreground">
          {werte.geschaetztAnzahl} Altbuchung{werte.geschaetztAnzahl === 1 ? '' : 'en'} ausgenommen — nur gerundete Stunden vorhanden.
        </p>
      )}
    </div>
  );
}