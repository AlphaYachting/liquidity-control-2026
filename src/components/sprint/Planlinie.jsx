import React from 'react';
import { RITTLER, fmtDate } from '@/components/sprint/sprintConfig';

const shortDate = (d) => (d ? fmtDate(d).slice(0, 6) : '—');

// U14 — Planlinie: dünn, ungefüllt, grau. Darf nie mit dem laufenden Countdown verwechselbar sein.
export default function Planlinie({ handover, freeze, delivery, className = '' }) {
  const marks = [
    { key: 'handover', date: handover, label: `Übergabe ${shortDate(handover)}`, pct: 33 },
    { key: 'freeze', date: freeze, label: `Freeze ${shortDate(freeze)}`, pct: 66 },
    { key: 'delivery', date: delivery, label: `Lieferung ${shortDate(delivery)}`, pct: 100 },
  ];

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <span className="text-[11px] uppercase tracking-[1px] mt-[-2px]" style={{ color: RITTLER.textSecondary }}>Plan</span>
      <div className="flex-1">
        <div className="relative h-[10px]">
          <div className="absolute top-[4px] left-0 right-0" style={{ height: 2, backgroundColor: RITTLER.line }} />
          {marks.map((m) => (
            <span
              key={m.key}
              className="absolute top-0 w-[2px] h-[10px]"
              style={{ left: `calc(${m.pct}% - 1px)`, backgroundColor: RITTLER.textSecondary }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1 text-[12px]" style={{ color: RITTLER.textSecondary }}>
          {marks.map((m) => <span key={m.key}>{m.label}</span>)}
        </div>
      </div>
    </div>
  );
}