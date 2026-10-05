import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const NICHT_VERRECHNEN_GRUENDE = [
  { value: 'wartungsvertrag', label: 'Im Wartungsvertrag enthalten' },
  { value: 'anderer_auftrag', label: 'In anderem Auftrag/Pauschale enthalten' },
  { value: 'kulanz', label: 'Kulanz' },
  { value: 'keine_gesonderte_abrechnung', label: 'Keine gesonderte Abrechnung nötig' },
  { value: 'sonstiges', label: 'Sonstiges' },
];
export const GRUND_LABEL = Object.fromEntries(NICHT_VERRECHNEN_GRUENDE.map((g) => [g.value, g.label]));

// Erledigtes Ticket bewusst ohne Rechnung abschließen — Zeitbuchungen bleiben unverändert.
export default function SupportNichtVerrechnenDialog({ task, open, onOpenChange, onDone }) {
  const [grund, setGrund] = useState('');
  const [notiz, setNotiz] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');

  const speichern = async () => {
    setBusy(true);
    setFehler('');
    try {
      const res = await base44.functions.invoke('supportVerrechnung', { aktion: 'nicht_verrechnen', ticket_id: task.ticket_id, grund, notiz });
      if (res.data?.error) throw new Error(res.data.error);
      onDone();
      onOpenChange(false);
    } catch (e) {
      setFehler(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const ok = grund && (grund !== 'sonstiges' || notiz.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nicht verrechnen — {task.task_title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Grund</Label>
            {NICHT_VERRECHNEN_GRUENDE.map((g) => (
              <label key={g.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="grund" value={g.value} checked={grund === g.value} onChange={() => setGrund(g.value)} />
                {g.label}
              </label>
            ))}
          </div>
          <div>
            <Label className="text-xs">Notiz {grund === 'sonstiges' ? '(Pflicht)' : '(optional)'}</Label>
            <Textarea rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. im Wartungspaket Premium enthalten" />
          </div>
          <p className="text-xs text-muted-foreground">Das Ticket verschwindet aus der Abrechnung und bleibt 30 Tage unter „Nicht verrechnet" sichtbar — dort lässt es sich zurückholen.</p>
          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={speichern} disabled={busy || !ok}>{busy ? 'Wird gespeichert…' : 'Nicht verrechnen'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
