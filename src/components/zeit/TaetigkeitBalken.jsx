import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { dauerText } from '@/lib/zeit/tagesAuswertung';
import { TAETIGKEITEN, TAETIGKEIT_LABEL, TAETIGKEIT_FARBE, summeNachTaetigkeit } from '@/lib/zeit/taetigkeit';

// Ein schmaler dreigeteilter Balken mit Legende — Beratung, Vertrieb, Umsetzung.
export default function TaetigkeitBalken({ eintraege = [], titel = 'Tätigkeit' }) {
  const s = summeNachTaetigkeit(eintraege);
  if (!s.gesamt) return null;

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: RITTLER.textSecondary }}>
        {titel}
      </p>
      <div className="flex h-2 rounded-full overflow-hidden" style={{ backgroundColor: RITTLER.surface }}>
        {TAETIGKEITEN.map((k) => s[k] > 0 && (
          <div key={k} style={{ width: `${(s[k] / s.gesamt) * 100}%`, backgroundColor: TAETIGKEIT_FARBE[k] }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {TAETIGKEITEN.map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-xs" style={{ color: RITTLER.textSecondary }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TAETIGKEIT_FARBE[k] }} />
            {TAETIGKEIT_LABEL[k]}
            <span className="font-semibold tabular-nums" style={{ color: RITTLER.black }}>{dauerText(s[k])}</span>
            <span className="tabular-nums">({Math.round((s[k] / s.gesamt) * 100)} %)</span>
          </span>
        ))}
      </div>
    </div>
  );
}