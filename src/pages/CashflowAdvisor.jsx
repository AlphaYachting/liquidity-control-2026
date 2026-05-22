import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { BrainCircuit, Send, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/shared/PageHeader';
import MessageBubble from '@/components/agent/MessageBubble';

export default function CashflowAdvisor() {
  const [conversation, setConversation] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!conversation) return;
    const unsub = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
    });
    return unsub;
  }, [conversation?.id]);

  const loadConversations = async () => {
    const list = await base44.agents.listConversations({ agent_name: 'cashflow_advisor' });
    setConversations(list || []);
  };

  const startNewConversation = async () => {
    const conv = await base44.agents.createConversation({
      agent_name: 'cashflow_advisor',
      metadata: { name: `Analyse ${new Date().toLocaleDateString('de-AT')}` }
    });
    setConversation(conv);
    setMessages(conv.messages || []);
    setConversations(prev => [conv, ...prev]);
  };

  const openConversation = async (conv) => {
    const full = await base44.agents.getConversation(conv.id);
    setConversation(full);
    setMessages(full.messages || []);
  };

  const sendMessage = async () => {
    if (!input.trim() || !conversation || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    await base44.agents.addMessage(conversation, { role: 'user', content: text });
    setSending(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const SUGGESTIONS = [
    'Welche Projekte haben noch offene Abrechnungsbeträge?',
    'Wie sieht der Cashflow für die nächsten Monate aus?',
    'Welche Projekte sollten dringend abgerechnet werden?',
    'Gibt es überfällige Rechnungen oder Risikoprojekte?',
  ];

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-0 -m-6">
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <Button onClick={startNewConversation} className="w-full gap-2">
            <Plus className="w-4 h-4" /> Neue Analyse
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">Noch keine Gespräche</p>
          )}
          {conversations.map(c => (
            <button
              key={c.id}
              onClick={() => openConversation(c)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                conversation?.id === c.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
              }`}
            >
              <p className="truncate">{c.metadata?.name || 'Analyse'}</p>
              <p className="text-xs text-muted-foreground">{new Date(c.created_date).toLocaleDateString('de-AT')}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b bg-card">
          <PageHeader
            title="Cashflow Berater"
            subtitle="KI-gestützte Analyse Ihrer Liquiditätsprojekte"
            icon={BrainCircuit}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!conversation ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-6">
              <div className="p-4 rounded-2xl bg-primary/10">
                <BrainCircuit className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-1">Cashflow Analyse starten</h2>
                <p className="text-muted-foreground text-sm max-w-md">
                  Stellen Sie Fragen zu Ihren Projekten, offenen Rechnungen und Cashflow-Prognosen.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={async () => {
                      const conv = await base44.agents.createConversation({
                        agent_name: 'cashflow_advisor',
                        metadata: { name: s.substring(0, 40) }
                      });
                      setConversation(conv);
                      setMessages(conv.messages || []);
                      setConversations(prev => [conv, ...prev]);
                      setInput(s);
                    }}
                    className="text-left p-3 rounded-xl border bg-card hover:bg-muted transition-colors text-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <Button onClick={startNewConversation} size="lg" className="gap-2">
                <Plus className="w-4 h-4" /> Neues Gespräch starten
              </Button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <p className="text-muted-foreground text-sm">Stellen Sie Ihre erste Frage …</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => setInput(s)}
                    className="text-left p-3 rounded-xl border bg-card hover:bg-muted transition-colors text-sm"
                  >{s}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => <MessageBubble key={i} message={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        {conversation && (
          <div className="p-4 border-t bg-card">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                rows={2}
                placeholder="Frage zu Cashflow, Projekten oder Rechnungen…"
                disabled={sending}
                className="flex-1 resize-none rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <Button onClick={sendMessage} disabled={!input.trim() || sending} size="icon" className="h-auto aspect-square rounded-xl">
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">Enter zum Senden, Shift+Enter für neue Zeile</p>
          </div>
        )}
      </div>
    </div>
  );
}