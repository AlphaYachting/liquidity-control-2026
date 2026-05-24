import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/shared/PageHeader';
import { Settings, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock, Loader2, ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

const STATUS_CONFIG = {
  not_configured: { label: 'Nicht konfiguriert', color: 'bg-gray-100 text-gray-600', icon: AlertTriangle },
  connected: { label: 'Verbunden', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  error: { label: 'Fehler', color: 'bg-red-100 text-red-700', icon: XCircle },
  rate_limited: { label: 'Rate Limit', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
};

const SYNC_STATUS_CONFIG = {
  running: { label: 'Läuft', color: 'bg-blue-100 text-blue-700' },
  success: { label: 'Erfolgreich', color: 'bg-emerald-100 text-emerald-700' },
  partial: { label: 'Teilweise', color: 'bg-amber-100 text-amber-700' },
  failed: { label: 'Fehlgeschlagen', color: 'bg-red-100 text-red-700' },
};

export default function AworkSettings() {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingTime, setIsSyncingTime] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [timeSyncProgress, setTimeSyncProgress] = useState(null); // { page, totalCreated, totalUpdated, hasMore }

  const { data: settings = [], isLoading: settingsLoading } = useQuery({
    queryKey: ['awork-settings'],
    queryFn: () => base44.entities.AworkIntegrationSetting.list()
  });

  const { data: syncLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['awork-sync-logs'],
    queryFn: () => base44.entities.AworkSyncLog.list('-started_at', 10)
  });

  const { data: projectSnapshots = [] } = useQuery({
    queryKey: ['awork-project-snapshots-count'],
    queryFn: () => base44.entities.AworkProjectSnapshot.list('-last_synced_at', 5)
  });

  const setting = settings[0];

  const handleSyncProjects = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    const resp = await base44.functions.invoke('syncAworkProjects', {});
    setSyncResult(resp.data);
    queryClient.invalidateQueries({ queryKey: ['awork-settings'] });
    queryClient.invalidateQueries({ queryKey: ['awork-sync-logs'] });
    queryClient.invalidateQueries({ queryKey: ['awork-project-snapshots-count'] });
    queryClient.invalidateQueries({ queryKey: ['awork-project-snapshots'] });
    setIsSyncing(false);
  };

  const handleSyncTimeEntries = async (page = 1, accCreated = 0, accUpdated = 0) => {
    setIsSyncingTime(true);
    setSyncResult(null);
    setTimeSyncProgress({ page, totalCreated: accCreated, totalUpdated: accUpdated, hasMore: false });

    const now = new Date();
    const fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const resp = await base44.functions.invoke('syncAworkTimeEntries', { from: fromDate, to: toDate, page, pageSize: 50 });
    const result = resp.data;

    const newCreated = accCreated + (result.created || 0);
    const newUpdated = accUpdated + (result.updated || 0);

    if (result.has_more) {
      setTimeSyncProgress({ page: result.next_page, totalCreated: newCreated, totalUpdated: newUpdated, hasMore: true });
      setIsSyncingTime(false);
      setSyncResult({ ...result, created: newCreated, updated: newUpdated, _partial: true });
    } else {
      setSyncResult({ ...result, created: newCreated, updated: newUpdated });
      setTimeSyncProgress(null);
      queryClient.invalidateQueries({ queryKey: ['aworkTimeEntries'] });
      setIsSyncingTime(false);
    }
  };

  const statusCfg = STATUS_CONFIG[setting?.connection_status || 'not_configured'];
  const StatusIcon = statusCfg.icon;

  return (
    <div className="space-y-6">
      <PageHeader
        title="awork Integration"
        subtitle="Verbindungseinstellungen und Synchronisation"
        icon={Settings}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSyncTimeEntries} disabled={isSyncingTime}>
              {isSyncingTime ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
              Zeitbuchungen synchronisieren
            </Button>
            <Button onClick={handleSyncProjects} disabled={isSyncing}>
              {isSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Projekte synchronisieren
            </Button>
          </div>
        }
      />

      {/* Security notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
        <ShieldCheck className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-800">Sicherheitshinweis</p>
          <p className="text-xs text-blue-700 mt-0.5">
            Der awork API-Key wird ausschließlich als Backend-Secret gespeichert und ist niemals im Frontend oder in den Entitätsdaten sichtbar.
            Diese Seite zeigt nur Verbindungsstatus und Sync-Protokolle — niemals den API-Key selbst.
            Modus: <strong>Read-only</strong> — es werden keine Daten in awork geschrieben.
          </p>
        </div>
      </div>

      {settingsLoading ? <Skeleton className="h-40" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Connection Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Verbindungsstatus</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className={`flex items-center gap-1.5 text-sm px-3 py-1 rounded-full font-medium ${statusCfg.color}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {statusCfg.label}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">API-Key</span>
                <span className="text-sm font-mono text-muted-foreground">
                  {setting?.connection_status === 'connected' ? '●●●●●●●● (konfiguriert)' : '— nicht konfiguriert —'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Basis-URL</span>
                <span className="text-sm font-mono">{setting?.api_base_url || 'https://api.awork.com'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Modus</span>
                <Badge className="bg-emerald-100 text-emerald-700">Read-only (gesperrt)</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Authentifizierung</span>
                <span className="text-sm">{setting?.auth_mode || 'api_key'}</span>
              </div>
              {setting?.last_successful_sync && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Letzter Sync</span>
                  <span className="text-sm">
                    {formatDistanceToNow(new Date(setting.last_successful_sync), { addSuffix: true, locale: de })}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Statistics */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Synchronisationsstatistiken</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Projekte synchronisiert</span>
                <span className="text-xl font-bold">{setting?.total_projects_synced || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Aufgaben synchronisiert</span>
                <span className="text-xl font-bold">{setting?.total_tasks_synced || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Gespeicherte Snapshots</span>
                <span className="text-sm text-muted-foreground">letzte 5 angezeigt</span>
              </div>
              {projectSnapshots.slice(0, 3).map(p => (
                <div key={p.id} className="flex items-center justify-between text-xs border-t pt-2">
                  <span className="text-muted-foreground truncate max-w-[60%]">{p.name}</span>
                  <span className="text-muted-foreground">{p.project_status}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sync result */}
      {syncResult && (
        <div className={`p-4 rounded-xl border text-sm ${syncResult.error ? 'bg-red-50 border-red-200 text-red-700' : syncResult._partial ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          {syncResult.error ? (
            <p>Fehler: {syncResult.error}</p>
          ) : syncResult.entries_fetched !== undefined ? (
            <div className="flex items-center justify-between gap-4">
              <p>
                {syncResult._partial ? '⏳ Läuft...' : '✓ Zeitbuchungen-Sync abgeschlossen:'} {syncResult.period?.from} – {syncResult.period?.to} |{' '}
                {syncResult.created} neu, {syncResult.updated} aktualisiert
                {syncResult.failed > 0 ? `, ${syncResult.failed} fehlgeschlagen` : ''}
                {syncResult._partial ? ` (Seite ${timeSyncProgress?.page ? timeSyncProgress.page - 1 : '?'} fertig, mehr verfügbar)` : ''}
              </p>
              {syncResult._partial && timeSyncProgress?.hasMore && (
                <Button size="sm" onClick={() => handleSyncTimeEntries(timeSyncProgress.page, syncResult.created, syncResult.updated)} disabled={isSyncingTime}>
                  {isSyncingTime ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Weiter (Seite {timeSyncProgress.page})
                </Button>
              )}
            </div>
          ) : (
            <p>
              ✓ Projekte-Sync abgeschlossen: {syncResult.projects_fetched} Projekte abgerufen,
              {syncResult.created} neu, {syncResult.updated} aktualisiert
              {syncResult.failed > 0 ? `, ${syncResult.failed} fehlgeschlagen` : ''}.
            </p>
          )}
        </div>
      )}

      {/* Sync Logs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sync-Protokoll (letzte 10)</CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? <Skeleton className="h-32" /> : syncLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Noch keine Sync-Vorgänge.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left pb-2 font-medium">Typ</th>
                    <th className="text-left pb-2 font-medium">Status</th>
                    <th className="text-right pb-2 font-medium">Abgerufen</th>
                    <th className="text-right pb-2 font-medium">Neu</th>
                    <th className="text-right pb-2 font-medium">Aktualisiert</th>
                    <th className="text-right pb-2 font-medium">Fehler</th>
                    <th className="text-left pb-2 font-medium pl-3">Zeitpunkt</th>
                  </tr>
                </thead>
                <tbody>
                  {syncLogs.map(log => {
                    const sc = SYNC_STATUS_CONFIG[log.status] || SYNC_STATUS_CONFIG.failed;
                    return (
                      <tr key={log.id} className="border-b last:border-0">
                        <td className="py-1.5">{log.sync_type}</td>
                        <td className="py-1.5">
                          <span className={`px-2 py-0.5 rounded-full ${sc.color}`}>{sc.label}</span>
                        </td>
                        <td className="py-1.5 text-right">{log.records_fetched || 0}</td>
                        <td className="py-1.5 text-right">{log.records_created || 0}</td>
                        <td className="py-1.5 text-right">{log.records_updated || 0}</td>
                        <td className="py-1.5 text-right text-red-600">{log.records_failed || 0}</td>
                        <td className="py-1.5 pl-3 text-muted-foreground">
                          {log.started_at ? formatDistanceToNow(new Date(log.started_at), { addSuffix: true, locale: de }) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {setting?.notes && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{setting.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}