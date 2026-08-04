import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Inbox, PenLine, ArrowLeft, MailQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import InboxItemCard from '@/components/crm/InboxItemCard';
import InboxCaptureDialog from '@/components/crm/InboxCaptureDialog';
import DealFormDialog from '@/components/crm/DealFormDialog';
import { threadIdOf, markThreadAsLead } from '@/components/crm/inboxDecision';

export default function CrmInbox() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [convertItem, setConvertItem] = useState(null);

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: ['crm-inbox'],
    queryFn: () => base44.entities.CrmInboxItem.filter({ status: 'new', decision: 'offen' }, '-created_date', 100),
  });

  // Starker Lead-Verdacht oben, schwacher darunter
  const items = [...rawItems].sort((a, b) => {
    const rank = (i) => (i.lead_strength === 'stark' ? 0 : i.lead_strength === 'schwach' ? 1 : 2);
    return rank(a) - rank(b);
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
    queryClient.invalidateQueries({ queryKey: ['crm-inbox-badge'] });
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
    await markThreadAsLead(threadId, deal.id);
    // Recherche erst jetzt — nie beim automatischen Erkennen
    base44.functions.invoke('enrichCrmLead', { deal_id: deal.id }).catch(() => {});
    setConvertItem(null);
    refresh();
    navigate(`/crm/deals/${deal.id}`);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader
        title="CRM — Posteingang"
        subtitle="Lead-Verdacht aus E-Mail, Telefon-KI und manueller Erfassung — drei Entscheidungen je Eintrag"
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
        <div className="space-y-3">
          {items.map(item => (
            <InboxItemCard key={item.id} item={item} onConvert={setConvertItem} onChanged={refresh} />
          ))}
        </div>
      )}

      <InboxCaptureDialog open={captureOpen} onOpenChange={setCaptureOpen} onSaved={refresh} />
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