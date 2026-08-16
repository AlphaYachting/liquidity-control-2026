import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SectionLabel from '@/components/sprint/SectionLabel';
import { MODEL_OPTIONS } from '@/components/sprint/projectTypes';

// Vollständigkeit der typspezifischen Zusatzfelder
export function typDetailsValid(seed) {
  if (seed.type === 'support') return Number(seed.stundensatz) > 0;
  if (seed.type === 'container') return Number(seed.kontingent_stunden) > 0;
  if (seed.type === 'legacy') return Boolean(seed.modell);
  return true;
}

// Schlanker Schritt für Schnellanlagen — keine Module, keine Termine
export default function StepTypDetails({ seed, setSeed, contracts = [] }) {
  const set = (patch) => setSeed((s) => ({ ...s, ...patch }));

  return (
    <div className="space-y-5 max-w-xl">
      <SectionLabel>Zusatzangaben</SectionLabel>

      {seed.type === 'support' && (
        <div>
          <Label>Stundensatz (EUR) *</Label>
          <Input type="number" value={seed.stundensatz || ''} onChange={(e) => set({ stundensatz: e.target.value })} />
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
        <div className="space-y-2">
          <Label>Abrechnungsmodell *</Label>
          <Select value={seed.modell || 'aufwand'} onValueChange={(v) => set({ modell: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Altprojekt — keine Automatismen.</p>
        </div>
      )}

      {seed.type === 'intern' && (
        <p className="text-sm text-muted-foreground">Keine Zusatzangaben nötig.</p>
      )}

      <p className="text-xs text-muted-foreground">
        Es entsteht ein laufender Behälter mit einer offenen Etappe — ohne Liefertermin und ohne Etappenbetrag.
        Tickets können sofort abgelegt werden.
      </p>
    </div>
  );
}