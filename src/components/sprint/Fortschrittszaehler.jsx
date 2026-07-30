import React from 'react';
import { Check } from 'lucide-react';
import { RITTLER } from '@/components/sprint/sprintConfig';

// K6 — Fortschritt steht über Fristen: Stückzahl, nie Prozent.
export default function Fortschrittszaehler({ done = 0, total = 0, goalLabel = '', className = '' }) {
  const rest = Math.max(total - done, 0);
  const pct = total > 0 ? (done / total) * 100 : 0;

  let label;
  if (total === 0) label = 'Keine Aufgaben';
  else if (rest === 0) label = 'geschafft';
  else if (rest <= 3) label = `noch ${rest} ${goalLabel}`.trim();
  else label = `${done} von ${total} erledigt`;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex-1 h-1.5 rounded-[3px] overflow-hidden" style={{ backgroundColor: RITTLER.line }}>
        <div className="h-full rounded-[3px]" style={{ width: `${pct}%`, backgroundColor: RITTLER.black }} />
      </div>
      <span className="text-sm font-semibold flex items-center gap-1 whitespace-nowrap" style={{ color: RITTLER.black }}>
        {total > 0 && rest === 0 && <Check className="w-4 h-4" strokeWidth={3} />}
        {label}
      </span>
    </div>
  );
}