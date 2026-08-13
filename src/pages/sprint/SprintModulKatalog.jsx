import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SectionLabel from '@/components/sprint/SectionLabel';
import ModulTemplateEditor from '@/components/sprint/ModulTemplateEditor';
import AddOnKatalog from '@/components/sprint/AddOnKatalog';
import { fmtEUR } from '@/components/sprint/sprintConfig';

// S7 — Modul-Katalog: ModuleTemplate, TicketTemplate, AddOnBlock
export default function SprintModulKatalog() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [newName, setNewName] = useState('');
  const [newHours, setNewHours] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const { data: modules = [] } = useQuery({
    queryKey: ['moduleTemplates'],
    queryFn: () => base44.entities.ModuleTemplate.list('-created_date', 200),
  });

  const handleAdd = async () => {
    if (!newName) return;
    const mod = await base44.entities.ModuleTemplate.create({
      name: newName,
      target_hours: Number(newHours) || 0,
      standard_price: Number(newPrice) || 0,
      active: true,
    });
    setNewName(''); setNewHours(''); setNewPrice('');
    setSelectedId(mod.id);
    qc.invalidateQueries({ queryKey: ['moduleTemplates'] });
  };

  const selected = modules.find((m) => m.id === selectedId);

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Modul-Katalog</h1>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <div className="bg-white rounded-lg shadow-sm p-5">
          <SectionLabel className="mb-3">Module</SectionLabel>
          <div className="space-y-2">
            {modules.filter((m) => m.active !== false).map((m) => (
              <button
                key={m.id} type="button" onClick={() => setSelectedId(m.id)}
                className={`w-full text-left rounded px-3 py-2.5 transition-colors ${
                  selectedId === m.id ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-primary/10'
                }`}
              >
                <span className="font-semibold text-sm">{m.name}</span>
                <span className={`text-xs ml-2 ${selectedId === m.id ? 'text-white/80' : 'text-muted-foreground'}`}>
                  {m.target_hours ? `${m.target_hours} h` : ''}{m.standard_price ? ` · ${fmtEUR(m.standard_price)}` : ''}
                </span>
              </button>
            ))}
            {modules.length === 0 && <p className="text-sm text-muted-foreground">Noch kein Modul — unten das erste anlegen.</p>}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <Input placeholder="Modulname, z. B. Landingpage" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" />
            <Input type="number" placeholder="Soll-h" className="sm:w-24" value={newHours} onChange={(e) => setNewHours(e.target.value)} />
            <Input type="number" placeholder="Preis €" className="sm:w-28" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
            <Button className="bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded" disabled={!newName} onClick={handleAdd}>
              Anlegen
            </Button>
          </div>
        </div>

        {selected ? (
          <ModulTemplateEditor key={selected.id} module={selected} />
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-10 text-center text-sm text-muted-foreground">
            Modul links auswählen, um die Pflichtkette zu bearbeiten.
          </div>
        )}
      </div>

      <AddOnKatalog />
    </div>
  );
}