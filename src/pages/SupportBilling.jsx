import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { LifeBuoy, RefreshCw, DownloadCloud } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import SupportBillingRow from '@/components/support/SupportBillingRow';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function SupportBilling() {
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['supportBillingCheck'],
    queryFn: async () => (await base44.functions.invoke('supportBillingCheck', {})).data,
    staleTime: 5 * 60 * 1000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => (await base44.functions.invoke('supportTasksSync', { max_projects: 6 })).data,
    onSuccess: () => refetch(),
  });

  const rows = data?.rows || [];
  const stunden = Math.round(((data?.total_open_minutes || 0) / 60) * 100) / 100;
  const ohneRechnung = rows.filter(r => r.instructions.length === 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support-Abrechnung"
        subtitle="Erledigte Support-Aufgaben aus awork mit offener Zeit ab 24.07.2026 — live gegen sevDesk geprüft"
        icon={LifeBuoy}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <DownloadCloud className={`w-3.5 h-3.5 ${syncMutation.isPending ? 'animate-pulse' : ''}`} />
              {syncMutation.isPending ? 'awork-Aufgaben werden geladen...' : 'awork-Aufgaben nachladen'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Neu prüfen
            </Button>
          </div>
        }
      />

      {syncMutation.data && (
        <p className="text-xs text-muted-foreground">
          {syncMutation.data.synced?.length || 0} Support-Projekte aus awork nachgeladen
          {syncMutation.data.remaining > 0
            ? ` — ${syncMutation.data.remaining} weitere offen, bitte noch einmal nachladen.`
            : ' — alle Support-Projekte sind aktuell.'}
        </p>
      )}
      {syncMutation.isError && (
        <p className="text-xs text-red-600">Nachladen fehlgeschlagen: {syncMutation.error?.response?.data?.error || syncMutation.error?.message}</p>
      )}

      {isLoading ? (
        <Skeleton className="h-[300px]" />
      ) : error || data?.error ? (
        <p className="text-sm text-red-600">Prüfung fehlgeschlagen: {data?.error || error.message}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title="Projekte mit offener Zeit" value={rows.length} subtitle={`${data.support_projects_checked} Support-Projekte geprüft`} />
            <KpiCard title="Offene Support-Stunden" value={`${stunden.toFixed(2)} h`} subtitle="erledigte Aufgaben, Zeit noch nicht abgerechnet" variant="warning" />
            <KpiCard title="Rechnung zu erstellen" value={ohneRechnung} subtitle="ohne Abrechnungsanweisung" variant={ohneRechnung > 0 ? 'danger' : 'default'} />
            <KpiCard title="sevDesk-Abgleich" value={data.sevdesk_live ? 'live' : 'inaktiv'} subtitle={`Stand ${new Date(data.checked_at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`} />
          </div>

          <div className="space-y-3">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine erledigten Support-Aufgaben mit offener Zeit.</p>
            ) : (
              rows.map(r => <SupportBillingRow key={r.awork_project_id} row={r} onDone={refetch} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}