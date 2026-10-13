import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/shared/PageHeader';
import ArchivExportPanel from '@/components/awork/ArchivExportPanel';
import { Settings, CheckCircle2, XCircle, AlertTriangle, Archive } from 'lucide-react';
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
  unvollstaendig: { label: 'Unvollständig', color: 'bg-red-100 text-red-700' },
};

const SYNC_TYPE_LABELS = {
  projects: 'Projekte',
  tasks: 'Aufgaben',
  project_tasks: 'Projektaufgaben',
  time_entries: 'Zeitbuchungen',
  full: 'Vollständig',
  archive_export: 'Archiv-Export',
};

// aWork ist abgelöst (Abo gekündigt, Oktober 2026). Diese Seite zeigt nur noch den
// Stand des Backups — kein Live-Abgleich, keine Knöpfe, die aWork anrufen.
export default function AworkSettings() {
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

  const statusCfg = STATUS_CONFIG[setting?.connection_status || 'not_configured'];
  const StatusIcon = statusCfg.icon;

  return (
    <div className="space-y-6">
      <PageHeader
        title="awork Backup"
        subtitle="aWork ist abgelöst — die Daten stehen nur noch im Backup"
        icon={Settings}
      />

      {/* aWork abgelöst */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
        <Archive className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-900">aWork ist abgelöst</p>
          <p className="text-xs text-amber-800 mt-0.5">
            Das aWork-Abo ist gekündigt, ein Live-Abgleich findet nicht mehr statt. Projekte, Aufgaben,
            Zeitbuchungen und das Archiv bleiben als Backup in der App lesbar (Stand des letzten Abgleichs).
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

      <ArchivExportPanel />

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
                        <td className="py-1.5">{SYNC_TYPE_LABELS[log.sync_type] || log.sync_type}</td>
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