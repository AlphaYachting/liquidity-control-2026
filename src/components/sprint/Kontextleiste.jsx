import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { RITTLER, STATUS_COLORS, fmtEUR, fmtDate, todayIso, SPRINT_SIZES } from '@/components/sprint/sprintConfig';

const daysUntil = (iso) => {
  if (!iso) return null;
  return Math.round((new Date(iso) - new Date(todayIso())) / 86400000);
};

// U10 — Projektkontext bleibt beim Scrollen stehen: Kunde, Projekt, Sprint,
// Etappenfortschritt, fakturierter Wert und Lieferfrist.
export default function Kontextleiste({ sprint, project, client, milestones, currentMilestoneId }) {
  const total = milestones.length;
  const released = milestones.filter((m) => m.state === 'freigegeben');
  const invoiced = released.reduce((s, m) => s + (m.milestone_amount || 0), 0);
  const currentIdx = milestones.findIndex((m) => m.id === currentMilestoneId);
  const rest = daysUntil(sprint?.delivery_date);
  const critical = rest !== null && rest < 7;

  return (
    <div className="sticky top-0 z-30 bg-white border-b" style={{ borderColor: RITTLER.line }}>
      <div className="max-w-[1200px] mx-auto px-4 py-3">
        <div className="flex items-center gap-2 text-[13px]">
          <Link to={`/sprint/sprints/${sprint?.id}`} className="text-[#6b6b6b] hover:text-[#2d2d2d]">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span style={{ color: RITTLER.textSecondary }}>{client?.name || '—'}</span>
          <span style={{ color: RITTLER.line }}>·</span>
          <span style={{ color: RITTLER.textSecondary }}>{project?.title || '—'}</span>
          <span style={{ color: RITTLER.line }}>·</span>
          <span className="font-bold uppercase" style={{ color: RITTLER.black }}>
            {sprint?.title || 'Sprint'} ({SPRINT_SIZES[sprint?.size]?.label || '—'})
          </span>
        </div>

        <div className="mt-2 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
          <div className="flex items-center gap-2 md:w-64">
            <span className="text-[11px] uppercase tracking-[1px]" style={{ color: RITTLER.textSecondary }}>Etappen</span>
            <div className="flex gap-[2px] flex-1">
              {milestones.map((m) => {
                const done = m.state === 'freigegeben';
                const running = !done && m.id === currentMilestoneId;
                return (
                  <div
                    key={m.id}
                    title={m.title}
                    className="flex-1 h-3 rounded-[2px]"
                    style={{
                      backgroundColor: done ? STATUS_COLORS.done : RITTLER.white,
                      border: done ? undefined : running ? `2px solid ${RITTLER.pink}` : `1px solid ${RITTLER.line}`,
                    }}
                  />
                );
              })}
              {total === 0 && <div className="flex-1 h-3 rounded-[2px]" style={{ border: `1px solid ${RITTLER.line}` }} />}
            </div>
          </div>

          <div className="md:flex-1">
            <p className="text-[15px] font-bold" style={{ color: RITTLER.black }}>
              Etappe {currentIdx >= 0 ? currentIdx + 1 : '—'} von {total}
            </p>
            <p className="text-[15px] font-bold hidden md:block" style={{ color: invoiced > 0 ? STATUS_COLORS.doneText : RITTLER.black }}>
              {fmtEUR(invoiced)} von {fmtEUR(sprint?.sprint_amount)} fakturiert
            </p>
          </div>

          <div className="hidden md:block text-right">
            <p className="text-[15px] font-semibold" style={{ color: critical ? STATUS_COLORS.critical : RITTLER.black }}>
              {rest === null ? 'Lieferung offen' : rest >= 0 ? `Lieferung in ${rest} Tagen` : `Lieferung seit ${-rest} Tagen offen`}
            </p>
            <p className="text-xs" style={{ color: RITTLER.textSecondary }}>{fmtDate(sprint?.delivery_date)}</p>
          </div>

          {/* Platz für den Timer (Teil 5) — wird später gefüllt */}
          <div className="hidden lg:block w-[160px] h-[56px] shrink-0" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}