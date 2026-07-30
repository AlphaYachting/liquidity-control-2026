import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus } from 'lucide-react';
import SectionLabel from '@/components/sprint/SectionLabel';
import { fmtEUR } from '@/components/sprint/sprintConfig';

// Schritt 2 des Sprint-Assistenten: Module wählen → Milestones, Etappenbeträge, Zusatzbausteine
// Etappenbetrag = Modulpreis plus die Preise der gewählten Zusatzbausteine
export const milestoneAmount = (m, addOns) =>
  (Number(m.amount) || 0) + m.addon_ids.reduce((s, id) => s + (Number(addOns.find((a) => a.id === id)?.price) || 0), 0);

export default function StepModule({ modules, addOns, selected, setSelected, discount = 0 }) {
  const sum = selected.reduce((s, m) => s + milestoneAmount(m, addOns), 0);

  const addModule = (mod) => {
    setSelected([...selected, { key: `${mod.id}-${Date.now()}`, module_template_id: mod.id, name: mod.name, amount: mod.standard_price || '', addon_ids: [] }]);
  };

  const removeAt = (idx) => setSelected(selected.filter((_, i) => i !== idx));

  const setAmount = (idx, val) => {
    const next = [...selected];
    next[idx] = { ...next[idx], amount: val };
    setSelected(next);
  };

  const toggleAddon = (idx, addonId) => {
    const next = [...selected];
    const ids = next[idx].addon_ids.includes(addonId)
      ? next[idx].addon_ids.filter((id) => id !== addonId)
      : [...next[idx].addon_ids, addonId];
    next[idx] = { ...next[idx], addon_ids: ids };
    setSelected(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel className="mb-2">Module aus dem Katalog</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {modules.map((mod) => (
            <Button key={mod.id} variant="outline" size="sm" className="rounded" onClick={() => addModule(mod)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> {mod.name}
            </Button>
          ))}
          {modules.length === 0 && <p className="text-sm text-[#999999]">Kein Modul im Katalog — zuerst im Modul-Katalog anlegen.</p>}
        </div>
      </div>

      <div>
        <SectionLabel className="mb-2">Milestones ({selected.length})</SectionLabel>
        <div className="space-y-3">
          {selected.map((m, idx) => (
            <div key={m.key} className="bg-[#f5f5f5] rounded p-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-[#ff3764]">{idx + 1}</span>
                <span className="flex-1 font-semibold text-sm text-[#2d2d2d]">{m.name}</span>
                <div className="text-right">
                  <Input
                    type="number" placeholder="Etappenbetrag €" className="w-40 bg-white"
                    value={m.amount} onChange={(e) => setAmount(idx, e.target.value)}
                  />
                  {milestoneAmount(m, addOns) !== (Number(m.amount) || 0) && (
                    <p className="text-[11px] text-[#999999] mt-1">mit Bausteinen {fmtEUR(milestoneAmount(m, addOns))}</p>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-[#999999] hover:text-[#ff3764]" onClick={() => removeAt(idx)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              {addOns.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 pl-6">
                  {addOns.map((a) => {
                    const active = m.addon_ids.includes(a.id);
                    return (
                      <button
                        key={a.id} type="button" onClick={() => toggleAddon(idx, a.id)}
                        className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                          active ? 'bg-[#ff3764] text-white border-[#ff3764]' : 'bg-white text-[#2d2d2d] border-gray-200'
                        }`}
                      >
                        {a.name} · {fmtEUR(a.price)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {selected.length === 0 && <p className="text-sm text-[#999999]">Noch kein Modul gewählt.</p>}
        </div>
      </div>

      <div className="rounded p-3 text-sm font-semibold bg-[#f5f5f5] text-[#2d2d2d]">
        Etappensumme {fmtEUR(sum)}
        {Number(discount) > 0 && <span className="text-[#999999] font-normal"> − Nachlass {fmtEUR(Number(discount))}</span>}
        <span className="text-[#999999] font-normal"> = Sprintbetrag </span>
        {fmtEUR(sum - (Number(discount) || 0))}
      </div>
    </div>
  );
}