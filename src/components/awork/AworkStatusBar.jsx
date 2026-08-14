import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Link2, Loader2, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow, differenceInHours } from 'date-fns';
import { de } from 'date-fns/locale';
import AworkLastBookers from '@/components/awork/AworkLastBookers';
import ProjektFaktenzeile from '@/components/projects/ProjektFaktenzeile';

/**
 * Schlanke awork-Kontextzeile — Verknüpfung, Sync-Frische und Fakten in zwei Zeilen.
 * Alle Fortschritts- und Stunden-Kennzahlen leben in ProjectProgressBlock bzw. der Faktenzeile.
 * Props: data (awork-Felder), projectId, onSelectProject, onSync, isSyncing
 */
export default function AworkStatusBar({ data, projectId, onSelectProject, onSync, isSyncing }) {
  const src = data || {};

  const lastSyncDate = src.awork_last_synced_at ? new Date(src.awork_last_synced_at) : null;
  const isStale = lastSyncDate ? differenceInHours(new Date(), lastSyncDate) > 24 : false;
  const neverSynced = !lastSyncDate;

  const statusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('abgeschlossen') || s.includes('completed') || s.includes('done')) return 'bg-status-done-surface text-status-done-text border-border';
    return 'bg-muted text-muted-foreground border-border';
  };

  const freshnessLabel = neverSynced
    ? 'nicht synchronisiert'
    : isStale
      ? `Sync ${formatDistanceToNow(lastSyncDate, { addSuffix: true, locale: de })}`
      : 'aktuell';

  const freshnessClass = neverSynced
    ? 'text-muted-foreground'
    : isStale
      ? 'text-status-attention'
      : 'text-status-done-text';

  if (!src.awork_project_id) {
    return (
      <div className="px-4 py-3 bg-muted/30 border border-dashed border-border rounded-xl space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-slate-400 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">a</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Kein awork/eWork-Projekt verknüpft</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Um den Fortschritt je Leistungspaket zu sehen: <strong>1. awork-Projekt verknüpfen</strong> → <strong>2. Leistungspakete mit awork-Tasklisten oder Tasks verbinden</strong>
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onSelectProject} className="h-7 text-xs flex-shrink-0">
            <Link2 className="w-3 h-3 mr-1" /> awork-Projekt verknüpfen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* Zeile 1: awork-Bezug + Sync-Frische + zuletzt gebucht, Aktionen rechts */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-5 h-5 rounded bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-primary-foreground text-xs font-bold">a</span>
        </div>
        <a
          href={`https://app.awork.com/projects/${src.awork_project_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-primary truncate hover:underline"
          title="In awork öffnen"
        >
          {src.awork_project_name || '—'}
        </a>
        {src.awork_project_status && (
          <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${statusColor(src.awork_project_status)}`}>
            {src.awork_project_status}
          </span>
        )}
        <span className={`text-xs font-medium flex-shrink-0 ${freshnessClass}`}>
          {isStale && <AlertTriangle className="w-3 h-3 inline mr-1" />}
          {freshnessLabel}
        </span>
        <AworkLastBookers aworkProjectId={src.awork_project_id} />
        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          <Button size="icon" variant="ghost" onClick={onSync} disabled={isSyncing}
            title="awork Daten synchronisieren"
            className="h-6 w-6 text-primary hover:bg-muted">
            {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={onSelectProject}
            className="h-6 text-xs text-primary hover:bg-muted px-2">
            <Link2 className="w-3 h-3 mr-1" /> Ändern
          </Button>
        </div>
      </div>

      {/* Zeile 2: Fakten — Frist, offene/blockierte Aufgaben, letzte Aktivität */}
      <ProjektFaktenzeile projectId={projectId} aworkProjectId={src.awork_project_id} />
    </div>
  );
}