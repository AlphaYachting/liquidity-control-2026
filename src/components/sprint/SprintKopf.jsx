import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import KennzahlFeld from '@/components/sprint/KennzahlFeld';
import TypPill from '@/components/sprint/TypPill';
import { RITTLER, STATUS_COLORS, SPRINT_SIZES, fmtDate, fmtEUR } from '@/components/sprint/sprintConfig';

const shortDate = (d) => (d ? fmtDate(d).slice(0, 6) : '—');

// W1/X2 — Kunde ist die Überschrift, Projekt und Sprint stehen darunter.
// Alle abgeleiteten Werte kommen aus sprintStatus (X1).
export default function SprintKopf({ sprint, project, client, milestones, status }) {
  const restDays = status.daysToDelivery;
  const next = status.nextDeadline;
  const overrun = status.ampel === 'attention' && status.hoursTarget > 0 && status.hoursBooked > 0.7 * status.hoursTarget;

  return (
    <div className="bg-white rounded-lg border border-border p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/sprint/projekte" className="hover:text-foreground" style={{ color: RITTLER.textSecondary }}>
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <TypPill project={project} />
          <div className="min-w-0">
            <h1 className="text-xl font-medium truncate" style={{ color: RITTLER.black }}>
              {project?.title || 'Projekt'}
            </h1>
            <p className="text-[13px] uppercase tracking-[0.5px] truncate" style={{ color: RITTLER.textSecondary }}>
              {client?.name || 'Kunde'} · {sprint.title || `Sprint ${sprint.size}`} · {SPRINT_SIZES[sprint.size]?.label || sprint.size} · {sprint.status}
            </p>
          </div>
        </div>
        {/* Platz für den Timer — auf allen Seiten an derselben Stelle */}
        <div className="hidden lg:block w-[160px] h-[56px] shrink-0" aria-hidden="true" />
      </div>

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
            {status.releasedCount} von {status.milestoneCount} abgeschlossen
          </p>
          <p className="text-[15px] font-bold" style={{ color: status.releasedAmount > 0 ? STATUS_COLORS.doneText : RITTLER.black }}>
            {fmtEUR(status.releasedAmount)} von {fmtEUR(status.sprintAmount)} freigegeben
          </p>
        </div>
      </div>

      <div className="flex flex-wrap mt-5 border rounded-md divide-x" style={{ borderColor: RITTLER.line }}>
        <KennzahlFeld
          label="Lieferung"
          value={fmtDate(sprint.delivery_date)}
          hint={restDays === null ? '—' : restDays >= 0 ? `in ${restDays} Tagen` : `seit ${-restDays} Tagen offen`}
          hintColor={restDays !== null && restDays < 7 ? STATUS_COLORS.critical : undefined}
        />
        <KennzahlFeld
          label="Nächste Frist"
          value={next ? `${next.label} ${shortDate(next.datum)}` : '—'}
          valueColor={next && next.tageRest < 0 ? STATUS_COLORS.critical : undefined}
          hint={!next ? '' : next.tageRest >= 0 ? `in ${next.tageRest} Tagen` : `${-next.tageRest} Tage überschritten`}
          tooltip={next ? milestones.find((m) => m.id === next.milestoneId)?.title : undefined}
        />
        <KennzahlFeld
          label="Zeit"
          value={`${Math.round(status.hoursBooked)} h von ${status.hoursTarget} h`}
          valueColor={overrun ? STATUS_COLORS.attention : undefined}
          hint={overrun ? 'Überzugsrisiko' : 'Indikator'}
          hintColor={overrun ? STATUS_COLORS.attention : undefined}
          tooltip="Gebuchte Stunden auf dieses Projekt im Sprintzeitraum, verglichen mit der Kalkulation aus den gewählten Modulen. Dient nur der Nachkalkulation, nicht der Abrechnung."
        />
        <KennzahlFeld
          label="Focus-Tage"
          value={`${status.focusDaysPlanned} von ${status.focusDaysTotal}`}
          hint="verplant"
        />
      </div>

      <p className="text-[13px] mt-3" style={{ color: RITTLER.textSecondary }}>{status.ampelGrund}</p>
    </div>
  );
}