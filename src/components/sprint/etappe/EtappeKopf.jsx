import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Zap } from 'lucide-react';
import KopfKennzahl, { KopfKennzahlLeiste } from '@/components/sprint/KopfKennzahl';
import PersonenStapel from '@/components/sprint/PersonenStapel';
import SprintTimerStart from '@/components/sprint/timer/SprintTimerStart';
import { initials, personColor } from '@/components/sprint/PersonenChip';
import { typeStyleOf } from '@/components/sprint/projectTypes';
import { STATUS_COLORS, SPRINT_SIZES, fmtDate, fmtEUR } from '@/components/sprint/sprintConfig';
import { etappeKennzahlen } from '@/lib/sprint/etappeKennzahlen';

// Kopf der Etappenseite — gleicher Aufbau wie der Projektkopf: Pfad zum Projekt,
// Titelblock mit Projektleitung und Beteiligten, Timer rechts, Kennzahlenleiste,
// darunter die Etappen als Reiter. `rechts` steht neben den Reitern (Projektintelligenz).
export default function EtappeKopf({
  milestone, siblings = [], sprint, project, client, tickets = [], members = [], me,
  darfBearbeiten, onBearbeiten, rechts,
}) {
  const k = etappeKennzahlen({ milestone, tickets });
  const reihe = [...siblings].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const nr = Math.max(1, reihe.findIndex((m) => m.id === milestone.id) + 1);
  const stil = typeStyleOf(project);

  const personVon = (email) => members.find((m) => m.email === email) || { email, name: email };
  const pm = project?.pm_email ? personVon(project.pm_email) : null;
  const beteiligte = [...new Set(tickets.map((t) => t.assignee_email).filter(Boolean))].map(personVon);
  const freigegeben = milestone.state === 'freigegeben';

  const pfad = [
    client?.name,
    sprint ? `Sprint ${SPRINT_SIZES[sprint.size]?.label || sprint.size || ''}`.trim() : null,
    sprint?.delivery_date ? `Lieferung ${fmtDate(sprint.delivery_date)}` : null,
  ].filter(Boolean);

  let betragHint = 'wird bei Freigabe fällig';
  let betragHintFarbe;
  if (freigegeben) {
    betragHint = milestone.invoiced_at ? `in SEF erfasst am ${fmtDate(milestone.invoiced_at)}` : 'noch nicht in SEF erfasst';
    betragHintFarbe = milestone.invoiced_at ? STATUS_COLORS.doneText : STATUS_COLORS.attention;
  }

  return (
    <>
      <nav aria-label="Pfad" className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
        <Link
          to={sprint ? `/sprint/sprints/${sprint.id}` : '/sprint/projekte'}
          className="inline-flex items-center gap-1.5 text-[#555555] hover:text-foreground"
        >
          <ArrowLeft className="w-[15px] h-[15px]" />
          <span className="font-semibold text-foreground hover:underline">{project?.title || 'Projekt'}</span>
        </Link>
        {pfad.map((teil) => (
          <React.Fragment key={teil}>
            <span aria-hidden="true">·</span>
            <span>{teil}</span>
          </React.Fragment>
        ))}
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.06em]"
              style={{ backgroundColor: stil.pillBg, color: stil.pillText }}
            >
              <Zap className="w-3 h-3" />
              Etappe {nr} von {reihe.length || 1}
            </span>
            <h1 className="m-0 text-[26px] leading-8 font-bold tracking-[-0.015em] text-foreground">
              {milestone.title}
              {milestone.is_final_milestone && (
                <span className="ml-2 align-middle rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Letzte Etappe
                </span>
              )}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[13px] text-[#555555]">
            {pm ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase text-white"
                  style={{ backgroundColor: personColor(pm) }}
                >
                  {initials(pm.name || pm.email)}
                </span>
                <span><span className="font-semibold text-foreground">{pm.name || pm.email}</span> · Projektleitung</span>
              </span>
            ) : (
              <span>Keine Projektleitung eingetragen</span>
            )}
            <span className="inline-flex items-center gap-2">
              {beteiligte.length > 0 ? (
                <>
                  <PersonenStapel members={beteiligte} currentUserEmail={me?.email} size={22} />
                  <span>{beteiligte.length === 1 ? 'arbeitet' : 'arbeiten'} in dieser Etappe</span>
                </>
              ) : (
                <span>Noch niemand in dieser Etappe eingeteilt</span>
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <SprintTimerStart project={project} client={client} variante="kompakt" />
          {darfBearbeiten && (
            <button type="button" onClick={onBearbeiten} className="text-xs font-medium text-[#555555] hover:text-foreground hover:underline">
              Etappe bearbeiten
            </button>
          )}
        </div>
      </div>

      <KopfKennzahlLeiste>
        <KopfKennzahl
          label="Zustand"
          value={k.zustand.label}
          farbe={k.zustand.erledigt ? STATUS_COLORS.doneText : undefined}
          hint={k.zustand.hint}
        />
        <KopfKennzahl
          label={k.frist.label}
          value={k.frist.wert}
          farbe={k.frist.kritisch ? STATUS_COLORS.critical : undefined}
          hint={k.frist.hint}
        />
        <KopfKennzahl label="Freeze" value={k.freeze.wert} hint={k.freeze.hint} />
        <KopfKennzahl
          label="Betrag"
          value={fmtEUR(milestone.milestone_amount)}
          farbe={freigegeben ? STATUS_COLORS.doneText : undefined}
          hint={betragHint}
          hintFarbe={betragHintFarbe}
        />
        <KopfKennzahl
          breit
          label="Aufgaben"
          value={`${k.aufgaben.erledigt}`}
          von={`von ${k.aufgaben.gesamt} erledigt`}
        >
          <span className="mt-1 block h-1.5 overflow-hidden rounded-sm bg-[#E6E6E6]" aria-hidden="true">
            <span className="block h-1.5 bg-foreground" style={{ width: `${k.aufgaben.pct}%` }} />
          </span>
        </KopfKennzahl>
      </KopfKennzahlLeiste>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Etappen" className="flex flex-wrap items-center gap-0.5">
          <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Etappen</span>
          {reihe.map((m, i) => {
            const aktiv = m.id === milestone.id;
            const fertig = m.state === 'freigegeben';
            return (
              <Link
                key={m.id}
                to={`/sprint/milestones/${m.id}`}
                title={`${m.title}${fertig ? ' · freigegeben' : ''}`}
                aria-current={aktiv ? 'page' : undefined}
                className={`inline-flex min-w-[36px] items-center justify-center px-2 pt-3 pb-[13px] text-sm ${
                  aktiv
                    ? 'font-bold text-foreground shadow-[inset_0_-2px_0_hsl(var(--foreground))]'
                    : `font-medium hover:text-foreground ${fertig ? 'text-status-done-text' : 'text-muted-foreground'}`
                }`}
              >
                {i + 1}
              </Link>
            );
          })}
        </nav>
        {rechts}
      </div>
    </>
  );
}
