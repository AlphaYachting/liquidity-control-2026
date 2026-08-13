import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import SectionLabel from '@/components/sprint/SectionLabel';
import HandlungsListe from '@/components/sprint/uebersicht/HandlungsListe';
import ProjektZeile from '@/components/sprint/uebersicht/ProjektZeile';
import UnternehmenBlock from '@/components/sprint/uebersicht/UnternehmenBlock';
import { sprintStatus } from '@/lib/sprint/status';
import { RITTLER, fmtEUR, todayIso } from '@/components/sprint/sprintConfig';

const mondayOf = (iso) => {
  const d = new Date(iso);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
};

const isoWeek = (iso) => {
  const d = new Date(iso);
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  return 1 + Math.round((target - firstThursday) / (7 * 86400000));
};

// X4 — Die Übersicht: Wochenbilanz, Handlungsliste, Projektzeilen, Unternehmenszahlen.
export default function SprintUebersicht() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });

  const { data, isLoading } = useQuery({
    queryKey: ['sprintUebersicht'],
    queryFn: async () => {
      const [clients, projects, sprints, milestones, tickets, members, signals, timeEntries, focusDays] = await Promise.all([
        base44.entities.Client.list('name', 300),
        base44.entities.Project.list('-created_date', 300),
        base44.entities.Sprint.list('-created_date', 300),
        base44.entities.Milestone.list('order', 1000),
        base44.entities.Ticket.list('order', 3000),
        base44.entities.TeamMember.filter({ active: true }, 'name', 100),
        base44.entities.IntelligenceSignal.filter({ resolved: false }, '-triggered_at', 100),
        base44.entities.TimeEntry.list('-entry_date', 3000),
        base44.entities.FocusDay.list('-day', 2000),
      ]);
      return { clients, projects, sprints, milestones, tickets, members, signals, timeEntries, focusDays };
    },
  });

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-10 w-full bg-muted" />
        <Skeleton className="h-40 w-full bg-muted" />
        <Skeleton className="h-64 w-full bg-muted" />
      </div>
    );
  }

  const { clients, projects, sprints, milestones, tickets, members, signals, timeEntries, focusDays } = data;
  const today = todayIso();
  const weekStart = mondayOf(today);
  const myEmail = me?.email;
  const myMember = members.find((m) => m.email === myEmail);
  const isLeadership = myMember ? ['pm', 'gf'].includes(myMember.system_role) : me?.role === 'admin';

  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));

  const activeSprints = sprints.filter((s) => ['geplant', 'laufend'].includes(s.status));

  const rows = activeSprints.map((sprint) => {
    const sprintMilestones = milestones.filter((m) => m.sprint_id === sprint.id);
    const ids = sprintMilestones.map((m) => m.id);
    const sprintTickets = tickets.filter((t) => ids.includes(t.milestone_id));
    const status = sprintStatus({
      sprint,
      milestones: sprintMilestones,
      tickets: sprintTickets,
      timeEntries: timeEntries.filter((t) => t.project_id === sprint.project_id),
      focusDays: focusDays.filter((f) => f.project_id === sprint.project_id && f.type === 'focus'),
      signals: signals.filter((s) => s.sprint_id === sprint.id || s.project_id === sprint.project_id),
    });
    const emails = [...new Set(sprintTickets.filter((t) => t.assignee_email).map((t) => t.assignee_email))];
    return {
      sprint,
      project: projectById[sprint.project_id],
      client: clientById[projectById[sprint.project_id]?.client_id],
      milestones: sprintMilestones,
      tickets: sprintTickets,
      status,
      people: emails.map((e) => members.find((m) => m.email === e) || { email: e, name: e }),
      mine: emails.includes(myEmail),
    };
  });

  const visibleRows = (isLeadership ? rows : rows.filter((r) => r.mine || rows.every((x) => !x.mine)))
    .sort((a, b) => a.status.urgency - b.status.urgency
      || (a.sprint.delivery_date || '').localeCompare(b.sprint.delivery_date || ''));

  // Block 1 — Wochenbilanz
  const releasedThisWeek = milestones.filter((m) => m.state === 'freigegeben' && (m.released_at || m.updated_date || '').slice(0, 10) >= weekStart);
  const doneThisWeek = tickets.filter((t) => t.status === 'erledigt' && (t.last_status_change || '').slice(0, 10) >= weekStart);

  // Block 4 — Unternehmenszahlen
  // S3 — Focus- UND Reaktionstage binden Kapazität; Abwesenheiten verkleinern den Nenner.
  const capacity = (weeks) => {
    const end = new Date(today);
    end.setDate(end.getDate() + weeks * 7);
    const endIso = end.toISOString().slice(0, 10);
    const inRange = (f) => f.day >= today && f.day <= endIso;
    const focus = focusDays.filter((f) => f.type === 'focus' && inRange(f)).length;
    const reaktion = focusDays.filter((f) => f.type === 'reaktion' && inRange(f)).length;
    const abwesend = focusDays.filter((f) => f.type === 'abwesend' && inRange(f)).length;
    const available = members.reduce((s, m) => s + (m.weekly_focus_days || 4) * weeks, 0) - abwesend;
    const pct = available > 0 ? Math.round(((focus + reaktion) / available) * 100) : 0;
    return { pct, focus, reaktion, available: Math.max(0, available) };
  };

  const liquiditaetMap = {};
  visibleRows.forEach((r) => {
    r.milestones.filter((m) => m.state !== 'freigegeben').forEach((m) => {
      const d = m.feedback_deadline || m.planned_freeze;
      if (!d || d < today) return;
      const kw = isoWeek(d);
      liquiditaetMap[kw] = (liquiditaetMap[kw] || 0) + (m.milestone_amount || 0);
    });
  });
  const liquiditaet = Object.entries(liquiditaetMap)
    .map(([kw, sum]) => ({ kw: Number(kw), sum }))
    .sort((a, b) => a.kw - b.kw);

  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);
  const in30Iso = in30.toISOString().slice(0, 10);
  const ending = activeSprints.filter((s) => s.delivery_date && s.delivery_date <= in30Iso);
  const pipeline = { ending: ending.length, withoutOffer: ending.filter((s) => !s.successor_offered).length };

  const imPlan = visibleRows.filter((r) => r.status.ampel === 'plan').length;
  const aufmerksamkeit = visibleRows.length - imPlan;

  const resolveSignal = async (signal) => {
    await base44.entities.IntelligenceSignal.update(signal.id, { resolved: true, resolved_at: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: ['sprintUebersicht'] });
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="bg-white rounded-lg border border-border px-4 py-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <SectionLabel>Diese Woche</SectionLabel>
        <p className="text-[15px] font-bold" style={{ color: RITTLER.black }}>
          {releasedThisWeek.length} {releasedThisWeek.length === 1 ? 'Etappe' : 'Etappen'} abgeschlossen ·{' '}
          {fmtEUR(releasedThisWeek.reduce((s, m) => s + (m.milestone_amount || 0), 0))} ·{' '}
          {doneThisWeek.length} {doneThisWeek.length === 1 ? 'Aufgabe' : 'Aufgaben'}
        </p>
      </div>

      <HandlungsListe
        signals={signals.filter((s) => visibleRows.some((r) => r.sprint.project_id === s.project_id || r.sprint.id === s.sprint_id))}
        projectsById={projectById}
        imPlan={imPlan}
        brauchenAufmerksamkeit={aufmerksamkeit}
        onResolve={resolveSignal}
      />

      <div>
        <SectionLabel className="mb-2">Projekte</SectionLabel>
        <div className="bg-white rounded-lg border border-border overflow-hidden">
          {visibleRows.map((r) => (
            <ProjektZeile
              key={r.sprint.id}
              sprint={r.sprint}
              project={r.project}
              client={r.client}
              milestones={r.milestones}
              status={r.status}
              people={r.people}
              currentUserEmail={myEmail}
            />
          ))}
          {visibleRows.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">Kein aktiver Sprint.</p>
          )}
        </div>
      </div>

      {isLeadership && (
        <UnternehmenBlock
          auslastung4={capacity(4)}
          auslastung8={capacity(8)}
          liquiditaet={liquiditaet}
          pipeline={pipeline}
        />
      )}
    </div>
  );
}