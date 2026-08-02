import React, { useState } from 'react';
import { Square } from 'lucide-react';
import { RITTLER } from '@/components/sprint/sprintConfig';

// Schmale Karte bei laufendem Timer: Projekt, laufende Zeit, STOPPEN. Nichts weiter.
export default function TimerKarte({ timer, label, userEmail, onStop }) {
  const [busy, setBusy] = useState(false);

  const stoppen = async () => {
    setBusy(true);
    await onStop(userEmail);
    setBusy(false);
  };

  return (
    <div className="p-5">
      <p className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: RITTLER.textSecondary }}>
        Läuft
      </p>
      <p className="text-[15px] font-bold mt-1" style={{ color: RITTLER.black }}>{timer.project_title}</p>
      <p className="text-[32px] font-bold leading-none mt-3 tabular-nums" style={{ color: RITTLER.black }}>
        {label}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={stoppen}
        className="mt-5 w-full h-11 rounded flex items-center justify-center gap-2 text-white text-sm font-bold uppercase tracking-wide disabled:opacity-60"
        style={{ backgroundColor: RITTLER.pink }}
      >
        <Square className="w-4 h-4" /> Stoppen
      </button>
    </div>
  );
}