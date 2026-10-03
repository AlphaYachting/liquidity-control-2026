import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useZugriff } from '@/lib/useZugriff';
import { Skeleton } from '@/components/ui/skeleton';
import HeuteAufgabenZeile from '@/components/sprint/HeuteAufgabenZeile';
import HeuteFristen from '@/components/sprint/HeuteFristen';
import HeutePmBlock from '@/components/sprint/HeutePmBlock';
import useTicketStatus from '@/hooks/useTicketStatus';
import { Abschnitt, KlappAbschnitt, KurzListe, Zaehlerleiste } from '@/components/sprint/heute/MeinTagBausteine';
import MeinTagProjektgruppen from '@/components/sprint/heute/MeinTagProjektgruppen';
import { MeinTagZeit, MeinTagEingang, stundenVon } from '@/components/sprint/heute/MeinTagSeitenleiste';
import { RITTLER, STATUS_COLORS, todayIso } from '@/components/sprint/sprintConfig';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import { ohneArchiv, PROJEKT_LAUFEND, istAktiv } from '@/lib/sprint/aktivFilter';
import { gliedereMeinTag, nachProjekt, VORSCHAU_TAGE } from '@/lib/sprint/meinTag';

const eindeutig = (liste) => [...new Set(liste.filter(Boolean))];
// Über dieser Menge wird nicht mehr gezielt per ID geladen, sondern die Liste geholt.
const MAX_IDS = 60;
const fmtH = (v) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(v || 0);

// MEIN TAG — alle eigenen Aufgaben auf einen Blick, unabhängig vom Focus-Tag.
// Gliederung: überfällig → heute → nächste 7 Tage → in Arbeit → ohne Termin (je Projekt);
// rechts Zeit, Wartendes, Posteingang und was später kommt.
export default function SprintHeute() {
  const { user } = useAuth();
  const zugriff = useZugriff();
  const queryClient = useQueryClient();
  const email = user?.email;
  const today = todayIso();

  const { data, isLoading } = useQuery({
    queryKey: ['sprintHeute', email, today],
    enabled: !!email,
    queryFn: async () => {
      const tagesbeginn = new Date(`${today}T00:00:00`).toISOString();
      const [offene, erledigtHeute, focusDays, pmProjects, settings, todayEntries] = await Promise.all([
        base44.entities.Ticket.filter(ohneArchiv({ assignee_email: email, status: { $ne: 'erledigt' } }), 'order', 1000),
        base44.entities.Ticket.filter(
          ohneArchiv({ assignee_email: email, status: 'erledigt', last_status_change: { $gte: tagesbeginn } }),
          '-last_status_change', 200,
        ),
        base44.entities.FocusDay.filter({ person_email: email, day: today }),
        base44.entities.Project.filter({ ...PROJEKT_LAUFEND, pm_email: email }, 'title', 500),
        base44.entities.Setting.filter({ group: 'kapazitaet' }, 'key', 50),
        base44.entities.TimeEntry.filter({ person_email: email, entry_date: today }),
      ]);
      const myTickets = [...offene, ...erledigtHeute];
      const focusDay = focusDays[0] || null;

      // Nur die Projekte, Kunden, Sprints und Etappen laden, die diese Person wirklich betreffen.
      const bekannt = new Set(pmProjects.map((p) => p.id));
      const fehlende = eindeutig([...myTickets.map((t) => t.project_id), focusDay?.project_id]).filter((id) => !bekannt.has(id));
      const weitere = !fehlende.length ? []
        : fehlende.length > MAX_IDS
          ? (await base44.entities.Project.filter(PROJEKT_LAUFEND, '-created_date', 500)).filter((p) => !bekannt.has(p.id))
          : await base44.entities.Project.filter({ id: { $in: fehlende } }, 'title', 500);
      const projects = [...pmProjects, ...weitere];
      const projectIds = projects.map((p) => p.id);
      const clientIds = eindeutig(projects.map((p) => p.client_id));
      const modulIds = eindeutig(myTickets.map((t) => t.module_template_id));

      const [clients, sprints, module] = await Promise.all([
        !clientIds.length ? []
          : clientIds.length > MAX_IDS
            ? base44.entities.Client.list('-created_date', 2000)
            : base44.entities.Client.filter({ id: { $in: clientIds } }, 'name', 500),
        !projectIds.length ? []
          : projectIds.length > MAX_IDS
            ? base44.entities.Sprint.list('-created_date', 500)
            : base44.entities.Sprint.filter({ project_id: { $in: projectIds } }, '-created_date', 500),
        !modulIds.length ? []
          : base44.entities.ModuleTemplate.filter({ id: { $in: modulIds.slice(0, 200) } }, 'name', 200),
      ]);
      const sprintIds = sprints.map((s) => s.id);
      const milestones = !sprintIds.length ? []
        : sprintIds.length > MAX_IDS
          ? await base44.entities.Milestone.list('-created_date', 500)
          : await base44.entities.Milestone.filter({ sprint_id: { $in: sprintIds } }, '-created_date', 500);

      const standardHours = Number(settings.find((s) => s.key === 'standard_day_hours')?.value) || 8;
      return { myTickets, focusDay, projects, clients, milestones, standardHours, sprints, todayEntries, module };
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sprintHeute'] });
  const { setStatus: handleStatusChange, dialog: routineDialog } = useTicketStatus(refresh);

  if (isLoading || !data) {
    return (
      <div className="max-w-[1280px] mx-auto space-y-4">
        <Skeleton className="h-10 w-48 bg-muted" />
        <Skeleton className="h-20 w-full bg-muted" />
        <Skeleton className="h-48 w-full bg-muted" />
      </div>
    );
  }

  const { myTickets, focusDay, projects, clients, milestones, standardHours, sprints, todayEntries, module } = data;
  const moduleById = Object.fromEntries(module.map((m) => [m.id, m]));
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const milestoneById = Object.fromEntries(milestones.map((m) => [m.id, m]));
  const sprintProject = Object.fromEntries(sprints.map((s) => [s.id, s.project_id]));
  const projectTitleById = Object.fromEntries(projects.map((p) => [p.id, p.title]));

  // Pausierte und abgeschlossene Projekte erzeugen keine Arbeit in „Mein Tag"
  const aktiveIds = new Set(projects.filter(istAktiv).map((p) => p.id));
  const g = gliedereMeinTag(myTickets.filter((t) => aktiveIds.has(t.project_id)), today);
  const focusProjectId = focusDay?.type === 'focus' ? focusDay.project_id : null;
  const focusProject = focusProjectId ? projectById[focusProjectId] : null;
  const gruppen = nachProjekt(g.ohneTermin, projectById, focusProjectId);
  const offenGesamt = myTickets.length - g.erledigt.length;

  // Kunde nur voranstellen, wenn er nicht schon im Projekttitel steht
  const projektName = (p) => {
    if (!p) return 'Projekt';
    const kunde = clientById[p.client_id]?.name;
    const erstesWort = (kunde || '').split(/\s+/)[0].toLowerCase();
    return kunde && erstesWort.length >= 3 && !(p.title || '').toLowerCase().includes(erstesWort)
      ? `${kunde} · ${p.title}` : p.title;
  };
  const projektZiel = (p) => {
    if (!p) return '/sprint/projekte';
    const eigene = sprints.filter((s) => s.project_id === p.id);
    const sprint = eigene.find((s) => s.status === 'laufend') || eigene[0];
    return sprint ? `/sprint/sprints/${sprint.id}` : '/sprint/projekte';
  };

  const zeile = ({ mitProjekt = true, mitTimer = false } = {}) => (t) => {
    const p = projectById[t.project_id];
    return (
      <HeuteAufgabenZeile
        key={t.id}
        ticket={t}
        milestone={milestoneById[t.milestone_id]}
        projectLabel={mitProjekt ? projektName(p) : null}
        projektTyp={p ? projectTypeOf(p) : 'sprint'}
        modulName={moduleById[t.module_template_id]?.name}
        onStatusChange={handleStatusChange}
        typProjekt={mitProjekt ? p : null}
        timerProjekt={mitTimer ? p : null}
        timerKunde={p ? clientById[p.client_id] : null}
      />
    );
  };
  const mitTimer = zeile({ mitTimer: true });

  // Fristen der Sprint-Etappen in den eigenen Projekten
  const myProjectIds = new Set(projects.map((p) => p.id));
  const deadlineOf = (m) => m.feedback_deadline || m.planned_freeze;
  const daysUntil = (d) => Math.round((new Date(d) - new Date(today)) / 86400000);
  const deadlines = milestones
    .filter((m) => m.state !== 'freigegeben' && deadlineOf(m) && deadlineOf(m) >= today
      && myProjectIds.has(sprintProject[m.sprint_id]))
    .sort((a, b) => deadlineOf(a).localeCompare(deadlineOf(b)))
    .slice(0, 3)
    .map((m) => {
      const project = projectById[sprintProject[m.sprint_id]];
      return {
        m,
        project,
        client: project ? clientById[project.client_id] : null,
        days: daysUntil(deadlineOf(m)),
        planned: !m.feedback_deadline,
        deadline: deadlineOf(m),
      };
    });

  const gebucht = todayEntries.reduce((s, e) => s + stundenVon(e), 0);
  const zaehler = [
    { label: 'Überfällig', wert: g.ueberfaellig.length, zahl: g.ueberfaellig.length, farbe: STATUS_COLORS.critical },
    { label: 'Heute fällig', wert: g.heute.length },
    { label: `Nächste ${VORSCHAU_TAGE} Tage`, wert: g.woche.length },
    { label: 'In Arbeit', wert: g.inArbeit.length },
    { label: 'Wartet', wert: g.wartet.length, zahl: g.wartet.length, farbe: STATUS_COLORS.attention },
    { label: 'Heute gebucht', wert: fmtH(gebucht), zusatz: `von ${fmtH(standardHours)} h` },
  ];

  const datum = new Date().toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const nichtsFaellig = g.ueberfaellig.length === 0 && g.heute.length === 0;
  const zeigeEingang = zugriff.darf(['leitung', 'support']);
  const kurzListeProps = { heute: today, projektName, milestoneById, projectById };

  return (
    <div className="max-w-[1280px] mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Mein Tag</h1>
        <p className="text-sm mt-0.5" style={{ color: RITTLER.textSecondary }}>{datum}</p>
      </div>

      {focusDay?.type === 'abwesend' && (
        <div className="bg-white rounded-lg shadow-sm px-5 py-3 text-sm text-foreground">
          Für heute bist du als abwesend eingetragen.
        </div>
      )}
      {focusProject && (
        <div className="bg-white rounded-lg shadow-sm px-5 py-3 text-sm text-foreground">
          <span className="font-bold">Focus heute:</span> {projektName(focusProject)}
        </div>
      )}

      <Zaehlerleiste werte={zaehler} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="space-y-5 min-w-0">
          {nichtsFaellig && (
            <div className="bg-white rounded-lg shadow-sm px-5 py-4 text-sm" style={{ color: RITTLER.textSecondary }}>
              {offenGesamt === 0
                ? 'Dir sind aktuell keine offenen Aufgaben zugewiesen.'
                : 'Heute ist nichts fällig und nichts überfällig.'}
            </div>
          )}

          <Abschnitt titel="Überfällig" anzahl={g.ueberfaellig.length} farbe={STATUS_COLORS.critical}>
            {g.ueberfaellig.map(mitTimer)}
          </Abschnitt>

          <Abschnitt titel="Heute" anzahl={g.heute.length}>
            {g.heute.map(mitTimer)}
          </Abschnitt>

          <Abschnitt titel={`Nächste ${VORSCHAU_TAGE} Tage`} anzahl={g.woche.length}>
            {g.woche.map(mitTimer)}
          </Abschnitt>

          <Abschnitt titel="In Arbeit, ohne Termin" anzahl={g.inArbeit.length}>
            {g.inArbeit.map(mitTimer)}
          </Abschnitt>

          <Abschnitt
            titel="Offen, ohne Termin"
            anzahl={g.ohneTermin.length}
            hinweis="Nach Projekt gegliedert. Ein Termin lässt sich direkt in der Zeile setzen."
          >
            <div className="mt-2">
              <MeinTagProjektgruppen
                gruppen={gruppen}
                projektName={projektName}
                projektZiel={projektZiel}
                zeile={zeile({ mitProjekt: false })}
                focusProjectId={focusProjectId}
              />
            </div>
          </Abschnitt>

          <HeutePmBlock
            email={email}
            milestones={milestones}
            sprints={sprints}
            projects={projects}
            clients={clients}
            today={today}
          />

          {deadlines.length > 0 && <HeuteFristen deadlines={deadlines} />}

          <KlappAbschnitt titel="Heute erledigt" anzahl={g.erledigt.length}>
            {g.erledigt.map(zeile())}
          </KlappAbschnitt>
        </div>

        <div className="space-y-5 min-w-0">
          <MeinTagZeit
            email={email}
            entries={todayEntries}
            standardHours={standardHours}
            projectTitleById={projectTitleById}
          />
          <KurzListe
            titel="Wartet"
            farbe={STATUS_COLORS.attention}
            hinweis="Liegt gerade nicht bei dir — nachfassen, wenn es zu lange dauert."
            tickets={g.wartet}
            max={6}
            {...kurzListeProps}
          />
          {zeigeEingang && <MeinTagEingang nurSupport={!zugriff.darf('leitung')} />}
          <KurzListe
            titel="Kommt später"
            tickets={g.spaeter}
            max={4}
            terminVorne
            {...kurzListeProps}
          />
        </div>
      </div>
      {routineDialog}
    </div>
  );
}
