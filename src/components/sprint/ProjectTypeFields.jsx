import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MODEL_OPTIONS } from '@/components/sprint/projectTypes';

// Zusatzfelder je Projekttyp — nur was der Typ wirklich braucht.
export default function ProjectTypeFields({ type, form, setForm, contracts = [] }) {
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  if (type === 'sprint') {
    return <p className="text-xs text-muted-foreground">Sprint im Assistenten planen — Termine und Etappen entstehen dort.</p>;
  }

  return (
    <>
      {type === 'support' && (
        <div>
          <Label>Stundensatz (EUR)</Label>
          <Input type="number" value={form.stundensatz || ''} onChange={(e) => set('stundensatz')(e.target.value)} />
        </div>
      )}

      {type === 'container' && (
        <>
          <div>
            <Label>Kontingent-Stunden pro Monat</Label>
            <Input
              type="number"
              value={form.support_kontingent_stunden || ''}
              onChange={(e) => set('support_kontingent_stunden')(e.target.value)}
            />
          </div>
          <div>
            <Label>Laufender Vertrag (optional)</Label>
            <Select value={form.recurring_contract_id || 'none'} onValueChange={(v) => set('recurring_contract_id')(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Kein Vertrag" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kein Vertrag</SelectItem>
                {contracts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.customer || c.domain || c.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {type === 'legacy' && (
        <div>
          <Label>Abrechnungsmodell</Label>
          <Select value={form.abrechnungsmodell || 'aufwand'} onValueChange={set('abrechnungsmodell')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Es entsteht sofort ein laufender Behälter ohne Termin und ohne Betrag — Tickets können direkt abgelegt werden.
      </p>
    </>
  );
}