import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Archive, Loader2, Download } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import ArchivLaufZeile from '@/components/awork/ArchivLaufZeile';

const JAHRE = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

// Vollständiger Rohexport des awork-Bestands — der Beleg für Migration und Sanierung.
export default function ArchivExportPanel() {
  const queryClient = useQueryClient();
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState(null);

  const { data: laeufe = [] } = useQuery({
    queryKey: ['awork-archive-exports'],
    queryFn: () => base44.entities.AworkSyncLog.filter({ sync_type: 'archive_export' }, '-started_at', 10),
  });

  const starten = async (jahr) => {
    setLaeuft(true); setErgebnis(null);
    const resp = await base44.functions.invoke('exportAworkArchive', jahr ? { jahr } : {});
    setErgebnis(resp.data);
    queryClient.invalidateQueries({ queryKey: ['awork-archive-exports'] });
    queryClient.invalidateQueries({ queryKey: ['awork-sync-logs'] });
    setLaeuft(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Archive className="w-4 h-4 text-muted-foreground" /> Archiv-Export
        </CardTitle>
        <Button size="sm" onClick={() => starten(null)} disabled={laeuft}>
          {laeuft ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          Vollständigen Export erzeugen
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Zieht Projekte, Aufgaben, Zeitbuchungen, Kommentare und Stammdaten roh als JSONL
          (plus CSV-Lesefassung) und legt sie mit Prüfsummen im Manifest ab. Dateianhänge sind
          nicht enthalten — Anhänge und awork-Dokumente sind es. Der Zeitraum begrenzt
          ausschliesslich die Zeitbuchungen; alles andere wird immer vollständig gezogen.
          Der Lauf kann mehrere Minuten dauern.
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Teillauf je Jahr</span>
          {JAHRE.map((j) => (
            <Button key={j} size="sm" variant="outline" className="h-6 px-2 text-[11px]"
              onClick={() => starten(j)} disabled={laeuft}>
              {j}
            </Button>
          ))}
        </div>

        {ergebnis?.error && <p className="text-xs text-destructive">Fehler: {ergebnis.error}</p>}

        {ergebnis?.ok && !ergebnis.vollstaendig && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 space-y-1">
            <p className="font-medium">Dieser Lauf ist unvollständig — kein belastbarer Beleg.</p>
            {ergebnis.abweichungen?.map((a, i) => (
              <p key={i}>{a.objektart}: erwartet {a.erwartet}, geschrieben {a.geschrieben}</p>
            ))}
            {ergebnis.fehlgeschlagene_abrufe?.length > 0 && (
              <p>{ergebnis.fehlgeschlagene_abrufe.length} fehlgeschlagene Abrufe — Details im Manifest.</p>
            )}
          </div>
        )}

        {ergebnis?.ok && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {ergebnis.summen.zeitbuchungen} Zeitbuchungen · {ergebnis.summen.projekte} Projekte ·{' '}
              {ergebnis.summen.aufgaben} Aufgaben · {ergebnis.summen.kommentare} Kommentare ·{' '}
              {ergebnis.summen.anhaenge} Anhänge · {ergebnis.summen.dokumente} Dokumente
              {ergebnis.fehlgeschlagene_abrufe?.length
                ? ` · ${ergebnis.fehlgeschlagene_abrufe.length} fehlgeschlagene Abrufe` : ''}
            </p>
            <div className="divide-y border rounded-lg">
              {ergebnis.dateien.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                  <span className="truncate">{d.name}</span>
                  <span className="text-muted-foreground shrink-0">{d.zeilen} Zeilen</span>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-primary hover:underline shrink-0">
                      Download
                    </a>
                  ) : <span className="text-destructive shrink-0">kein Upload</span>}
                </div>
              ))}
            </div>
          </div>
        )}

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