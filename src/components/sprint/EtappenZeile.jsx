import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Check } from 'lucide-react';
import MiniZustandskette from '@/components/sprint/MiniZustandskette';
import PersonenStapel from '@/components/sprint/PersonenStapel';
import { RITTLER, STATUS_COLORS, fmtDate, fmtEUR } from '@/components/sprint/sprintConfig';

const shortDate = (d) => (d ? fmtDate(d).slice(0, 6) : '—');

// W3 — Etappenzeile mit festen Spalten; laufende Etappe pink, freigegebene grün getönt.
export default function EtappenZeile({ milestone: m, tickets, people, currentUserEmail }) {
  const done = tickets.filter((t) => t.status === 'erledigt').length;
  const total = tickets.length;
  const released = m.state === 'freigegeben';
  const running = !released && m.state !== 'input';
  const pct = total > 0 ? (done / total) * 100 : 0;

  let counter = `${total} ${total === 1 ? 'Aufgabe' : 'Aufgaben'}`;
  if (done > 0 && done < total) counter = `${done} von ${total} erledigt`;

  return (
    <Link
      to={`/sprint/milestones/${m.id}`}
      className="block hover:bg-[#fafafa] border-b border-[#eeeeee] last:border-0"
      style={{
        borderLeft: `3px solid ${released ? STATUS_COLORS.doneText : running ? RITTLER.pink : 'transparent'}`,
        backgroundColor: released ? STATUS_COLORS.doneSurface : undefined,
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="w-7 text-[15px] font-bold shrink-0" style={{ color: RITTLER.pink }}>{m.order}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base truncate" style={{ color: RITTLER.black, fontWeight: 600 }}>{m.title}</span>
            {m.is_final_milestone && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-[2px]" style={{ color: RITTLER.black, backgroundColor: RITTLER.surface }}>
                Letzte Etappe
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-[15px] font-bold" style={{ color: released ? STATUS_COLORS.doneText : RITTLER.black }}>
              {fmtEUR(m.milestone_amount)}{released ? ' freigegeben' : ''}
            </span>
            <span className="text-[13px]" style={{ color: RITTLER.textSecondary }}>
              Übergabe {shortDate(m.handover_date || m.planned_handover)} · Freeze {shortDate(m.feedback_deadline || m.planned_freeze)}
            </span>
          </div>
          {m.is_final_milestone && (
            <p className="text-xs mt-0.5" style={{ color: RITTLER.textSecondary }}>Feedbackschluss des Projekts</p>
          )}
        </div>

        <div className="hidden md:block w-[72px] shrink-0">
          <PersonenStapel members={people} currentUserEmail={currentUserEmail} />
        </div>

        <div className="hidden lg:block w-[120px] h-1.5 rounded-[2px] shrink-0" style={{ backgroundColor: RITTLER.line }}>
          <div className="h-full rounded-[2px]" style={{ width: `${pct}%`, backgroundColor: RITTLER.black }} />
        </div>

        <span className="hidden sm:flex w-[110px] shrink-0 justify-end items-center gap-1 text-sm" style={{ color: RITTLER.black }}>
          {total > 0 && done === total ? <>{done} von {total} · <Check className="w-3.5 h-3.5" strokeWidth={3} /></> : counter}
        </span>

        <div className="hidden xl:block w-[190px] shrink-0">
          <MiniZustandskette state={m.state} />
        </div>

        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: RITTLER.textSecondary }} />
      </div>
    </Link>
  );
}