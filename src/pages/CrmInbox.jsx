import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { PenLine, ArrowLeft, MailQuestion, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import InboxItemCard from '@/components/crm/InboxItemCard';
import SupportTicketDialog from '@/components/crm/support/SupportTicketDialog';
import InboxCaptureDialog from '@/components/crm/InboxCaptureDialog';
import DealFormDialog from '@/components/crm/DealFormDialog';
import InboxDuplicateDialog from '@/components/crm/InboxDuplicateDialog';
import { threadIdOf, markThreadAsLead, attachInboxItemToDeal } from '@/components/crm/inboxDecision';
import InboxAssignDealDialog from '@/components/crm/InboxAssignDealDialog';
import { useToast } from '@/components/ui/use-toast';
import { findDuplicateDeal, CLOSED_STAGES } from '../../base44/shared/crmDuplicate.js';

export default function CrmInbox() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [convertItem, setConvertItem] = useState(null);
  const [assignItem, setAssignItem] = useState(null);
  const [supportItem, setSupportItem] = useState(null);
  const [duplicateHit, setDuplicateHit] = useState(null); // { item, deal }
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState(null);
  const { toast } = useToast();
  const [backchannelWarning, setBackchannelWarning] = useState(null);

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: ['crm-inbox'],
    queryFn: () => base44.entities.CrmInboxItem.filter({ status: 'new', decision: 'offen' }, '-created_date', 100),
  });

  // Eine gemeinsame Liste, streng nach Datum — neueste zuerst
  const items = [...rawItems].sort(
    (a, b) => new Date(b.received_at || b.created_date) - new Date(a.received_at || a.created_date),
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
    queryClient.invalidateQueries({ queryKey: ['crm-inbox-badge'] });
  };

  // Vor der Übernahme prüfen, ob es zu diesem Kontakt schon einen offenen Deal gibt —
  // über BEIDE Pipelines (Neu- und Bestandskunden), sonst wird jede Anfrage zum neuen Lead.
  const handleConvert = async (item) => {
    const deals = await base44.entities.CrmDeal.list('-updated_date', 300).catch(() => []);
    const openDeals = deals.filter(d => !CLOSED_STAGES.includes(d.stage));
    const hit = findDuplicateDeal(openDeals, {
      contactEmail: item.sender_email,
      companyName: item.matched_customer_name || item.sender_name,
    });
    if (hit) setDuplicateHit({ item, deal: hit });
    else setConvertItem(item);
  };

  // Anfrage dem bestehenden Deal zuordnen statt einen Duplikat-Lead anzulegen.
  // Jeder Schritt ist abgesichert: Fehler bleiben im Pop-up sichtbar — nie wieder ein toter Klick.
  const attachToExistingDeal = async () => {
    const { item, deal } = duplicateHit;
    setAttachBusy(true);
    setAttachError(null);
    let back;
    try {
      back = await attachInboxItemToDeal(item, deal);
    } catch (e) {
      setAttachBusy(false);
      setAttachError(e?.response?.data?.detail || e?.response?.data?.error || e?.message || 'Unbekannter Fehler beim Zuordnen');
      return;
    }
    setAttachBusy(false);
    setDuplicateHit(null);
    refresh();
    toast({ title: `Der Anfrage wurde Deal „${deal.title}" zugeordnet` });
    if (!back.ok) {
      setBackchannelWarning({ subject: item.subject || 'Anfrage', dealId: deal.id, mode: 'attach' });
      return;
    }
    navigate(`/crm/deals/${deal.id}`);
  };

  const handleDealSaved = async (deal) => {
    if (!convertItem) return;
    const threadId = threadIdOf(convertItem);
    const user = await base44.auth.me().catch(() => null);
    await base44.entities.CrmDeal.update(deal.id, {
      email_thread_id: threadId || '',
      origin_inbox_item_id: convertItem.id,
    });
    await base44.entities.CrmInboxItem.update(convertItem.id, {
      status: 'converted', decision: 'lead', linked_deal_id: deal.id,
      decided_by: user?.email || '', decided_at: new Date().toISOString(),
    });
    await base44.entities.CrmActivity.create({
      deal_id: deal.id,
      activity_type: 'system',
      title: 'Aus Posteingang übernommen',
      content: `Quelle: ${convertItem.source === 'phone_ai' ? 'Telefon-KI' : convertItem.source === 'email' ? 'E-Mail' : 'Manuell'}\n${convertItem.body || ''}`.trim(),
      activity_date: new Date().toISOString(),
    });
    const back = await markThreadAsLead(threadId, deal.id);
    // Recherche erst jetzt — nie beim automatischen Erkennen
    base44.functions.invoke('enrichCrmLead', { deal_id: deal.id }).catch(() => {});
    setConvertItem(null);
    refresh();
    // Der Lead bleibt in jedem Fall bestehen — schlägt nur der Rückkanal fehl,
    // bleibt der Nutzer hier und sieht den Hinweis.
    if (!back.ok) {
      setBackchannelWarning({ subject: convertItem.subject || 'Anfrage', dealId: deal.id });
      return;
    }
    navigate(`/crm/deals/${deal.id}`);
  };

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="CRM — Posteingang"
        subtitle="Alle triage-relevanten Anfragen in einer Liste — die KI schlägt vor, entschieden wird hier"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" asChild>
              <Link to="/crm"><ArrowLeft className="w-4 h-4" /> Zur Pipeline</Link>
            </Button>
            <Button className="gap-2" onClick={() => setCaptureOpen(true)}>
              <PenLine className="w-4 h-4" /> Manuell erfassen
            </Button>
          </div>
        }
      />

      {backchannelWarning && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="flex-1">
            {backchannelWarning.mode === 'attach'
              ? <>Die Anfrage „{backchannelWarning.subject}" wurde dem Deal zugeordnet, aber der Thread konnte in der E-Mail-Zentrale nicht als zugeordnet markiert werden — er bleibt dort in „Braucht Antwort" stehen.</>
              : <>Der Lead zu „{backchannelWarning.subject}" wurde angelegt, aber der Thread konnte in der E-Mail-Zentrale nicht als übernommen markiert werden — er bleibt dort in „Braucht Antwort" stehen.</>}{' '}
            <Link to={`/crm/deals/${backchannelWarning.dealId}`} className="font-semibold underline">Deal öffnen</Link>
          </p>
          <button onClick={() => setBackchannelWarning(null)} className="text-amber-700 font-semibold shrink-0">Ausblenden</button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Posteingang lädt…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border rounded-xl bg-card">
          <div className="inline-flex p-3 rounded-2xl bg-muted mb-3">
            <MailQuestion className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Keine neuen Anfragen</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Sobald die Postfach-Anbindung aktiv ist, landen Anfragen der Telefon-KI und E-Mail-Leads automatisch hier.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {items.map((item) => (
            <InboxItemCard
              key={item.id}
              item={item}
              onConvert={handleConvert}
              onAssign={setAssignItem}
              onSupportTicket={setSupportItem}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      <InboxCaptureDialog open={captureOpen} onOpenChange={setCaptureOpen} onSaved={refresh} />
      <SupportTicketDialog
        open={Boolean(supportItem)}
        onOpenChange={(o) => { if (!o) setSupportItem(null); }}
        item={supportItem}
        onDone={(ticket, back) => {
          setSupportItem(null);
          refresh();
          toast({
            title: `Support-Ticket „${ticket.title}" angelegt`,
            description: back.ok ? undefined : 'Der Thread konnte in der E-Mail-Zentrale nicht markiert werden.',
          });
        }}
      />
      <InboxAssignDealDialog
        open={Boolean(assignItem)}
        onOpenChange={(o) => { if (!o) setAssignItem(null); }}
        item={assignItem}
        onDone={(deal, back) => {
          const subject = assignItem?.subject || 'Anfrage';
          setAssignItem(null);
          refresh();
          toast({ title: `Der Anfrage wurde Deal „${deal.title}" zugeordnet` });
          if (!back.ok) {
            setBackchannelWarning({ subject, dealId: deal.id, mode: 'attach' });
            return;
          }
          navigate(`/crm/deals/${deal.id}`);
        }}
      />
      <InboxDuplicateDialog
        open={Boolean(duplicateHit)}
        onOpenChange={(o) => { if (!o) { setDuplicateHit(null); setAttachError(null); } }}
        deal={duplicateHit?.deal}
        busy={attachBusy}
        error={attachError}
        onAttach={attachToExistingDeal}
        onCreateAnyway={() => { setConvertItem(duplicateHit.item); setDuplicateHit(null); }}
      />
      <DealFormDialog
        open={Boolean(convertItem)}
        onOpenChange={(o) => { if (!o) setConvertItem(null); }}
        initialData={convertItem ? {
          pipeline: convertItem.suggested_pipeline === 'existing_customer' ? 'existing_customer' : 'new_business',
          stage: convertItem.suggested_pipeline === 'existing_customer' ? 'inquiry_received' : 'new_lead',
          title: convertItem.subject || `Anfrage ${convertItem.sender_name || ''}`.trim(),
          company_name: convertItem.matched_customer_name || '',
          contact_name: convertItem.sender_name || '',
          contact_email: convertItem.sender_email || '',
          contact_phone: convertItem.sender_phone || '',
          source: convertItem.source,
          description: convertItem.body || '',
          linked_customer_name: convertItem.matched_customer_name || '',
        } : null}
        onSaved={handleDealSaved}
      />
    </div>
  );
}