import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';

// Ein Hauptknopf über die volle Breite. Gesperrt heißt neutral, nicht aufgehellt rosa.
export default function HauptKnopf({ children, disabled, onClick, grund, icon }) {
  return (
    <div className="mt-3">
      {disabled && grund && (
        <p className="text-[12px] mb-1.5" style={{ color: RITTLER.textSecondary }}>{grund}</p>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="w-full h-11 rounded flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wide whitespace-nowrap"
        style={
          disabled
            ? { backgroundColor: RITTLER.surface, color: RITTLER.textSecondary, cursor: 'not-allowed' }
            : { backgroundColor: RITTLER.pink, color: RITTLER.white }
        }
      >
        {icon}
        {children}
      </button>
    </div>
  );
}