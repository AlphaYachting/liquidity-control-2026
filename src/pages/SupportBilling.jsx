import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { LifeBuoy, RefreshCw } from 'lucide-react';
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

  const rows = data?.rows || [];
  const stunden = Math.round(((data?.total_open_minutes || 0) / 60) * 100) / 100;
  const ohneRechnung = rows.filter(r => r.instructions.length === 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support-Abrechnung"
        subtitle="Erledigte Support-Aufgaben aus awork mit offener Zeit — live gegen sevDesk geprüft"
        icon={LifeBuoy}
        actions={
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Neu prüfen
          </Button>
        }
      />

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