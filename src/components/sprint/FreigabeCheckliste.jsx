import React from 'react';
import { Check } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

// X3 — Voraussetzungen sichtbar: Häkchen oder offener Kreis, immer mit Klartext.
export default function FreigabeCheckliste({ items }) {
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.key} className="flex items-start gap-2 text-sm">
          {it.ok ? (
            <Check className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={3} style={{ color: RITTLER.black }} />
          ) : (
            <span
              className="w-4 h-4 mt-0.5 rounded-full shrink-0"
              style={{ border: `2px solid ${RITTLER.line}` }}
              aria-hidden="true"
            />
          )}
          <span style={{ color: it.ok ? RITTLER.black : it.blocking ? RITTLER.textSecondary : STATUS_COLORS.attention }}>
            {it.text}
            {!it.ok && it.hint ? ` — ${it.hint}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}