import React, { useState } from 'react';
import { ExternalLink, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Verweise auf Entwürfe, Dateien, Dokumente
export default function TicketLinks({ items = [], onChange }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');

  const hinzufuegen = () => {
    if (!url.trim()) return;
    onChange([...items, { label: label.trim() || url.trim(), url: url.trim() }]);
    setLabel('');
    setUrl('');
  };

  return (
    <div className="space-y-2">
      {items.map((l, i) => (
        <div key={i} className="flex items-center gap-2 group">
          <a href={l.url} target="_blank" rel="noreferrer"
            className="flex-1 min-w-0 truncate text-sm text-primary hover:underline inline-flex items-center gap-1">
            <ExternalLink className="w-3.5 h-3.5 shrink-0" /> {l.label || l.url}
          </a>
          <button onClick={() => onChange(items.filter((_, k) => k !== i))}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Bezeichnung" className="h-8 w-1/3" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="h-8" />
        <Button size="sm" variant="outline" onClick={hinzufuegen} className="h-8 shrink-0">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}