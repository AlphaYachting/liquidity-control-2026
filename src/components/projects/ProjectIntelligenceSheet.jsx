import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { BrainCircuit, Send, RotateCcw, FolderPlus, Mic, Square, PenLine, Loader2 } from 'lucide-react';
import ProjektupdateEinstieg from '@/components/projects/kundenakt/ProjektupdateEinstieg';
import KundenaktVorschlagKarte from '@/components/projects/kundenakt/KundenaktVorschlagKarte';
import { ausformuliereEintrag, speichereEintrag } from '@/components/projects/kundenakt/kundenaktAusformulierung';
import useSpracheingabe from '@/lib/useSpracheingabe';
import MessageBubble from '@/components/agent/MessageBubble';
import { toast } from 'sonner';
import { QUICK_FRAGEN } from '@/components/projects/projektIntelligenzFragen';
import KundenaktEntryDialog from '@/components/projects/kundenakt/KundenaktEntryDialog';

import { faktenBlock } from '@/components/projects/intelligenzFakten';

const MARKER = '[FESTHALTEN_ANGEBOTEN]';

// Projektintelligenz als begleitendes Panel — die Seite dahinter bleibt sichtbar und bedienbar.
export default function ProjectIntelligenceSheet({
  open, onClose, projectId, projectName, customer, kennzahlen, finanzen, kontext,
}) {
  const [gespraech, setGespraech] = useState(null); // gespeicherter Datensatz je Projekt
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [aktEntry, setAktEntry] = useState(null);
  const [modus, setModus] = useState('frage'); // 'frage' | 'erfassung'
  const [rohtext, setRohtext] = useState('');
  const [vorschlag, setVorschlag] = useState(null);
  const [vorschlagFehler, setVorschlagFehler] = useState(false);
  const [formuliert, setFormuliert] = useState(false);
  const [speichernd, setSpeichernd] = useState(false);
  const endRef = useRef(null);
  const sprache = useSpracheingabe(setInput);

  const projectLabel = [customer, projectName].filter(Boolean).join(' · ') || 'Projekt';

  const contextPrefix = `Kontext: Ausgangspunkt ist das Projekt "${projectName || ''}" des Kunden "${customer || ''}" (LiquidityProject.id = ${projectId}). Hat der Kunde weitere Aufträge oder Projekte, nenne sie und sage, ob deine Antwort sie abdeckt. Triff keine Aussage über einen Auftrag, den du nicht geladen hast. Lade dazu auch den digitalen Kundenakt (ProjectFileEntry nach project_id) und gewichte dokumentierte Vereinbarungen am stärksten.\n\n${faktenBlock(kennzahlen, finanzen, kontext)}Frage: `;

  // Dauerhaft gespeichertes Gespräch beim Öffnen wiederherstellen
  useEffect(() => {
    if (!open || conversation || !projectId) return;
    let aktiv = true;
    (async () => {
      const treffer = await base44.entities.ProjektIntelligenzGespraech.filter(
        { project_id: projectId }, '-letzter_zugriff', 1
      );
      if (!aktiv || !treffer[0]) return;
      setGespraech(treffer[0]);
      setConversation({ id: treffer[0].conversation_id });
      base44.entities.ProjektIntelligenzGespraech.update(treffer[0].id, { letzter_zugriff: new Date().toISOString() });
    })();
    return () => { aktiv = false; };
  }, [open, projectId, conversation]);

  useEffect(() => {
    if (!conversation) return;
    const unsub = base44.agents.subscribeToConversation(conversation.id, (data) => {
      const msgs = data.messages || [];
      setMessages(msgs);
      if (msgs[msgs.length - 1]?.role === 'assistant') setSending(false);
    });
    return unsub;
  }, [conversation?.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' }); }, [messages.length]);

  const neuesGespraech = async () => {
    if (gespraech) await base44.entities.ProjektIntelligenzGespraech.delete(gespraech.id);
    setGespraech(null);
    setConversation(null);
    setMessages([]);
    setSending(false);
  };

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;
    setInput('');
    setSending(true);
    try {
      let conv = conversation;
      if (!conv) {
        conv = await base44.agents.createConversation({
          agent_name: 'cashflow_advisor',
          metadata: { name: `${projectLabel} · ${new Date().toLocaleDateString('de-AT')}` },
        });
        setConversation(conv);
        const record = await base44.entities.ProjektIntelligenzGespraech.create({
          project_id: projectId, conversation_id: conv.id, letzter_zugriff: new Date().toISOString(),
        });
        setGespraech(record);
      }
      await base44.agents.addMessage(conv, { role: 'user', content: contextPrefix + msg });
    } catch {
      toast.error('Nachricht konnte nicht verarbeitet werden.');
      setInput(msg);
      setSending(false);
    }
  };

  // Erfassungsmodus — die Eingabe geht nicht an den Agenten, sondern in die Ausformulierung
  const erfasse = async (text) => {
    const roh = (text || input).trim();
    if (!roh || formuliert) return;
    setRohtext(roh);
    setInput('');
    setVorschlag(null); setVorschlagFehler(false); setFormuliert(true);
    try {
      const v = await ausformuliereEintrag({ text: roh, projectName, customer, kennzahlen, finanzen });
      setVorschlag(v);
    } catch {
      setVorschlagFehler(true);
    }
    setFormuliert(false);
  };

  const zurueckInFragemodus = () => {
    setModus('frage'); setVorschlag(null); setVorschlagFehler(false); setRohtext('');
  };

  const vorschlagUebernehmen = async () => {
    setSpeichernd(true);
    try {
      await speichereEintrag(projectId, vorschlag);
      toast.success('Im Kundenakt festgehalten.');
      zurueckInFragemodus();
    } catch (e) {
      toast.error('Speichern fehlgeschlagen: ' + (e?.message || ''));
    }
    setSpeichernd(false);
  };

  const vorschlagBearbeiten = () => {
    setAktEntry({
      entry_type: vorschlag.entry_type,
      title: vorschlag.title,
      content: vorschlag.content,
      summary: vorschlag.summary,
      entry_date: vorschlag.entry_date,
      participants: vorschlag.participants,
      follow_up_text: vorschlag.follow_up_text,
      follow_up_date: vorschlag.follow_up_date,
    });
    zurueckInFragemodus();
  };

  const uebernehmen = (m) => {
    const text = typeof m.content === 'string' ? m.content : '';
    const ersteZeile = (text.split('\n').find(z => z.trim()) || 'Projektintelligenz').replace(/[#*]/g, '').trim();
    setAktEntry({ title: ersteZeile.slice(0, 80), content: text });
  };

  return (
    <>
      <Sheet open={open} modal={false} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent side="right" overlay={false} className="w-full sm:max-w-[774px] p-0 flex flex-col shadow-2xl">
          <SheetHeader className="px-5 py-3 border-b shrink-0">
            <SheetTitle className="flex items-center justify-between gap-2 text-sm pr-6">
              <span className="flex items-center gap-2 min-w-0 truncate">
                <BrainCircuit className="w-4 h-4 text-primary shrink-0" />
                <span className="truncate">Projektintelligenz — {projectLabel}</span>
              </span>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground shrink-0"
                onClick={neuesGespraech}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Neues Gespräch
              </Button>
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 ? (
              <div className="space-y-2">
                <ProjektupdateEinstieg onStart={() => setModus('erfassung')} />
                <p className="text-sm text-muted-foreground">
                  Frag die Projektintelligenz zu diesem Projekt — sie kennt Auftrag, awork-Daten,
                  Rechnungen, Kommunikation und den Kundenakt.
                </p>
                {QUICK_FRAGEN.map((q, i) => (
                  <button key={i} onClick={() => send(q.text)} disabled={sending}
                    className="block w-full text-left text-sm px-3 py-2 rounded-xl border bg-card hover:bg-muted transition-colors disabled:opacity-50">
                    {q.label}
                  </button>
                ))}
              </div>
            ) : (
              messages.map((m, i) => {
                const text = typeof m.content === 'string' ? m.content : '';
                const angebot = m.role === 'assistant' && text.includes(MARKER);
                const sichtbar = angebot ? { ...m, content: text.replace(MARKER, '').trimEnd() } : m;
                const vorherigeEingabe = () => {
                  const vor = messages[i - 1];
                  const roh = typeof vor?.content === 'string' ? vor.content : '';
                  return roh.split('Frage: ').pop().trim();
                };
                return (
                  <div key={m.id || `${m.role}-${i}`} className="space-y-1">
                    <MessageBubble message={sichtbar} />
                    {m.role === 'assistant' && text.trim() && (
                      <div className="flex flex-wrap items-center gap-3">
                        <button onClick={() => uebernehmen(m)}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                          <FolderPlus className="w-3 h-3" /> In den Kundenakt übernehmen
                        </button>
                        {angebot && (
                          <button onClick={() => erfasse(vorherigeEingabe())}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <PenLine className="w-3 h-3" /> Als Kundenakt-Eintrag festhalten
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {formuliert && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Ich formuliere daraus einen Eintrag…
              </p>
            )}

            {vorschlag && (
              <KundenaktVorschlagKarte
                vorschlag={vorschlag}
                speichernd={speichernd}
                onUebernehmen={vorschlagUebernehmen}
                onBearbeiten={vorschlagBearbeiten}
                onVerwerfen={() => { setInput(rohtext); zurueckInFragemodus(); }}
              />
            )}

            {vorschlagFehler && (
              <div className="rounded-xl border bg-card p-3 space-y-2">
                <p className="text-sm">Vorschlag nicht möglich.</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="h-7 text-xs"
                    onClick={() => { setAktEntry({ content: rohtext }); zurueckInFragemodus(); }}>
                    Trotzdem als Eintrag festhalten
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => { const t = rohtext; zurueckInFragemodus(); send(t); }}>
                    Als Frage senden
                  </Button>
                </div>
              </div>
            )}

            {sending && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="p-3 border-t bg-card shrink-0 space-y-1.5">
            {modus === 'erfassung' && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <PenLine className="w-3.5 h-3.5 text-primary" /> Projektupdate
                <button onClick={zurueckInFragemodus} className="underline hover:text-foreground">abbrechen</button>
              </p>
            )}
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    modus === 'erfassung' ? erfasse() : send();
                  }
                }}
                rows={2}
                placeholder={modus === 'erfassung'
                  ? 'Was ist passiert? (Enter zum Festhalten)'
                  : 'Frage zu diesem Projekt… (Enter zum Senden)'}
                className="flex-1 resize-none rounded-xl border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {sprache.supported && (
                <Button
                  type="button"
                  size="icon"
                  variant={sprache.listening ? 'destructive' : 'outline'}
                  className="rounded-xl"
                  title={sprache.listening ? 'Aufnahme stoppen' : 'Frage einsprechen'}
                  onClick={() => (sprache.listening ? sprache.stop() : sprache.start(input))}
                >
                  {sprache.listening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
              )}
              <Button onClick={() => (modus === 'erfassung' ? erfasse() : send())}
                disabled={!input.trim() || sending || formuliert} size="icon" className="rounded-xl">
                <Send className="w-4 h-4" />
              </Button>
            </div>
            {sprache.listening && (
              <p className="text-[10px] text-destructive flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                Aufnahme läuft — der gesprochene Text erscheint live im Feld.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {aktEntry && (
        <KundenaktEntryDialog
          open={!!aktEntry}
          onClose={() => setAktEntry(null)}
          projectId={projectId}
          projectName={projectName}
          customer={customer}
          initialEntryType={aktEntry.entry_type || 'update'}
          initialTitle={aktEntry.title || ''}
          initialContent={aktEntry.content}
          initialSummary={aktEntry.summary}
          initialDate={aktEntry.entry_date}
          initialParticipants={aktEntry.participants}
          initialFollowUpText={aktEntry.follow_up_text}
          initialFollowUpDate={aktEntry.follow_up_date}
          kennzahlen={kennzahlen}
          finanzen={finanzen}
        />
      )}
    </>
  );
}