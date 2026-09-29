import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { naechsterTermin } from '@/lib/sprint/routine';
import { todayIso } from '@/components/sprint/sprintConfig';

// Bestätigung beim Erledigen einer Routine — im Normalfall genügt Enter.
export default function RoutineErledigtDialog({ ticket, onConfirm, onCancel }) {
  const [termin, setTermin] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    if (ticket) { setTermin(naechsterTermin(ticket, todayIso()) || ''); setLaeuft(false); }
  }, [ticket]);

  const absenden = async (e) => {
    e.preventDefault();
    if (!termin) return;
    setLaeuft(true);
    await onConfirm(termin);
  };

  return (
    <Dialog open={!!ticket} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <form onSubmit={absenden}>
          <DialogHeader><DialogTitle>{ticket?.title} erledigt</DialogTitle></DialogHeader>
          <div className="py-4 space-y-1.5">
            <Label>Nächster Termin</Label>
            <Input type="date" required autoFocus value={termin} onChange={(e) => setTermin(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>Abbrechen</Button>
            <Button type="submit" disabled={!termin || laeuft}>Übernehmen</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}