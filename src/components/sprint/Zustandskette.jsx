import React from 'react';
import { MILESTONE_STATES, STATE_LABELS_SHORT } from '@/components/sprint/sprintConfig';

// K2 — Zustandskette: fünf Milestone-Zustände als waagrechte Kette.
// Erledigte Schritte pink gefüllt, aktueller pink umrandet mit Punkt, kommende grau.
export default function Zustandskette({ state, compact = false, onSelect }) {
  const currentIdx = MILESTONE_STATES.indexOf(state);

  return (
    <div className="flex items-start">
      {MILESTONE_STATES.map((s, idx) => {
        const done = idx < currentIdx || state === 'freigegeben';
        const current = idx === currentIdx && state !== 'freigegeben';
        return (
          <React.Fragment key={s}>
            {idx > 0 && (
              <div
                className="h-[2px] flex-1 min-w-[16px] mt-[9px]"
                style={{ backgroundColor: idx <= currentIdx ? '#ff3764' : '#e5e5e5' }}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                role={onSelect ? 'button' : undefined}
                onClick={onSelect && Math.abs(idx - currentIdx) === 1 && idx <= 3 ? () => onSelect(s) : undefined}
                className={`w-5 h-5 rounded-full flex items-center justify-center border-2 ${
                  onSelect && Math.abs(idx - currentIdx) === 1 && idx <= 3 ? 'cursor-pointer hover:scale-110 transition-transform' : ''
                }`}
                style={{
                  borderColor: done || current ? '#ff3764' : '#e5e5e5',
                  backgroundColor: done ? '#ff3764' : '#ffffff',
                }}
              >
                {current && <div className="w-2 h-2 rounded-full bg-[#ff3764]" />}
              </div>
              {!compact && (
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: done || current ? '#2d2d2d' : '#999999' }}
                >
                  {STATE_LABELS_SHORT[s]}
                </span>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}