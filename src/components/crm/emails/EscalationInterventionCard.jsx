import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import EscalationCaseControls from '@/components/crm/emails/EscalationCaseControls';
import { emailApi } from '@/components/crm/emails/emailApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { TON_STREIFEN } from '@/lib/designTon';
import { Sparkles, Loader2, FolderKanban, ExternalLink, ChevronDown, LifeBuoy, Siren } from 'lucide-react';
import EscalationThreadPreview from '@/components/crm/emails/EscalationThreadPreview';
import SupportTicketDialog from '@/components/crm/support/SupportTicketDialog';
import { nameVon } from '@/components/crm/ZuweisungWahl';

const STUFE = {
  1: { label: 'Stufe 1', klasse: 'bg-amber-100 text-amber-800' },
  2: { label: 'Stufe 2', klasse: 'bg-orange-100 text-orange-800' },
  3: { label: 'Stufe 3', klasse: 'bg-red-100 text-red-700' },
};

const wartezeit = (iso) => {
  const t = new Date(String(iso || '').includes('T') ? iso : `${String(iso || '').replace(' ', 'T')}Z`).getTime();
  if (!t) return '';
  const std = Math.max(0, Math.round((Date.now() - t) / 3600000));
  if (std < 24) return `${std} Std.`;
  const tage = Math.round(std / 24);
  return `${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`;
};

/**
 * Eine Eskalation als kompakte Zeile (Muster wie im Posteingang). Zugeklappt sieht man Stufe, Kunde,
 * Betreff, Zuständigkeit und Stand; aufgeklappt Aktionen, Vorgang und Verlauf. Der Verlauf lädt erst
 * beim Aufklappen. Support-Ticket direkt aus dem Fall — der Vorgang wird damit „in Arbeit“ und verknüpft.
 */
export default function EscalationInterventionCard({ zeile, offen, onOeffnen, linkedProjects = [], team = [] }) {
  const { thread, caseRecord, faelle = [], wartet, anzahl = 1 } = zeile;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [supportOffen, setSupportOffen] = useState(false);

  const stufe = STUFE[caseRecord?.severity] || null;
  const ticketVerknuepft = faelle.some((c) => c.linked_ticket_id);

  // Pseudo-Anfrage aus dem Verlauf — derselbe Ticket-Dialog wie im Posteingang (mit Doppelticket-Schutz)
  const supportItem = {
    source: 'email',
    thread_id: String(thread.id),
    subject: thread.subject || '',
    body: thread.summary || '',
    sender_name: thread.last_from_name || '',
    sender_email: thread.external_from || '',
    matched_customer_name: thread.matched_customer_name || thread.customer_label || '',
    customer_match: thread.customer_match || '',
    request_nature: thread.request_nature || '',
    eskalation: true,
  };

  const ticketAngelegt = async (ticket, back, hinweis, info) => {
    // Alle Vorgänge dieser Konversation mit dem Ticket verknüpfen und in Arbeit setzen
    await Promise.all(faelle.filter((c) => c.id).map((c) => base44.entities.CrmEscalation.update(c.id, {
      linked_ticket_id: ticket.id,
      state: c.state === 'erledigt' ? c.state : 'in_arbeit',
    }))).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['crm-escalations'] });
    queryClient.invalidateQueries({ queryKey: ['eskalations-liste'] });
    queryClient.invalidateQueries({ queryKey: ['posteingang'] });
    toast({
      title: info?.angehaengt ? `An Ticket „${ticket.title}“ angehängt` : `Support-Ticket „${ticket.title}“ angelegt`,
      description: [hinweis, back?.ok === false ? 'Der Verlauf konnte in der E-Mail-Zentrale nicht markiert werden.' : ''].filter(Boolean).join(' ') || undefined,
    });
  };

  const generatePlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await emailApi('thread', { params: { id: thread.id, msgs: 10, full: 1 } });
      const convo = (detail.messages || [])
        .map((m) => `[${m.direction === 'in' ? 'KUNDE' : m.direction === 'out' ? 'WIR' : 'INTERN'}] ${m.from_name || m.from} (${m.received_at}):\n${(m.text || '').slice(0, 2000)}`)
        .join('\n\n---\n\n')
        .slice(0, 20000);
      const projectInfo = linkedProjects
        .map((p) => `${p.project_name} (Status: ${p.status}, offen: €${Math.round(p.open_amount || 0)}, Risiko: ${p.risk_status})`)
        .join('; ');
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Du bist Krisenberater der Digitalagentur Rittler & Co. Ein Kunde zeigt in dieser E-Mail-Konversation Eskalationsgefahr. Erstelle einen konkreten Einschreitungsplan auf Deutsch. Nichts erfinden.

KUNDE: ${thread.customer_normalized || thread.customer_label || 'unbekannt'}
BETREFF: ${thread.subject || '—'}
KI-ZUSAMMENFASSUNG: ${thread.summary || '—'}
VERKNÜPFTE PROJEKTE: ${projectInfo || 'keine gefunden'}

KONVERSATION:
"""
${convo}
"""

Liefere: (1) Kern des Problems in 1-2 Sätzen. (2) Dringlichkeit (hoch/mittel/niedrig) mit Begründung. (3) 2-4 konkrete Einschreitungsschritte in Reihenfolge (wer macht was, Kanal: Anruf/E-Mail/Termin). (4) Formulierungsvorschlag für die erste Antwort an den Kunden (3-5 Sätze, deeskalierend, professionell).`,
        response_json_schema: {
          type: 'object',
          properties: {
            problem: { type: 'string' },
            dringlichkeit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
            begruendung: { type: 'string' },
            schritte: { type: 'array', items: { type: 'string' } },
            antwort_entwurf: { type: 'string' },
          },
        },
      });
      setPlan(result);
    } catch (e) {
      setError('Vorschlag konnte nicht erstellt werden. Bitte erneut versuchen.');
    }
    setLoading(false);
  };

  const urgencyColor = { hoch: 'bg-red-100 text-red-700', mittel: 'bg-amber-100 text-amber-700', niedrig: 'bg-blue-100 text-blue-700' };
  const zustaendig = caseRecord?.assigned_to;

  return (
    <div className={cn(wartet && caseRecord?.severity >= 3 ? TON_STREIFEN.critical : wartet && TON_STREIFEN.attention)}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={offen}
        onClick={onOeffnen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOeffnen?.(); } }}
        className={cn('grid grid-cols-[72px_minmax(0,1fr)_130px_150px_16px] gap-3 items-center px-4 py-2.5 cursor-pointer hover:bg-muted/40', offen && 'bg-muted/30')}
      >
        <span>
          {stufe
            ? <Badge variant="outline" className={`border-0 text-[10px] ${stufe.klasse}`}>{stufe.label}</Badge>
            : <Siren className="w-4 h-4 text-muted-foreground" />}
        </span>

        <div className="min-w-0">
          <p className="text-object text-foreground truncate">{thread.subject || '(kein Betreff)'}</p>
          <p className="text-label uppercase text-muted-foreground truncate">
            {[thread.customer_label || thread.external_from || 'Unbekannter Absender', anzahl > 1 ? `${anzahl} Verläufe` : '']
              .filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="min-w-0 text-meta truncate">
          {zustaendig
            ? <span className="font-semibold text-foreground">→ {nameVon(zustaendig, team)}</span>
            : <span className="text-muted-foreground">nicht zugewiesen</span>}
          {ticketVerknuepft && (
            <span className="flex items-center gap-1 text-muted-foreground"><LifeBuoy className="w-3 h-3" /> Ticket</span>
          )}
        </div>

        <div className="text-right text-meta">
          {wartet
            ? <span className="font-semibold text-status-critical">wartet seit {wartezeit(thread.last_message_at)}</span>
            : ticketVerknuepft
              ? <span className="text-foreground">In Bearbeitung (Ticket)</span>
              : <span className="text-muted-foreground">beantwortet · Vorgang offen</span>}
        </div>

        <ChevronDown className={cn('w-4 h-4 text-muted-foreground', offen && 'rotate-180')} />
      </div>

      {offen && (
        <div className="border-t px-4 pt-3 pb-4 pl-[100px] space-y-3">
          {thread.summary && <p className="text-sm text-foreground">{thread.summary}</p>}
          <p className="text-meta text-muted-foreground">
            {[thread.external_from || thread.last_from, thread.last_to && `an ${thread.last_to}`, thread.message_count > 0 && `${thread.message_count} Nachrichten`]
              .filter(Boolean).join(' · ')}
          </p>

          {/* Entscheidung zuerst — der Verlauf darunter ist oft lang */}
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link to={`/crm/emails?thread=${thread.id}`}><ExternalLink /> Antworten</Link>
            </Button>
            <Button variant="outline" onClick={() => setSupportOffen(true)}>
              <LifeBuoy /> {ticketVerknuepft ? 'Weiteres Support-Ticket / anhängen' : 'Support-Ticket anlegen'}
            </Button>
            <Button variant="outline" onClick={generatePlan} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <Sparkles />} Einschreitungsvorschlag
            </Button>
            {linkedProjects.length > 0 && (
              <span className="flex items-center gap-1.5 flex-wrap text-xs">
                <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                {linkedProjects.slice(0, 3).map((p) => (
                  <Link key={p.id} to={`/projects/${p.id}`} className="text-primary hover:underline truncate max-w-[200px]">
                    {p.project_name}
                  </Link>
                ))}
              </span>
            )}
          </div>

          <EscalationCaseControls
            caseRecord={caseRecord}
            thread={thread}
            weitereFaelle={faelle.filter((c) => c.id && c.id !== caseRecord?.id)}
          />

          {error && <p className="text-xs text-red-600">{error}</p>}
          {plan && (
            <div className="border rounded-lg bg-muted/40 p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`border-0 text-[10px] ${urgencyColor[plan.dringlichkeit] || ''}`}>
                  Dringlichkeit: {plan.dringlichkeit}
                </Badge>
                <span className="text-xs text-muted-foreground">{plan.begruendung}</span>
              </div>
              <p className="text-sm"><strong>Problem:</strong> {plan.problem}</p>
              <div>
                <p className="text-xs font-semibold mb-1">Einschreitungsschritte:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  {(plan.schritte || []).map((s, i) => <li key={i} className="text-xs">{s}</li>)}
                </ol>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1">Formulierungsvorschlag erste Antwort:</p>
                <p className="text-xs bg-card border rounded p-2 whitespace-pre-wrap">{plan.antwort_entwurf}</p>
              </div>
            </div>
          )}

          <p className="text-label uppercase text-muted-foreground pt-1">Verlauf · neueste Nachricht zuerst</p>
          <EscalationThreadPreview threadId={thread.id} start={3} />
        </div>
      )}

      <SupportTicketDialog
        open={supportOffen}
        onOpenChange={setSupportOffen}
        item={supportOffen ? supportItem : null}
        onDone={ticketAngelegt}
      />
    </div>
  );
}
