import React from 'react';
import ProjektKopfTitel from '@/components/sprint/projekt/ProjektKopfTitel';
import KopfKennzahl, { KopfKennzahlLeiste } from '@/components/sprint/KopfKennzahl';
import { STATUS_COLORS, SPRINT_SIZES, fmtDate, fmtEUR } from '@/components/sprint/sprintConfig';

const shortDate = (d) => (d ? fmtDate(d).slice(0, 6) : '—');

// Projektkopf eines Sprintprojekts: Titelblock mit Verwaltung rechts, darunter eine Kennzahlenleiste.
// Alle abgeleiteten Werte kommen aus sprintStatus (X1).
export default function SprintKopf({ sprint, project, client, milestones, status, pm, aktionen }) {
  const restDays = status.daysToDelivery;
  const next = status.nextDeadline;
  const overrun = status.ampel === 'attention' && status.hoursTarget > 0 && status.hoursBooked > 0.7 * status.hoursTarget;
  const fristUeber = !!next && next.tageRest < 0;
  const lieferKnapp = restDays !== null && restDays < 7;

  const unterzeile = [
    client?.name || 'Kunde',
    `Sprint ${SPRINT_SIZES[sprint.size]?.label || sprint.size}`,
    sprint.status,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <ProjektKopfTitel project={project} unterzeile={unterzeile} person={pm} />
        {aktionen}
      </div>

      <KopfKennzahlLeiste>
        <KopfKennzahl
          label="Lieferung"
          value={fmtDate(sprint.delivery_date)}
          hint={restDays === null ? '—' : restDays >= 0 ? `in ${restDays} Tagen` : `seit ${-restDays} Tagen offen`}
          hintFarbe={lieferKnapp ? STATUS_COLORS.critical : undefined}
        />
        <KopfKennzahl
          label="Nächste Frist"
          value={next ? `${next.label} ${shortDate(next.datum)}` : '—'}
          farbe={fristUeber ? STATUS_COLORS.critical : undefined}
          hint={!next ? '' : next.tageRest >= 0 ? `in ${next.tageRest} Tagen` : `${-next.tageRest} Tage überschritten`}
          tooltip={next ? milestones.find((m) => m.id === next.milestoneId)?.title : undefined}
        />
        <KopfKennzahl
          breit
          label="Freigegeben"
          value={fmtEUR(status.releasedAmount)}
          von={`von ${fmtEUR(status.sprintAmount)}`}
          farbe={status.releasedAmount > 0 ? STATUS_COLORS.doneText : undefined}
          hint={`${status.releasedCount} von ${status.milestoneCount} Etappen`}
        >
          <div className="flex gap-[3px] py-1" aria-hidden="true">
            {milestones.map((m) => {
              const done = m.state === 'freigegeben';
              const running = !done && m.state !== 'input';
              return (
                <span
                  key={m.id}
                  title={m.title}
                  className="h-1.5 flex-1 rounded-sm"
                  style={{ backgroundColor: done ? STATUS_COLORS.done : running ? '#9A9A9A' : '#E6E6E6' }}
                />
              );
            })}
          </div>
        </KopfKennzahl>
        <KopfKennzahl
          label="Zeit"
          value={`${Math.round(status.hoursBooked)} h`}
          von={`von ${status.hoursTarget} h`}
          farbe={overrun ? STATUS_COLORS.attention : undefined}
          hint={overrun ? 'Überzugsrisiko' : 'Nachkalkulation'}
          tooltip="Gebuchte Stunden auf dieses Projekt im Sprintzeitraum, verglichen mit der Kalkulation aus den gewählten Modulen. Dient nur der Nachkalkulation, nicht der Abrechnung."
        />
        <KopfKennzahl
          label="Focus-Tage"
          value={`${status.focusDaysPlanned}`}
          von={`von ${status.focusDaysTotal}`}
          hint="verplant"
        />
      </KopfKennzahlLeiste>
    </>
  );
}
