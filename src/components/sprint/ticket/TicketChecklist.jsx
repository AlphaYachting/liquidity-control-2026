import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Checkliste innerhalb eines Tickets — abhaken, ergänzen, entfernen
export default function TicketChecklist({ items = [], onChange }) {
  const [neu, setNeu] = useState('');

  const toggle = (i) => onChange(items.map((it, k) => (k === i ? { ...it, done: !it.done } : it)));
  const entfernen = (i) => onChange(items.filter((_, k) => k !== i));
  const hinzufuegen = () => {
    const text = neu.trim();
    if (!text) return;
    onChange([...items, { text, done: false }]);
    setNeu('');
  };

  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 group">
          <Checkbox checked={!!it.done} onCheckedChange={() => toggle(i)} />
          <span className={`flex-1 text-sm ${it.done ? 'line-through text-muted-foreground' : ''}`}>{it.text}</span>
          <button onClick={() => entfernen(i)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input value={neu} onChange={(e) => setNeu(e.target.value)} placeholder="Punkt hinzufügen…"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); hinzufuegen(); } }} className="h-8" />
        <Button size="sm" variant="outline" onClick={hinzufuegen} className="h-8 shrink-0">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}