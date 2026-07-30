import React from 'react';
import { Link } from 'react-router-dom';
import Ampelpunkt from '@/components/sprint/Ampelpunkt';
import PersonenStapel from '@/components/sprint/PersonenStapel';
import { RITTLER, STATUS_COLORS, STATE_LABELS, fmtEUR, fmtDate, SPRINT_SIZES } from '@/components/sprint/sprintConfig';

const AMPEL_COLOR = { plan: 'transparent', attention: STATUS_COLORS.attention, action: STATUS_COLORS.critical };
const AMPEL_SHAPE = { plan: 'plan', attention: 'attention', action: 'critical' };

// X4 Block 3 — Projektzeile: Kunde ist die Überschrift, alle Werte aus sprintStatus.
export default function ProjektZeile({ sprint, project, client, milestones, status, people, currentUserEmail }) {
  const fristFarbe = status.urgency <= 2 ? AMPEL_COLOR[status.ampel] : RITTLER.black;

  return (
    <Link
      to={`/sprint/sprints/${sprint.id}`}
      title={status.ampelGrund}
      aria-label={`${client?.name || 'Kunde'} — ${status.ampelGrund}`}
      className="block hover:bg-[#fafafa] border-b border-[#eeeeee] last:border-0"
      style={{ borderLeft: `3px solid ${AMPEL_COLOR[status.ampel]}` }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Ampelpunkt status={AMPEL_SHAPE[status.ampel]} />

        <div className="flex-1 min-w-0">
          <p className="text-base font-bold uppercase truncate" style={{ color: RITTLER.black }}>
            {client?.name || 'Kunde'}
          </p>
          <p className="text-[13px] truncate" style={{ color: RITTLER.textSecondary }}>
            {project?.title || 'Projekt'} · {sprint.title || `Sprint ${sprint.size}`} · {SPRINT_SIZES[sprint.size]?.label || sprint.size}
          </p>
        </div>

        <div className="hidden md:block w-[72px] shrink-0">
          <PersonenStapel members={people} currentUserEmail={currentUserEmail} />
        </div>

        <div className="hidden sm:block w-[110px] shrink-0">
          <div className="flex gap-1">
            {milestones.map((m) => {
              const done = m.state === 'freigegeben';
              const running = !done && m.state !== 'input';
              return (
                <div
                  key={m.id}
                  className="flex-1 h-3 rounded-[2px]"
                  title={m.title}
                  style={{
                    backgroundColor: done ? STATUS_COLORS.done : RITTLER.white,
                    border: done ? undefined : running ? `2px solid ${RITTLER.pink}` : `1px solid ${RITTLER.line}`,
                  }}
                />
              );
            })}
          </div>
          <p className="text-[13px] mt-1" style={{ color: RITTLER.textSecondary }}>
            {status.releasedCount} von {status.milestoneCount}
          </p>
        </div>

        <div className="w-[160px] shrink-0 text-right">
          <p className="text-[15px] font-semibold" style={{ color: fristFarbe }}>
            {status.nextDeadline
              ? `${status.nextDeadline.label} ${status.nextDeadline.tageRest >= 0 ? `in ${status.nextDeadline.tageRest} Tagen` : `${-status.nextDeadline.tageRest} Tage über`}`
              : `Lieferung ${fmtDate(sprint.delivery_date)}`}
          </p>
          <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>
            {status.activeMilestone ? STATE_LABELS[status.activeMilestone.state] : 'Abgeschlossen'}
            {status.multipleActive ? ' · 2 parallel' : ''}
          </p>
        </div>

        <div className="hidden lg:block w-[150px] shrink-0 text-right">
          <p className="text-[15px] font-bold" style={{ color: status.invoicedAmount > 0 ? STATUS_COLORS.doneText : RITTLER.black }}>
            {fmtEUR(status.invoicedAmount)} von {fmtEUR(status.sprintAmount)}
          </p>
        </div>
      </div>
    </Link>
  );
}