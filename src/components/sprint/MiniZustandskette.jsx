import React from 'react';
import { MILESTONE_STATES, STATE_LABELS, RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

// W2 — Listenvariante: fünf Punkte ohne Beschriftung, daneben der Zustand als Wort.
// Die beschriftete Kette bleibt ausschließlich der Etappen-Detailansicht vorbehalten.
export default function MiniZustandskette({ state }) {
  const idx = MILESTONE_STATES.indexOf(state);
  const released = state === 'freigegeben';

  return (
    <div className="flex items-center gap-2" title={MILESTONE_STATES.map((s, i) => `${i <= idx ? '✓' : '·'} ${STATE_LABELS[s]}`).join('\n')}>
      <div className="flex items-center gap-1">
        {MILESTONE_STATES.map((s, i) => {
          const isCurrent = i === idx;
          const isLast = i === MILESTONE_STATES.length - 1;
          const size = isCurrent ? 10 : 8;
          let color = RITTLER.line;
          if (i < idx) color = RITTLER.black;
          if (isCurrent) color = released && isLast ? STATUS_COLORS.doneText : RITTLER.pink;
          return (
            <span
              key={s}
              className="rounded-full shrink-0"
              style={{
                width: size,
                height: size,
                backgroundColor: color,
                boxShadow: isCurrent && !released ? `0 0 0 1.5px ${RITTLER.pink}` : undefined,
              }}
            />
          );
        })}
      </div>
      <span className="text-sm whitespace-nowrap" style={{ color: RITTLER.black }}>{STATE_LABELS[state]}</span>
    </div>
  );
}