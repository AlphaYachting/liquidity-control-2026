import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';

// Fünf Zeilen: Beschriftung, Zahl, Wort, Vergleich, Balken. Keine Rahmen, keine Flächen.
export default function ZahlSpalte({ daten }) {
  const breite = daten.anteil === null ? 0 : Math.min(100, Math.max(3, Math.round(daten.anteil * 100)));
  return (
    <div className="min-w-0">
      <p
        className="text-[9px] font-bold uppercase"
        style={{ letterSpacing: '1.4px', color: RITTLER.textSecondary }}
      >
        {daten.beschriftung}
      </p>
      <p className="text-[21px] font-bold leading-tight tabular-nums truncate" style={{ color: RITTLER.black }}>
        {daten.zahl}
      </p>
      <p className="text-[11.5px] font-semibold h-4" style={{ color: daten.farbe || 'transparent' }}>
        {daten.wort || ''}
      </p>
      <p className="text-[11.5px] truncate" style={{ color: RITTLER.textSecondary }}>
        {daten.vergleich}
      </p>
      <div className="mt-1.5 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: RITTLER.surface }}>
        {breite > 0 && (
          <div className="h-full rounded-full" style={{ width: `${breite}%`, backgroundColor: daten.farbe || RITTLER.textSecondary }} />
        )}
      </div>
    </div>
  );
}