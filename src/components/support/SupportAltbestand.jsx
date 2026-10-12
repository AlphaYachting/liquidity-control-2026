import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SupportBillingRow from '@/components/support/SupportBillingRow';

// Altbestand aus aWork (Status „In Verrechnung") — läuft aus, sobald alles abgerechnet ist
export default function SupportAltbestand({ rows, onDone }) {

  const offeneTasks = rows
    .filter(r => !r.customer_name)
    .flatMap(r => r.tasks)
    .filter(t => t.suggested_customer)
    .map(t => ({ awork_task_id: t.awork_task_id, suggested_customer: t.suggested_customer }));

  // „awork-Aufgaben nachladen“ entfernt: aWork ist abgelöst, der Altbestand kommt aus dem Backup.
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
        </div>
      </div>

      {autoMutation.data && (
        <p className="text-xs text-muted-foreground">
          {autoMutation.data.assigned || 0} Anfragen automatisch zugewiesen
          {autoMutation.data.unresolved?.length ? ` — nicht gefunden: ${autoMutation.data.unresolved.join(', ')}. Diese bitte manuell zuweisen.` : ' — alle Kunden erkannt.'}
        </p>
      )}
      {autoMutation.isError && <p className="text-xs text-red-600">Automatische Zuweisung fehlgeschlagen: {autoMutation.error?.response?.data?.error || autoMutation.error?.message}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Kein Altbestand mehr offen.</p>
      ) : (
        rows.map(r => <SupportBillingRow key={r.group_key} row={r} onDone={onDone} />)
      )}

    </div>
  );
}