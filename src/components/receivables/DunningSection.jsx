import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Bell, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DunningSection() {
  const queryClient = useQueryClient();
  const [runResult, setRunResult] = useState(null);

  const { data: records = [] } = useQuery({
    queryKey: ['dunningRecords'],
    queryFn: () => base44.entities.DunningRecord.list('-created_date', 200),
  });

  const runMutation = useMutation({
    mutationFn: () => base44.functions.invoke('runDunningCheck', {}),
    onSuccess: (res) => {
      setRunResult(res.data);
      queryClient.invalidateQueries({ queryKey: ['dunningRecords'] });
    },
  });

  const pending = records.filter(r => r.status === 'draft_created');

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-600" />
          <h3 className="font-semibold">Mahnwesen — automatische Mahnentwürfe</h3>
          {pending.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              {pending.length} zur Freigabe
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
          <RefreshCw className={`w-3.5 h-3.5 ${runMutation.isPending ? 'animate-spin' : ''}`} />
          {runMutation.isPending ? 'Mahnlauf läuft...' : 'Mahnlauf jetzt prüfen'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Täglicher Lauf um 06:00 Uhr. Basis: Erstversanddatum der Rechnung — nach 14 Tagen Zahlungserinnerung,
        nach 21 Tagen 1. Mahnung (inkl. Anrufeskalation), nach 28 Tagen 2. Mahnung.
        Entwürfe werden in sevDesk angelegt — „Versenden" schickt die Mahnung direkt per E-Mail an den Kunden.
      </p>

      {runMutation.isError && (
        <p className="text-xs text-red-600">Fehler beim Mahnlauf: {runMutation.error?.response?.data?.error || runMutation.error?.message}</p>
      )}
      {runResult && (
        <p className="text-xs text-emerald-700">
          Mahnlauf abgeschlossen: {runResult.checked} Rechnungen geprüft, {runResult.created} neue Mahnentwürfe,
          {' '}{runResult.closed || 0} bezahlte Entwürfe geschlossen, {runResult.already_sent || 0} in sevDesk bereits versendet,
          {' '}{runResult.skipped} übersprungen
          {runResult.errors_count > 0 ? `, ${runResult.errors_count} Fehler` : ''}.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Mahnstand, sevDesk-Link und Versand jeder Rechnung stehen unten direkt in der Forderungsliste.
      </p>
    </div>
  );
}