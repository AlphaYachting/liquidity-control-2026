import React from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const RHYTHMEN = [
  { value: 'woechentlich', label: 'wöchentlich' },
  { value: '14taegig', label: 'alle 14 Tage' },
  { value: 'monatlich', label: 'monatlich' },
  { value: 'manuell', label: 'manuell' },
];

// Art/Rhythmus/Fenster/optional einer Vorlage in Container-Modulen — ersetzt die Phase.
export default function RoutineVorlageFelder({ form, setForm }) {
  return (
    <>
      <Select value={form.art} onValueChange={(v) => setForm({ ...form, art: v, rhythmus: v === 'routine' ? form.rhythmus || 'monatlich' : form.rhythmus })}>
        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="einmalig">Einmalig</SelectItem>
          <SelectItem value="routine">Routine</SelectItem>
        </SelectContent>
      </Select>
      {form.art === 'routine' && (
        <>
          <Select value={form.rhythmus} onValueChange={(v) => setForm({ ...form, rhythmus: v })}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Rhythmus" /></SelectTrigger>
            <SelectContent>{RHYTHMEN.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" className="w-24" placeholder="Fenster" title="Fenster (Arbeitstage)" value={form.fenster_tage}
            onChange={(e) => setForm({ ...form, fenster_tage: e.target.value })} />
        </>
      )}
      <label className="flex items-center gap-1.5 text-sm">
        <Checkbox checked={!!form.optional} onCheckedChange={(v) => setForm({ ...form, optional: !!v })} /> optional
      </label>
    </>
  );
}

export const routineFelderAusForm = (form) => ({
  art: form.art,
  rhythmus: form.art === 'routine' ? form.rhythmus || 'monatlich' : null,
  fenster_tage: form.art === 'routine' ? Number(form.fenster_tage) || 0 : 0,
  optional: !!form.optional,
  milestone_state: 'produktion',
});