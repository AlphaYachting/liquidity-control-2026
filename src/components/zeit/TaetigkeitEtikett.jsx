import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { TAETIGKEITEN, TAETIGKEIT_LABEL, TAETIGKEIT_FARBE, merkeTaetigkeit } from '@/lib/zeit/taetigkeit';

// Die Tätigkeit als Etikett. Ein Klick öffnet drei Knöpfe, ein Klick ändert und schließt.
export default function TaetigkeitEtikett({ eintrag, onGeaendert }) {
  const [offen, setOffen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wert = TAETIGKEITEN.includes(eintrag.taetigkeit) ? eintrag.taetigkeit : 'umsetzung';

  const waehlen = async (k) => {
    setOffen(false);
    if (k === eintrag.taetigkeit) return;
    setBusy(true);
    await base44.entities.TimeEntry.update(eintrag.id, { taetigkeit: k });
    merkeTaetigkeit(k);
    setBusy(false);
    onGeaendert?.();
  };

  if (offen) {
    return (
      <span className="inline-flex items-center gap-1">
        {TAETIGKEITEN.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => waehlen(k)}
            className="h-6 px-2 rounded text-[11px] font-semibold border"
            style={{
              borderColor: k === wert ? RITTLER.black : RITTLER.line,
              backgroundColor: k === wert ? RITTLER.black : 'transparent',
              color: k === wert ? RITTLER.white : RITTLER.textSecondary,
            }}
          >
            {TAETIGKEIT_LABEL[k]}
          </button>
        ))}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => setOffen(true)}
      className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[2px] border disabled:opacity-50"
      style={{ borderColor: RITTLER.line, color: TAETIGKEIT_FARBE[wert] }}
    >
      {TAETIGKEIT_LABEL[wert]}
    </button>
  );
}