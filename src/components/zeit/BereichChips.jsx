import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { istContainerProjekt, bereicheVonProjekt } from '@/lib/zeit/leistungsbereich';

// Optionaler Leistungsbereich als Chips — nur bei Container-Projekten.
export default function BereichChips({ projectId, wert, onWaehlen }) {
  const { data: bereiche = [] } = useQuery({
    queryKey: ['leistungsbereiche', projectId],
    enabled: !!projectId,
    queryFn: async () => ((await istContainerProjekt(projectId)) ? bereicheVonProjekt(projectId) : []),
  });
  if (!bereiche.length) return null;

  return (
    <div className="mt-2">
      <p className="text-[11px] text-muted-foreground mb-1">Leistungsbereich (optional)</p>
      <div className="flex flex-wrap gap-1.5">
        {bereiche.map((b) => {
          const aktiv = b.id === wert;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onWaehlen(aktiv ? null : b.id)}
              className={`text-xs px-2 py-0.5 rounded border ${aktiv ? 'border-foreground bg-foreground text-background' : 'border-border text-foreground hover:bg-muted'}`}
            >
              {b.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}