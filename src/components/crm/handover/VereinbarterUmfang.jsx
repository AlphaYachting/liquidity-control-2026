import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus } from 'lucide-react';
import UmfangPosition from '@/components/crm/handover/UmfangPosition';
import UmfangAuftrag from '@/components/crm/handover/UmfangAuftrag';
import { fmtEUR } from '@/components/sprint/sprintConfig';

const Kopf = ({ children }) => (
  <div className="px-3 py-2 bg-muted/50 border-y first:border-t-0">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{children}</p>
  </div>
);

// Abschnitt „Vereinbarter Umfang": Positionen + Auftragsrahmen, inline bearbeitbar
export default function VereinbarterUmfang({ zustand, onChange, modules, summen, abweichung, geprueft, onGeprueft, manuell }) {
  const setPos = (i, p) => onChange({ ...zustand, positionen: zustand.positionen.map((x, idx) => (idx === i ? p : x)) });
  const remove = (i) => onChange({ ...zustand, positionen: zustand.positionen.filter((_, idx) => idx !== i) });
  const add = () => onChange({ ...zustand, positionen: [...zustand.positionen, {
    name: '', amount: '', description: '', lieferumfang: [], korrekturschleifen: '', leistungszeitraum: '',
    abrechnung: 'einmalig', optional_im_angebot: false, beauftragt: true, module_choice: '',
  }] });

  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      <Kopf>Vereinbarter Umfang · Positionen</Kopf>
      {zustand.positionen.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Noch keine Position erfasst.</p>}
      {zustand.positionen.map((p, i) => (
        <UmfangPosition key={i} p={p} modules={modules} onChange={(np) => setPos(i, np)} onRemove={manuell ? () => remove(i) : null} />
      ))}
      <div className="px-3 py-2 border-t">
        <Button variant="outline" size="sm" onClick={add}><Plus /> Position hinzufügen</Button>
      </div>
      <div className="px-3 py-2 bg-muted/30 border-t space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Projekthöhe netto</span>
          <span className="text-sm font-bold tabular-nums">{fmtEUR(summen.einmalig)}</span>
        </div>
        {summen.monatlich > 0 && <p className="text-xs text-muted-foreground text-right">zusätzlich monatlich: {fmtEUR(summen.monatlich)}</p>}
        {summen.aufwand > 0 && <p className="text-xs text-muted-foreground text-right">zusätzlich nach Aufwand: {fmtEUR(summen.aufwand)}</p>}
      </div>
      {abweichung && (
        <div className="px-3 py-2 border-t bg-status-attention-surface space-y-1">
          <p className="text-xs text-status-attention">
            Summe der angehakten Positionen {fmtEUR(abweichung.positionen)} weicht von der Angebotssumme {fmtEUR(abweichung.angebot)} ab.
          </p>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={geprueft} onCheckedChange={(v) => onGeprueft(v === true)} /> Abweichung geprüft
          </label>
        </div>
      )}
      <Kopf>Vereinbarter Umfang · Auftrag</Kopf>
      <UmfangAuftrag a={zustand.auftrag} onChange={(a) => onChange({ ...zustand, auftrag: a })} />
    </div>
  );
}