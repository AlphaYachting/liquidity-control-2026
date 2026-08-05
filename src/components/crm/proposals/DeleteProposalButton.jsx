import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2 } from 'lucide-react';

// Entwurf verwerfen — löscht das Angebot, löst die Verknüpfung am Deal
// und führt zurück (zum Deal, sonst zur Angebotsliste), um neu zu starten.
export default function DeleteProposalButton({ proposal, disabled }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const remove = async () => {
    if (!window.confirm('Angebotsentwurf endgültig löschen? Alle Quellen, Analysen und Freigaben dieses Entwurfs gehen verloren.')) return;
    setBusy(true); setError(null);
    try {
      if (proposal.deal_id) {
        await base44.entities.CrmDeal.update(proposal.deal_id, { proposal_id: '' }).catch(() => {});
      }
      await base44.entities.CrmProposal.delete(proposal.id);
      navigate(proposal.deal_id ? `/crm/deals/${proposal.deal_id}` : '/crm/proposals');
    } catch (e) {
      setError('Löschen fehlgeschlagen: ' + (e?.message || ''));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="ghost" size="sm" onClick={remove} disabled={disabled || busy} className="gap-1.5 text-red-600 hover:text-red-600 hover:bg-red-50">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        Entwurf löschen & neu starten
      </Button>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}