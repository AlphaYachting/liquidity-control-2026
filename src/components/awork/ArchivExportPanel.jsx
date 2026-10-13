import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Archive } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import ArchivLaufZeile from '@/components/awork/ArchivLaufZeile';

// Vollständiger Rohexport des awork-Bestands — der Beleg für Migration und Sanierung.
// aWork ist abgelöst: Neue Exporte sind nicht mehr möglich, die bisherigen Läufe
// (Dateien mit Prüfsummen) bleiben hier abrufbar.
export default function ArchivExportPanel() {
  const { data: laeufe = [] } = useQuery({
    queryKey: ['awork-archive-exports'],
    queryFn: () => base44.entities.AworkSyncLog.filter({ sync_type: 'archive_export' }, '-started_at', 10),
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Archive className="w-4 h-4 text-muted-foreground" /> Archiv-Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Rohexport des aWork-Bestands (JSONL plus CSV-Lesefassung, mit Prüfsummen im Manifest).
          aWork ist abgelöst — neue Exporte sind nicht mehr möglich. Die bisherigen Läufe und
          ihre Dateien bleiben unten abrufbar.
        </p>

        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Bisherige Läufe</p>
          {laeufe.length === 0 ? (
            <p className="text-xs text-muted-foreground">Noch kein Archiv-Export erzeugt.</p>
          ) : (
            <div className="divide-y border rounded-lg">
              {laeufe.map((l) => (
                <ArchivLaufZeile key={l.id} lauf={l}
                  zeit={l.started_at ? formatDistanceToNow(new Date(l.started_at), { addSuffix: true, locale: de }) : '—'} />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}