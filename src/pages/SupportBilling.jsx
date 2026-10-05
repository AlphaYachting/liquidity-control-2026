import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { LifeBuoy, RefreshCw } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import SupportAppRow from '@/components/support/SupportAppRow';
import SupportAltbestand from '@/components/support/SupportAltbestand';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function SupportBilling() {
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['supportBillingCheck'],
    queryFn: async () => (await base44.functions.invoke('supportBillingCheck', {})).data,
    staleTime: 5 * 60 * 1000,
  });

  const rows = data?.rows || [];
  const appRows = data?.app_rows || [];
  const appOffen = appRows.filter(r => r.tasks.length > 0);

  const stunden = ((data?.total_billable_minutes || 0) + (data?.app_billable_minutes || 0)) / 60;
  const ohneRechnung = rows.filter(r => r.customer_name && r.instructions.length === 0).length + appOffen.length;
  const ohneKunde = rows.filter(r => !r.customer_name).reduce((s, r) => s + r.tasks.length, 0)
    + appOffen.filter(r => !r.sevdesk_contact_id).reduce((s, r) => s + r.tasks.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support-Abrechnung"
        subtitle="Erledigte Support-Tickets — je Kunde gebündelt, je Ticket eine Rechnungsposition, Minimum 0,5 h, danach in 15-Minuten-Schritten"
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KpiCard title="Kunden zur Verrechnung" value={appOffen.length + rows.length} subtitle={`${data.app_support_projects || 0} Support-Projekte geprüft`} />
            <KpiCard title="Zu verrechnende Stunden" value={`${stunden.toFixed(2)} h`} subtitle="Minimum 0,5 h, danach in 15-Minuten-Schritten aufgerundet" variant="warning" />
            <KpiCard title="Rechnung zu erstellen" value={ohneRechnung} subtitle="Kunden mit offenen Positionen" variant={ohneRechnung > 0 ? 'danger' : 'default'} />
            <KpiCard title="Kunde offen" value={ohneKunde} subtitle="ohne Kunde bzw. ohne sevDesk-Verknüpfung" variant={ohneKunde > 0 ? 'warning' : 'default'} />
            <KpiCard title="sevDesk-Abgleich" value={data.sevdesk_live ? 'live' : 'inaktiv'} subtitle={`Stand ${new Date(data.checked_at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`} />
          </div>

          <div className="space-y-3">
            {appRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine erledigten Support-Tickets offen.</p>
            ) : (
              appRows.map(r => <SupportAppRow key={r.group_key} row={r} onDone={refetch} />)
            )}
          </div>

          <SupportAltbestand rows={rows} onDone={refetch} />
        </>
      )}
    </div>
  );
}