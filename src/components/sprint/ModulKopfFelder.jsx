import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pencil, Check, X, Trash2 } from 'lucide-react';
import { fmtEUR } from '@/components/sprint/sprintConfig';

// Kopfdaten eines Moduls — Name, Sollstunden, Standardpreis bearbeiten
export default function ModulKopfFelder({ module, onChanged, onDeleted }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    name: module.name || '',
    target_hours: module.target_hours || '',
    standard_price: module.standard_price || '',
  });

  const speichern = async () => {
    if (!form.name.trim()) return;
    await base44.entities.ModuleTemplate.update(module.id, {
      name: form.name.trim(),
      target_hours: Number(form.target_hours) || 0,
      standard_price: Number(form.standard_price) || 0,
    });
    setEdit(false);
    onChanged();
  };

  const loeschen = async () => {
    if (!window.confirm(`Modul „${module.name}" wirklich löschen?`)) return;
    await base44.entities.ModuleTemplate.update(module.id, { active: false });
    onDeleted();
  };

  if (edit) {
    return (
      <div className="space-y-2 mb-4">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Modulname" />
        <div className="flex flex-wrap gap-2">
          <Input type="number" className="w-24" placeholder="Soll-h" value={form.target_hours}
            onChange={(e) => setForm({ ...form, target_hours: e.target.value })} />
          <Input type="number" className="w-28" placeholder="Preis €" value={form.standard_price}
            onChange={(e) => setForm({ ...form, standard_price: e.target.value })} />
          <Button size="sm" className="font-bold uppercase" onClick={speichern} disabled={!form.name.trim()}>
            <Check className="w-4 h-4 mr-1" /> Speichern
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEdit(false)}><X className="w-4 h-4" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-2 mb-4">
      <div className="min-w-0">
        <h3 className="font-bold text-foreground uppercase truncate">{module.name}</h3>
        <p className="text-xs text-muted-foreground">
          {module.target_hours ? `${module.target_hours} h Soll` : 'keine Sollstunden'}
          {module.standard_price ? ` · ${fmtEUR(module.standard_price)}` : ''}
        </p>
      </div>
      <div className="flex shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Modul bearbeiten" onClick={() => setEdit(true)}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" title="Modul entfernen" onClick={loeschen}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}