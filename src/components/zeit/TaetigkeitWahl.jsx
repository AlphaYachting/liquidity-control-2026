import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { TAETIGKEITEN, TAETIGKEIT_LABEL } from '@/lib/zeit/taetigkeit';

// Drei Knöpfe. Ohne Wahl greift die Vorbelegung — niemand muss hier etwas tun.
export default function TaetigkeitWahl({ wert, onWaehlen }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-3">
      <span className="text-[11px] font-bold uppercase tracking-wide mr-1" style={{ color: RITTLER.textSecondary }}>
        Tätigkeit
      </span>
      {TAETIGKEITEN.map((k) => {
        const aktiv = wert === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onWaehlen(aktiv ? '' : k)}
            className="h-7 px-2.5 rounded text-xs font-semibold border"
            style={{
              borderColor: aktiv ? RITTLER.black : RITTLER.line,
              backgroundColor: aktiv ? RITTLER.black : 'transparent',
              color: aktiv ? RITTLER.white : RITTLER.textSecondary,
            }}
          >
            {TAETIGKEIT_LABEL[k]}
          </button>
        );
      })}
    </div>
  );
}