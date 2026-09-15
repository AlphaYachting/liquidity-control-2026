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
  const stunden = Math.round(((data?.total_billable_minutes || 0) / 60) * 10) / 10;
  const ohneRechnung = rows.filter(r => r.customer_name && r.instructions.length === 0).length;
  const ohneKunde = rows.filter(r => !r.customer_name).reduce((s, r) => s + r.tasks.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support-Abrechnung"
        subtitle="Support-Anfragen mit awork-Status „In Verrechnung“ — nach Kunde gebündelt, je Anfrage eine Rechnungsposition, halbstundengenau"
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KpiCard title="Kunden zur Verrechnung" value={rows.length} subtitle={`${data.support_projects_checked} Support-Projekte geprüft`} />
            <KpiCard title="Zu verrechnende Stunden" value={`${stunden.toFixed(1)} h`} subtitle="halbstundengenau, je Anfrage aufgerundet" variant="warning" />
            <KpiCard title="Rechnung zu erstellen" value={ohneRechnung} subtitle="ohne Abrechnungsanweisung" variant={ohneRechnung > 0 ? 'danger' : 'default'} />
            <KpiCard title="Kunde offen" value={ohneKunde} subtitle="Anfragen ohne Kundenzuweisung" variant={ohneKunde > 0 ? 'warning' : 'default'} />
            <KpiCard title="sevDesk-Abgleich" value={data.sevdesk_live ? 'live' : 'inaktiv'} subtitle={`Stand ${new Date(data.checked_at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`} />
          </div>

          <div className="space-y-3">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine erledigten Support-Aufgaben mit offener Zeit.</p>
            ) : (
              rows.map(r => <SupportBillingRow key={r.group_key} row={r} onDone={refetch} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}