import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { DownloadCloud, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SupportBillingRow from '@/components/support/SupportBillingRow';

// Altbestand aus aWork (Status „In Verrechnung") — läuft aus, sobald alles abgerechnet ist
export default function SupportAltbestand({ rows, onDone }) {

  const offeneTasks = rows
    .filter(r => !r.customer_name)
    .flatMap(r => r.tasks)
    .filter(t => t.suggested_customer)
    .map(t => ({ awork_task_id: t.awork_task_id, suggested_customer: t.suggested_customer }));

  const syncMutation = useMutation({
    mutationFn: async () => (await base44.functions.invoke('supportTasksSync', { max_projects: 6 })).data,
    onSuccess: () => onDone(),
  });
  const autoMutation = useMutation({
    mutationFn: async () => (await base44.functions.invoke('supportAutoAssignCustomers', { tasks: offeneTasks })).data,
    onSuccess: () => onDone(),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
        <p className="text-sm font-semibold">Altbestand aus aWork</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => autoMutation.mutate()} disabled={autoMutation.isPending || offeneTasks.length === 0}>
            <Wand2 className={`w-3.5 h-3.5 ${autoMutation.isPending ? 'animate-pulse' : ''}`} />
            {autoMutation.isPending ? 'Kunden werden zugewiesen...' : `Kunden automatisch zuweisen${offeneTasks.length ? ` (${offeneTasks.length})` : ''}`}
          </Button>
          <Button size="sm" variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            <DownloadCloud className={`w-3.5 h-3.5 ${syncMutation.isPending ? 'animate-pulse' : ''}`} />
            {syncMutation.isPending ? 'awork-Aufgaben werden geladen...' : 'awork-Aufgaben nachladen'}
          </Button>
        </div>
      </div>

      {syncMutation.data && (
        <p className="text-xs text-muted-foreground">
          {syncMutation.data.synced?.length || 0} Support-Projekte aus awork nachgeladen
          {syncMutation.data.remaining > 0 ? ` — ${syncMutation.data.remaining} weitere offen, bitte noch einmal nachladen.` : ' — alle Support-Projekte sind aktuell.'}
        </p>
      )}
      {autoMutation.data && (
        <p className="text-xs text-muted-foreground">
          {autoMutation.data.assigned || 0} Anfragen automatisch zugewiesen
          {autoMutation.data.unresolved?.length ? ` — nicht gefunden: ${autoMutation.data.unresolved.join(', ')}. Diese bitte manuell zuweisen.` : ' — alle Kunden erkannt.'}
        </p>
      )}
      {autoMutation.isError && <p className="text-xs text-red-600">Automatische Zuweisung fehlgeschlagen: {autoMutation.error?.response?.data?.error || autoMutation.error?.message}</p>}
      {syncMutation.isError && <p className="text-xs text-red-600">Nachladen fehlgeschlagen: {syncMutation.error?.response?.data?.error || syncMutation.error?.message}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Kein Altbestand mehr offen.</p>
      ) : (
        rows.map(r => <SupportBillingRow key={r.group_key} row={r} onDone={onDone} />)
      )}

    </div>
  );
}