import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Link2 } from 'lucide-react';
import { attachInboxItemToDeal } from '@/components/crm/inboxDecision';
import { CLOSED_STAGES } from '../../../base44/shared/crmDuplicate.js';

// Manuelle Zuordnung einer Posteingang-Anfrage zu einem bestehenden Deal —
// auch wenn die automatische Erkennung keinen Treffer gefunden hat.
export default function InboxAssignDealDialog({ open, onOpenChange, item, onDone }) {
  const [dealId, setDealId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ['crm-assign-deals'],
    queryFn: async () => {
      const all = await base44.entities.CrmDeal.list('-updated_date', 300);
      return all.filter(d => !CLOSED_STAGES.includes(d.stage));
    },
    enabled: open,
  });

  const assign = async () => {
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;
    setBusy(true);
    setError(null);
    try {
      const back = await attachInboxItemToDeal(item, deal);
      setBusy(false);
      setDealId('');
      onDone(deal, back);
    } catch (e) {
      setBusy(false);
      setError(e?.response?.data?.detail || e?.response?.data?.error || e?.message || 'Unbekannter Fehler beim Zuordnen');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setDealId(''); setError(null); } onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Zu Deal zuordnen</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Die Anfrage „{item?.subject || 'ohne Betreff'}" wird dem gewählten Deal als Aktivität
            zugeordnet und verlässt den Posteingang.
          </p>
          <div>
            <Label className="text-xs">Bestehender Deal *</Label>
            <Select value={dealId} onValueChange={setDealId} disabled={busy || isLoading}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={isLoading ? 'Deals laden…' : 'Deal wählen'} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {deals.map(d => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.title}{d.company_name ? ` — ${d.company_name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Abbrechen</Button>
            <Button onClick={assign} disabled={!dealId || busy} className="gap-2">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Zuordnen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}