import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RITTLER } from '@/components/sprint/sprintConfig';

// X3 Punkt 3 — Lieferstand: Links oder Dateiablagen, die im Streitfall zählen.
export default function LieferstandFeld({ links = [], disabled, onChange }) {
  const [value, setValue] = useState('');

  const add = () => {
    const v = value.trim();
    if (!v) return;
    onChange([...links, v]);
    setValue('');
  };

  return (
    <div>
      <p className="text-[13px] mb-2" style={{ color: RITTLER.textSecondary }}>Lieferstand</p>
      <ul className="space-y-1 mb-2">
        {links.map((l, i) => (
          <li key={`${l}-${i}`} className="flex items-center gap-2 text-sm">
            <a href={l} target="_blank" rel="noreferrer" className="truncate underline" style={{ color: RITTLER.black }}>{l}</a>
            {!disabled && (
              <button onClick={() => onChange(links.filter((_, idx) => idx !== i))} aria-label="Link entfernen">
                <X className="w-3.5 h-3.5" style={{ color: RITTLER.textSecondary }} />
              </button>
            )}
          </li>
        ))}
        {links.length === 0 && (
          <li className="text-sm" style={{ color: RITTLER.textSecondary }}>Noch kein Link hinterlegt.</li>
        )}
      </ul>
      {!disabled && (
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Link zum Lieferstand"
            className="rounded"
          />
          <Button variant="outline" className="rounded border-[1.5px] border-[#2d2d2d] text-[#2d2d2d]" onClick={add}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}