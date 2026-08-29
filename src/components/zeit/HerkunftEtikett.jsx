import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';

// Sagt, woher die Projektwahl kommt — und lässt sie in einem Klick ändern.
export default function HerkunftEtikett({ ausOrt, ortKunde, onZurueckZumOrt, onSuche }) {
  return (
    <div className="mt-1.5">
      <span
        className="text-[10.5px] font-semibold tracking-wide uppercase"
        style={{ color: RITTLER.textSecondary }}
      >
        {ausOrt ? 'Vorausgewählt aus dieser Seite' : 'Von dir gewählt'}
      </span>
      <div className="mt-1 flex items-center gap-3">
        <button
          type="button"
          onClick={onSuche}
          className="text-[11.5px] hover:text-primary transition-colors"
          style={{ color: RITTLER.textSecondary }}
        >
          anderes Projekt
        </button>
        {!ausOrt && onZurueckZumOrt && (
          <button
            type="button"
            onClick={onZurueckZumOrt}
            className="text-[11.5px] hover:text-primary transition-colors truncate"
            style={{ color: RITTLER.textSecondary }}
          >
            ← zurück zu {ortKunde || 'dieser Seite'}
          </button>
        )}
      </div>
    </div>
  );
}