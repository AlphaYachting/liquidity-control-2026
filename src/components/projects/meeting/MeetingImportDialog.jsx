import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, Check, ChevronDown, ChevronRight, AlertTriangle, MessageSquare } from 'lucide-react';
import PersonenChip from '@/components/sprint/PersonenChip';
import { useAuth } from '@/lib/AuthContext';
import { useZugriff } from '@/lib/useZugriff';
import { leseDatei, transkribiereAudio } from '@/lib/meeting/quelleLesen';
import { ladeMeetingKontext, werteMeetingAus } from '@/lib/meeting/meetingAuswertung';
import { crWaehlbar, crArt, zeileZuTicket } from '@/lib/meeting/meetingZeilen';
import { legeTicketsAn, pruefeZeile, etappeFreigegeben } from '@/lib/sprint/ticketAnlage';

const heuteIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const klein = (s) => String(s || '').trim().toLowerCase();
const datumAT = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('de-AT') : '');

// Meeting-Import aus der Projektintelligenz: Transkript → Vorschlagsliste → nach Bestätigung
// Tickets, Kommentare an bestehenden Tickets und ein Eintrag im Projektakt.
// projectId = Arbeitsprojekt (Project.id) — derselbe, an dem der Projektakt hängt.
export default function MeetingImportDialog({ open, onClose, projectId, projectName, customer }) {
  const { user } = useAuth();
  const zugriff = useZugriff();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState('quelle'); // quelle | liest | wertet | pruefen | legt_an | fertig
  const [quelle, setQuelle] = useState('datei');
  const [eingefuegt, setEingefuegt] = useState('');
  const [transkript, setTranskript] = useState(null); // { text, name }
  const [meetingDatum, setMeetingDatum] = useState(heuteIso());
  const [teilnehmer, setTeilnehmer] = useState('');
  const [ctx, setCtx] = useState(null);
  const [ergebnis, setErgebnis] = useState(null);
  const [zeilen, setZeilen] = useState([]);
  const [fortschritt, setFortschritt] = useState(null);
  const [fehler, setFehler] = useState('');
  const [abschluss, setAbschluss] = useState(null);
  const [zusammenfassungOffen, setZusammenfassungOffen] = useState(true);
  const dateiRef = useRef(null);
  const audioRef = useRef(null);
  const laeuft = useRef(false);

  useEffect(() => {
    if (!open) return;
    setPhase('quelle'); setQuelle('datei'); setEingefuegt(''); setTranskript(null);
    setMeetingDatum(heuteIso()); setTeilnehmer(''); setErgebnis(null); setZeilen([]);
    setFortschritt(null); setFehler(''); setAbschluss(null); setZusammenfassungOffen(true);
    laeuft.current = false;
    let aktiv = true;
    ladeMeetingKontext(projectId)
      .then((c) => { if (aktiv) setCtx(c); })
      .catch((e) => { if (aktiv) setFehler('Projekt konnte nicht geladen werden: ' + (e?.message || '')); });
    return () => { aktiv = false; };
  }, [open, projectId]);

  const leitung = useMemo(() => {
    if (!user || !ctx) return false;
    if (user.role === 'admin' || zugriff.rechte?.fuehrung) return true;
    return !!ctx.projekt?.pm_email && klein(ctx.projekt.pm_email) === klein(user.email);
  }, [user, ctx, zugriff.rechte?.fuehrung]);

  const etappeVon = useMemo(() => Object.fromEntries((ctx?.etappen || []).map((m) => [m.id, m])), [ctx]);
  const memberVon = (email) => (ctx?.team || []).find((m) => klein(m.email) === klein(email)) || { email, name: email };
  const nurEineEtappe = (ctx?.etappen || []).length === 1;

  // ---------- Schritt 1: Quelle lesen ----------
  const dateiGewaehlt = async (file) => {
    setFehler(''); setPhase('liest');
    try { setTranskript(await leseDatei(file)); } catch (e) { setFehler(e?.message || 'Datei konnte nicht gelesen werden'); }
    setPhase('quelle');
  };
  const audioGewaehlt = async (file) => {
    setFehler(''); setPhase('liest');
    try { setTranskript(await transkribiereAudio(file)); } catch (e) { setFehler('Transkription fehlgeschlagen: ' + (e?.message || '')); }
    setPhase('quelle');
  };

  const text = quelle === 'text' ? eingefuegt.trim() : (transkript?.text || '');

  const auswerten = async () => {
    if (!text || !ctx) return;
    setFehler(''); setPhase('wertet'); setFortschritt(null);
    try {
      const res = await werteMeetingAus({
        text, meetingDatum, ctx, onFortschritt: (n, von) => setFortschritt(von > 1 ? { n, von } : null),
      });
      setErgebnis(res);
      if (!teilnehmer && res.teilnehmer) setTeilnehmer(res.teilnehmer);
      setZeilen(res.aufgaben.map((a) => ({
        ...a,
        an: true,
        change_request: a.change_request_vorschlag,
        als_kommentar: !!a.aehnliches_ticket,
      })));
      setPhase('pruefen');
    } catch (e) {
      setFehler('Auswertung fehlgeschlagen: ' + (e?.message || ''));
      setPhase('quelle');
    }
  };

  // ---------- Schritt 2: Prüfliste ----------
  const aendere = (key, felder) => setZeilen((zs) => zs.map((z) => (z.key === key ? { ...z, ...felder } : z)));

  const zeilenStatus = useMemo(() => zeilen.map((z) => {
    if (!z.an) return { ...z, gruende: [] };
    if (z.als_kommentar && z.aehnliches_ticket) return { ...z, gruende: [] };
    const etappe = etappeVon[z.milestone_id];
    const ticket = zeileZuTicket(z, { leitung, projekttyp: ctx?.projekttyp, etappe, meetingDatum });
    return { ...z, gruende: pruefeZeile(ticket, etappe) };
  }), [zeilen, etappeVon, leitung, ctx, meetingDatum]);

  const neueTickets = zeilenStatus.filter((z) => z.an && !(z.als_kommentar && z.aehnliches_ticket));
  const kommentare = zeilenStatus.filter((z) => z.an && z.als_kommentar && z.aehnliches_ticket);
  const unvollstaendig = zeilenStatus.filter((z) => z.an && z.gruende.length).length;

  // ---------- Schritt 3: Anlegen ----------
  const anlegen = async () => {
    if (laeuft.current || unvollstaendig) return;
    laeuft.current = true;
    setPhase('legt_an'); setFehler('');
    const me = user || await base44.auth.me().catch(() => null);
    const bericht = { tickets: [], kommentare: 0, fehler: [], projektakt: false };
    try {
      // 1. Transkript als Textdatei ablegen (nie die Audiodatei)
      let fileUrl = '';
      const dateiname = `Transkript_${meetingDatum}.txt`;
      try {
        const datei = new File([text], dateiname, { type: 'text/plain' });
        fileUrl = (await base44.integrations.Core.UploadFile({ file: datei })).file_url || '';
      } catch { /* Eintrag entsteht trotzdem, nur ohne Anhang */ }

      // 2. Projektakt-Eintrag zuerst — die Tickets verweisen darauf
      const kopf = [
        ergebnis.zusammenfassung,
        ergebnis.vereinbarungen.length ? `\nVereinbart:\n${ergebnis.vereinbarungen.map((v) => `• ${v}`).join('\n')}` : '',
        ergebnis.offene_fragen.length ? `\nOffene Fragen:\n${ergebnis.offene_fragen.map((v) => `• ${v}`).join('\n')}` : '',
      ].filter(Boolean).join('\n');
      const eintrag = await base44.entities.ProjectFileEntry.create({
        project_id: projectId,
        entry_type: 'vereinbarung',
        title: `Meeting ${datumAT(meetingDatum)}`,
        content: kopf,
        ai_summary: ergebnis.zusammenfassung.split(/(?<=\.)\s/)[0] || '',
        ...(fileUrl ? { file_url: fileUrl, file_name: dateiname } : {}),
        entry_date: new Date(`${meetingDatum}T12:00:00`).toISOString(),
        recorded_by: me?.full_name || me?.email || '',
        participants: teilnehmer,
        follow_up_text: '',
        follow_up_done: false,
      });
      bericht.projektakt = true;

      // 3. Neue Tickets über die gemeinsame Anlage
      const ticketZeilen = neueTickets.map((z) => zeileZuTicket(z, {
        leitung, projekttyp: ctx.projekttyp, etappe: etappeVon[z.milestone_id], meetingDatum, projektaktId: eintrag.id,
      }));
      const res = await legeTicketsAn(ticketZeilen, { projectId });
      bericht.tickets = res.angelegt.map((t) => ({ title: t.title, art: neueTickets[t._index] ? crArt(neueTickets[t._index], { leitung, projekttyp: ctx.projekttyp, etappe: etappeVon[neueTickets[t._index].milestone_id] }) : 'pflicht', kunde: t.status === 'wartet' }));
      res.fehler.forEach((f) => bericht.fehler.push(`${neueTickets[f.index]?.titel || 'Aufgabe'}: ${f.grund}`));

      // 4. Kommentare an bestehenden Tickets
      for (const z of kommentare) {
        try {
          await base44.entities.Comment.create({
            project_id: projectId,
            ticket_id: z.aehnliches_ticket.id,
            ...(z.aehnliches_ticket.milestone_id ? { milestone_id: z.aehnliches_ticket.milestone_id } : {}),
            author_email: me?.email || '',
            text: `Aus dem Meeting vom ${datumAT(meetingDatum)}: ${z.titel}${z.beleg ? ` — „${z.beleg}“` : ''}`,
            created_at: new Date().toISOString(),
          });
          bericht.kommentare += 1;
        } catch (e) {
          bericht.fehler.push(`Kommentar zu „${z.aehnliches_ticket.title}“: ${e?.message || 'fehlgeschlagen'}`);
        }
      }

      // 5. Projektakt-Eintrag um das Ergebnis ergänzen
      const liste = [
        bericht.tickets.length ? `\nAngelegte Aufgaben:\n${bericht.tickets.map((t) => `• ${t.title}${t.kunde ? ' (wartet auf Kunde)' : ''}${t.art === 'change_request' ? ' (Change Request)' : t.art === 'pruefen' ? ' (Kundenwunsch — Projektleitung prüft)' : ''}`).join('\n')}` : '',
        kommentare.length ? `\nZu bestehenden Aufgaben kommentiert:\n${kommentare.map((z) => `• ${z.aehnliches_ticket.title}`).join('\n')}` : '',
      ].filter(Boolean).join('\n');
      if (liste) await base44.entities.ProjectFileEntry.update(eintrag.id, { content: `${kopf}\n${liste}` }).catch(() => {});

      setAbschluss(bericht);
      setPhase('fertig');
    } catch (e) {
      bericht.fehler.push(e?.message || 'Anlage fehlgeschlagen');
      setAbschluss(bericht);
      setPhase('fertig');
    }
    ['projektAufgaben', 'projektZusagen', 'sprintHeute', 'meinTag', 'tickets'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    queryClient.invalidateQueries({ predicate: (q) => /ticket|aufgabe|projektakt|kundenakt|heute/i.test(JSON.stringify(q.queryKey)) });
  };

  const schliessen = () => { if (phase !== 'legt_an' && phase !== 'wertet') onClose(); };

  // ---------- Darstellung ----------
  const beschaeftigt = phase === 'liest' || phase === 'wertet' || phase === 'legt_an';
  const knopfText = (() => {
    const t = neueTickets.length; const k = kommentare.length;
    const teile = [];
    if (t) teile.push(t === 1 ? '1 Aufgabe anlegen' : `${t} Aufgaben anlegen`);
    if (k) teile.push(k === 1 ? '1 Kommentar anhängen' : `${k} Kommentare anhängen`);
    return teile.length ? teile.join(' · ') : 'Nur im Projektakt festhalten';
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) schliessen(); }}>
      <DialogContent className="w-[92vw] max-w-[92vw] sm:max-w-[1100px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Meeting importieren{projectName ? ` — ${[customer, projectName].filter(Boolean).join(' · ')}` : ''}
          </DialogTitle>
        </DialogHeader>

        {(phase === 'quelle' || phase === 'liest' || phase === 'wertet') && (
          <div className="space-y-3">
            <Tabs value={quelle} onValueChange={(v) => { setQuelle(v); setFehler(''); }}>
              <TabsList className="w-full">
                <TabsTrigger value="datei" className="flex-1 text-xs" disabled={beschaeftigt}>Datei</TabsTrigger>
                <TabsTrigger value="text" className="flex-1 text-xs" disabled={beschaeftigt}>Text einfügen</TabsTrigger>
                <TabsTrigger value="audio" className="flex-1 text-xs" disabled={beschaeftigt}>Audio</TabsTrigger>
              </TabsList>
            </Tabs>

            {quelle === 'datei' && (
              <div className="space-y-1.5">
                <Button type="button" variant="outline" size="sm" className="gap-2" disabled={beschaeftigt}
                  onClick={() => dateiRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5" /> Transkript hochladen (.vtt, .srt, .txt, .md, .docx, .pdf)
                </Button>
                <input ref={dateiRef} type="file" className="hidden" accept=".txt,.md,.vtt,.srt,.pdf,.docx,.doc,text/plain"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) dateiGewaehlt(f); e.target.value = ''; }} />
              </div>
            )}
            {quelle === 'audio' && (
              <div className="space-y-1.5">
                <Button type="button" variant="outline" size="sm" className="gap-2" disabled={beschaeftigt}
                  onClick={() => audioRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5" /> Audiodatei hochladen
                </Button>
                <input ref={audioRef} type="file" className="hidden" accept="audio/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) audioGewaehlt(f); e.target.value = ''; }} />
                <p className="text-[11px] text-muted-foreground">Die Aufnahme wird nur transkribiert und nirgends im Projekt gespeichert.</p>
              </div>
            )}
            {quelle === 'text' && (
              <Textarea value={eingefuegt} onChange={(e) => setEingefuegt(e.target.value)} disabled={beschaeftigt}
                placeholder="Transkript oder Gesprächsnotizen hier einfügen …" className="min-h-[200px] text-sm" />
            )}

            {phase === 'liest' && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {quelle === 'audio' ? 'Wird transkribiert …' : 'Datei wird gelesen …'}
              </p>
            )}
            {quelle !== 'text' && transkript && phase !== 'liest' && (
              <div className="rounded border bg-muted/40 px-3 py-2">
                <p className="text-xs font-medium flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-status-done" /> {transkript.name} · {transkript.text.length.toLocaleString('de-AT')} Zeichen</p>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">{transkript.text.slice(0, 400)}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Datum des Meetings</Label>
                <Input type="date" value={meetingDatum} onChange={(e) => setMeetingDatum(e.target.value)}
                  disabled={beschaeftigt} className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Teilnehmer (optional)</Label>
                <Input value={teilnehmer} onChange={(e) => setTeilnehmer(e.target.value)} disabled={beschaeftigt}
                  placeholder="z. B. M. Galler, Kunde M. Huber" className="mt-1 h-8 text-xs" />
              </div>
            </div>

            {ctx && !ctx.etappen.length && (
              <p className="text-xs text-status-attention flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Dieses Projekt hat noch keine Etappe — Aufgaben lassen sich erst anlegen, wenn eine Etappe existiert. Zusammenfassung und Projektakt funktionieren trotzdem.
              </p>
            )}
            {fehler && <p className="text-xs text-destructive">{fehler}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={schliessen} disabled={beschaeftigt}>Abbrechen</Button>
              <Button size="sm" className="gap-2" onClick={auswerten} disabled={beschaeftigt || !text || !ctx}>
                {phase === 'wertet' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {phase === 'wertet'
                  ? (fortschritt ? `Projektintelligenz wertet aus … (${fortschritt.n}/${fortschritt.von})` : 'Projektintelligenz wertet aus …')
                  : 'Auswerten'}
              </Button>
            </div>
          </div>
        )}

        {(phase === 'pruefen' || phase === 'legt_an') && ergebnis && (
          <div className="space-y-4">
            <div className="rounded border px-3 py-2.5 space-y-2">
              <button type="button" onClick={() => setZusammenfassungOffen((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium">
                {zusammenfassungOffen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Zusammenfassung · Meeting vom {datumAT(meetingDatum)}
              </button>
              {zusammenfassungOffen && (
                <div className="space-y-2 text-sm">
                  <p className="whitespace-pre-wrap">{ergebnis.zusammenfassung || '—'}</p>
                  {ergebnis.vereinbarungen.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vereinbart</p>
                      <ul className="list-disc pl-5 text-[13px]">{ergebnis.vereinbarungen.map((v, i) => <li key={i}>{v}</li>)}</ul>
                    </div>
                  )}
                  {ergebnis.offene_fragen.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Offene Fragen</p>
                      <ul className="list-disc pl-5 text-[13px]">{ergebnis.offene_fragen.map((v, i) => <li key={i}>{v}</li>)}</ul>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">Wird mit dem Transkript als Eintrag im Projektakt gespeichert.</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium">
                Vorgeschlagene Aufgaben ({zeilen.length}) — nur angehakte werden übernommen
              </p>
              {zeilen.length === 0 && (
                <p className="text-sm text-muted-foreground">Im Gespräch wurden keine Aufgaben vereinbart.</p>
              )}
              {zeilenStatus.map((z) => {
                const etappe = etappeVon[z.milestone_id];
                const alsKommentar = z.als_kommentar && z.aehnliches_ticket;
                const art = crArt(z, { leitung, projekttyp: ctx.projekttyp, etappe });
                const rot = z.an && z.gruende.length > 0;
                return (
                  <div key={z.key} className={`rounded border bg-card px-3 py-2.5 space-y-2 ${rot ? 'border-destructive' : ''}`}
                    style={{ opacity: z.an ? 1 : 0.55 }}>
                    <div className="flex items-start gap-2.5">
                      <input type="checkbox" className="mt-1.5" checked={z.an} disabled={phase === 'legt_an'}
                        onChange={(e) => aendere(z.key, { an: e.target.checked })} aria-label="übernehmen" />
                      <div className="flex-1 min-w-0 space-y-1">
                        <Input value={z.titel} onChange={(e) => aendere(z.key, { titel: e.target.value })}
                          disabled={!z.an || phase === 'legt_an'} className="h-8 text-sm font-medium" />
                        {z.beleg && <p className="text-[11px] text-muted-foreground italic">„{z.beleg}“</p>}
                      </div>
                    </div>

                    {z.an && (
                      <div className="pl-6 space-y-2">
                        {z.aehnliches_ticket && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Ähnlich: <strong>{z.aehnliches_ticket.title}</strong></span>
                            <div className="flex gap-1">
                              <button type="button" onClick={() => aendere(z.key, { als_kommentar: true })}
                                className={`px-2 py-0.5 rounded border ${z.als_kommentar ? 'border-foreground bg-foreground text-background' : 'border-border'}`}>
                                Als Kommentar anhängen
                              </button>
                              <button type="button" onClick={() => aendere(z.key, { als_kommentar: false })}
                                className={`px-2 py-0.5 rounded border ${!z.als_kommentar ? 'border-foreground bg-foreground text-background' : 'border-border'}`}>
                                Trotzdem neu anlegen
                              </button>
                            </div>
                          </div>
                        )}

                        {!alsKommentar && (
                          <div className="flex flex-wrap items-end gap-3">
                            <div>
                              <Label className="text-[10px] text-muted-foreground">Art</Label>
                              <div className="flex gap-1 mt-1">
                                {[['rittler', 'Rittler'], ['kunde', 'Wartet auf Kunde']].map(([w, l]) => (
                                  <button key={w} type="button" onClick={() => aendere(z.key, { art: w })}
                                    className={`h-8 px-2.5 rounded border text-xs ${z.art === w ? 'border-foreground bg-foreground text-background' : 'border-border'}`}>
                                    {l}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <Label className="text-[10px] text-muted-foreground">{z.art === 'kunde' ? 'Nachfassen' : 'Zuständig'}</Label>
                              <div className="mt-1 h-8 flex items-center gap-2">
                                <PersonenChip
                                  members={ctx.team}
                                  zustaendige={(z.assignee_emails || []).map(memberVon)}
                                  currentUserEmail={user?.email}
                                  onToggle={(email, war) => setZeilen((zs) => zs.map((r) => (r.key !== z.key ? r : {
                                    ...r,
                                    assignee_emails: war
                                      ? (r.assignee_emails || []).filter((e) => klein(e) !== klein(email))
                                      : [...(r.assignee_emails || []), klein(email)],
                                  })))}
                                  onLeeren={() => aendere(z.key, { assignee_emails: [] })}
                                />
                                {!(z.assignee_emails || []).length && z.person_genannt && (
                                  <span className="text-[11px] text-muted-foreground">im Transkript: {z.person_genannt}</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <Label className="text-[10px] text-muted-foreground">Termin</Label>
                              <Input type="date" value={z.termin} onChange={(e) => aendere(z.key, { termin: e.target.value })}
                                className="mt-1 h-8 text-xs w-[150px]" />
                            </div>
                            {!nurEineEtappe && (
                              <div className="min-w-[200px]">
                                <Label className="text-[10px] text-muted-foreground">Etappe</Label>
                                <Select value={z.milestone_id || undefined} onValueChange={(v) => aendere(z.key, { milestone_id: v })}>
                                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Etappe wählen" /></SelectTrigger>
                                  <SelectContent>
                                    {ctx.etappen.map((m) => (
                                      <SelectItem key={m.id} value={m.id} className="text-xs">
                                        {m.title}{etappeFreigegeben(m) ? ' · freigegeben' : ''}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            {crWaehlbar(ctx.projekttyp, etappe) && leitung && (
                              <div>
                                <Label className="text-[10px] text-muted-foreground">Abrechnung</Label>
                                <div className="flex gap-1 mt-1">
                                  {[[false, 'Im Auftrag'], [true, 'Change Request']].map(([w, l]) => (
                                    <button key={l} type="button" onClick={() => aendere(z.key, { change_request: w })}
                                      title={z.begruendung || undefined}
                                      className={`h-8 px-2.5 rounded border text-xs ${!!z.change_request === w ? 'border-foreground bg-foreground text-background' : 'border-border'}`}>
                                      {l}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {!alsKommentar && art === 'pruefen' && (
                          <p className="text-[11px] text-status-attention">
                            Möglicher Change Request — die Projektleitung entscheidet, ob er als Mehraufwand geführt wird.
                          </p>
                        )}
                        {!alsKommentar && z.neuer_wunsch && z.begruendung && art !== 'pruefen' && (
                          <p className="text-[11px] text-muted-foreground">Neuer Kundenwunsch: {z.begruendung}</p>
                        )}
                        {rot && <p className="text-[11px] text-destructive">{z.gruende.join(' · ')}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {fehler && <p className="text-xs text-destructive">{fehler}</p>}
            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-[11px] text-muted-foreground">
                {unvollstaendig > 0
                  ? `${unvollstaendig === 1 ? 'Einer Aufgabe fehlen' : `${unvollstaendig} Aufgaben fehlen`} noch Angaben — Person und Termin sind Pflicht.`
                  : 'Nichts wird angelegt, bevor du bestätigst.'}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPhase('quelle')} disabled={phase === 'legt_an'}>Zurück</Button>
                <Button size="sm" className="gap-2" onClick={anlegen} disabled={phase === 'legt_an' || unvollstaendig > 0}>
                  {phase === 'legt_an' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {phase === 'legt_an' ? 'Legt an …' : knopfText}
                </Button>
              </div>
            </div>
          </div>
        )}

        {phase === 'fertig' && abschluss && (
          <div className="space-y-3">
            <p className="text-sm flex items-center gap-2">
              <Check className="w-4 h-4 text-status-done" />
              {[
                abschluss.tickets.length ? `${abschluss.tickets.length} ${abschluss.tickets.length === 1 ? 'Aufgabe' : 'Aufgaben'} angelegt` : null,
                abschluss.kommentare ? `${abschluss.kommentare} ${abschluss.kommentare === 1 ? 'Kommentar' : 'Kommentare'} angehängt` : null,
                abschluss.projektakt ? 'Eintrag im Projektakt gespeichert' : null,
              ].filter(Boolean).join(', ') || 'Nichts gespeichert'}.
            </p>
            {abschluss.tickets.some((t) => t.art === 'pruefen') && (
              <p className="text-xs text-muted-foreground">Kundenwünsche zur Prüfung sind für die Projektleitung markiert.</p>
            )}
            {abschluss.fehler.length > 0 && (
              <div className="rounded border border-destructive/40 px-3 py-2">
                <p className="text-xs font-medium text-destructive">Nicht alles hat geklappt:</p>
                <ul className="list-disc pl-5 text-xs">{abschluss.fehler.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            )}
            <div className="flex justify-end"><Button size="sm" onClick={onClose}>Schließen</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
