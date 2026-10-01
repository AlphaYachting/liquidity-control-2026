import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Loader2, ClipboardCheck } from 'lucide-react';
import { fmtEUR } from '@/components/sprint/sprintConfig';
import ZumProjektLink from '@/components/projekt/ZumProjektLink';
import { projektZumAuftrag, wizardAusAuftrag } from '@/lib/crm/auftragZuWizard';

// Zum Deal gibt es schon einen Auftrag — kein zweites Übergabeblatt
export default function BestehenderAuftrag({ order, deal, onCancel }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const { data: projektId, isLoading } = useQuery({
    queryKey: ['auftrag-projekt', order.id, order.project_id],
    queryFn: () => projektZumAuftrag(order),
  });

  const anlegen = async () => {
    setBusy(true);
    try {
      navigate('/sprint/neu', { state: await wizardAusAuftrag(order, deal) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border rounded-lg bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">Auftrag besteht bereits</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
        <p><span className="text-muted-foreground">Nummer: </span>{order.order_number || '—'}</p>
        <p><span className="text-muted-foreground">Betrag netto: </span>{fmtEUR(order.total_net_amount)}</p>
        <p><span className="text-muted-foreground">Projekt: </span>{isLoading ? '…' : projektId ? 'ja' : 'nein'}</p>
      </div>
      <div className="flex justify-end gap-2 border-t pt-3">
        {onCancel && <Button variant="outline" onClick={onCancel}>Schließen</Button>}
        {isLoading ? null : projektId ? (
          <ZumProjektLink projectRefId={projektId} />
        ) : (
          <Button variant="outline" onClick={anlegen} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Projekt anlegen
          </Button>
        )}
      </div>
    </div>
  );
}