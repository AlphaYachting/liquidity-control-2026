import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

// Nach dem Öffnen des Mailprogramms: nur eine Bestätigung schreibt etwas fort.
export default function SendenDialog({ open, onOpenChange, empfaenger, folgen, busy, onJa, onNein }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md p-5">
        <p className="text-base font-semibold">E-Mail gesendet?</p>
        <p className="text-[13px] text-muted-foreground">
          Das Mailprogramm wurde mit dem Entwurf an <span className="font-medium text-foreground">{empfaenger}</span>{' '}
          geöffnet. Wurde die E-Mail tatsächlich gesendet?
        </p>
        <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
          Bei „Ja, gesendet": {folgen.join(' · ')}. Bei „Doch nicht" bleibt alles unverändert.
        </div>
        <div className="flex justify-end gap-2 mt-1">
          <Button variant="ghost" onClick={onNein} disabled={busy}>Doch nicht</Button>
          <Button autoFocus onClick={onJa} disabled={busy} className="bg-primary gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Ja, gesendet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}