import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { eur } from '@/components/crm/quotes/quoteConfig';

export default function QuoteItemsEditor({ items = [], vatRate = 20, onChange }) {
  const update = (idx, field, value) => {
    const next = items.map((it, i) => i === idx ? { ...it, [field]: value } : it);
    onChange(next.map((it, i) => ({
      ...it,
      position: i + 1,
      total_price: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    })));
  };
  const addRow = () => onChange([...items, { position: items.length + 1, title: '', description: '', quantity: 1, unit: 'pauschal', unit_price: 0, total_price: 0 }]);
  const removeRow = (idx) => onChange(items.filter((_, i) => i !== idx).map((it, i) => ({ ...it, position: i + 1 })));

  const net = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);

  return (
    <div className="space-y-2">
      <div className="hidden sm:grid grid-cols-[2rem_1fr_5rem_6rem_6rem_6rem_2rem] gap-2 text-[11px] text-muted-foreground px-1">
        <span>Pos.</span><span>Leistung</span><span>Menge</span><span>Einheit</span><span>Einzelpreis</span><span className="text-right">Gesamt</span><span />
      </div>
      {items.map((it, idx) => (
        <div key={idx} className="grid grid-cols-[2rem_1fr_5rem_6rem_6rem_6rem_2rem] gap-2 items-start">
          <span className="text-xs text-muted-foreground pt-2">{idx + 1}</span>
          <div className="space-y-1">
            <Input value={it.title} onChange={e => update(idx, 'title', e.target.value)} placeholder="Leistungsbezeichnung" className="h-8 text-xs" />
            <Input value={it.description || ''} onChange={e => update(idx, 'description', e.target.value)} placeholder="Beschreibung (optional)" className="h-7 text-[11px] text-muted-foreground" />
          </div>
          <Input type="number" value={it.quantity} onChange={e => update(idx, 'quantity', Number(e.target.value))} className="h-8 text-xs" />
          <Input value={it.unit || ''} onChange={e => update(idx, 'unit', e.target.value)} className="h-8 text-xs" />
          <Input type="number" value={it.unit_price} onChange={e => update(idx, 'unit_price', Number(e.target.value))} className="h-8 text-xs" />
          <span className="text-xs font-medium text-right pt-2">{eur((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}</span>
          <button onClick={() => removeRow(idx)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addRow} className="h-7 text-xs gap-1">
        <Plus className="w-3 h-3" /> Position hinzufügen
      </Button>
      <div className="border-t pt-2 space-y-1 text-sm max-w-xs ml-auto">
        <div className="flex justify-between text-muted-foreground text-xs"><span>Netto</span><span className="font-medium text-foreground">{eur(net)}</span></div>
        <div className="flex justify-between text-muted-foreground text-xs"><span>MwSt. ({vatRate}%)</span><span>{eur(net * vatRate / 100)}</span></div>
        <div className="flex justify-between font-semibold"><span>Brutto</span><span>{eur(net * (1 + vatRate / 100))}</span></div>
      </div>
    </div>
  );
}