import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { BrainCircuit, Send, RotateCcw, FolderPlus } from 'lucide-react';
import MessageBubble from '@/components/agent/MessageBubble';
import { toast } from 'sonner';
import { QUICK_FRAGEN } from '@/components/projects/projektIntelligenzFragen';
import KundenaktEntryDialog from '@/components/projects/kundenakt/KundenaktEntryDialog';

const std = (min) => Math.round((min || 0) / 60);
const eur = (v) => Math.round(v || 0).toLocaleString('de-AT');
const kurz = (iso) => iso ? new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }) : 'kein Termin gesetzt';

function faktenBlock(kennzahlen, finanzen) {
  if (!kennzahlen && !finanzen) return '';
  const k = kennzahlen || {};
  const f = finanzen || {};
  return `Diese Werte sind bereits berechnet und verbindlich — verwende sie unverändert und leite sie nicht neu her:
Aufgaben erledigt: ${k.erledigt || 0} von ${k.gesamt || 0} (${Math.round(k.erledigt_prozent || 0)} %)
Zeitbudget: ${std(k.gebuchte_minuten)} von ${std(k.geplante_minuten)} Stunden (${k.budget_verbraucht_prozent === null || k.budget_verbraucht_prozent === undefined ? '—' : Math.round(k.budget_verbraucht_prozent)} %)
blockierte Aufgaben: ${k.blockiert || 0}
nächste Frist: ${kurz(k.naechste_frist)}
Abrechnungsfortschritt: ${Math.round(f.billingPct || 0)} %
Zahlungsfortschritt: ${Math.round(f.paymentPct || 0)} %
Auftragswert netto: ${eur(f.orderNet)} EUR, davon fakturiert ${eur(f.invoicedNet)} EUR, bezahlt ${eur(f.paidGross)} EUR

`;
}

// Projektintelligenz als begleitendes Panel — die Seite dahinter bleibt sichtbar und bedienbar.
export default function ProjectIntelligenceSheet({
  open, onClose, projectId, projectName, customer, kennzahlen, finanzen,
}) {
  const storageKey = `projectIntelligence.conversation.${projectId}`;
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [aktEntry, setAktEntry] = useState(null);
  const endRef = useRef(null);

  const projectLabel = [customer, projectName].filter(Boolean).join(' · ') || 'Projekt';

  const contextPrefix = `Kontext: Es geht ausschließlich um das Projekt "${projectName || ''}" des Kunden "${customer || ''}" (LiquidityProject.id = ${projectId}). Lade dazu auch den digitalen Kundenakt (ProjectFileEntry nach project_id) und gewichte dokumentierte Vereinbarungen am stärksten.\n\n${faktenBlock(kennzahlen, finanzen)}Frage: `;

  // Gespeichertes Gespräch beim Öffnen wiederherstellen
  useEffect(() => {
    if (!open || conversation) return;
    const savedId = sessionStorage.getItem(storageKey);
    if (savedId) setConversation({ id: savedId });
  }, [open, storageKey, conversation]);

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

  const neuesGespraech = () => {
    sessionStorage.removeItem(storageKey);
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
        sessionStorage.setItem(storageKey, conv.id);
      }
      await base44.agents.addMessage(conv, { role: 'user', content: contextPrefix + msg });
    } catch {
      toast.error('Nachricht konnte nicht verarbeitet werden.');
      setInput(msg);
      setSending(false);
    }
  };

  const uebernehmen = (m) => {
    const text = typeof m.content === 'string' ? m.content : '';
    const ersteZeile = (text.split('\n').find(z => z.trim()) || 'Projektintelligenz').replace(/[#*]/g, '').trim();
    setAktEntry({ title: ersteZeile.slice(0, 80), content: text });
  };

  return (
    <>
      <Sheet open={open} modal={false} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent side="right" overlay={false} className="w-full sm:max-w-[560px] p-0 flex flex-col shadow-2xl">
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
              messages.map((m, i) => (
                <div key={m.id || `${m.role}-${i}`} className="space-y-1">
                  <MessageBubble message={m} />
                  {m.role === 'assistant' && typeof m.content === 'string' && m.content.trim() && (
                    <button onClick={() => uebernehmen(m)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <FolderPlus className="w-3 h-3" /> In den Kundenakt übernehmen
                    </button>
                  )}
                </div>
              ))
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

          <div className="p-3 border-t bg-card shrink-0 flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={2}
              placeholder="Frage zu diesem Projekt… (Enter zum Senden)"
              className="flex-1 resize-none rounded-xl border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button onClick={() => send()} disabled={!input.trim() || sending} size="icon" className="rounded-xl">
              <Send className="w-4 h-4" />
            </Button>
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
          initialEntryType="update"
          initialTitle={aktEntry.title}
          initialContent={aktEntry.content}
        />
      )}
    </>
  );
}