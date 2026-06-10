import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DeleteProjectCockpitDialog({ project, allOrders, allBlocks, onDeleted, onClose }) {
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);

  const { data: allInstructions = [] } = useQuery({
    queryKey: ['billingInstructions'],
    queryFn: () => base44.entities.BillingInstruction.list()
  });
  const { data: allPlans = [] } = useQuery({
    queryKey: ['monthlyBillingPlans', project.id],
    queryFn: () => base44.entities.MonthlyBillingPlan.filter({ project_id: project.id })
  });

  const linkedOrders = allOrders.filter(o => o.project_id === project.id);
  const linkedBlocks = allBlocks.filter(b => b.project_id === project.id);
  const linkedInstructions = allInstructions.filter(i => i.project_id === project.id);
  const linkedPlans = allPlans.filter(p => p.project_id === project.id);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // 1. Unlink ConfirmedOrders
      await Promise.all(linkedOrders.map(o =>
        base44.entities.ConfirmedOrder.update(o.id, { project_id: '' })
      ));
      // 2. Unlink ProjectBillingBlocks (keep blocks, just remove project link)
      await Promise.all(linkedBlocks.map(b =>
        base44.entities.ProjectBillingBlock.update(b.id, { project_id: '' })
      ));
      // 3. Delete BillingInstructions for this project
      await Promise.all(linkedInstructions.map(i =>
        base44.entities.BillingInstruction.delete(i.id)
      ));
      // 4. Delete MonthlyBillingPlans for this project
      await Promise.all(linkedPlans.map(p =>
        base44.entities.MonthlyBillingPlan.delete(p.id)
      ));
      // 5. Delete the project itself
      await base44.entities.LiquidityProject.delete(project.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['confirmedOrders'] });
      queryClient.invalidateQueries({ queryKey: ['billingBlocks'] });
      queryClient.invalidateQueries({ queryKey: ['billingInstructions'] });
      queryClient.invalidateQueries({ queryKey: ['monthlyBillingPlans', project.id] });
      onDeleted();
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-100">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Projekt-Cockpit löschen</h2>
              <p className="text-sm text-muted-foreground">{project.project_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Das Cockpit wird gelöscht. Alle Verknüpfungen werden aufgehoben — die Originaldaten in sevDesk und awork bleiben unverändert.
          </p>
        </div>

        {/* What will happen */}
        <div className="space-y-1.5 text-sm">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Folgende Verknüpfungen werden aufgehoben:</p>
          <ul className="space-y-1 text-sm">
            <li className="flex items-center gap-2">
              <span className={linkedOrders.length > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
                {linkedOrders.length} Auftragsbestätigung(en) werden entkoppelt
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className={linkedBlocks.length > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
                {linkedBlocks.length} Auftragspaket(e) werden entkoppelt
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className={linkedInstructions.length > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                {linkedInstructions.length} Abrechnungsanweisung(en) werden gelöscht
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className={linkedPlans.length > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                {linkedPlans.length} Monatsplan-Einträge werden gelöscht
              </span>
            </li>
          </ul>
        </div>

        {/* Confirm checkbox */}
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            className="mt-0.5 rounded"
          />
          <span className="text-sm">Ich bestätige, dass ich dieses Projekt-Cockpit unwiderruflich löschen möchte.</span>
        </label>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="destructive"
            disabled={!confirmed || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
            className="flex-1"
          >
            <Trash2 className="w-4 h-4 mr-1.5" />
            {deleteMutation.isPending ? 'Wird gelöscht…' : 'Endgültig löschen'}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={deleteMutation.isPending}>
            Abbrechen
          </Button>
        </div>
      </div>
    </div>
  );
}