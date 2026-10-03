import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';

// V4 — Farbe hilft beim Überfliegen, der Filter beantwortet die Frage endgültig.
export default function AufgabenFilter({ value, onChange, counts }) {
  const chips = [
    { key: 'alle', label: 'Alle' },
    { key: 'meine', label: 'Meine' },
    { key: 'offen_zuweisung', label: 'Nicht zugewiesen' },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => {
        const active = value === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            aria-pressed={active}
            className={`h-[30px] rounded-full px-3 text-[13px] ${active ? 'font-semibold' : ''}`}
            style={{
              backgroundColor: active ? RITTLER.black : '#F0F0F0',
              color: active ? RITTLER.white : '#444444',
            }}
          >
            {c.label} ({counts[c.key] || 0})
          </button>
        );
      })}
    </div>
  );
}