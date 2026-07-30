import React from 'react';
import { Check, Lock } from 'lucide-react';
import { MILESTONE_STATES, STATE_LABELS_SHORT, RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

// K2 — Zustandskette. Erledigte Schritte wirken solider als kommende, nie blasser:
// schwarzer Punkt mit Häkchen, dickerer Verbinder, Label in vollem Schwarz.
export default function Zustandskette({ state, compact = false, onSelect }) {
  const currentIdx = MILESTONE_STATES.indexOf(state);
  const released = state === 'freigegeben';

  return (
    <div className="flex items-start">
      {MILESTONE_STATES.map((s, idx) => {
        const isFinal = s === 'freigegeben';
        const done = idx < currentIdx;
        const current = idx === currentIdx;
        const clickable = !!onSelect && Math.abs(idx - currentIdx) === 1 && idx <= 3 && currentIdx <= 3;
        const finalReleased = isFinal && released;

        let dot = { size: 10, bg: RITTLER.line, border: RITTLER.line, ring: false };
        if (done) dot = { size: 10, bg: RITTLER.black, border: RITTLER.black };
        if (current && !released) dot = { size: 14, bg: RITTLER.pink, border: RITTLER.pink, ring: true };
        if (finalReleased) dot = { size: 10, bg: STATUS_COLORS.doneText, border: STATUS_COLORS.doneText };

        let labelColor = RITTLER.textSecondary;
        if (done || current) labelColor = RITTLER.black;
        if (finalReleased) labelColor = STATUS_COLORS.doneText;

        return (
          <React.Fragment key={s}>
            {idx > 0 && (
              <div
                className="flex-1 min-w-[16px] mt-[11px]"
                style={{
                  height: idx <= currentIdx ? 3 : 2,
                  backgroundColor: idx <= currentIdx ? RITTLER.black : RITTLER.line,
                }}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div className="h-6 w-6 flex items-center justify-center">
                <button
                  type="button"
                  tabIndex={clickable ? 0 : -1}
                  aria-label={STATE_LABELS_SHORT[s]}
                  onClick={clickable ? () => onSelect(s) : undefined}
                  disabled={!clickable}
                  className={`rounded-full flex items-center justify-center ${clickable ? 'cursor-pointer' : 'cursor-default'} focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`}
                  style={{
                    width: dot.size,
                    height: dot.size,
                    backgroundColor: dot.bg,
                    border: `1.5px solid ${dot.border}`,
                    boxShadow: dot.ring ? `0 0 0 2px ${RITTLER.white}, 0 0 0 4px ${RITTLER.pink}` : undefined,
                  }}
                >
                  {done && <Check className="w-2 h-2 text-white" strokeWidth={4} />}
                  {finalReleased && <Check className="w-2 h-2 text-white" strokeWidth={4} />}
                </button>
              </div>
              {!compact && (
                <span
                  className={`text-[10px] uppercase tracking-wide flex items-center gap-0.5 ${current || finalReleased ? 'font-bold' : 'font-normal'}`}
                  style={{ color: labelColor }}
                >
                  {finalReleased && <Lock className="w-2.5 h-2.5" />}
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