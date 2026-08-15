import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { LifeBuoy, UserPlus, Link2, MailCheck } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { emailApi } from '@/components/crm/emails/emailApi';
import { markThreadAsLead } from '@/components/crm/inboxDecision';
import SupportTicketDialog from '@/components/crm/support/SupportTicketDialog';
import InboxAssignDealDialog from '@/components/crm/InboxAssignDealDialog';
import DealFormDialog from '@/components/crm/DealFormDialog';
import { SUGGESTION_META } from '@/components/crm/emails/suggestionMeta';

// Volle Optionsleiste unter jeder Konversation — der KI-Vorschlag ist nur
// hervorgehoben, alle Wege bleiben klickbar.
export default function ThreadActionBar({ thread, messages = [], onChanged }) {
  const navigate = useNavigate();
  const { toast } = useToast();
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
  };

  const variantFor = (key) => (suggested === key ? 'default' : 'outline');

  const markNoLead = async () => {
    setBusy(true);
    try {
      await emailApi('enrich', {
        thread_id: t.id,
        fields: { crm_status: 'kein_lead', status: 'erledigt' },
      });
      toast({ title: 'Als kein Lead erledigt' });
      onChanged?.();
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
      title: 'Aus E-Mail-Zentrale übernommen',
      content: `${t.subject || ''}\n\n${item.body || ''}`.trim(),
      activity_date: new Date().toISOString(),
    });
    const back = await markThreadAsLead(String(t.id), deal.id);
    base44.functions.invoke('enrichCrmLead', { deal_id: deal.id }).catch(() => {});
    setLeadOpen(false);
    onChanged?.();
    toast({
      title: `Deal „${deal.title}" angelegt`,
      description: back.ok ? undefined : 'Der Thread konnte in der E-Mail-Zentrale nicht markiert werden.',
    });
    navigate(`/crm/deals/${deal.id}`);
  };

  return (
    <div className="border rounded-xl p-3 bg-card space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        Entscheidung
        {SUGGESTION_META[suggested] && <> · KI schlägt vor: {SUGGESTION_META[suggested].label}</>}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={variantFor('supportticket')} className="h-8 gap-1.5 text-xs"
          disabled={busy} onClick={() => setSupportOpen(true)}>
          <LifeBuoy className="w-3.5 h-3.5" /> Supportticket anlegen
        </Button>
        <Button size="sm" variant={variantFor('anfrage')} className="h-8 gap-1.5 text-xs"
          disabled={busy} onClick={() => setLeadOpen(true)}>
          <UserPlus className="w-3.5 h-3.5" /> Als Anfrage/Lead übernehmen
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
          disabled={busy} onClick={() => setAssignOpen(true)}>
          <Link2 className="w-3.5 h-3.5" /> Bestehendem Deal zuordnen
        </Button>
        <Button size="sm" variant={variantFor('kein_lead')} className="h-8 gap-1.5 text-xs"
          disabled={busy} onClick={markNoLead}>
          <MailCheck className="w-3.5 h-3.5" /> Kein Lead / erledigt
        </Button>
      </div>

      <SupportTicketDialog
        open={supportOpen}
        onOpenChange={setSupportOpen}
        item={supportOpen ? item : null}
        onDone={(ticket, back) => {
          onChanged?.();
          toast({
            title: `Support-Ticket „${ticket.title}" angelegt`,
            description: back.ok ? undefined : 'Der Thread konnte in der E-Mail-Zentrale nicht markiert werden.',
          });
        }}
      />
      <InboxAssignDealDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        item={item}
        onDone={(deal, back) => {
          setAssignOpen(false);
          onChanged?.();
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
          description: item.body || '',
          linked_customer_name: item.matched_customer_name || '',
        } : null}
        onSaved={handleLeadSaved}
      />
    </div>
  );
}