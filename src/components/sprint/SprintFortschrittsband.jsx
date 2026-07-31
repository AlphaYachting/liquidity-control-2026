import React from 'react';
import { RITTLER, STATUS_COLORS, fmtEUR } from '@/components/sprint/sprintConfig';

// K8 — Fortschrittsband: erledigte Arbeit unmittelbar mit Wertschöpfung verbunden.
export default function SprintFortschrittsband({ sprint, milestones }) {
  const total = milestones.length;
  const released = milestones.filter((m) => m.state === 'freigegeben');
  const allDone = total > 0 && released.length === total;
  const releasedAmount = released.reduce((sum, m) => sum + (m.milestone_amount || 0), 0);

  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <div className="flex gap-[2px]">
        {milestones.map((m) => {
          const done = m.state === 'freigegeben';
          const running = !done && m.state !== 'input';
          return (
            <div
              key={m.id}
              title={m.title}
              className="flex-1 h-3 rounded-sm"
              style={{
                backgroundColor: done ? STATUS_COLORS.done : running ? RITTLER.white : RITTLER.line,
                border: running ? `2px solid ${RITTLER.pink}` : undefined,
              }}
            />
          );
        })}
        {total === 0 && <div className="flex-1 h-3 rounded-sm" style={{ backgroundColor: RITTLER.line }} />}
      </div>
      <p className="text-base font-bold mt-3" style={{ color: RITTLER.black }}>
        {allDone ? 'Sprint abgeschlossen' : `${released.length} von ${total} Etappen abgeschlossen`}
      </p>
      <p className="text-base font-bold" style={{ color: STATUS_COLORS.doneText }}>
        {fmtEUR(releasedAmount)} von {fmtEUR(sprint.sprint_amount)} freigegeben
      </p>
    </div>
  );
}