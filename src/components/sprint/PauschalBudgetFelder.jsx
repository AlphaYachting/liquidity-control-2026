import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { KALKULATIONSSATZ, budgetStundenAus } from '@/components/sprint/projectTypes';

// Budget eines Pauschalprojekts (Entscheidung 06.10.2026): Auftragssumme netto und Budgetstunden sind Pflicht.
// Die Stunden werden aus der Summe vorbelegt (Summe ÷ Kalkulationssatz) und bleiben änderbar.
// betrag/stunden sind Rohwerte aus dem Formular; onChange bekommt { betrag, stunden }.
export function pauschalBudgetGueltig(betrag, stunden) {
  return Number(betrag) > 0 && Number(stunden) > 0;
}

export default function PauschalBudgetFelder({ betrag, stunden, onChange, sperre, onSperre, istAdmin = false }) {
  const vorschlagAlt = budgetStundenAus(betrag);

  const betragAendern = (wert) => {
    // Stunden folgen der Summe, solange niemand sie von Hand geändert hat
    const folgt = stunden === '' || stunden == null || Number(stunden) === 0 || Number(stunden) === vorschlagAlt;
    onChange({ betrag: wert, stunden: folgt ? (budgetStundenAus(wert) || '') : stunden });
  };

  const satz = Number(betrag) > 0 && Number(stunden) > 0 ? Math.round(Number(betrag) / Number(stunden)) : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Auftragssumme netto (EUR) *</Label>
          <Input type="number" min="0" value={betrag ?? ''} onChange={(e) => betragAendern(e.target.value)} />
        </div>
        <div>
          <Label>Budgetstunden *</Label>
          <Input type="number" min="0" step="0.5" value={stunden ?? ''} onChange={(e) => onChange({ betrag, stunden: e.target.value })} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Vorbelegt mit Summe ÷ {KALKULATIONSSATZ} € je Stunde{satz ? ` · aktuell ${satz} € je Budgetstunde` : ''}.
        Beim Buchen und in der Übersicht wird gegen diese Stunden gemessen; ab 80 % gelb, über 100 % rot.
      </p>
      {!pauschalBudgetGueltig(betrag, stunden) && (
        <p className="text-xs text-status-attention">Pauschalprojekte brauchen Auftragssumme und Budgetstunden.</p>
      )}
      {istAdmin && onSperre && (
        <div className="flex items-center gap-2">
          <Switch checked={!!sperre} disabled={!(Number(stunden) > 0)} onCheckedChange={onSperre} />
          <Label>Buchen sperren, wenn das Budget verbraucht ist</Label>
        </div>
      )}
    </div>
  );
}
