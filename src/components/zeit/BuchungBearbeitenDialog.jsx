import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { aendereZeit } from '@/lib/sprint/useTimer';
import { minuteVonIso, isoVonMinute, uhr } from '@/lib/zeit/tagesAuswertung';

const zuMinute = (s) => {
  const [h, m] = String(s || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Buchung ändern, solange der Tag nicht bestätigt ist.
export default function BuchungBearbeitenDialog({ eintrag, open, onOpenChange, onSaved }) {
  const [von, setVon] = useState('09:00');
  const [bis, setBis] = useState('10:00');
  const [notiz, setNotiz] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!eintrag) return;
    setVon(eintrag.started_at ? uhr(minuteVonIso(eintrag.started_at)) : '09:00');
    setBis(eintrag.ended_at ? uhr(minuteVonIso(eintrag.ended_at)) : '10:00');
    setNotiz(eintrag.note || '');
  }, [eintrag?.id, open]);

  if (!eintrag) return null;
  const minuten = zuMinute(bis) - zuMinute(von);

  const speichern = async () => {
    setSaving(true);
    await aendereZeit(eintrag.id, {
      started_at: isoVonMinute(eintrag.entry_date, zuMinute(von)),
      ended_at: isoVonMinute(eintrag.entry_date, zuMinute(bis)),
      duration_minutes: minuten,
      note: notiz,
    });
    setSaving(false);
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="uppercase font-bold">Buchung ändern</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Von</Label><Input type="time" value={von} onChange={(e) => setVon(e.target.value)} /></div>
            <div><Label>Bis</Label><Input type="time" value={bis} onChange={(e) => setBis(e.target.value)} /></div>
          </div>
          <div><Label>Notiz</Label><Input value={notiz} onChange={(e) => setNotiz(e.target.value)} /></div>
          <Button className="w-full font-bold uppercase" disabled={saving || minuten <= 0} onClick={speichern}>
            {saving ? 'Speichert…' : 'Speichern'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}