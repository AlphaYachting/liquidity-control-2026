import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { LifeBuoy, UserPlus, Link2, Check, ExternalLink } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { emailApi } from '@/components/crm/emails/emailApi';
import { markThreadAsLead } from '@/components/crm/inboxDecision';
import SupportTicketDialog from '@/components/crm/support/SupportTicketDialog';
import InboxAssignDealDialog from '@/components/crm/InboxAssignDealDialog';
import DealFormDialog from '@/components/crm/DealFormDialog';
import { PostAktionen } from '@/components/post/PostBaukasten';

/**
 * Die Standard-Aktionen zu einer E-Mail-Konversation — EINE Quelle für alle Postbereiche
 * (Posteingang, Eskalationen, „Meine Post“, E-Mail-Zentrale). Liefert Aktionen für die
 * PostAktionen-Leiste und die zugehörigen Dialoge.
 *  thread:   { id, subject, summary, customer, matched_customer_name, customer_match, request_nature,
 *              suggested_action, is_known_customer, eskalation }
 *  messages: bekannte Nachrichten (für Absender und Text), darf leer sein
 */
export function useThreadAktionen({ thread, messages = [], onChanged, mitAntworten = true }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Jede Aktion verändert den Posteingang — alle Ansichten sofort nachziehen
  const fertig = (...args) => {
    queryClient.invalidateQueries({ queryKey: ['posteingang'] });
    queryClient.invalidateQueries({ queryKey: ['eskalations-liste'] });
    onChanged?.(...args);
  };
  const [supportOpen, setSupportOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const t = thread || {};
  const suggested = t.suggested_action;
  const lastInbound = messages.find((m) => m.direction === 'in');
  const isKnown = Number(t.is_known_customer) === 1;

  // Pseudo-Anfrage aus dem Thread — dieselben Dialoge wie im Posteingang, ohne Posteingangs-Eintrag
  const item = {
    source: 'email',
    thread_id: String(t.id),
    subject: t.subject || '',
    body: t.summary || lastInbound?.text || '',
    sender_name: lastInbound?.from_name || '',
    sender_email: lastInbound?.from || '',
    matched_customer_name: t.matched_customer_name || t.customer || '',
    customer_match: t.customer_match || '',
    // für die Fälligkeit des Support-Tickets (Störung/Eskalation = sofort fällig)
    request_nature: t.request_nature || '',
    eskalation: Number(t.eskalation) === 1 || t.eskalation === true,
  };

  const erledigt = async () => {
    setBusy(true);
    try {
      await emailApi('enrich', { thread_id: t.id, fields: { crm_status: 'kein_lead', status: 'erledigt' } });
      toast({ title: 'Erledigt — kommt bei der nächsten Kundennachricht zurück' });
      fertig();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Nicht gespeichert', description: e?.message || 'Unbekannter Fehler' });
    }
    setBusy(false);
  };

  const handleLeadSaved = async (deal) => {
    await base44.entities.CrmDeal.update(deal.id, { email_thread_id: String(t.id) });
    await base44.entities.CrmActivity.create({
      deal_id: deal.id,
      activity_type: 'email',
      title: 'Aus E-Mail übernommen',
      content: `${t.subject || ''}\n\n${item.body || ''}`.trim(),
      activity_date: new Date().toISOString(),
    });
    const back = await markThreadAsLead(String(t.id), deal.id);
    base44.functions.invoke('enrichCrmLead', { deal_id: deal.id }).catch(() => {});
    setLeadOpen(false);
    fertig();
    toast({
      title: `Deal „${deal.title}" angelegt`,
      description: back.ok ? undefined : 'Der Thread konnte in der E-Mail-Zentrale nicht markiert werden.',
    });
    navigate(`/crm/deals/${deal.id}`);
  };

  // Gefüllt ist die Aktion, die die KI vorschlägt — ohne Vorschlag „Antworten“
  const empfohlen = suggested === 'supportticket' ? 'support' : suggested === 'anfrage' ? 'lead' : 'antworten';

  const aktionen = {
    antworten: mitAntworten && t.id
      ? { key: 'antworten', label: 'Antworten', icon: ExternalLink, href: `/crm/emails?thread=${t.id}`, primaer: empfohlen === 'antworten' }
      : null,
    support: { key: 'support', label: 'Support-Ticket', icon: LifeBuoy, onClick: () => setSupportOpen(true), primaer: empfohlen === 'support' },
    lead: { key: 'lead', label: 'Anfrage / Lead', icon: UserPlus, onClick: () => setLeadOpen(true), primaer: empfohlen === 'lead' },
  };
  const mehr = {
    deal: { key: 'deal', label: 'Bestehendem Deal zuordnen', icon: Link2, onClick: () => setAssignOpen(true) },
    erledigt: { key: 'erledigt', label: 'Erledigt (ohne Antwort)', icon: Check, onClick: erledigt, trenner: true },
  };

  const dialoge = (
    <>
      <SupportTicketDialog
        open={supportOpen}
        onOpenChange={setSupportOpen}
        item={supportOpen ? item : null}
        onDone={(ticket, back, hinweis, info) => {
          fertig(ticket, info);
          toast({
            title: info?.angehaengt ? `An Ticket „${ticket.title}" angehängt` : `Support-Ticket „${ticket.title}" angelegt`,
            description: [hinweis, back?.ok === false ? 'Der Thread konnte in der E-Mail-Zentrale nicht markiert werden.' : ''].filter(Boolean).join(' ') || undefined,
          });
        }}
      />
      <InboxAssignDealDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        item={item}
        onDone={(deal, back) => {
          setAssignOpen(false);
          fertig();
          toast({
            title: `Dem Deal „${deal.title}" zugeordnet`,
            description: back.ok ? undefined : 'Der Thread konnte in der E-Mail-Zentrale nicht markiert werden.',
          });
          navigate(`/crm/deals/${deal.id}`);
        }}
      />
      <DealFormDialog
        open={leadOpen}
        onOpenChange={setLeadOpen}
        initialData={leadOpen ? {
          pipeline: isKnown ? 'existing_customer' : 'new_business',
          stage: isKnown ? 'inquiry_received' : 'new_lead',
          title: t.subject || `Anfrage ${item.sender_name || ''}`.trim(),
          company_name: item.matched_customer_name || '',
          contact_name: item.sender_name || '',
          contact_email: item.sender_email || '',
          source: 'email',
          description: (item.body || '').slice(0, 4000),
          email_thread_id: String(t.id),
          linked_customer_name: item.matched_customer_name || '',
        } : null}
        onSaved={handleLeadSaved}
      />
    </>
  );

  return { aktionen, mehr, dialoge, busy };
}

// Aktionsleiste in der E-Mail-Zentrale — dieselbe Leiste wie überall, ohne „Antworten“
// (dort steht die Antwort direkt darunter).
export default function ThreadActionBar({ thread, messages = [], onChanged, rechts }) {
  const { aktionen, mehr, dialoge, busy } = useThreadAktionen({ thread, messages, onChanged, mitAntworten: false });
  return (
    <>
      <PostAktionen
        busy={busy}
        aktionen={[aktionen.support, aktionen.lead]}
        mehr={[mehr.deal, mehr.erledigt]}
        rechts={rechts}
      />
      {dialoge}
    </>
  );
}
