import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DISMISS_REASONS } from '@/components/crm/inboxSignals';

// Verwerfen ist nur MIT Grund möglich — der Grund fließt in die nächste Einstufung ein.
export default function InboxDismissDialog({ open, onOpenChange, onConfirm }) {
  const [reason, setReason] = useState(null);
  const [free, setFree] = useState('');
  const [saving, setSaving] = useState(false);

  const complete = reason && (reason !== 'Sonstiges' || free.trim());

  const confirm = async () => {
    setSaving(true);
    await onConfirm(free.trim() ? `${reason}: ${free.trim()}` : reason);
    setSaving(false);
    setReason(null); setFree('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Anfrage verwerfen</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Grund *</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {DISMISS_REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    reason === r ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-muted'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Anmerkung {reason === 'Sonstiges' ? '*' : '(optional)'}</Label>
            <Textarea value={free} onChange={e => setFree(e.target.value)} rows={2}
              className="text-sm mt-1" placeholder="z.B. Anfrage passt nicht zu unserem Leistungsspektrum" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={confirm} disabled={!complete || saving}>
              {saving ? 'Speichert…' : 'Verwerfen'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}