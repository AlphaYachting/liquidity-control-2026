import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { BrainCircuit, Send } from 'lucide-react';
import MessageBubble from '@/components/agent/MessageBubble';
import { toast } from 'sonner';

// Projektintelligenz als Overlay im Projekt-Cockpit — Gespräch immer auf dieses Projekt bezogen.
export default function ProjectIntelligenceSheet({ open, onClose, projectId, projectName, customer }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const projectLabel = [customer, projectName].filter(Boolean).join(' · ') || 'Projekt';

  const contextPrefix = `Kontext: Es geht ausschließlich um das Projekt "${projectName || ''}" des Kunden "${customer || ''}" (LiquidityProject.id = ${projectId}). Lade dazu auch den digitalen Kundenakt (ProjectFileEntry nach project_id) und gewichte dokumentierte Vereinbarungen am stärksten.\n\nFrage: `;

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
      }
      await base44.agents.addMessage(conv, { role: 'user', content: contextPrefix + msg });
    } catch {
      toast.error('Nachricht konnte nicht verarbeitet werden.');
      setInput(msg);
      setSending(false);
    }
  };

  const QUICK = [
    { label: 'Vollständige Projektanalyse', text: 'Führe die vollständige Einzelprojekt-Analyse für dieses Projekt durch — inklusive Kundenakt, Kommunikation und konkreter Empfehlung.' },
    { label: 'Was kann ich abrechnen?', text: 'Was kann bei diesem Projekt jetzt abgerechnet werden? Begründe mit Fortschritt, Budget, offenen verrechenbaren Stunden und den dokumentierten Vereinbarungen.' },
    { label: 'Risiken & Blockaden', text: 'Welche Risiken, Blockaden oder offenen Zusagen gibt es bei diesem Projekt?' },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-[80vw] sm:max-w-[80vw] p-0 flex flex-col">
        <SheetHeader className="px-5 py-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <BrainCircuit className="w-4 h-4 text-primary" />
            Projektintelligenz — {projectLabel}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="space-y-2 max-w-xl">
              <p className="text-sm text-muted-foreground">
                Frag die Projektintelligenz zu diesem Projekt — sie kennt Auftrag, awork-Daten,
                Rechnungen, Kommunikation und den Kundenakt.
              </p>
              {QUICK.map((q, i) => (
                <button key={i} onClick={() => send(q.text)} disabled={sending}
                  className="block w-full text-left text-sm px-3 py-2 rounded-xl border bg-card hover:bg-muted transition-colors disabled:opacity-50">
                  {q.label}
                </button>
              ))}
            </div>
          ) : (
            messages.map((m, i) => <MessageBubble key={m.id || `${m.role}-${i}`} message={m} />)
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
  );
}