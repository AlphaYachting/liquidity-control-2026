import React from 'react';
import { Plus } from 'lucide-react';
import { RITTLER } from '@/components/sprint/sprintConfig';

// Höchstens vier Projekte, danach der Ausweg: Projekt hier anlegen.
export default function TrefferListe({ treffer, aktiv, wort, onWaehlen, onAnlegen }) {
  return (
    <div className="mt-2 border-t" style={{ borderColor: RITTLER.line }}>
      {treffer.map((p, i) => (
        <button
          key={p.id}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onWaehlen(p)}
          className={`w-full text-left px-2.5 py-2 flex items-center gap-2 ${i === aktiv ? 'bg-muted' : ''}`}
        >
          <span
            className="text-[11px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
            style={{ backgroundColor: RITTLER.surface, color: RITTLER.textSecondary }}
          >
            {p.kuerzelAnzeige}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium truncate" style={{ color: RITTLER.black }}>{p.title}</span>
            {p.clientName && (
              <span className="block text-xs truncate" style={{ color: RITTLER.textSecondary }}>{p.clientName}</span>
            )}
          </span>
          {p.status === 'pausiert' && (
            <span className="text-[11px] font-bold uppercase shrink-0" style={{ color: RITTLER.textSecondary }}>pausiert</span>
          )}
        </button>
      ))}

      {wort && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onAnlegen}
          className={`w-full text-left px-2.5 py-2 flex items-center gap-2 ${aktiv === treffer.length ? 'bg-muted' : ''}`}
        >
          <Plus className="w-4 h-4 shrink-0" style={{ color: RITTLER.pink }} />
          <span className="text-sm font-medium" style={{ color: RITTLER.black }}>
            Support-Projekt für „{wort}" anlegen
          </span>
        </button>
      )}
    </div>
  );
}