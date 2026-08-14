import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, FolderOpen } from 'lucide-react';
import Sektion from '@/components/projects/Sektion';
import KundenaktTimeline from '@/components/projects/kundenakt/KundenaktTimeline';
import KundenaktEntryDialog from '@/components/projects/kundenakt/KundenaktEntryDialog';

// Digitaler Kundenakt des Projekts — Vereinbarungen, Updates und Dokumente
// als Timeline, neueste Eingabe oben.
export default function KundenaktTab({ projectId, projectName, customer }) {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['projectFileEntries', projectId],
    queryFn: () => base44.entities.ProjectFileEntry.filter({ project_id: projectId }, '-entry_date'),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['projectFileEntries', projectId] });

  return (
    <Sektion
      titel="Kundenakt"
      symbol={FolderOpen}
      aktion={
        <Button size="sm" onClick={() => setShowDialog(true)} className="gap-2 shrink-0">
          <Plus className="w-3.5 h-3.5" /> Eintrag erfassen
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

      <KundenaktEntryDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        projectId={projectId}
        projectName={projectName}
        customer={customer}
        onSaved={refresh}
      />
    </Sektion>
  );
}