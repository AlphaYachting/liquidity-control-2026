import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Link2, Loader2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { formatDistanceToNow, differenceInHours } from 'date-fns';
import { de } from 'date-fns/locale';
import AworkLastBookers from '@/components/awork/AworkLastBookers';

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
  const totalTasks = taskStats?.total_tasks ?? snapshot?.tasks_count ?? 0;
  const doneTasks = taskStats?.done_tasks ?? snapshot?.tasks_done_count ?? 0;
  const openTasks = taskStats?.open_tasks ?? (totalTasks - doneTasks - blockedTasks);
  const taskCompletionPct = taskStats?.task_completion_pct ?? (totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0);
  const hoursBurnPct = taskStats?.hours_burn_pct ?? null;
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

      {/* Kombinierter Fortschrittsindex */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-blue-800 font-medium">
            Leistungsfortschritt
            {hoursBurnPct !== null && <span className="text-blue-600 font-normal ml-1">(Tasks 60% · Stunden 40%)</span>}
          </span>
          <span className="text-blue-900 font-bold">{progressPct}%</span>
        </div>
        <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              progressPct >= 90 ? 'bg-emerald-500' : progressPct >= 50 ? 'bg-blue-500' : 'bg-amber-500'
            }`}
            style={{ width: `${Math.min(100, progressPct)}%` }}
          />
        </div>
      </div>

      {/* Task-KPI-Zeile */}
      {totalTasks > 0 && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-white/60 rounded-lg px-2.5 py-1.5 text-center border border-blue-100">
            <div className="font-bold text-emerald-700">{doneTasks}</div>
            <div className="text-blue-700/70">erledigt</div>
          </div>
          <div className="bg-white/60 rounded-lg px-2.5 py-1.5 text-center border border-blue-100">
            <div className="font-bold text-blue-800">{openTasks}</div>
            <div className="text-blue-700/70">offen</div>
          </div>
          <div className={`rounded-lg px-2.5 py-1.5 text-center border ${blockedTasks > 0 ? 'bg-red-50 border-red-200' : 'bg-white/60 border-blue-100'}`}>
            <div className={`font-bold ${blockedTasks > 0 ? 'text-red-600' : 'text-gray-400'}`}>{blockedTasks}</div>
            <div className={blockedTasks > 0 ? 'text-red-500/80' : 'text-blue-700/70'}>blockiert</div>
          </div>
        </div>
      )}

      {/* Stunden-Zeile */}
      <div className="flex items-center gap-4 text-xs flex-wrap">
        {hoursBurnPct !== null ? (
          <>
            <span className="flex items-center gap-1 text-blue-800">
              <CheckCircle2 className="w-3 h-3" />
              {trackedHours} h verbraucht
              {budgetHours && <span className="text-blue-600">/ {budgetHours} h Budget ({hoursBurnPct}%)</span>}
            </span>
            {hoursBurnPct >= 90 && (
              <span className="text-red-600 font-medium flex items-center gap-0.5">
                <AlertTriangle className="w-3 h-3" /> Budget fast ausgeschöpft
              </span>
            )}
          </>
        ) : totalTasks > 0 ? (
          <span className="text-muted-foreground italic">Keine Stundendaten — nur Task-Fortschritt ({taskCompletionPct}%)</span>
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

      {/* Wer hat zuletzt gebucht — Ansprechpersonen für Fertigstellungs-Einschätzung */}
      <AworkLastBookers aworkProjectId={src.awork_project_id} />

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