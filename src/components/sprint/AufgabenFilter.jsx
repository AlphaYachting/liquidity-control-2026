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
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => {
        const active = value === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            className="text-[13px] px-3 py-1 rounded-full"
            style={{
              backgroundColor: active ? RITTLER.black : RITTLER.surface,
              color: active ? RITTLER.white : RITTLER.textSecondary,
            }}
          >
            {c.label} ({counts[c.key] || 0})
          </button>
        );
      })}
    </div>
  );
}