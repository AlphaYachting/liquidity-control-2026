import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Mail, Archive, Repeat, Trash2, RotateCcw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SprintTimerStart from '@/components/sprint/timer/SprintTimerStart';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import TicketChecklist from '@/components/sprint/ticket/TicketChecklist';
import TicketLinks from '@/components/sprint/ticket/TicketLinks';
import KommentarStrang from '@/components/sprint/kommentare/KommentarStrang';
import { schreibeSystemEintrag } from '@/lib/sprint/systemComment';
import { useMeldeZeitKontext } from '@/lib/sprint/ZeitKontext';
import { ROLES, TICKET_STATUSES, TICKET_STATUS_LABELS, STATE_LABELS, fmtDate } from '@/components/sprint/sprintConfig';
import { RHYTHMUS_LABEL } from '@/components/sprint/paket/paketZaehler';
import { ARCHIV_GRUENDE, ARCHIV_GRUND_LABEL } from '@/lib/sprint/aktivFilter';
import { ticketBereinigen, darfBereinigen } from '@/lib/sprint/ticketBereinigen';

const STATES = ['input', 'produktion', 'pruefung', 'kundenfeedback'];
const ORIGIN_LABEL = {
  pflicht: 'Pflichtaufgabe',
  addon: 'Zusatz',
  change_request: 'Change Request · nach Aufwand abrechenbar',
  support: 'Support',
};
const h1 = (v) => (v || 0).toLocaleString('de-AT', { maximumFractionDigits: 1 });
const kurz = (d) => (d ? fmtDate(d).slice(0, 6) : null);

// Feldbezeichnung im Panel — wie in den Formularen, nicht als Sektionslabel
const Feld = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-[#555555]">{children}</label>
);

// Arbeitsplatz eines Tickets: Projektkontext (Projekt, Kunde, Etappe, Projektleitung) oben,
// darunter Zuständigkeit, Status, Phase, Plan gegen Ist, Inhalt, Checkliste, Verweise, Kommentare.
// Wer über „Mein Tag“ oder die Suche direkt in eine Aufgabe springt, sieht sofort, wohin sie gehört.
export default function TicketDetailPanel({ ticket, members = [], open, onOpenChange, onSaved }) {
  const [form, setForm] = useState(ticket || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(ticket || {}); }, [ticket?.id, open]);

  const { data: gebucht = 0 } = useQuery({
    enabled: Boolean(open && ticket?.id),
    queryKey: ['ticketHours', ticket?.id],
    queryFn: async () => {
      const rows = await base44.entities.TimeEntry.filter({ ticket_id: ticket.id }, '-entry_date', 500);
      return rows.reduce((s, r) => s + (r.hours || 0), 0);
    },
  });

  useMeldeZeitKontext(
    { project_id: ticket?.project_id, ticket_id: ticket?.id, quelle: 'aufgabe' },
    Boolean(open && ticket?.id),
  );

  // Archivieren / Routine beenden / Löschen — nur Projektverantwortliche und Admins
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me(), enabled: Boolean(open) });
  const { data: kontext } = useQuery({
    queryKey: ['ticketKontext', ticket?.milestone_id, ticket?.project_id],
    enabled: Boolean(open && ticket?.id),
    queryFn: async () => {
      const milestone = ticket.milestone_id
        ? await base44.entities.Milestone.get(ticket.milestone_id).catch(() => null)
        : null;
      let projectId = ticket.project_id;
      if (!projectId && milestone?.sprint_id) {
        const sprint = await base44.entities.Sprint.get(milestone.sprint_id).catch(() => null);
        projectId = sprint?.project_id;
      }
      const project = projectId ? await base44.entities.Project.get(projectId).catch(() => null) : null;
      const client = project?.client_id ? await base44.entities.Client.get(project.client_id).catch(() => null) : null;
      return { milestone, project, client };
    },
  });
  const projekt = kontext?.project || null;
  const [aktion, setAktion] = useState(null);
  const [grund, setGrund] = useState('nicht_mehr_relevant');
  const [pruefung, setPruefung] = useState(null);
  const [bestaetigt, setBestaetigt] = useState(false);
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => { setAktion(null); setPruefung(null); setBestaetigt(false); setFehler(''); }, [ticket?.id, open]);

  if (!ticket) return null;

  const darf = darfBereinigen(me, projekt);
  const istAdmin = me?.role === 'admin';
  const archiviert = !!ticket.archiviert;

  const waehle = async (neu) => {
    setFehler('');
    setBestaetigt(false);
    setAktion(aktion === neu ? null : neu);
    if (neu === 'loeschen' && aktion !== neu) {
      setPruefung(null);
      try {
        const r = await ticketBereinigen('pruefen', [ticket.id]);
        setPruefung(r.tickets[0] || null);
      } catch (e) { setFehler(e.message); }
    }
  };

  const ausfuehren = async (name, grundWert) => {
    setLaeuft(true);
    setFehler('');
    try {
      const r = await ticketBereinigen(name, [ticket.id], grundWert);
      if (r.abgelehnt.length) {
        setFehler(r.abgelehnt[0].grund);
      } else {
        onSaved?.();
        onOpenChange(false);
      }
    } catch (e) {
      setFehler(e.message);
    }
    setLaeuft(false);
  };

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const plan = Number(form.target_hours) || 0;
  const pct = plan > 0 ? Math.min(100, Math.round((gebucht / plan) * 100)) : 0;

  const speichern = async () => {
    setSaving(true);
    await base44.entities.Ticket.update(ticket.id, {
      title: form.title,
      description: form.description || '',
      checklist: form.checklist || [],
      links: form.links || [],
      assignee_email: form.assignee_email || '',
      role: form.role,
      milestone_state: form.milestone_state,
      status: form.status,
      target_hours: plan || undefined,
      ...(form.status !== ticket.status ? { last_status_change: new Date().toISOString() } : {}),
    });
    if (form.status !== ticket.status) {
      await schreibeSystemEintrag({
        project_id: ticket.project_id,
        milestone_id: ticket.milestone_id,
        ticket_id: ticket.id,
        text: `Status von „${ticket.status}" auf „${form.status}" gesetzt.`,
      });
    }
    setSaving(false);
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left text-base">Aufgabe</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {archiviert && (
            <div className="rounded border border-border bg-muted px-3 py-2 text-sm flex items-center justify-between gap-3">
              <span>
                <span className="font-semibold">Archiviert</span>
                {ticket.archiviert_am ? ` am ${new Date(ticket.archiviert_am).toLocaleDateString('de-AT')}` : ''}
                {ticket.archiviert_von ? ` von ${ticket.archiviert_von}` : ''}
                {ticket.archiv_grund ? ` · ${ARCHIV_GRUND_LABEL[ticket.archiv_grund] || ticket.archiv_grund}` : ''}
              </span>
              {darf && (
                <Button size="sm" variant="outline" className="h-7 shrink-0" disabled={laeuft} onClick={() => ausfuehren('wiederherstellen')}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Wiederherstellen
                </Button>
              )}
            </div>
          )}
          <fieldset disabled={archiviert} className="space-y-5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {ORIGIN_LABEL[ticket.origin] || ticket.origin}
            </span>
            {ticket.customer_name && (
              <span className="text-xs text-muted-foreground">{ticket.customer_name}</span>
            )}
            {ticket.rhythmus && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                Routine · {RHYTHMUS_LABEL[ticket.rhythmus] || ticket.rhythmus}
              </span>
            )}
            {ticket.source_thread_id && (
              <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
                <Link to={`/crm/emails?thread=${ticket.source_thread_id}`}>
                  <Mail className="w-3.5 h-3.5" /> Kundenkonversation öffnen
                </Link>
              </Button>
            )}
          </div>

          <Input value={form.title || ''} onChange={(e) => set({ title: e.target.value })} className="font-semibold" />

          <div>
            <SectionLabel className="mb-1.5">Beschreibung</SectionLabel>
            <Textarea rows={5} value={form.description || ''} onChange={(e) => set({ description: e.target.value })}
              placeholder="Was ist zu tun, worauf kommt es an?" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <SectionLabel className="mb-1.5">Person</SectionLabel>
              <Select value={form.assignee_email || 'none'}
                onValueChange={(v) => set({ assignee_email: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">nicht zugewiesen</SelectItem>
                  {members.map((m) => <SelectItem key={m.email} value={m.email}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <SectionLabel className="mb-1.5">Rolle</SectionLabel>
              <Select value={form.role || ''} onValueChange={(v) => set({ role: v })}>
                <SelectTrigger><SelectValue placeholder="Rolle wählen" /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <SectionLabel className="mb-1.5">Etappe</SectionLabel>
              <Select value={form.milestone_state || 'produktion'} onValueChange={(v) => set({ milestone_state: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATES.map((s) => <SelectItem key={s} value={s}>{STATE_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <SectionLabel className="mb-1.5">Status</SectionLabel>
              <Select value={form.status || 'offen'} onValueChange={(v) => set({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{TICKET_STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <SectionLabel className="mb-1.5">Stunden</SectionLabel>
            <div className="flex items-center gap-3">
              <Input type="number" step="0.5" className="h-8 w-24" value={form.target_hours ?? ''}
                onChange={(e) => set({ target_hours: e.target.value })} placeholder="Plan" />
              <div className="flex-1">
                <p className="text-xs font-semibold">{h1(gebucht)} von {h1(plan)} h gebucht</p>
                <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div>
            <SectionLabel className="mb-1.5">Checkliste</SectionLabel>
            <TicketChecklist items={form.checklist || []} onChange={(checklist) => set({ checklist })} />
          </div>

          <div>
            <SectionLabel className="mb-1.5">Verweise</SectionLabel>
            <TicketLinks items={form.links || []} onChange={(links) => set({ links })} />
          </div>

          <div>
            <SectionLabel className="mb-1.5">Kommentare & Notizen</SectionLabel>
            <KommentarStrang projectId={ticket.project_id} ticketId={ticket.id} milestoneId={ticket.milestone_id} compact />
          </div>

          </fieldset>

          <div className="flex gap-2">
            {!archiviert && <Button onClick={speichern} disabled={saving}>Speichern</Button>}
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Schließen</Button>
          </div>

          {darf && !archiviert && (
            <div className="border-t border-border pt-4 pb-4 space-y-3">
              <SectionLabel>Weitere Aktionen</SectionLabel>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded" onClick={() => waehle('archivieren')}>
                  <Archive className="w-3.5 h-3.5 mr-1" /> Archivieren
                </Button>
                {ticket.rhythmus && ticket.status !== 'erledigt' && (
                  <Button size="sm" variant="outline" className="rounded" onClick={() => waehle('routine')}>
                    <Repeat className="w-3.5 h-3.5 mr-1" /> Routine beenden
                  </Button>
                )}
                {istAdmin && (
                  <Button size="sm" variant="outline" className="rounded text-red-700 border-red-200 hover:bg-red-50" onClick={() => waehle('loeschen')}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Löschen
                  </Button>
                )}
              </div>

              {aktion === 'archivieren' && (
                <div className="rounded border border-border p-3 space-y-2">
                  <p className="text-sm">Die Aufgabe verschwindet aus allen Listen. Gebuchte Zeiten bleiben unverändert; wiederherstellen ist jederzeit möglich.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={grund} onValueChange={setGrund}>
                      <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ARCHIV_GRUENDE.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" disabled={laeuft} onClick={() => ausfuehren('archivieren', grund)}>Archivieren</Button>
                  </div>
                </div>
              )}

              {aktion === 'routine' && (
                <div className="rounded border border-border p-3 space-y-2">
                  <p className="text-sm">Es wird kein weiterer Durchlauf erzeugt. Dieser offene Durchlauf wird archiviert, erledigte Durchläufe bleiben als Leistungsnachweis erhalten.</p>
                  <Button size="sm" disabled={laeuft} onClick={() => ausfuehren('routine_beenden')}>Routine beenden</Button>
                </div>
              )}

              {aktion === 'loeschen' && (
                <div className="rounded border border-red-200 p-3 space-y-2">
                  {!pruefung && !fehler && <p className="text-sm text-muted-foreground">Prüfe Verknüpfungen …</p>}
                  {pruefung && !pruefung.loeschbar && (
                    <p className="text-sm">Nicht löschbar: {pruefung.grund_nicht_loeschbar}. Bitte archivieren.</p>
                  )}
                  {pruefung?.loeschbar && (
                    <>
                      <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                        <input type="checkbox" className="mt-0.5" checked={bestaetigt} onChange={(e) => setBestaetigt(e.target.checked)} />
                        Diese Aufgabe endgültig löschen. Das lässt sich nicht rückgängig machen.
                      </label>
                      <Button size="sm" variant="destructive" disabled={!bestaetigt || laeuft} onClick={() => ausfuehren('loeschen')}>
                        Endgültig löschen
                      </Button>
                    </>
                  )}
                </div>
              )}

              {fehler && <p className="text-sm text-red-700">{fehler}</p>}
            </div>
          )}
          {!(darf && !archiviert) && <div className="pb-4" />}
        </div>
      </SheetContent>
    </Sheet>
  );
}