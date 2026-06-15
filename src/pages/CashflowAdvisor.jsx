import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { BrainCircuit, Send, Plus, Trash2, ChevronRight, Zap, TrendingDown, Calendar, AlertTriangle, Search, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MessageBubble from '@/components/agent/MessageBubble';

const SUGGESTION_GROUPS = [
  {
    group: '⚡ Sofortmaßnahmen',
    color: 'emerald',
    items: [
      {
        label: 'Quick-Wins — sofort verrechenbar',
        icon: Zap,
        description: 'Welche Projekte & Pakete sind jetzt abrechnungsbereit?',
        text: 'Analysiere alle aktiven LiquidityProject-Einträge und ProjectBillingBlock-Einträge. Finde Quick-Wins: (1) Alle ProjectBillingBlock wo awork_readiness_signal = "ready_candidate" oder "likely_ready" und invoice_readiness_status NICHT invoiced oder paid — lade dazu das zugehörige LiquidityProject via project_id. (2) Alle LiquidityProject wo notes_next_invoice einen Text enthält — das sind PM-Direktanweisungen für die nächste Rechnung. (3) Alle LiquidityProject wo expected_invoice_month = "2026-06". Zeige vollständige Liste nach Kunde alphabetisch mit Projektname, Paket, Betrag netto und konkreter Handlungsempfehlung. KPIs oben: Gesamtbetrag und Anzahl Projekte.',
      },
      {
        label: 'PM-Notizen zur nächsten Rechnung',
        icon: Search,
        description: 'Was haben die PMs für nächste Abrechnungen notiert?',
        text: 'Lade alle LiquidityProject mit is_active_for_billing = true. Zeige alle Projekte wo das Feld notes_next_invoice einen Inhalt hat. Für jedes Projekt: Kunde, Projektname, PM-Notiz (notes_next_invoice), Auftragswert (total_net_amount), bereits abgerechnet (already_invoiced_amount), noch offen (open_amount). Sortiere nach Kunde. Diese PM-Notizen sind direkte Abrechnungsanweisungen — analysiere den Inhalt und gib je Projekt eine konkrete Empfehlung.',
      },
    ],
  },
  {
    group: '📊 Analysen',
    color: 'blue',
    items: [
      {
        label: 'Abrechnungsrückstände',
        icon: TrendingDown,
        description: 'Projekte wo Fortschritt > Abrechnung',
        text: 'Analysiere alle aktiven LiquidityProject-Einträge auf Abrechnungsrückstand. Berechne für jedes Projekt: Fortschritt% = real_progress_percent (wenn > 0) oder awork_progress_percent. Abrechnung% = already_invoiced_amount / total_net_amount * 100. Rückstand = Fortschritt% - Abrechnung%. Zeige alle Projekte wo der Rückstand > 15%, sortiert nach größtem offenen Betrag (open_amount). Inkl. risk_status, PM-Name und konkreter Empfehlung was jetzt abgerechnet werden sollte.',
      },
      {
        label: 'Risiko & Überfällige',
        icon: AlertTriangle,
        description: 'Kritische Projekte und offene Rechnungen',
        text: 'Führe ein Risiko-Screening durch: (1) Lade alle InvoiceRecord mit payment_status = "overdue" — nach Kunde gruppiert, Gesamtbetrag, Fälligkeit. (2) Lade alle LiquidityProject mit risk_status = "high" oder "critical" und open_amount > 0 — mit Projektdetails. (3) Lade alle LiquidityProject mit status = "on_hold". (4) Lade alle BillingInstruction mit status = "blocked". Zeige für jeden Bereich eine klare Übersicht mit Beträgen und priorisierten Handlungsempfehlungen.',
      },
      {
        label: 'Offene Rechnungen nach Kunde',
        icon: BarChart3,
        description: 'Welche Kunden haben noch offene Beträge?',
        text: 'Lade alle InvoiceRecord mit payment_status IN [open, partially_paid]. Gruppiere nach customer_name und berechne je Kunde: Anzahl offene Rechnungen, Gesamtbetrag offen (open_amount), älteste Rechnung (invoice_date), nächste Fälligkeit (due_date). Sortiere nach Gesamtbetrag absteigend. Markiere alle wo due_date < 2026-06-15 als überfällig 🔴. Gesamtsumme aller offenen Beträge am Ende.',
      },
    ],
  },
  {
    group: '📅 Planung',
    color: 'violet',
    items: [
      {
        label: 'Forecast nächste 3 Monate',
        icon: Calendar,
        description: 'Erwartete Einnahmen Juli–September 2026',
        text: 'Erstelle eine Cashflow-Prognose für Juli, August und September 2026. Nutze drei Quellen: (1) InvoiceRecord mit payment_status IN [open, partially_paid] — gruppiere nach Monat des due_date, das sind erwartete Zahlungseingänge. (2) BillingInstruction mit status IN [draft, ready_for_backoffice] und planned_invoice_date in diesem Zeitraum — geplante neue Rechnungen. (3) LiquidityProject mit expected_invoice_month IN [2026-07, 2026-08, 2026-09] — PM-Erwartungen. Zeige pro Monat: erwartete Zahlungseingänge (€), geplante neue Rechnungen (€), PM-erwartete Abrechnungen (€). Gesamtprognose pro Monat und kumulativ.',
      },
      {
        label: 'Nächsten Monat planen (Juli 2026)',
        icon: Calendar,
        description: 'Was sollte im Juli abgerechnet werden?',
        text: 'Erstelle einen Abrechnungsplan für Juli 2026. Nutze: (1) MonthlyBillingPlan mit planning_month = "2026-07" — zeige alle geplanten Positionen. (2) BillingInstruction mit planned_invoice_date zwischen 2026-07-01 und 2026-07-31. (3) ProjectBillingBlock mit billing_month = "2026-07". (4) LiquidityProject mit expected_invoice_month = "2026-07". Sortiere nach Kunde, zeige Beträge und Status. Gesamtplanvolumen und Empfehlung welche Positionen zuerst angegangen werden sollten.',
      },
    ],
  },
];

export default function CashflowAdvisor() {
  const [conversation, setConversation] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activeGroup, setActiveGroup] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { loadConversations(); }, []);

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
    setMessages([]);
    setConversations(prev => [conv, ...prev]);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const openConversation = async (conv) => {
    const full = await base44.agents.getConversation(conv.id);
    setConversation(full);
    setMessages(full.messages || []);
  };

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || !conversation || sending) return;
    setInput('');
    setSending(true);
    await base44.agents.addMessage(conversation, { role: 'user', content: msg });
    setSending(false);
  };

  const handleSuggestionClick = async (suggestion) => {
    let conv = conversation;
    if (!conv) {
      conv = await base44.agents.createConversation({
        agent_name: 'cashflow_advisor',
        metadata: { name: suggestion.label }
      });
      setConversation(conv);
      setMessages([]);
      setConversations(prev => [conv, ...prev]);
    }
    setSending(true);
    await base44.agents.addMessage(conv, { role: 'user', content: suggestion.text });
    setSending(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const colorMap = {
    emerald: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800',
    blue: 'border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800',
    violet: 'border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-800',
  };
  const iconColorMap = {
    emerald: 'text-emerald-600',
    blue: 'text-blue-600',
    violet: 'text-violet-600',
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-0 -m-6 overflow-hidden">

      {/* Sidebar */}
      <div className="w-60 shrink-0 border-r bg-card flex flex-col">
        <div className="p-3 border-b">
          <Button onClick={startNewConversation} className="w-full gap-2" size="sm">
            <Plus className="w-3.5 h-3.5" /> Neue Analyse
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground p-2 text-center mt-4">Noch keine Gespräche</p>
          )}
          {conversations.map(c => (
            <button
              key={c.id}
              onClick={() => openConversation(c)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors group ${
                conversation?.id === c.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-muted text-foreground'
              }`}
            >
              <p className="truncate text-xs font-medium leading-tight">
                {c.metadata?.name || 'Analyse'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {new Date(c.created_date).toLocaleDateString('de-AT')}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <div className="px-5 py-3 border-b bg-card flex items-center gap-3 shrink-0">
          <div className="p-2 rounded-lg bg-primary/10">
            <BrainCircuit className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold leading-tight truncate">
              {conversation?.metadata?.name || 'Cashflow Berater'}
            </h1>
            <p className="text-xs text-muted-foreground">
              KI-Analyse · Projekt-Cockpit · Stand 15.06.2026
            </p>
          </div>
          {sending && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{animationDelay:'0ms'}}/>
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{animationDelay:'150ms'}}/>
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{animationDelay:'300ms'}}/>
            </div>
          )}
        </div>

        {/* Messages or Start Screen */}
        <div className="flex-1 overflow-y-auto">
          {!conversation || messages.length === 0 ? (
            <div className="p-5 space-y-5 max-w-3xl mx-auto">
              {/* Intro */}
              {!conversation && (
                <div className="text-center py-4">
                  <div className="inline-flex p-3 rounded-2xl bg-primary/10 mb-3">
                    <BrainCircuit className="w-7 h-7 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold mb-1">Cashflow Analyse</h2>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Fragen Sie nach Quick-Wins, Abrechnungsrückständen, Projektstatus oder Cashflow-Prognosen.
                  </p>
                </div>
              )}

              {/* Suggestion Groups */}
              {SUGGESTION_GROUPS.map((group) => (
                <div key={group.group}>
                  <button
                    onClick={() => setActiveGroup(activeGroup === group.group ? null : group.group)}
                    className="flex items-center gap-2 w-full text-left mb-2"
                  >
                    <span className="text-sm font-semibold text-foreground">{group.group}</span>
                    <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${activeGroup === group.group ? 'rotate-90' : ''}`} />
                  </button>
                  <div className={`grid grid-cols-1 gap-2 ${activeGroup !== group.group && activeGroup !== null ? 'hidden' : ''}`}>
                    {group.items.map((item, i) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={i}
                          onClick={() => handleSuggestionClick(item)}
                          disabled={sending}
                          className={`flex items-start gap-3 p-3 rounded-xl border transition-all text-left disabled:opacity-50 ${colorMap[group.color]}`}
                        >
                          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColorMap[group.color]}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-tight">{item.label}</p>
                            <p className="text-xs mt-0.5 opacity-75">{item.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Custom question hint */}
              <div className="text-center pt-2">
                <p className="text-xs text-muted-foreground">
                  Oder stellen Sie eine eigene Frage — z.B. „Analysiere das Projekt Bergholz Admont" oder „Was kann ich bei Steirerfleisch noch abrechnen?"
                </p>
              </div>
            </div>
          ) : (
            <div className="p-5 space-y-4 max-w-3xl mx-auto">
              {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}

              {/* Inline follow-up suggestions after response */}
              {!sending && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Weiterführende Fragen:</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: '⚡ Quick-Wins zeigen', text: 'Zeige mir die Quick-Wins — welche Projekte kann ich sofort abrechnen?' },
                      { label: '📊 Rückstände prüfen', text: 'Welche Projekte haben einen Abrechnungsrückstand (Fortschritt > Abrechnung)?' },
                      { label: '⚠️ Risiken anzeigen', text: 'Zeige mir alle überfälligen Rechnungen und Risikoprojekte.' },
                    ].map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(s.text)}
                        disabled={sending}
                        className="text-xs px-3 py-1.5 rounded-full border bg-card hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t bg-card shrink-0">
          <div className="max-w-3xl mx-auto flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={2}
              placeholder={conversation ? 'Frage stellen oder Projekt angeben… (Enter zum Senden)' : 'Neue Frage — zuerst eine Analyse oben wählen oder direkt tippen…'}
              disabled={sending}
              className="flex-1 resize-none rounded-xl border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <div className="flex flex-col gap-1.5">
              <Button
                onClick={() => {
                  if (!conversation) {
                    startNewConversation().then(() => {
                      if (input.trim()) setTimeout(() => sendMessage(), 300);
                    });
                  } else {
                    sendMessage();
                  }
                }}
                disabled={!input.trim() || sending}
                size="icon"
                className="flex-1 rounded-xl"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 text-center max-w-3xl mx-auto">
            Enter senden · Shift+Enter neue Zeile · Modell: Claude Sonnet (höhere Analysequalität)
          </p>
        </div>
      </div>
    </div>
  );
}