import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Link2, Loader2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { formatDistanceToNow, differenceInHours } from 'date-fns';
import { de } from 'date-fns/locale';

/**
 * Upgraded awork status card — status-first, sync-secondary.
 * Props:
 *   data / order  — awork fields from project or order
 *   taskStats     — aggregated from AworkTaskSnapshot: { total_tasks, done_tasks, open_tasks, blocked_tasks, progress_percent, last_activity_at, last_synced_at, has_stale_data }
 *   snapshot      — AworkProjectSnapshot record (optional)
 *   onSelectProject, onSync, isSyncing
 */
export default function AworkStatusBar({ order, data, taskStats, snapshot, onSelectProject, onSync, isSyncing }) {
  const src = data || order || {};

  const lastSyncDate = src.awork_last_synced_at ? new Date(src.awork_last_synced_at) : null;
  const lastSyncLabel = lastSyncDate
    ? formatDistanceToNow(lastSyncDate, { addSuffix: true, locale: de })
    : null;
  const isStale = lastSyncDate ? differenceInHours(new Date(), lastSyncDate) > 24 : false;
  const neverSynced = !lastSyncDate;

  // Budget/tracked hours from taskStats, fallback to snapshot time budget
  const budgetMinutes = taskStats?.budget_minutes ?? snapshot?.time_budget_minutes ?? 0;
  const trackedMinutes = taskStats?.tracked_minutes ?? snapshot?.tracked_duration_minutes ?? 0;
  const budgetHours = budgetMinutes > 0 ? (budgetMinutes / 60).toFixed(1) : null;
  const trackedHours = trackedMinutes > 0 ? (trackedMinutes / 60).toFixed(1) : null;
  const blockedTasks = taskStats?.blocked_tasks ?? 0;
  const progressPct = taskStats?.progress_percent ?? src.awork_progress_percent ?? snapshot?.progress_percent ?? 0;
  const lastActivityDate = taskStats?.last_activity_at ? new Date(taskStats.last_activity_at) : null;
  const lastActivityLabel = lastActivityDate
    ? formatDistanceToNow(lastActivityDate, { addSuffix: true, locale: de })
    : null;

  const statusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('abgeschlossen') || s.includes('completed') || s.includes('done')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (s.includes('aktiv') || s.includes('progress') || s.includes('active')) return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  const freshnessLabel = neverSynced
    ? 'nicht synchronisiert'
    : isStale
      ? 'älter als 24h'
      : 'aktuell';

  const freshnessClass = neverSynced
    ? 'text-muted-foreground'
    : isStale
      ? 'text-amber-600'
      : 'text-emerald-600';

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
    <div className="border border-blue-200 bg-blue-50/60 rounded-xl px-4 py-3 space-y-3">
      {/* Header row: name + status + secondary actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">a</span>
          </div>
          {src.awork_project_id ? (
            <a
              href={`https://app.awork.com/projects/${src.awork_project_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-blue-900 truncate hover:underline"
              title="In awork öffnen"
            >
              {src.awork_project_name || '—'}
            </a>
          ) : (
            <span className="text-sm font-semibold text-blue-900 truncate">{src.awork_project_name || '—'}</span>
          )}
          {src.awork_project_status && (
            <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${statusColor(src.awork_project_status)}`}>
              {src.awork_project_status}
            </span>
          )}
        </div>
        {/* Secondary actions — small, right-aligned */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button size="icon" variant="ghost" onClick={onSync} disabled={isSyncing}
            title="awork Daten synchronisieren"
            className="h-6 w-6 text-blue-700 hover:bg-blue-100">
            {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={onSelectProject}
            className="h-6 text-xs text-blue-700 hover:bg-blue-100 px-2">
            <Link2 className="w-3 h-3 mr-1" /> Ändern
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-blue-800 font-medium">Fortschritt</span>
          <span className="text-blue-900 font-bold">{progressPct}%</span>
        </div>
        <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(100, progressPct)}%` }} />
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs flex-wrap">
        {budgetHours || trackedHours ? (
          <>
            {trackedHours && (
              <span className="flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="w-3 h-3" />
                {trackedHours} h verbraucht
              </span>
            )}
            {budgetHours && (
              <span className="text-blue-800 font-medium">/ {budgetHours} h Budget</span>
            )}
            {blockedTasks > 0 && (
              <span className="text-red-600 font-medium">⊘ {blockedTasks} blockiert</span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground italic">Keine Stundendaten synchronisiert</span>
        )}

        {lastActivityLabel && (
          <span className="text-muted-foreground flex items-center gap-1 ml-auto">
            <Clock className="w-3 h-3" />
            Aktivität: {lastActivityLabel}
          </span>
        )}
      </div>

      {/* Sync freshness footer */}
      <div className="flex items-center justify-between text-xs border-t border-blue-100 pt-2">
        <span className="text-muted-foreground">
          {lastSyncLabel ? `Letzter Sync: ${lastSyncLabel}` : 'Noch nicht synchronisiert'}
        </span>
        <span className={`font-medium ${freshnessClass}`}>
          {isStale && <AlertTriangle className="w-3 h-3 inline mr-1" />}
          {freshnessLabel}
        </span>
      </div>
    </div>
  );
}