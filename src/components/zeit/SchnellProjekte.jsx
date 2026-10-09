import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { useProjektSuche } from '@/lib/zeit/useProjektSuche';

// Die drei Projekte, auf die zuletzt am häufigsten gebucht wurde — ein Klick startet.
export default function SchnellProjekte({ email, onStart, onTippzeile }) {
  const { suche } = useProjektSuche(email);
  const [busy, setBusy] = useState('');
  const top = suche('').slice(0, 3);

  const starten = async (p) => {
    setBusy(p.id);
    await onStart(p, p.kuerzelAnzeige, '', { force: true });
    setBusy('');
  };

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: RITTLER.textSecondary }}>
        Timer starten
      </p>

      <div className="mt-3 space-y-2">
        {top.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={!!busy}
            onClick={() => starten(p)}
            className="w-full h-12 px-3 rounded border-[1.5px] flex items-center gap-3 text-left disabled:opacity-60"
            style={{ borderColor: RITTLER.line }}
          >
            <Play className="w-4 h-4 shrink-0" style={{ color: RITTLER.pink }} />
            <span className="text-[11px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
              style={{ backgroundColor: RITTLER.surface, color: RITTLER.textSecondary }}>
              {p.kuerzelAnzeige}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold truncate" style={{ color: RITTLER.black }}>{p.title}</span>
              {p.clientName && (
                <span className="block text-xs truncate" style={{ color: RITTLER.textSecondary }}>{p.clientName}</span>
              )}
            </span>
          </button>
        ))}

        <button
          type="button"
          onClick={onTippzeile}
          className="w-full h-11 rounded border-[1.5px] text-sm font-bold uppercase tracking-wide"
          style={{ borderColor: RITTLER.black, color: RITTLER.black }}
        >
          anderes Projekt …
        </button>
      </div>

      <button
        type="button"
        onClick={onTippzeile}
        className="mt-4 text-xs underline"
        style={{ color: RITTLER.textSecondary }}
      >
        Vergessen zu starten? Zeit nachtragen
      </button>
    </div>
  );
}