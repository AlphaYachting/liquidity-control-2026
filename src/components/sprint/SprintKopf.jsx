import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import KennzahlFeld from '@/components/sprint/KennzahlFeld';
import { RITTLER, STATUS_COLORS, SPRINT_SIZES, fmtDate, fmtEUR, todayIso } from '@/components/sprint/sprintConfig';

const daysUntil = (iso) => (iso ? Math.ceil((new Date(iso) - new Date(todayIso())) / 86400000) : null);
const shortDate = (d) => (d ? fmtDate(d).slice(0, 6) : '—');

// W1 — Kopf und Fortschritt in einer Karte; der Sprint ist die Überschrift.
export default function SprintKopf({ sprint, project, client, milestones, bookedHours = 0, plannedFocusUsed = 0 }) {
  const released = milestones.filter((m) => m.state === 'freigegeben');
  const invoiced = released.reduce((s, m) => s + (m.milestone_amount || 0), 0);
  const restDays = daysUntil(sprint.delivery_date);

  // Nächste Frist: früheste noch offene Plan-Übergabe oder Plan-Freeze
  const deadlines = milestones
    .filter((m) => m.state !== 'freigegeben')
    .flatMap((m) => [
      m.handover_date ? null : { date: m.planned_handover, label: 'Übergabe', m },
      { date: m.feedback_deadline || m.planned_freeze, label: 'Freeze', m },
    ])
    .filter((d) => d && d.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = deadlines[0];
  const nextDays = next ? daysUntil(next.date) : null;

  const targetHours = sprint.target_hours || 0;
  const overrun = targetHours > 0 && bookedHours > targetHours * 0.7 && released.length < milestones.length / 2;

  return (
    <div className="bg-white rounded-lg border border-[#e0e0e0] p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 text-[13px]" style={{ color: RITTLER.textSecondary }}>
          <Link to="/sprint/projekte" className="hover:text-[#2d2d2d]"><ArrowLeft className="w-4 h-4" /></Link>
          <span className="uppercase">{client?.name || 'Kunde'}</span>
          <span>·</span>
          <span className="uppercase">{project?.title || 'Projekt'}</span>
        </div>
        {/* Platz für den Timer — auf allen Seiten an derselben Stelle */}
        <div className="hidden lg:block w-[160px] h-[56px] shrink-0" aria-hidden="true" />
      </div>

      <h1 className="text-[28px] leading-tight font-extrabold uppercase tracking-tight mt-2" style={{ color: RITTLER.black }}>
        {sprint.title || `Sprint ${sprint.size}`}
      </h1>
      <p className="text-sm" style={{ color: RITTLER.textSecondary }}>
        {sprint.size} · {SPRINT_SIZES[sprint.size]?.subtitle} · {sprint.status}
      </p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[1px]" style={{ color: RITTLER.textSecondary }}>Etappen</span>
          <div className="flex gap-1">
            {milestones.map((m) => {
              const done = m.state === 'freigegeben';
              const running = !done && m.state !== 'input';
              return (
                <div
                  key={m.id}
                  title={m.title}
                  className="w-16 h-3 rounded-[2px]"
                  style={{
                    backgroundColor: done ? STATUS_COLORS.done : RITTLER.white,
                    border: done ? undefined : running ? `2px solid ${RITTLER.pink}` : `1px solid ${RITTLER.line}`,
                  }}
                />
              );
            })}
          </div>
        </div>
        <div>
          <p className="text-[15px] font-bold" style={{ color: RITTLER.black }}>
            {released.length} von {milestones.length} abgeschlossen
          </p>
          <p className="text-[15px] font-bold" style={{ color: invoiced > 0 ? STATUS_COLORS.doneText : RITTLER.black }}>
            {fmtEUR(invoiced)} von {fmtEUR(sprint.sprint_amount)} fakturiert
          </p>
        </div>
      </div>

      <div className="flex flex-wrap mt-5 border rounded-md divide-x" style={{ borderColor: RITTLER.line, borderRightColor: RITTLER.line }}>
        <KennzahlFeld
          label="Lieferung"
          value={fmtDate(sprint.delivery_date)}
          hint={restDays === null ? '—' : restDays >= 0 ? `in ${restDays} Tagen` : `seit ${-restDays} Tagen offen`}
          hintColor={restDays !== null && restDays < 7 ? STATUS_COLORS.critical : undefined}
        />
        <KennzahlFeld
          label="Nächste Frist"
          value={next ? `${next.label} ${shortDate(next.date)}` : '—'}
          valueColor={nextDays !== null && nextDays < 0 ? STATUS_COLORS.critical : undefined}
          hint={nextDays === null ? '' : nextDays >= 0 ? `in ${nextDays} Tagen` : `${-nextDays} Tage überschritten`}
          tooltip={next ? next.m.title : undefined}
        />
        <KennzahlFeld
          label="Zeit"
          value={`${Math.round(bookedHours)} h von ${targetHours} h`}
          valueColor={overrun ? STATUS_COLORS.attention : undefined}
          hint={overrun ? 'Überzugsrisiko' : 'Indikator'}
          hintColor={overrun ? STATUS_COLORS.attention : undefined}
          tooltip="Gebuchte Stunden auf dieses Projekt im Sprintzeitraum, verglichen mit der Kalkulation aus den gewählten Modulen. Dient nur der Nachkalkulation, nicht der Abrechnung."
        />
        <KennzahlFeld
          label="Focus-Tage"
          value={`${plannedFocusUsed} von ${sprint.planned_focus_days || 0}`}
          hint="verplant"
        />
      </div>
    </div>
  );
}