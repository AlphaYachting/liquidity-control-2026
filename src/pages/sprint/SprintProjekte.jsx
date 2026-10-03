import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Pencil, LayoutTemplate, Plus, X, Search, Link2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import SevdeskAbgleichDialog from '@/components/kunden/SevdeskAbgleichDialog';
import ProjektZeile from '@/components/sprint/uebersicht/ProjektZeile';
import ProjektZeileOhneSprint from '@/components/sprint/uebersicht/ProjektZeileOhneSprint';
import ClientFormDialog from '@/components/sprint/ClientFormDialog';
import KundeAnlegenDialog from '@/components/kunden/KundeAnlegenDialog';
import ProjectFormDialog from '@/components/sprint/ProjectFormDialog';
import { sprintStatus } from '@/lib/sprint/status';
import BehaelterZeile from '@/components/sprint/uebersicht/BehaelterZeile';
import { behaelterStatus } from '@/lib/sprint/behaelterStatus';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import { NICHT_ARCHIVIERT } from '@/lib/sprint/aktivFilter';
import ProjektFilterLeiste from '@/components/sprint/uebersicht/ProjektFilterLeiste';
import ProjektGruppe from '@/components/sprint/uebersicht/ProjektGruppe';
import {
  PROJEKT_GRUPPEN, gruppeVon, standVon, meineProjektIds, passtZurSuche, merkLesen, merkSchreiben,
} from '@/lib/sprint/projektGruppen';

const MERK_SICHT = 'projekte.sicht';
const MERK_GRUPPEN = 'projekte.gruppenOffen';

// S3 — Projektliste + Stammdaten für Client und Project (gleicher Informationsgehalt wie die Übersicht)
export default function SprintProjekte() {
  const qc = useQueryClient();
  const [clientDialog, setClientDialog] = useState({ open: false, client: null });
  const [projectDialog, setProjectDialog] = useState({ open: false, project: null });
  // Neuanlage und sevDesk-Verknüpfung laufen über den Kunden-Baustein
  const [kundeDialog, setKundeDialog] = useState({ open: false, client: null });
  const [nurOhnePm, setNurOhnePm] = useState(false);
  // Projektliste: Meine/Alle (Wahl wird gemerkt), Stand, Suche, auf-/zugeklappte Typgruppen
  const [sicht, setSicht] = useState(() => (merkLesen(MERK_SICHT, 'meine') === 'alle' ? 'alle' : 'meine'));
  const [stand, setStand] = useState('laufend');
  const [projektSuche, setProjektSuche] = useState('');
  const [gruppenOffen, setGruppenOffen] = useState(() => merkLesen(MERK_GRUPPEN, {}) || {});
  // Kundenverzeichnis: Suche, Filter „ohne sevDesk" und Sammelabgleich
  const [kundenSuche, setKundenSuche] = useState('');
  const [nurOhneSevdesk, setNurOhneSevdesk] = useState(false);
  const [abgleichOffen, setAbgleichOffen] = useState(false);
  // ?tab=kunden öffnet direkt das Kundenverzeichnis
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get('tab') === 'kunden' ? 'kunden' : 'projekte'));

  // Kundenfilter aus der Adresse (?kunde=<id>) — Ziel eines Kundentreffers in der
  // Kopfsuche. ?kundendaten=1 öffnet zusätzlich gleich den Kundendatensatz.
  const [params, setParams] = useSearchParams();
  const kundeId = params.get('kunde') || '';
  const kundendatenOeffnen = params.get('kundendaten') === '1';

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });

  const { data, isLoading } = useQuery({
    queryKey: ['sprintProjekte'],
    queryFn: async () => {
      const [clients, projects, sprints, milestones, tickets, members, signals, timeEntries, focusDays, contracts] = await Promise.all([
        base44.entities.Client.list('name', 2000),
        base44.entities.Project.list('-created_date', 300),
        base44.entities.Sprint.list('-created_date', 500),
        base44.entities.Milestone.list('order', 1000),
        base44.entities.Ticket.filter(NICHT_ARCHIVIERT, 'order', 3000),
        base44.entities.TeamMember.filter({ active: true }, 'name', 100),
        base44.entities.IntelligenceSignal.filter({ resolved: false }, '-triggered_at', 100),
        base44.entities.TimeEntry.list('-entry_date', 3000),
        base44.entities.FocusDay.list('-day', 2000),
        base44.entities.RecurringContract.list('-created_date', 500),
      ]);
      return { clients, projects, sprints, milestones, tickets, members, signals, timeEntries, focusDays, contracts };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['sprintProjekte'] });

  useEffect(() => { if (kundeId) setTab('projekte'); }, [kundeId]);

  useEffect(() => {
    if (!kundendatenOeffnen || !data) return;
    const kunde = data.clients.find((c) => c.id === kundeId);
    if (kunde) setClientDialog({ open: true, client: kunde });
    const naechste = new URLSearchParams(params);
    naechste.delete('kundendaten');
    setParams(naechste, { replace: true });
  }, [kundendatenOeffnen, data, kundeId, params, setParams]);

  const kundenfilterAufheben = () => {
    const naechste = new URLSearchParams(params);
    naechste.delete('kunde');
    setParams(naechste, { replace: true });
  };

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-10 w-48 bg-muted" />
        <Skeleton className="h-64 w-full bg-muted" />
      </div>
    );
  }

  const { clients, projects, sprints, milestones, tickets, members, signals, timeEntries, focusDays, contracts } = data;
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const contractById = Object.fromEntries(contracts.map((c) => [c.id, c]));

  const ohneSevdeskAnzahl = clients.filter((c) => !c.sevdesk_contact_id).length;
  const suchwort = kundenSuche.trim().toLowerCase();
  const kundenSichtbar = clients.filter((c) => {
    if (nurOhneSevdesk && c.sevdesk_contact_id) return false;
    if (!suchwort) return true;
    return [c.name, c.contact_person, c.contact_email, c.city, c.sevdesk_contact_id]
      .some((f) => String(f || '').toLowerCase().includes(suchwort));
  });

  const filterKunde = kundeId ? clientById[kundeId] : null;
  const basis = filterKunde ? projects.filter((p) => p.client_id === kundeId) : projects;

  // Meine = Projektverantwortung oder offene Aufgabe. Beim Kundenfilter immer alle Projekte des Kunden.
  const meineIds = meineProjektIds({ projects, tickets, email: me?.email });
  const sichtWirksam = filterKunde ? 'alle' : sicht;
  const anzahlSicht = { meine: basis.filter((p) => meineIds.has(p.id)).length, alle: basis.length };
  const inSicht = sichtWirksam === 'meine' ? basis.filter((p) => meineIds.has(p.id)) : basis;

  const anzahlStand = inSicht.reduce((acc, p) => {
    const s = standVon(p);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const imStand = inSicht.filter((p) => standVon(p) === stand);

  const ohnePmAnzahl = imStand.filter((p) => !p.pm_email).length;
  const sucheAktiv = projektSuche.trim().length > 0;
  const sichtbar = imStand
    .filter((p) => !nurOhnePm || !p.pm_email)
    .filter((p) => passtZurSuche(p, clientById[p.client_id], projektSuche));

  const sichtWaehlen = (wert) => { setSicht(wert); merkSchreiben(MERK_SICHT, wert); };
  const gruppeUmschalten = (key, offenJetzt) => {
    const naechste = { ...gruppenOffen, [key]: !offenJetzt };
    setGruppenOffen(naechste);
    merkSchreiben(MERK_GRUPPEN, naechste);
  };

  const zeilen = sichtbar.map((project) => {
    const projectSprints = sprints.filter((s) => s.project_id === project.id);
    const sprint = projectSprints.find((s) => s.status === 'laufend') || projectSprints.find((s) => s.status === 'geplant');
    if (projectTypeOf(project) !== 'sprint') {
      const projectTickets = tickets.filter((t) => t.project_id === project.id);
      const emails = [...new Set(projectTickets.filter((t) => t.assignee_email).map((t) => t.assignee_email))];
      return {
        project, client: clientById[project.client_id], sprint: sprint || null, projectSprints, behaelter: true,
        status: behaelterStatus({
          project,
          tickets: projectTickets,
          timeEntries: timeEntries.filter((t) => t.project_id === project.id),
          contract: contractById[project.recurring_contract_id],
        }),
        people: emails.map((e) => members.find((m) => m.email === e) || { email: e, name: e }),
      };
    }
    if (!sprint) return { project, client: clientById[project.client_id], sprint: null, projectSprints };

    const sprintMilestones = milestones.filter((m) => m.sprint_id === sprint.id);
    const ids = sprintMilestones.map((m) => m.id);
    const sprintTickets = tickets.filter((t) => ids.includes(t.milestone_id));
    const status = sprintStatus({
      sprint,
      milestones: sprintMilestones,
      tickets: sprintTickets,
      timeEntries: timeEntries.filter((t) => t.project_id === project.id),
      focusDays: focusDays.filter((f) => f.project_id === project.id && f.type === 'focus'),
      signals: signals.filter((s) => s.sprint_id === sprint.id || s.project_id === project.id),
    });
    const emails = [...new Set(sprintTickets.filter((t) => t.assignee_email).map((t) => t.assignee_email))];
    return {
      project,
      client: clientById[project.client_id],
      sprint,
      projectSprints,
      milestones: sprintMilestones,
      status,
      people: emails.map((e) => members.find((m) => m.email === e) || { email: e, name: e }),
    };
  })
    // gleiche Sortierung wie die Übersicht: Dringlichkeit, dann Liefertermin; Projekte ohne Sprint zuletzt
    .sort((a, b) => {
      if (!a.status && !b.status) return (a.project.title || '').localeCompare(b.project.title || '');
      if (!a.status) return 1;
      if (!b.status) return -1;
      return a.status.urgency - b.status.urgency
        || (a.sprint?.delivery_date || '').localeCompare(b.sprint?.delivery_date || '');
    });

  // Gliederung nach Projekttyp — innerhalb der Gruppe bleibt die Sortierung nach Dringlichkeit
  const gruppen = PROJEKT_GRUPPEN
    .map((g) => ({ gruppe: g, zeilen: zeilen.filter((z) => gruppeVon(z.project) === g.key) }))
    .filter((g) => g.zeilen.length > 0);

  const istOffen = (g) => {
    if (sucheAktiv || nurOhnePm || gruppen.length === 1) return true;
    if (typeof gruppenOffen[g.key] === 'boolean') return gruppenOffen[g.key];
    return sichtWirksam === 'meine' || !g.anfangsZu;
  };

  const zeileRendern = (z) => (
    <div key={z.project.id} className="border-b border-[#eeeeee] last:border-0">
      {z.behaelter ? (
        <BehaelterZeile
          sprint={z.sprint}
          project={z.project}
          client={z.client}
          status={z.status}
          people={z.people}
          currentUserEmail={me?.email}
          onEdit={() => setProjectDialog({ open: true, project: z.project })}
        />
      ) : z.sprint ? (
        <ProjektZeile
          sprint={z.sprint}
          project={z.project}
          client={z.client}
          milestones={z.milestones}
          status={z.status}
          people={z.people}
          currentUserEmail={me?.email}
          onEdit={() => setProjectDialog({ open: true, project: z.project })}
        />
      ) : (
        <ProjektZeileOhneSprint
          project={z.project}
          client={z.client}
          onEdit={() => setProjectDialog({ open: true, project: z.project })}
        />
      )}
      {z.projectSprints.length > 1 && (
        <div className="flex flex-wrap gap-2 px-4 pb-3 pl-12">
          {z.projectSprints.map((s) => (
            <Link
              key={s.id}
              to={`/sprint/sprints/${s.id}`}
              className="text-[11px] px-2 py-0.5 rounded bg-muted text-foreground hover:bg-border"
            >
              {s.title || s.size} · {s.status}
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Projekte</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded" asChild>
            <Link to="/sprint/katalog"><LayoutTemplate className="w-4 h-4 mr-1.5" /> Modul-Katalog</Link>
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded" asChild>
            <Link to="/sprint/neu"><Plus className="w-4 h-4 mr-1" /> Neu anlegen</Link>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="projekte">Projekte ({projects.length})</TabsTrigger>
          <TabsTrigger value="kunden">Kunden ({clients.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="projekte" className="mt-4 space-y-3">
          {(filterKunde || ohnePmAnzahl > 0 || nurOhnePm) && (
          <div className="flex flex-wrap items-center gap-2">
          {filterKunde && (
            <>
              <span
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide pl-2.5 pr-1 py-1 rounded border bg-white text-foreground border-foreground"
              >
                Kunde: {filterKunde.name}
                <button
                  type="button"
                  onClick={kundenfilterAufheben}
                  title="Kundenfilter aufheben"
                  className="p-0.5 rounded hover:bg-muted"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
              <button
                type="button"
                onClick={() => setClientDialog({ open: true, client: filterKunde })}
                className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded border bg-white text-foreground border-border hover:bg-muted"
              >
                <Pencil className="w-3 h-3" /> Kundendaten
              </button>
            </>
          )}
          {(ohnePmAnzahl > 0 || nurOhnePm) && (
          <button
            type="button"
            onClick={() => setNurOhnePm((v) => !v)}
            className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded border ${
              nurOhnePm ? 'bg-primary text-white border-primary' : 'bg-white text-muted-foreground border-border'
            }`}
          >
            Ohne Projektmanager zugeordnet ({ohnePmAnzahl})
          </button>
          )}
          </div>
          )}
          <ProjektFilterLeiste
            sicht={sichtWirksam} onSicht={sichtWaehlen} anzahlSicht={anzahlSicht}
            stand={stand} onStand={setStand} anzahlStand={anzahlStand}
            suche={projektSuche} onSuche={setProjektSuche}
            gesperrt={!!filterKunde}
          />
          {gruppen.map(({ gruppe, zeilen: gruppenZeilen }) => {
            const offen = istOffen(gruppe);
            return (
              <ProjektGruppe
                key={gruppe.key}
                gruppe={gruppe}
                anzahl={gruppenZeilen.length}
                dringend={gruppenZeilen.filter((z) => z.status?.ampel === 'action').length}
                offen={offen}
                onToggle={() => gruppeUmschalten(gruppe.key, offen)}
              >
                {gruppenZeilen.map(zeileRendern)}
              </ProjektGruppe>
            );
          })}
          {zeilen.length === 0 && (
            <div className="bg-white rounded-lg border border-border p-10 text-center text-sm text-muted-foreground">
              {sucheAktiv ? (
                'Kein Projekt passt zur Suche.'
              ) : nurOhnePm ? (
                'Jedes Projekt hat einen Projektmanager.'
              ) : sichtWirksam === 'meine' && anzahlSicht.meine === 0 ? (
                <>
                  Dir ist aktuell kein Projekt zugeordnet.{' '}
                  <button type="button" className="underline text-foreground" onClick={() => sichtWaehlen('alle')}>
                    Alle Projekte anzeigen
                  </button>
                </>
              ) : stand !== 'laufend' ? (
                `Kein Projekt ist ${stand}.`
              ) : filterKunde ? (
                'Für diesen Kunden gibt es kein laufendes Projekt.'
              ) : basis.length === 0 ? (
                'Noch kein Projekt — oben rechts über „Neu anlegen" starten.'
              ) : (
                'Kein laufendes Projekt in dieser Auswahl.'
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="kunden" className="space-y-3 mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                className="pl-8 bg-white"
                placeholder="Kunde suchen — Name, Ansprechperson, E-Mail, Ort, sevDesk-Nr."
                value={kundenSuche}
                onChange={(e) => setKundenSuche(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => setNurOhneSevdesk((v) => !v)}
              className={`text-xs font-bold uppercase tracking-wide px-2.5 py-2 rounded border ${
                nurOhneSevdesk ? 'bg-primary text-white border-primary' : 'bg-white text-muted-foreground border-border'
              }`}
            >
              Ohne sevDesk ({ohneSevdeskAnzahl})
            </button>
            {ohneSevdeskAnzahl > 0 && (
              <Button variant="outline" className="rounded" onClick={() => setAbgleichOffen(true)}>
                <Link2 className="w-4 h-4 mr-1" /> sevDesk-Abgleich
              </Button>
            )}
            <Button variant="outline" className="rounded" onClick={() => setKundeDialog({ open: true, client: null })}>
              <Plus className="w-4 h-4 mr-1" /> Kunde anlegen
            </Button>
          </div>
          {clients.length > 0 && kundenSichtbar.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center text-sm text-muted-foreground">
              Kein Kunde passt zur Suche.
            </div>
          )}
          {kundenSichtbar.map((c) => (
            <div key={c.id} className="bg-white rounded-lg shadow-sm p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.contact_person ? `${c.contact_person} · ` : ''}{c.contact_email}
                  {c.agb_version ? ` · ${c.agb_version}` : ''}
                  {c.sevdesk_contact_id ? ` · sevDesk ${c.sevdesk_contact_id}` : ''}
                </p>
              </div>
              {!c.sevdesk_contact_id && (
                <Button variant="outline" size="sm" className="rounded" onClick={() => setKundeDialog({ open: true, client: c })}>
                  Mit sevDesk verknüpfen
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setClientDialog({ open: true, client: c })}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          {clients.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm p-10 text-center text-sm text-muted-foreground">
              Noch kein Kunde — hier oben anlegen.
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ClientFormDialog
        open={clientDialog.open} client={clientDialog.client}
        onOpenChange={(o) => setClientDialog((d) => ({ ...d, open: o }))} onSaved={refresh}
      />
      <KundeAnlegenDialog
        open={kundeDialog.open} client={kundeDialog.client}
        onOpenChange={(o) => setKundeDialog((d) => ({ ...d, open: o }))} onSaved={refresh}
      />
      <SevdeskAbgleichDialog
        open={abgleichOffen} clients={clients}
        onOpenChange={setAbgleichOffen} onSaved={refresh}
      />
      <ProjectFormDialog
        open={projectDialog.open} project={projectDialog.project} clients={clients}
        onOpenChange={(o) => setProjectDialog((d) => ({ ...d, open: o }))} onSaved={refresh}
      />
    </div>
  );
}