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
  const [suche, setSuche] = useState('');

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
  const aktive = modules.filter((m) => m.active !== false);
  const gefiltert = aktive.filter((m) => (m.name || '').toLowerCase().includes(suche.trim().toLowerCase()));

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Modul-Katalog</h1>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <div className="bg-white rounded-lg shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <SectionLabel>Module</SectionLabel>
            <span className="text-xs text-muted-foreground">{aktive.length} aktiv</span>
          </div>
          <Input placeholder="Modul suchen…" value={suche} onChange={(e) => setSuche(e.target.value)} className="mb-3" />
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            {gefiltert.map((m) => (
              <button
                key={m.id} type="button" onClick={() => setSelectedId(m.id)}
                className={`w-full text-left rounded border px-3 py-2.5 transition-colors ${
                  selectedId === m.id
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent bg-muted hover:border-primary/40'
                }`}
              >
                <p className="font-semibold text-sm text-foreground truncate">{m.name}</p>
                <p className="text-xs text-muted-foreground">
                  {m.target_hours ? `${m.target_hours} h` : 'keine Sollstunden'}
                  {m.standard_price ? ` · ${fmtEUR(m.standard_price)}` : ''}
                </p>
              </button>
            ))}
            {aktive.length === 0 && <p className="text-sm text-muted-foreground">Noch kein Modul — unten das erste anlegen.</p>}
            {aktive.length > 0 && gefiltert.length === 0 && (
              <p className="text-sm text-muted-foreground">Kein Modul passt zur Suche.</p>
            )}
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
          <ModulTemplateEditor
            key={selected.id}
            module={selected}
            onModuleChanged={() => qc.invalidateQueries({ queryKey: ['moduleTemplates'] })}
            onModuleDeleted={() => { setSelectedId(null); qc.invalidateQueries({ queryKey: ['moduleTemplates'] }); }}
          />
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