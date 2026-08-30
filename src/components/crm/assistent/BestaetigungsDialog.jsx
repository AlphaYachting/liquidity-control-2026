import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

// Senden heißt bestätigen — was gleich geschieht, steht im Klartext.
export default function BestaetigungsDialog({ open, onOpenChange, empfaenger, folgen, busy, onJa, onNein }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>E-Mail an {empfaenger} gesendet?</DialogTitle></DialogHeader>
        <p className="text-[13px] text-muted-foreground">
          Bei „Ja, gesendet": {folgen.join(' · ')}.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onNein} disabled={busy}>Doch nicht</Button>
          <Button onClick={onJa} disabled={busy} className="gap-2">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Ja, gesendet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}