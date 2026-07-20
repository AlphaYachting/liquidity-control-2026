import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PIPELINES, STAGE_LABELS } from '@/components/crm/stages';

export default function WonLostDialog({ open, onOpenChange, deal, mode, onSaved }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const isWon = mode === 'won';
  const targetStage = isWon ? PIPELINES[deal?.pipeline]?.wonStage : PIPELINES[deal?.pipeline]?.lostStage;

  const save = async () => {
    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await base44.entities.CrmDeal.update(deal.id, {
        stage: targetStage,
        closed_at: today,
        ...(isWon ? {} : { lost_reason: reason }),
      });
      await base44.entities.CrmActivity.create({
        deal_id: deal.id,
        activity_type: 'stage_change',
        title: `Deal ${STAGE_LABELS[targetStage]}`,
        content: isWon ? 'Deal als gewonnen markiert.' : `Verlust-Grund: ${reason || '—'}`,
        activity_date: new Date().toISOString(),
      });
      onSaved?.();
      onOpenChange(false);
      setReason('');
    } finally {
      setSaving(false);
    }
  };

  if (!deal) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isWon ? '✅ Deal gewonnen' : '❌ Deal verloren'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            „{deal.title}" wird als <strong>{STAGE_LABELS[targetStage]}</strong> abgeschlossen.
          </p>
          {!isWon && (
            <div>
              <Label className="text-xs">Verlust-Grund</Label>
              <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
                placeholder="z.B. Preis zu hoch, Mitbewerber, kein Budget…" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={save} disabled={saving} variant={isWon ? 'default' : 'destructive'}>
              {saving ? 'Speichert…' : 'Bestätigen'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}