import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Etappe bearbeiten (Projektverantwortliche und Admins): Titel, Betrag und Plantermine.
// Laufende Fristen (Übergabe erfolgt, Kundenfrist) bleiben unberührt — die setzt der Ablauf.
export default function EtappeBearbeitenDialog({ open, onOpenChange, milestone, onSaved }) {
  const [form, setForm] = useState({});
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    if (!open || !milestone) return;
    setForm({
      title: milestone.title || '',
      milestone_amount: milestone.milestone_amount ?? '',
      planned_handover: milestone.planned_handover || '',
      planned_freeze: milestone.planned_freeze || '',
    });
    setFehler('');
  }, [open, milestone]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const freigegeben = milestone?.state === 'freigegeben';
  const terminFehler = form.planned_handover && form.planned_freeze && form.planned_freeze < form.planned_handover
    ? 'Der Freeze liegt vor der Übergabe.' : '';

  const speichern = async () => {
    if (!form.title?.trim() || terminFehler) return;
    setLaeuft(true);
    setFehler('');
    try {
      await base44.entities.Milestone.update(milestone.id, {
        title: form.title.trim(),
        ...(freigegeben ? {} : { milestone_amount: Number(form.milestone_amount) || 0 }),
        planned_handover: form.planned_handover || null,
        planned_freeze: form.planned_freeze || null,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setFehler(e?.message || 'Etappe konnte nicht gespeichert werden.');
    }
    setLaeuft(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Etappe bearbeiten</DialogTitle>
          <DialogDescription>
            Titel, Betrag und Plantermine. Übergabe und Kundenfrist setzt der Ablauf selbst.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="etappe-titel">Titel</Label>
            <Input id="etappe-titel" value={form.title || ''} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="etappe-betrag">Betrag (€ netto)</Label>
            <Input
              id="etappe-betrag" type="number" min="0" step="50" disabled={freigegeben}
              value={form.milestone_amount} onChange={(e) => set({ milestone_amount: e.target.value })}
            />
            {freigegeben && <p className="text-xs text-muted-foreground">Die Etappe ist freigegeben — der Betrag ist abgerechnet und bleibt fest.</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex-[1_1_180px] space-y-1.5">
              <Label htmlFor="etappe-uebergabe">Geplante Übergabe</Label>
              <Input id="etappe-uebergabe" type="date" value={form.planned_handover || ''} onChange={(e) => set({ planned_handover: e.target.value })} />
            </div>
            <div className="flex-[1_1_180px] space-y-1.5">
              <Label htmlFor="etappe-freeze">Geplanter Freeze</Label>
              <Input id="etappe-freeze" type="date" value={form.planned_freeze || ''} onChange={(e) => set({ planned_freeze: e.target.value })} />
            </div>
          </div>
          {(terminFehler || fehler) && <p className="text-sm text-status-critical">{terminFehler || fehler}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={speichern} disabled={!form.title?.trim() || !!terminFehler || laeuft}>
            {laeuft ? 'Speichert…' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
