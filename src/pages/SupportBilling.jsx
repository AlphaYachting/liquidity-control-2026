import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ChevronDown, ChevronRight, LifeBuoy, RefreshCw } from 'lucide-react';
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
  // Blöcke ohne offene Positionen (nur Rechnungen, die auf Zahlung warten, oder kürzlich ohne Rechnung
  // Abgeschlossenes) stehen eingeklappt am Ende — die Arbeitsliste zeigt nur, was zu entscheiden ist (25.11.2026)
  const [ruhendOffen, setRuhendOffen] = useState(false);

  const rows = data?.rows || [];
  // Kundenblock (22.10.2026): Support und Regie eines Kunden in EINEM Block — eine Rechnung je Kunde
  const kundenRows = data?.kunden_rows || [...(data?.app_rows || []), ...(data?.regie_rows || [])];
  const kundenOffen = kundenRows.filter(r => r.tasks.length > 0);
  // In der Arbeitsliste bleibt, wer offene Positionen hat oder eine Rechnung, die noch zu tun gibt:
  // sevDesk-Entwurf (noch nicht versendet) oder Anweisung ohne sevDesk-Rechnung
  const brauchtAktion = (r) => r.tasks.length > 0
    || (r.instructions || []).some(i => !i.sevdesk_invoice_id || i.live_status?.status_code === '100');
  const kundenAktiv = kundenRows.filter(brauchtAktion);
  const kundenRuhend = kundenRows.filter(r => !brauchtAktion(r));

  const stunden = ((data?.total_billable_minutes || 0) + (data?.app_billable_minutes || 0) + (data?.regie_billable_minutes || 0)) / 60;
  const ohneRechnung = rows.filter(r => r.customer_name && r.instructions.length === 0).length + kundenOffen.length;
  const ohneKunde = rows.filter(r => !r.customer_name).reduce((s, r) => s + r.tasks.length, 0)
    + kundenOffen.filter(r => !r.sevdesk_contact_id).reduce((s, r) => s + r.tasks.length, 0);
  // Meldung des Servers zuerst — sonst steht nur „Request failed with status code 500“ da
  const fehler = data?.error || error?.response?.data?.error || error?.message;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support-Abrechnung"
        subtitle="Support und Regie je Kunde in einer Rechnung — Support je Ticket eine Position (Minimum 0,5 h, danach 15-Minuten-Schritte), Regie je Tag und Projekt eine Position"
        icon={LifeBuoy}
        actions={
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Neu prüfen
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-[300px]" />
      ) : fehler ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-red-600">Prüfung fehlgeschlagen: {fehler}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Erneut versuchen
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KpiCard title="Kunden zur Verrechnung" value={kundenOffen.length + rows.length} subtitle={`${data.app_support_projects || 0} Support-, ${data.regie_projects || 0} Regie-Projekte geprüft`} />
            <KpiCard title="Zu verrechnende Stunden" value={`${stunden.toFixed(2)} h`} subtitle="Support, Regie und Altbestand nach ihren Rundungsregeln" variant="warning" />
            <KpiCard title="Rechnung zu erstellen" value={ohneRechnung} subtitle="Kunden mit offenen Positionen" variant={ohneRechnung > 0 ? 'danger' : 'default'} />
            <KpiCard title="Kunde offen" value={ohneKunde} subtitle="ohne Kunde bzw. ohne sevDesk-Verknüpfung" variant={ohneKunde > 0 ? 'warning' : 'default'} />
            <KpiCard title="sevDesk-Abgleich" value={data.sevdesk_live ? 'live' : 'inaktiv'} subtitle={`Stand ${new Date(data.checked_at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`} />
          </div>

          <div className="space-y-3">
            {data.regie_fehler && (
              <p className="text-sm text-red-600">Regie-Prüfung fehlgeschlagen — Regiezeiten fehlen in den Blöcken: {data.regie_fehler}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Je Kunde ein Block, darin je Projekt die Positionen. Regie-Aufgaben bleiben offen; als verrechnet gelten nur die enthaltenen Zeitbuchungen.
              Was nicht verrechnet wird, schließt „Ohne Rechnung“ ab — an der Position oder für mehrere im Kundenkopf.
            </p>
            {kundenAktiv.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nichts zu verrechnen.</p>
            ) : (
              kundenAktiv.map(r => <SupportAppRow key={r.group_key} row={r} onDone={refetch} />)
            )}
          </div>

          {kundenRuhend.length > 0 && (
            <div className="space-y-3">
              <button
                onClick={() => setRuhendOffen((o) => !o)}
                className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                {ruhendOffen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Ohne offene Positionen ({kundenRuhend.length})
                <span className="font-normal text-xs">— Rechnungen, die auf Zahlung warten, und ohne Rechnung Abgeschlossenes (30 Tage zurückholbar)</span>
              </button>
              {ruhendOffen && kundenRuhend.map(r => <SupportAppRow key={r.group_key} row={r} onDone={refetch} />)}
            </div>
          )}

          <SupportAltbestand rows={rows} abgeschlossen={data.altbestand_nicht_verrechnet || []} onDone={refetch} />
        </>
      )}
    </div>
  );
}
