import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';

// Höchstens vier Kennzahlen unter dem Untertitel.
export default function KundenKarte({ card }) {
  if (!card?.length) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11.5px]">
      {card.slice(0, 4).map((k) => (
        <span key={k.label} style={{ color: RITTLER.textSecondary }}>
          {k.label}{' '}
          <span className="font-semibold" style={{ color: k.tone === 'warn' ? RITTLER.pink : RITTLER.black }}>
            {k.value}
          </span>
        </span>
      ))}
    </div>
  );
}