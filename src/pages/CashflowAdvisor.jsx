import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { BrainCircuit, Send, Plus, Trash2, ChevronRight, Zap, TrendingDown, Calendar, AlertTriangle, Search, BarChart3, Mic, MicOff } from 'lucide-react';
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
        description: 'Fortschritt, Budget & PM-Notizen kombiniert',
        text: 'Führe ein vollständiges Quick-Win-Screening durch. Nutze DREI parallele Methoden:\n\n1. AWORK-BASIERT: Lade alle LiquidityProject (is_active_for_billing=true). Für jedes: lade AworkProjectSnapshot via awork_project_id. Berechne Abrechnungsstand% = already_invoiced_amount / total_net_amount × 100. Fortschritts-Lücke = progress_percent - Abrechnungsstand%. Quick-Win wenn Lücke > 20% und open_amount > 0.\n\n2. PM-NOTIZEN: LiquidityProject wo notes_next_invoice nicht leer — zeige Notiz und Empfehlung.\n\n3. PAKETE: ProjectBillingBlock wo awork_readiness_signal IN [ready_candidate, likely_ready] und invoice_readiness_status NOT IN [invoiced, paid].\n\nZeige alle Treffer nach Kunde alphabetisch. KPIs oben: Gesamtpotenzial €, Anzahl Projekte, sofort abrechenbar.',
      },
      {
        label: 'Budget-Auslastung & Risiken',
        icon: Search,
        description: 'Welche Projekte haben Budget-Probleme?',
        text: 'Analysiere Budget-Auslastung aller aktiven Projekte. Lade alle LiquidityProject (is_active_for_billing=true), für jedes AworkProjectSnapshot via awork_project_id. Berechne: Budget-Auslastung = tracked_duration_minutes / time_budget_minutes × 100. Kategorisiere: 🔴 KRITISCH: Auslastung > 100% (Budget überschritten). ⚠️ WARNUNG: Auslastung > 80% bei progress_percent < 60%. ✅ OK: im Plan. Zeige Kunde, Projekt, Budget in Stunden, Erfasst in Stunden, Auslastung%, Fortschritt%, Bewertung. Gesamtübersicht mit Anzahl kritischer Projekte.',
      },
    ],
  },
  {
    group: '📊 awork-Analysen',
    color: 'blue',
    items: [
      {
        label: 'Abrechnungsrückstände (awork)',
        icon: TrendingDown,
        description: 'Fortschritt deutlich vor Abrechnung',
        text: 'Analysiere alle aktiven LiquidityProject auf Abrechnungsrückstand via awork. Für jedes Projekt: lade AworkProjectSnapshot via awork_project_id. Berechne: Fortschritt% = progress_percent aus Snapshot (bevorzugt) oder real_progress_percent aus LiquidityProject. Abrechnungsstand% = already_invoiced_amount / total_net_amount × 100. Rückstand = Fortschritt - Abrechnungsstand. Zeige alle Projekte wo Rückstand > 15%, sortiert nach größtem open_amount. Inkl. Budget-Auslastung, risk_status, PM-Name. Gesamtpotenzial am Ende.',
      },
      {
        label: 'Verrechenbare Stunden je Projekt',
        icon: BarChart3,
        description: 'Offene billable Stunden in awork',
        text: 'Analysiere verrechenbare offene Stunden. Lade AworkTimeEntry (is_billable=true, is_billed=false). Gruppiere nach awork_project_id / project_name. Berechne je Projekt: Summe duration_minutes (÷60 = Stunden). Lade zugehöriges LiquidityProject für Kundename und Auftragswert. Zeige: Kunde, Projekt, offene verrechenbare Stunden, bereits abgerechnete Stunden (is_billed=true), wichtigste Tätigkeitsarten (type_of_work_name). Sortiere nach meisten offenen Stunden. Gesamtstunden und Hinweis auf Abrechnungspotenzial.',
      },
      {
        label: 'Risiko & Überfällige',
        icon: AlertTriangle,
        description: 'Budget-Überschreitungen, blockierte Tasks, offene Rechnungen',
        text: 'Vollständiges Risiko-Screening: (1) AworkProjectSnapshot: tracked_duration_minutes > time_budget_minutes — Budget überschritten 🔴. (2) AworkTaskSnapshot: is_blocked=true — zeige blockierte Aufgaben nach Projekt. (3) InvoiceRecord: payment_status="overdue" — nach Kunde mit Betrag. (4) LiquidityProject: risk_status IN [high, critical] mit open_amount > 0. (5) BillingInstruction: status="blocked". Für jeden Bereich: klare Übersicht + Handlungsempfehlung.',
      },
    ],
  },
  {
    group: '📅 Planung & Forecast',
    color: 'violet',
    items: [
      {
        label: 'Forecast nächste 3 Monate',
        icon: Calendar,
        description: 'Erwartete Einnahmen Juli–September 2026',
        text: 'Cashflow-Prognose Juli–September 2026. Drei Quellen kombinieren: (1) InvoiceRecord (open/partially_paid): gruppiere open_amount nach Monat des due_date = erwartete Zahlungseingänge. (2) BillingInstruction (draft/ready_for_backoffice): nach Monat von planned_invoice_date = geplante neue Rechnungen. (3) LiquidityProject mit expected_invoice_month in 2026-07/08/09 + Quick-Win-Potenzial aus Fortschritts-Lücke. Zeige pro Monat: Zahlungseingänge, neue Rechnungen, Potenzial, Summe. Gesamtprognose kumuliert.',
      },
      {
        label: 'Nächsten Monat planen (Juli 2026)',
        icon: Calendar,
        description: 'Vollständiger Abrechnungsplan für Juli',
        text: 'Erstelle Abrechnungsplan für Juli 2026. Nutze: (1) MonthlyBillingPlan mit planning_month="2026-07". (2) BillingInstruction mit planned_invoice_date im Juli. (3) ProjectBillingBlock mit billing_month="2026-07". (4) LiquidityProject mit expected_invoice_month="2026-07". (5) AworkProjectSnapshot: Projekte mit hoher Fortschritts-Lücke die im Juli abgerechnet werden könnten. Sortiere nach Kunde, zeige Status und Beträge. Gesamtvolumen und Prioritätenliste.',
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
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.lang = 'de-AT';
    rec.continuous = true;
    rec.interimResults = true;
    let finalTranscript = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscript += e.results[i][0].transcript + ' ';
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setInput(finalTranscript + interim);
    };
    rec.onend = () => {
      // Bei continuous=true: automatisch neu starten solange isRecording aktiv
      if (recognitionRef.current?._shouldRestart) {
        try { rec.start(); } catch {}
      } else {
        setIsRecording(false);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech') return; // Kurze Pause — ignorieren, läuft weiter
      setIsRecording(false);
    };
    rec._shouldRestart = true;
    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current._shouldRestart = false;
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  useEffect(() => { loadConversations(); }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!conversation) return;
    const unsub = base44.agents.subscribeToConversation(conversation.id, (data) => {
      const msgs = data.messages || [];
      setMessages(msgs);
      // Sicherheitsnetz: sobald die Antwort des Beraters da ist, Eingabe wieder freigeben
      if (msgs.length > 0 && msgs[msgs.length - 1]?.role === 'assistant') {
        setSending(false);
      }
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
    try {
      await base44.agents.addMessage(conversation, { role: 'user', content: msg });
    } finally {
      setSending(false);
    }
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
    try {
      await base44.agents.addMessage(conv, { role: 'user', content: suggestion.text });
    } finally {
      setSending(false);
    }
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
                      { label: '⚡ Quick-Wins zeigen', text: 'Zeige mir die Quick-Wins basierend auf awork-Fortschritt und PM-Notizen — welche Projekte kann ich sofort abrechnen?' },
                      { label: '⏱️ Budget-Auslastung', text: 'Zeige mir die Budget-Auslastung aller Projekte aus awork: welche haben das Budget überschritten oder sind kritisch?' },
                      { label: '📊 Rückstände prüfen', text: 'Welche Projekte haben einen Abrechnungsrückstand? Vergleiche awork-Fortschritt mit Abrechnungsstand.' },
                      { label: '⚠️ Risiken & Blockierte', text: 'Zeige mir Budget-Überschreitungen, blockierte Tasks in awork, überfällige Rechnungen und Hochrisiko-Projekte.' },
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
                className="rounded-xl"
              >
                <Send className="w-4 h-4" />
              </Button>
              {(window.SpeechRecognition || window.webkitSpeechRecognition) && (
                <Button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={sending}
                  size="icon"
                  variant={isRecording ? 'destructive' : 'outline'}
                  className="rounded-xl"
                  title={isRecording ? 'Aufnahme stoppen' : 'Diktat starten'}
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
              )}
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