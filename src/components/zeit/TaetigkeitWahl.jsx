import React, { useState } from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { TAETIGKEITEN, TAETIGKEIT_LABEL } from '@/lib/zeit/taetigkeit';

// Kein Knopfblock: ein kleines Etikett, das sich auf Klick öffnet und wieder schließt.
export default function TaetigkeitWahl({ wert, onWaehlen }) {
  const [offen, setOffen] = useState(false);
  const gewaehlt = TAETIGKEITEN.includes(wert) ? wert : 'umsetzung';

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOffen((o) => !o)}
        className="text-[11.5px] underline decoration-dotted"
        style={{ color: RITTLER.textSecondary }}
      >
        Tätigkeit: {TAETIGKEIT_LABEL[gewaehlt]}
      </button>
      {offen && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {TAETIGKEITEN.map((k) => {
            const aktiv = gewaehlt === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => { onWaehlen(k); setOffen(false); }}
                className="h-7 px-2.5 rounded text-xs font-semibold border"
                style={{
                  borderColor: aktiv ? RITTLER.pink : RITTLER.line,
                  backgroundColor: aktiv ? 'hsl(var(--primary) / 0.08)' : 'transparent',
                  color: aktiv ? RITTLER.pink : RITTLER.textSecondary,
                }}
              >
                {TAETIGKEIT_LABEL[k]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}