import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SectionLabel from '@/components/sprint/SectionLabel';
import PauschalBudgetFelder, { pauschalBudgetGueltig } from '@/components/sprint/PauschalBudgetFelder';

// Vollständigkeit der typspezifischen Zusatzfelder
export function typDetailsValid(seed) {
  if (seed.type === 'support' || seed.type === 'regie') return Number(seed.stundensatz) > 0;
  if (seed.type === 'container') return Number(seed.kontingent_stunden) > 0;
  if (seed.type === 'legacy') return pauschalBudgetGueltig(seed.budget_betrag, seed.budget_stunden);
  return true;
}

// Schlanker Schritt für Schnellanlagen — keine Module, keine Termine
export default function StepTypDetails({ seed, setSeed, contracts = [] }) {
  const set = (patch) => setSeed((s) => ({ ...s, ...patch }));

  return (
    <div className="space-y-5 max-w-xl">
      <SectionLabel>Zusatzangaben</SectionLabel>

      {(seed.type === 'support' || seed.type === 'regie') && (
        <div>
          <Label>Stundensatz (EUR) *</Label>
          <Input type="number" value={seed.stundensatz || ''} onChange={(e) => set({ stundensatz: e.target.value })} />
          <Label className="mt-4 block">Monatsrahmen in Stunden (optional)</Label>
          <Input type="number" value={seed.kontingent_stunden || ''} onChange={(e) => set({ kontingent_stunden: e.target.value })} />
        </div>
      )}

      {seed.type === 'container' && (
        <div className="space-y-4">
          <div>
            <Label>Kontingent-Stunden pro Monat *</Label>
            <Input type="number" value={seed.kontingent_stunden || ''} onChange={(e) => set({ kontingent_stunden: e.target.value })} />
          </div>
          <div>
            <Label>Laufender Vertrag (optional)</Label>
            <Select value={seed.recurring_contract_id || ''} onValueChange={(v) => set({ recurring_contract_id: v })}>
              <SelectTrigger><SelectValue placeholder="Vertrag wählen" /></SelectTrigger>
              <SelectContent>
                {contracts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.project_name || c.contract_type || c.customer}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {contracts.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Für diesen Kunden ist kein laufender Vertrag erfasst.</p>
            )}
          </div>
          <div>
            <Label>Stundensatz für Mehraufwand (optional)</Label>
            <Input type="number" value={seed.stundensatz || ''} onChange={(e) => set({ stundensatz: e.target.value })} />
          </div>
        </div>
      )}

      {seed.type === 'legacy' && (
        <PauschalBudgetFelder
          betrag={seed.budget_betrag}
          stunden={seed.budget_stunden}
          onChange={({ betrag, stunden }) => set({ budget_betrag: betrag, budget_stunden: stunden })}
        />
      )}

      {seed.type === 'intern' && (
        <p className="text-sm text-muted-foreground">Keine Zusatzangaben nötig.</p>
      )}

      <p className="text-xs text-muted-foreground">
        {seed.type === 'legacy'
          ? 'Es entsteht ein Pauschalprojekt ohne Sprintplanung und ohne Pakete. Aufgaben legst du direkt im Projekt an; gebucht wird gegen die Budgetstunden.'
          : 'Es entsteht eine laufende Betreuung mit einer offenen Etappe — ohne Liefertermin und ohne Etappenbetrag. Tickets können sofort abgelegt werden.'}
      </p>
    </div>
  );
}