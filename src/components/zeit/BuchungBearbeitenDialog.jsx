import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { aendereZeit } from '@/lib/sprint/useTimer';
import BereichChips from './BereichChips';
import { minuteVonIso, isoVonMinute, uhr } from '@/lib/zeit/tagesAuswertung';
import { brauchtBeschreibung, beschreibungReicht } from '@/lib/zeit/beschreibungPflicht';

const zuMinute = (s) => {
  const [h, m] = String(s || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Buchung ändern, solange der Tag nicht bestätigt ist.
export default function BuchungBearbeitenDialog({ eintrag, projekt, open, onOpenChange, onSaved }) {
  const [von, setVon] = useState('09:00');
  const [bis, setBis] = useState('10:00');
  const [notiz, setNotiz] = useState('');
  const [saving, setSaving] = useState(false);
  const [bereich, setBereich] = useState(null);

  useEffect(() => {
    if (!eintrag) return;
    setVon(eintrag.started_at ? uhr(minuteVonIso(eintrag.started_at)) : '09:00');
    setBis(eintrag.ended_at ? uhr(minuteVonIso(eintrag.ended_at)) : '10:00');
    setNotiz(eintrag.note || '');
    setBereich(eintrag.module_template_id || null);
  }, [eintrag?.id, open]);

  if (!eintrag) return null;
  const minuten = zuMinute(bis) - zuMinute(von);
  // Nach Aufwand ohne Ticket: die Notiz ist die Rechnungszeile — Regel hier gleich sichtbar machen.
  const notizPflicht = brauchtBeschreibung({ ...eintrag, note: '' }, projekt);
  const notizZuKurz = notizPflicht && !beschreibungReicht(notiz);

  const speichern = async () => {
    setSaving(true);
    await aendereZeit(eintrag.id, {
      started_at: isoVonMinute(eintrag.entry_date, zuMinute(von)),
      ended_at: isoVonMinute(eintrag.entry_date, zuMinute(bis)),
      duration_minutes: minuten,
      note: notiz,
      ...(bereich !== (eintrag.module_template_id || null) ? { module_template_id: bereich } : {}),
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
          <div>
            <Label>Notiz</Label>
            <Input value={notiz} onChange={(e) => setNotiz(e.target.value)} />
            {notizZuKurz && (
              <p className="text-xs mt-1 text-amber-700">
                Wird nach Aufwand verrechnet: bitte mindestens zwei Wörter, was gemacht wurde — z. B. „Projektmanagement Abstimmung mit Kunde“. Sonst lässt sich der Tag nicht abschließen.
              </p>
            )}
          </div>
          <BereichChips projectId={eintrag.project_id} wert={bereich} onWaehlen={setBereich} />
          <Button className="w-full font-bold uppercase" disabled={saving || minuten <= 0} onClick={speichern}>
            {saving ? 'Speichert…' : 'Speichern'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}