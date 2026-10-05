import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useZugriff } from '@/lib/useZugriff';
import { Skeleton } from '@/components/ui/skeleton';
import MeinTagZeile from '@/components/sprint/heute/MeinTagZeile';
import MeinTagNeueAufgabe from '@/components/sprint/heute/MeinTagNeueAufgabe';
import MeinTagUebernahme from '@/components/sprint/heute/MeinTagUebernahme';
import TicketDetailPanel from '@/components/sprint/ticket/TicketDetailPanel';
import HeuteFristen from '@/components/sprint/HeuteFristen';
import HeutePmBlock from '@/components/sprint/HeutePmBlock';
import useTicketStatus from '@/hooks/useTicketStatus';
import { Abschnitt, KlappAbschnitt, KurzListe, Zaehlerleiste } from '@/components/sprint/heute/MeinTagBausteine';
import MeinTagProjektgruppen from '@/components/sprint/heute/MeinTagProjektgruppen';
import { MeinTagZeit, MeinTagEingang, stundenVon } from '@/components/sprint/heute/MeinTagSeitenleiste';
import MeinTagSupportTickets, { SUPPORT_TICKETS_KEY } from '@/components/sprint/heute/MeinTagSupportTickets';
import { RITTLER, STATUS_COLORS, todayIso } from '@/components/sprint/sprintConfig';
import { ohneArchiv, PROJEKT_LAUFEND, istAktiv } from '@/lib/sprint/aktivFilter';
import { gliedereMeinTag, nachProjekt } from '@/lib/sprint/meinTag';

const eindeutig = (liste) => [...new Set(liste.filter(Boolean))];
// Über dieser Menge wird nicht mehr gezielt per ID geladen, sondern die Liste geholt.
const MAX_IDS = 60;
const fmtH = (v) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(v || 0);

// MEIN TAG — alle eigenen Aufgaben auf einen Blick, unabhängig vom Focus-Tag.
// Gliederung: überfällig → heute → diese Woche → in Arbeit → ohne Termin (je Projekt);
// rechts Zeit, Wartendes, Posteingang und was später kommt.
export default function SprintHeute() {
  const { user } = useAuth();
  const zugriff = useZugriff();
  const queryClient = useQueryClient();
  const email = user?.email;
  const today = todayIso();
  const [neueAufgabe, setNeueAufgabe] = useState(false);
  // Aufgabe, die in der Ebene rechts geöffnet ist — die Liste bleibt dahinter bedienbar
  const [panelTicketId, setPanelTicketId] = useState(null);
  const [supportTicket, setSupportTicket] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sprintHeute', email, today],
    enabled: !!email,
    queryFn: async () => {
      const tagesbeginn = new Date(`${today}T00:00:00`).toISOString();
      const [offene, erledigtHeute, focusDays, pmProjects, settings, todayEntries, members] = await Promise.all([
        base44.entities.Ticket.filter(ohneArchiv({ assignee_email: email, status: { $ne: 'erledigt' } }), 'order', 1000),
        base44.entities.Ticket.filter(
          ohneArchiv({ assignee_email: email, status: 'erledigt', last_status_change: { $gte: tagesbeginn } }),
          '-last_status_change', 200,
        ),
        base44.entities.FocusDay.filter({ person_email: email, day: today }),
        base44.entities.Project.filter({ ...PROJEKT_LAUFEND, pm_email: email }, 'title', 500),
        base44.entities.Setting.filter({ group: 'kapazitaet' }, 'key', 50),
        base44.entities.TimeEntry.filter({ person_email: email, entry_date: today }),
        base44.entities.TeamMember.filter({ active: { $ne: false } }, 'name', 200),
      ]);
      const myTickets = [...offene, ...erledigtHeute];
      const focusDay = focusDays[0] || null;

      // Nur die Projekte, Kunden, Sprints und Etappen laden, die diese Person wirklich betreffen.
      const bekannt = new Set(pmProjects.map((p) => p.id));
      const fehlende = eindeutig([...myTickets.map((t) => t.project_id), focusDay?.project_id]).filter((id) => !bekannt.has(id));
      const modulIds = eindeutig(myTickets.map((t) => t.module_template_id));
      // Sprints hängen nur an der Projekt-ID — sie werden daher gleichzeitig mit den
      // fehlenden Projekten geladen statt danach (eine Abfragerunde weniger).
      const alleProjektIds = eindeutig([...bekannt, ...fehlende]);

      const [weitere, sprints, module] = await Promise.all([
        !fehlende.length ? []
          : fehlende.length > MAX_IDS
            ? base44.entities.Project.filter(PROJEKT_LAUFEND, '-created_date', 500).then((r) => r.filter((p) => !bekannt.has(p.id)))
            : base44.entities.Project.filter({ id: { $in: fehlende } }, 'title', 500),
        !alleProjektIds.length ? []
          : alleProjektIds.length > MAX_IDS
            ? base44.entities.Sprint.list('-created_date', 500)
            : base44.entities.Sprint.filter({ project_id: { $in: alleProjektIds } }, '-created_date', 500),
        !modulIds.length ? []
          : base44.entities.ModuleTemplate.filter({ id: { $in: modulIds.slice(0, 200) } }, 'name', 200),
      ]);
      const projects = [...pmProjects, ...weitere];
      const clientIds = eindeutig(projects.map((p) => p.client_id));
      const sprintIds = sprints.map((s) => s.id);

      const [clients, milestones] = await Promise.all([
        !clientIds.length ? []
          : clientIds.length > MAX_IDS
            ? base44.entities.Client.list('-created_date', 2000)
            : base44.entities.Client.filter({ id: { $in: clientIds } }, 'name', 500),
        !sprintIds.length ? []
          : sprintIds.length > MAX_IDS
            ? base44.entities.Milestone.list('-created_date', 500)
            : base44.entities.Milestone.filter({ sprint_id: { $in: sprintIds } }, '-created_date', 500),
      ]);

      const standardHours = Number(settings.find((s) => s.key === 'standard_day_hours')?.value) || 8;
      return { myTickets, focusDay, projects, clients, milestones, standardHours, sprints, todayEntries, module, members };
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['sprintHeute'] });
    queryClient.invalidateQueries({ queryKey: SUPPORT_TICKETS_KEY });
  };
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

  const { myTickets, focusDay, projects, clients, milestones, standardHours, sprints, todayEntries, module, members } = data;
  const panelTicket = panelTicketId
    ? myTickets.find((t) => t.id === panelTicketId) || (supportTicket?.id === panelTicketId ? supportTicket : null)
    : null;
  const oeffneTicket = (t) => setPanelTicketId(t.id);
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
  // Wenige laufende Aufgaben stehen als eigene Liste; sind es viele (z. B. nach einem Import),
  // wandern sie in den Vorrat je Projekt — sonst wird die Seite endlos.
  const MAX_IN_ARBEIT = 8;
  const inArbeitEigen = g.inArbeit.length <= MAX_IN_ARBEIT;
  const vorrat = inArbeitEigen ? g.ohneTermin : [...g.inArbeit, ...g.ohneTermin];
  const gruppen = nachProjekt(vorrat, projectById, focusProjectId);
  const nichtsGeplant = g.ueberfaellig.length === 0 && g.heute.length === 0 && vorrat.length > 0;
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

  const zeile = ({ variante = 'voll', mitTimer = true } = {}) => (t) => {
    const p = projectById[t.project_id];
    return (
      <MeinTagZeile
        key={t.id}
        ticket={t}
        project={p}
        client={p ? clientById[p.client_id] : null}
        milestone={milestoneById[t.milestone_id]}
        modulName={moduleById[t.module_template_id]?.name}
        projektName={projektName(p)}
        heute={today}
        onStatusChange={handleStatusChange}
        variante={variante}
        mitTimer={mitTimer}
        onOeffnen={oeffneTicket}
        aktiv={t.id === panelTicketId}
      />
    );
  };
  const mitTimer = zeile();

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
    { label: 'Diese Woche', wert: g.woche.length },
    { label: 'In Arbeit', wert: g.inArbeit.length },
    { label: 'Wartet', wert: g.wartet.length, zahl: g.wartet.length, farbe: STATUS_COLORS.attention },
    { label: 'Heute gebucht', wert: fmtH(gebucht), zusatz: `von ${fmtH(standardHours)} h` },
  ];

  const datum = new Date().toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const zeigeEingang = zugriff.darf(['leitung', 'support']);
  const kurzListeProps = { heute: today, projektName, milestoneById, projectById, onOeffnen: oeffneTicket };

  return (
    <div className="max-w-[1280px] mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Mein Tag</h1>
          <p className="text-sm mt-1" style={{ color: RITTLER.textSecondary }}>
            {[datum, user?.full_name].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MeinTagUebernahme email={email} />
          <button
            type="button"
            onClick={() => setNeueAufgabe(true)}
            className="h-11 px-4 bg-white border border-[#d4d4d4] rounded text-sm font-semibold text-foreground hover:bg-muted"
          >
            Neue Aufgabe
          </button>
          <Link
            to="/zeiten"
            className="h-11 px-4 inline-flex items-center bg-white border border-foreground rounded text-sm font-semibold text-foreground hover:bg-muted"
          >
            Zeit erfassen
          </Link>
        </div>
      </div>

      {focusDay?.type === 'abwesend' && (
        <div className="bg-white rounded-lg border border-border px-5 py-3 text-sm text-foreground">
          Für heute bist du als abwesend eingetragen.
        </div>
      )}
      {focusProject && (
        <div className="bg-white rounded-lg border border-border px-5 py-3 text-sm text-foreground">
          <span className="font-bold">Focus heute:</span> {projektName(focusProject)}
        </div>
      )}

      <Zaehlerleiste werte={zaehler} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="space-y-5 min-w-0">
          {offenGesamt === 0 && (
            <div className="bg-white rounded-lg border border-border px-5 py-4 text-sm" style={{ color: RITTLER.textSecondary }}>
              Dir sind aktuell keine offenen Aufgaben zugewiesen.
            </div>
          )}

          <Abschnitt titel="Überfällig" anzahl={g.ueberfaellig.length} farbe={STATUS_COLORS.critical}>
            {g.ueberfaellig.map(mitTimer)}
          </Abschnitt>

          <Abschnitt titel="Heute" anzahl={g.heute.length}>
            {g.heute.map(mitTimer)}
          </Abschnitt>

          <Abschnitt titel="Diese Woche" anzahl={g.woche.length}>
            {g.woche.map(mitTimer)}
          </Abschnitt>

          {nichtsGeplant && (
            <div className="bg-white rounded-lg border border-border px-5 py-4 text-sm" style={{ color: RITTLER.textSecondary }}>
              <span className="font-semibold text-foreground">Für heute ist noch nichts eingeplant.</span>{' '}
              Unten ein Projekt aufklappen und mit „Heute" einplanen, was heute dran ist.
            </div>
          )}

          <Abschnitt titel="In Arbeit, ohne Termin" anzahl={inArbeitEigen ? g.inArbeit.length : 0}>
            {g.inArbeit.map(mitTimer)}
          </Abschnitt>

          <Abschnitt
            titel={inArbeitEigen ? 'Offen, ohne Termin' : 'Ohne Termin'}
            anzahl={vorrat.length}
            hinweis={`${gruppen.length} ${gruppen.length === 1 ? 'Projekt' : 'Projekte'} — aufklappen und Aufgaben mit „Heute" oder einem Termin einplanen.`}
          >
            <div className="mt-1">
              <MeinTagProjektgruppen
                gruppen={gruppen}
                projektName={projektName}
                projektZiel={projektZiel}
                zeile={zeile({ variante: 'gruppe' })}
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
            {g.erledigt.map(zeile({ mitTimer: false }))}
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
            hinweis="Liegt nicht bei dir – nachfassen, wenn es zu lange dauert."
            tickets={g.wartet}
            max={6}
            {...kurzListeProps}
          />
          {zeigeEingang && <MeinTagEingang nurSupport={!zugriff.darf('leitung')} />}
          {zugriff.darf('support') && (
            <MeinTagSupportTickets
              email={email}
              istFuehrung={zugriff.darf('fuehrung')}
              members={members}
              onOeffnen={(t) => { setSupportTicket(t); setPanelTicketId(t.id); }}
              onUebernommen={refresh}
            />
          )}
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
      <TicketDetailPanel
        ticket={panelTicket}
        members={members}
        open={!!panelTicket}
        onOpenChange={(o) => { if (!o) setPanelTicketId(null); }}
        onSaved={refresh}
        nichtModal
      />
      <MeinTagNeueAufgabe
        open={neueAufgabe}
        onOpenChange={setNeueAufgabe}
        email={email}
        projects={projects.filter(istAktiv)}
        sprints={sprints}
        milestones={milestones}
        projektName={projektName}
        onCreated={refresh}
      />
    </div>
  );
}