import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { PIPELINES } from '@/components/crm/stages';
import { computeAbPflicht } from '@/lib/crm/abPflicht';

const eur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);

// Übergabeblatt: aus dem gewonnenen Deal wird der Auftrag — mit klarer AB-Pflicht.
export default function UebergabeblattDialog({ open, onOpenChange, deal, onSaved }) {
  const [advance, setAdvance] = useState(30);
  const [saving, setSaving] = useState(false);
  const kunde = deal?.linked_customer_name || deal?.company_name || '';

  const { data, isLoading } = useQuery({
    enabled: open && Boolean(deal?.id),
    queryKey: ['uebergabe-kontext', deal?.id],
    queryFn: async () => {
      const [proposal, orders] = await Promise.all([
        deal.proposal_id ? base44.entities.CrmProposal.get(deal.proposal_id).catch(() => null) : Promise.resolve(null),
        kunde ? base44.entities.ConfirmedOrder.filter({ customer: kunde }, '-created_date', 5) : Promise.resolve([]),
      ]);
      return { proposal, hasPreviousOrders: (orders || []).length > 0 };
    },
  });

  if (!deal) return null;
  const ab = data ? computeAbPflicht({ deal, proposal: data.proposal, hasPreviousOrders: data.hasPreviousOrders }) : null;

  const beauftragen = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const today = now.split('T')[0];
      if (ab.required) {
        await base44.entities.ConfirmedOrder.create({
          customer: kunde || deal.title,
          project_name: deal.title,
          deal_id: deal.id,
          proposal_id: deal.proposal_id || '',
          advance_percent: Number(advance) || 0,
          total_net_amount: Number(deal.value_net) || 0,
          confirmation_date: today,
          status: 'draft',
          source_type: 'manual',
        });
      }
      await base44.entities.CrmDeal.update(deal.id, {
        stage: PIPELINES[deal.pipeline]?.wonStage,
        closed_at: today,
      });
      await base44.entities.CrmActivity.create({
        deal_id: deal.id,
        activity_type: 'stage_change',
        title: 'Beauftragt',
        content: ab.required
          ? `Auftrag angelegt, Anzahlung ${Number(advance) || 0} % — ${ab.reason}`
          : `Ohne Auftragsbestätigung — ${ab.reason}`,
        activity_date: now,
      });
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Übergabeblatt · Beauftragen</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
            <p className="font-semibold">{deal.title}</p>
            <p className="text-muted-foreground">{kunde || '— kein Kunde hinterlegt'}</p>
            <p className="tabular-nums">Auftragswert netto {eur(deal.value_net)}</p>
          </div>

          {isLoading || !ab ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Herkunft wird geprüft…</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Auftragsbestätigung</span>
                  <Badge variant="outline" className={`text-[10px] border-0 ${ab.required ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary text-secondary-foreground'}`}>
                    {ab.required ? 'Pflicht: ja' : 'Pflicht: nein'}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-0 bg-secondary text-secondary-foreground">
                    Herkunft: {ab.origin === 'studio' ? 'Angebot aus Studio' : 'E-Mail / ad-hoc'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{ab.reason}</p>
              </div>

              {ab.required && (
                <div>
                  <Label className="text-xs">Anzahlung in %</Label>
                  <Input type="number" className="w-28" value={advance} onChange={(e) => setAdvance(e.target.value)} />
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={beauftragen} disabled={saving || !ab}>
              {saving ? 'Speichert…' : ab?.required ? 'Auftrag anlegen' : 'Auf Regie beauftragen'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}