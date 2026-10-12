import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PenLine, FolderOpen } from 'lucide-react';
import Sektion from '@/components/projects/Sektion';
import KundenaktTimeline from '@/components/projects/kundenakt/KundenaktTimeline';

// Projektakt — Vereinbarungen, Updates und Dokumente des Projekts als Timeline,
// neueste Eingabe oben. Hängt immer am Arbeitsprojekt (Project.id).
// Erfasst wird über die Projektintelligenz (onFesthalten).
export default function KundenaktTab({ projectId, projectName, customer, onFesthalten, titel = 'Projektakt' }) {
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['projectFileEntries', projectId],
    queryFn: () => base44.entities.ProjectFileEntry.filter({ project_id: projectId }, '-entry_date'),
    enabled: !!projectId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['projectFileEntries', projectId] });

  if (!projectId) {
    return (
      <Sektion titel={titel} symbol={FolderOpen}>
        <p className="text-sm text-muted-foreground">
          Mit diesem Cockpit ist kein Arbeitsprojekt verknüpft. Der Projektakt hängt am Arbeitsprojekt —
          bitte zuerst ein Projekt verknüpfen.
        </p>
      </Sektion>
    );
  }

  return (
    <Sektion
      titel={titel}
      symbol={FolderOpen}
      aktion={
        <Button size="sm" variant="ghost" onClick={onFesthalten} className="gap-2 shrink-0 text-muted-foreground hover:text-foreground">
          <PenLine className="w-3.5 h-3.5" /> Festhalten
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">
        Vereinbarungen, Updates und Dokumente zum Projekt — Schritt für Schritt nach unten.
      </p>

      {isLoading ? (
        <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : (
        <KundenaktTimeline entries={entries} onChanged={refresh} />
      )}
    </Sektion>
  );
}
