import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PositionModuleSelect from '@/components/crm/handover/PositionModuleSelect';
import { Plus, Trash2 } from 'lucide-react';

// Positionen von Hand erfassen, wenn kein Studio-Angebot vorliegt.
// Jede Zeile braucht Leistung, Betrag und ein Katalogmodul — daraus entstehen
// Auftragspositionen UND die Modulauswahl im Anlage-Wizard.
export default function ManualPositionsEditor({ rows, modules, onChange }) {
  const set = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { name: '', amount: '', module_choice: '' }]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="divide-y">
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Kein Angebot aus dem Studio — Positionen hier erfassen. Mindestens eine Zeile mit Leistung,
        Betrag und Katalogmodul ist Pflicht.
      </p>
      {rows.map((r, i) => (
        <div key={i} className="px-3 py-2 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
          <Input
            className="h-9 sm:col-span-5"
            placeholder="Leistung, z. B. Flyer + Visitenkarten"
            value={r.name}
            onChange={(e) => set(i, { name: e.target.value })}
          />
          <Input
            type="number"
            className="h-9 sm:col-span-2 tabular-nums"
            placeholder="Betrag"
            value={r.amount}
            onChange={(e) => set(i, { amount: e.target.value })}
          />
          <div className="sm:col-span-4">
            <PositionModuleSelect
              value={r.module_choice}
              modules={modules}
              onChange={(v) => set(i, { module_choice: v })}
            />
          </div>
          <div className="sm:col-span-1 flex justify-end">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(i)} disabled={rows.length === 1}>
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      ))}
      <div className="px-3 py-2">
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={add}>
          <Plus className="w-3.5 h-3.5" /> Position hinzufügen
        </Button>
      </div>
    </div>
  );
}