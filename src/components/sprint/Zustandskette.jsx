import React from 'react';
import { Check, Lock } from 'lucide-react';
import { MILESTONE_STATES, STATE_LABELS_SHORT, RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

// K2 — Zustandskette. Erledigt schwarz mit Häkchen, aktuell pink (Achse A: Fokus),
// kommend hellgrau, freigegeben grün mit Schloss — Grün erscheint genau einmal.
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

        let dot = { size: 'w-[10px] h-[10px]', bg: RITTLER.line, border: RITTLER.line, ring: false };
        if (done) dot = { size: 'w-[14px] h-[14px]', bg: RITTLER.black, border: RITTLER.black };
        if (current && !released) dot = { size: 'w-[14px] h-[14px]', bg: RITTLER.pink, border: RITTLER.pink, ring: true };
        if (isFinal && released) dot = { size: 'w-[14px] h-[14px]', bg: STATUS_COLORS.done, border: STATUS_COLORS.done };

        let labelColor = RITTLER.textSecondary;
        if (current && !released) labelColor = RITTLER.black;
        if (isFinal && released) labelColor = STATUS_COLORS.doneText;

        return (
          <React.Fragment key={s}>
            {idx > 0 && (
              <div
                className="h-[2px] flex-1 min-w-[16px] mt-[11px]"
                style={{ backgroundColor: idx <= currentIdx ? RITTLER.black : RITTLER.line }}
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
                  className={`${dot.size} rounded-full flex items-center justify-center ${clickable ? 'cursor-pointer' : 'cursor-default'} focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`}
                  style={{
                    backgroundColor: dot.bg,
                    border: `1.5px solid ${dot.border}`,
                    boxShadow: dot.ring ? `0 0 0 2px #ffffff, 0 0 0 4px ${RITTLER.pink}33` : undefined,
                  }}
                >
                  {done && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  {isFinal && released && <Lock className="w-2 h-2 text-white" strokeWidth={3} />}
                </button>
              </div>
              {!compact && (
                <span
                  className={`text-[10px] uppercase tracking-wide ${current || (isFinal && released) ? 'font-bold' : 'font-semibold'}`}
                  style={{ color: labelColor }}
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