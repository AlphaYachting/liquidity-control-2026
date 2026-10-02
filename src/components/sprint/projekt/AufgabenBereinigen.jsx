import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Repeat, Trash2, RotateCcw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TICKET_STATUS_LABELS, fmtDate } from '@/components/sprint/sprintConfig';
import { RHYTHMUS_LABEL } from '@/components/sprint/paket/paketZaehler';
import { ARCHIV_GRUENDE, ARCHIV_GRUND_LABEL } from '@/lib/sprint/aktivFilter';
import { ticketBereinigen } from '@/lib/sprint/ticketBereinigen';
import { ladeAnsichtenNachTicketAenderung } from '@/lib/sprint/ansichtenNeuLaden';

const STATUS_FILTER = [
  { value: 'alle', label: 'Alle Status' },
  { value: 'offen', label: 'Offen' },
  { value: 'in_arbeit', label: 'In Arbeit' },
  { value: 'wartet', label: 'Wartet' },
  { value: 'erledigt', label: 'Erledigt' },
];

// Bereinigung eines Projekts: Mehrfachauswahl über alle Aufgaben, Archiv mit Wiederherstellen.
// Alle Änderungen laufen über die Server-Funktion ticketBereinigen (Rechte + Prüfungen dort).
export default function AufgabenBereinigen({ project, me, open, onOpenChange, onDone }) {
  const queryClient = useQueryClient();
  const istAdmin = me?.role === 'admin';
  const [reiter, setReiter] = useState('aktiv');
  const [status, setStatus] = useState('alle');
  const [routine, setRoutine] = useState('alle');
  const [modul, setModul] = useState('alle');
  const [suche, setSuche] = useState('');
  const [auswahl, setAuswahl] = useState(() => new Set());
  const [grund, setGrund] = useState(project?.awork_project_id ? 'altbestand_awork' : 'nicht_mehr_relevant');
  const [loeschPruefung, setLoeschPruefung] = useState(null);
  const [meldung, setMeldung] = useState(null);
  const [laeuft, setLaeuft] = useState(false);

  const { data: tickets = [], refetch, isLoading } = useQuery({
    queryKey: ['bereinigenTickets', project?.id],
    queryFn: () => base44.entities.Ticket.filter({ project_id: project.id }, 'order', 2000),
    enabled: Boolean(open && project?.id),
  });
  const { data: module = [] } = useQuery({
    queryKey: ['bereinigenModule'],
    queryFn: () => base44.entities.ModuleTemplate.list('name', 500),
    enabled: Boolean(open),
  });
  const { data: team = [] } = useQuery({
    queryKey: ['bereinigenTeam'],
    queryFn: () => base44.entities.TeamMember.list('name', 200),
    enabled: Boolean(open),
  });

  useEffect(() => {
    if (!open) return;
    setAuswahl(new Set());
    setLoeschPruefung(null);
    setMeldung(null);
  }, [open, reiter]);

  const { data: etappen = [] } = useQuery({
    queryKey: ['bereinigenEtappen', project?.id],
    queryFn: async () => {
      const sprints = await base44.entities.Sprint.filter({ project_id: project.id });
      const listen = await Promise.all(sprints.map((s) => base44.entities.Milestone.filter({ sprint_id: s.id })));
      return listen.flat();
    },
    enabled: Boolean(open && project?.id),
  });
  const etappeName = useMemo(() => Object.fromEntries(etappen.map((m) => [m.id, m.title])), [etappen]);
  const modulName = useMemo(() => Object.fromEntries(module.map((m) => [m.id, m.name])), [module]);
  const personName = useMemo(() => Object.fromEntries(team.map((m) => [m.email, m.name])), [team]);

  const aktive = tickets.filter((t) => !t.archiviert);
  const archivierte = tickets.filter((t) => t.archiviert)
    .sort((a, b) => String(b.archiviert_am || '').localeCompare(String(a.archiviert_am || '')));
  const modulOptionen = [...new Set(aktive.map((t) => t.module_template_id).filter(Boolean))];

  const wort = suche.trim().toLowerCase();
  const sichtbar = (reiter === 'aktiv' ? aktive : archivierte).filter((t) => {
    if (reiter === 'aktiv') {
      if (status !== 'alle' && t.status !== status) return false;
      if (routine === 'ja' && !t.rhythmus) return false;
      if (routine === 'nein' && t.rhythmus) return false;
      if (modul !== 'alle' && t.module_template_id !== modul) return false;
    }
    if (wort && !(t.title || '').toLowerCase().includes(wort)) return false;
    return true;
  });

  const gewaehlt = sichtbar.filter((t) => auswahl.has(t.id));
  const alleGewaehlt = sichtbar.length > 0 && gewaehlt.length === sichtbar.length;
  const nurOffeneRoutinen = gewaehlt.length > 0 && gewaehlt.every((t) => t.rhythmus && t.status !== 'erledigt');

  const umschalten = (id) => setAuswahl((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const alleUmschalten = () => setAuswahl(alleGewaehlt ? new Set() : new Set(sichtbar.map((t) => t.id)));

  const fertig = async (r, verb) => {
    setMeldung({ text: `${r.erledigt.length} ${verb}${r.abgelehnt.length ? `, ${r.abgelehnt.length} abgelehnt` : ''}.`, abgelehnt: r.abgelehnt });
    setAuswahl(new Set());
    setLoeschPruefung(null);
    await refetch();
    ladeAnsichtenNachTicketAenderung(queryClient);
    onDone?.();
  };

  const ausfuehren = async (aktion, verb, grundWert) => {
    setLaeuft(true);
    setMeldung(null);
    try {
      const r = await ticketBereinigen(aktion, gewaehlt.map((t) => t.id), grundWert);
      await fertig(r, verb);
    } catch (e) {
      setMeldung({ text: e.message, abgelehnt: [], fehler: true });
    }
    setLaeuft(false);
  };

  const loeschenPruefen = async () => {
    setLaeuft(true);
    setMeldung(null);
    try {
      const r = await ticketBereinigen('pruefen', gewaehlt.map((t) => t.id));
      setLoeschPruefung(r.tickets);
    } catch (e) {
      setMeldung({ text: e.message, abgelehnt: [], fehler: true });
    }
    setLaeuft(false);
  };

  const loeschbar = (loeschPruefung || []).filter((p) => p.loeschbar);
  const nichtLoeschbar = (loeschPruefung || []).filter((p) => !p.loeschbar);

  const loeschen = async () => {
    setLaeuft(true);
    try {
      const r = await ticketBereinigen('loeschen', loeschbar.map((p) => p.id));
      await fertig(r, 'gelöscht');
    } catch (e) {
      setMeldung({ text: e.message, abgelehnt: [], fehler: true });
    }
    setLaeuft(false);
  };

  const reiterKnopf = (wert, text) => (
    <button
      type="button"
      onClick={() => setReiter(wert)}
      className={`px-3 pb-2 pt-1 text-sm border-b-2 -mb-px ${reiter === wert ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground'}`}
    >
      {text}
    </button>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left text-base">Aufgaben bereinigen · {project?.title}</SheetTitle>
        </SheetHeader>

        <div className="mt-3 flex gap-1 border-b border-border">
          {reiterKnopf('aktiv', `Aktiv (${aktive.length})`)}
          {reiterKnopf('archiv', `Archiviert (${archivierte.length})`)}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {reiter === 'aktiv' && (
            <>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_FILTER.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={routine} onValueChange={setRoutine}>
                <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Routinen und einmalige</SelectItem>
                  <SelectItem value="ja">Nur Routinen</SelectItem>
                  <SelectItem value="nein">Nur einmalige</SelectItem>
                </SelectContent>
              </Select>
              {modulOptionen.length > 0 && (
                <Select value={modul} onValueChange={setModul}>
                  <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle Module</SelectItem>
                    {modulOptionen.map((id) => <SelectItem key={id} value={id}>{modulName[id] || 'Modul'}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </>
          )}
          <Input className="h-8 w-48" placeholder="Titel suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
        </div>

        {/* Aktionsleiste */}
        <div className="mt-3 rounded border border-border px-3 py-2 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2 cursor-pointer select-none mr-2">
            <input type="checkbox" checked={alleGewaehlt} onChange={alleUmschalten} disabled={!sichtbar.length} />
            {gewaehlt.length ? `${gewaehlt.length} ausgewählt` : 'Alle sichtbaren auswählen'}
          </label>
          {reiter === 'aktiv' ? (
            <>
              <Select value={grund} onValueChange={setGrund}>
                <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>{ARCHIV_GRUENDE.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="rounded" disabled={!gewaehlt.length || laeuft}
                onClick={() => ausfuehren('archivieren', 'archiviert', grund)}>
                <Archive className="w-3.5 h-3.5 mr-1" /> Archivieren
              </Button>
              <Button size="sm" variant="outline" className="rounded" disabled={!nurOffeneRoutinen || laeuft}
                title={nurOffeneRoutinen ? '' : 'Nur möglich, wenn ausschließlich offene Routinen ausgewählt sind'}
                onClick={() => ausfuehren('routine_beenden', 'Routinen beendet')}>
                <Repeat className="w-3.5 h-3.5 mr-1" /> Routine beenden
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="rounded" disabled={!gewaehlt.length || laeuft}
              onClick={() => ausfuehren('wiederherstellen', 'wiederhergestellt')}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Wiederherstellen
            </Button>
          )}
          {istAdmin && (
            <Button size="sm" variant="outline" className="rounded text-red-700 border-red-200 hover:bg-red-50"
              disabled={!gewaehlt.length || laeuft} onClick={loeschenPruefen}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Löschen
            </Button>
          )}
        </div>

        {loeschPruefung && (
          <div className="mt-3 rounded border border-red-200 p-3 text-sm space-y-2">
            <p className="font-semibold">{loeschbar.length} von {loeschPruefung.length} löschbar.</p>
            {nichtLoeschbar.length > 0 && (
              <div>
                <p className="text-muted-foreground">Nicht löschbar – bitte archivieren:</p>
                <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                  {nichtLoeschbar.map((p) => <li key={p.id}>· {p.titel} — {p.grund_nicht_loeschbar}</li>)}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" disabled={!loeschbar.length || laeuft} onClick={loeschen}>
                {loeschbar.length} endgültig löschen
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLoeschPruefung(null)}>Abbrechen</Button>
            </div>
          </div>
        )}

        {meldung && (
          <div className={`mt-3 rounded border px-3 py-2 text-sm ${meldung.fehler ? 'border-red-200 text-red-700' : 'border-border'}`}>
            <p>{meldung.text}</p>
            {meldung.abgelehnt.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {meldung.abgelehnt.map((a) => <li key={a.id}>· {a.titel} — {a.grund}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* Liste */}
        <div className="mt-3 rounded border border-border overflow-hidden">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Lade Aufgaben …</p>}
          {!isLoading && sichtbar.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">{reiter === 'aktiv' ? 'Keine Aufgaben für diesen Filter.' : 'Nichts archiviert.'}</p>
          )}
          {sichtbar.map((t) => (
            <label key={t.id} className="flex items-start gap-3 px-3 py-2 border-b border-[#eeeeee] last:border-0 cursor-pointer hover:bg-muted/40">
              <input type="checkbox" className="mt-1" checked={auswahl.has(t.id)} onChange={() => umschalten(t.id)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                {etappeName[t.milestone_id] && <p className="text-xs text-foreground/70 truncate">{etappeName[t.milestone_id]}</p>}
                <p className="text-xs text-muted-foreground">
                  {reiter === 'aktiv'
                    ? [
                      TICKET_STATUS_LABELS[t.status] || t.status,
                      t.rhythmus ? `Routine · ${RHYTHMUS_LABEL[t.rhythmus] || t.rhythmus}` : null,
                      t.planned_for ? `fällig ${fmtDate(t.planned_for)}` : null,
                      t.assignee_email ? (personName[t.assignee_email] || t.assignee_email) : 'nicht zugewiesen',
                      t.module_template_id ? modulName[t.module_template_id] : null,
                    ].filter(Boolean).join(' · ')
                    : [
                      ARCHIV_GRUND_LABEL[t.archiv_grund] || t.archiv_grund,
                      t.archiviert_am ? `am ${new Date(t.archiviert_am).toLocaleDateString('de-AT')}` : null,
                      t.archiviert_von ? `von ${personName[t.archiviert_von] || t.archiviert_von}` : null,
                      t.archiv_status_vorher ? `vorher ${TICKET_STATUS_LABELS[t.archiv_status_vorher] || t.archiv_status_vorher}` : null,
                    ].filter(Boolean).join(' · ')}
                </p>
              </div>
            </label>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}