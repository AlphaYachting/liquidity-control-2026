import React from 'react';
import { Plus } from 'lucide-react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { kuerzeTitel } from '@/lib/zeit/projektTitel';

// Vorschläge tragen keine Fläche — eine graue Fläche würde „ausgewählt" bedeuten.
export default function TrefferListe({ treffer, wort, onWaehlen, onAnlegen }) {
  if (!wort) return null;

  // Genau ein Treffer steht schon in der Vorschau — dann braucht es keine Liste.
  if (treffer.length === 1) return null;

  if (treffer.length === 0) {
    return (
      <div className="mt-2 border-t" style={{ borderColor: RITTLER.line }}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onAnlegen}
          className="w-full text-left px-2.5 py-2 flex items-center gap-2"
        >
          <Plus className="w-4 h-4 shrink-0" style={{ color: RITTLER.pink }} />
          <span className="text-[13px] font-medium" style={{ color: RITTLER.black }}>
            Projekt für „{wort}" anlegen
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 border-t" style={{ borderColor: RITTLER.line }}>
      {treffer.slice(0, 3).map((p) => {
        const kurz = kuerzeTitel(p.clientName, p.title);
        return (
          <button
            key={p.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onWaehlen(p)}
            className="w-full text-left px-2.5 py-2 flex items-center gap-2"
          >
            <span className="text-[11px] font-bold uppercase shrink-0" style={{ color: RITTLER.textSecondary }}>
              {p.kuerzelAnzeige}
            </span>
            <span className="flex-1 min-w-0 text-[13px] truncate" style={{ color: RITTLER.black }}>
              {p.clientName ? `${p.clientName} · ${kurz}` : kurz}
            </span>
          </button>
        );
      })}
    </div>
  );
}