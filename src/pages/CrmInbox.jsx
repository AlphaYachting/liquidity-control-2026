import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { PenLine, KanbanSquare, AlertTriangle, ArrowDownToLine } from 'lucide-react';
import AworkUebernahmeDialog from '@/components/support/AworkUebernahmeDialog';
import { SUPPORT_TICKETS_KEY } from '@/components/sprint/heute/MeinTagSupportTickets';
import { useZugriff } from '@/lib/useZugriff';
import { Link } from 'react-router-dom';
import Seitenkopf from '@/components/shared/Seitenkopf';
import { Box } from '@/components/shared/Box';
import InboxItemCard from '@/components/crm/InboxItemCard';
import InboxThreadCard from '@/components/crm/InboxThreadCard';
import { usePosteingang } from '@/hooks/usePosteingang';
import { FILTER, SCHWELLE_ARBEITSSTUNDEN } from '@/lib/crm/posteingang';
import InboxFilterZeile from '@/components/crm/InboxFilterZeile';
import SupportTicketDialog from '@/components/crm/support/SupportTicketDialog';
import InboxCaptureDialog from '@/components/crm/InboxCaptureDialog';
import DealFormDialog from '@/components/crm/DealFormDialog';
import InboxDuplicateDialog from '@/components/crm/InboxDuplicateDialog';
import { threadIdOf, markThreadAsLead, attachInboxItemToDeal, eintragAendern } from '@/components/crm/inboxDecision';
import InboxAssignDealDialog from '@/components/crm/InboxAssignDealDialog';
import { descriptionFromThread } from '@/components/crm/support/threadDescription';
import { useToast } from '@/components/ui/use-toast';
import { findDuplicateDeal, CLOSED_STAGES } from '@/lib/crm/crmDuplicate';

export default function CrmInbox() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [uebernahmeOpen, setUebernahmeOpen] = useState(false);
  const { darf } = useZugriff();
  const [convertItem, setConvertItem] = useState(null);
  const [assignItem, setAssignItem] = useState(null);
  const [supportItem, setSupportItem] = useState(null);
  const [duplicateHit, setDuplicateHit] = useState(null); // { item, deal }
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState(null);
  const { toast } = useToast();
  const [backchannelWarning, setBackchannelWarning] = useState(null);
  const [threadText, setThreadText] = useState('');
  // Der Filter steht in der Adresse (?filter=support) — so sind Sichten wie der
  // Support-Eingang direkt verlinkbar.
  const [params, setParams] = useSearchParams();
  const filter = FILTER.some((f) => f.key === params.get('filter')) ? params.get('filter') : 'alle';
  const setFilter = (key) => {
    const neu = new URLSearchParams(params);
    if (key === 'alle') neu.delete('filter'); else neu.set('filter', key);
    setParams(neu, { replace: true });
  };
  const [neuesteZuerst, setNeuesteZuerst] = useState(true);
  const [zeigeJung, setZeigeJung] = useState(false);
  const [offenId, setOffenId] = useState(null);

  // Fehlt der Anfragetext, den echten E-Mail-Verlauf nachladen — die Beschreibung
  // des Deals darf nie ein bloßes „Anfrage" sein.
  useEffect(() => {
    setThreadText('');
    if (!convertItem || convertItem.body) return;
    const threadId = threadIdOf(convertItem);
    if (!threadId) return;
    let cancelled = false;
    descriptionFromThread(threadId).then((text) => { if (!cancelled) setThreadText(text || ''); });
    return () => { cancelled = true; };
  }, [convertItem]);

  // EIN Posteingang: nur unbeantwortete Konversationen (Regel im Backend) plus
  // Anfragen der Telefon-KI und manuell erfasste — siehe lib/crm/posteingang.js
  const { eintraege, zahlen, gesamt, ueberfaellig: overdue, isLoading } = usePosteingang();

  const passt = FILTER.find((f) => f.key === filter)?.passt || FILTER[0].passt;
  const imFilter = eintraege.filter(passt);
  const jungAnzahl = imFilter.filter((e) => !e.sichtbar).length;
  // Im Support-Eingang zählt der Seitenkopf nur die Support-Anfragen
  const kopfAnzahl = filter === 'support' ? imFilter.filter((e) => e.sichtbar).length : gesamt;
  const kopfUeberfaellig = filter === 'support' ? imFilter.filter((e) => e.sichtbar && e.ueberfaellig).length : overdue;
  const gefilterte = imFilter
    .filter((e) => e.sichtbar || zeigeJung)
    .sort((a, b) => (neuesteZuerst ? b.eingang - a.eingang : a.eingang - b.eingang));
  const offeneId = (gefilterte.find((e) => e.key === offenId) || gefilterte[0])?.key;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['posteingang'] });
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
    await base44.entities.CrmDeal.update(deal.id, {
      email_thread_id: threadId || '',
      origin_inbox_item_id: convertItem.id,
    });
    // Der Deal steht — scheitert nur das Schließen des Eintrags, bleibt der Deal gültig
    await eintragAendern(convertItem.id, { status: 'converted', decision: 'lead', linked_deal_id: deal.id })
      .catch((e) => toast({ variant: 'destructive', title: 'Deal angelegt — Posteingangs-Eintrag nicht geschlossen', description: e?.message }));
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
    <div className="max-w-[1200px] space-y-4">
      <Seitenkopf
        bereich="CRM"
        titel={filter === 'support' ? 'Support-Eingang' : 'Posteingang'}
        kontext={`${kopfAnzahl} unbeantwortet seit mindestens ${SCHWELLE_ARBEITSSTUNDEN} Arbeitsstunden${kopfUeberfaellig > 0 ? ` · ${kopfUeberfaellig} davon länger als 2 Tage` : ''}`}
        aktionen={
          <>
            <Button variant="outline" asChild>
              <Link to="/crm"><KanbanSquare /> Pipeline</Link>
            </Button>
            {filter === 'support' && darf('fuehrung') && (
              <Button variant="outline" onClick={() => setUebernahmeOpen(true)}>
                <ArrowDownToLine /> Offene aWork-Support-Aufgaben übernehmen
              </Button>
            )}
            <Button onClick={() => setCaptureOpen(true)}>
              <PenLine /> Manuell erfassen
            </Button>
          </>
        }
      />
      {uebernahmeOpen && (
        <AworkUebernahmeDialog
          open={true}
          onOpenChange={setUebernahmeOpen}
          onDone={() => queryClient.invalidateQueries({ queryKey: SUPPORT_TICKETS_KEY })}
        />
      )}

      {backchannelWarning && (
        <div className="rounded-lg bg-status-attention-surface px-4 py-3 text-meta text-foreground flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-status-attention" />
          <p className="flex-1">
            {backchannelWarning.mode === 'attach'
              ? <>Die Anfrage „{backchannelWarning.subject}" wurde dem Deal zugeordnet, aber der Thread konnte in der E-Mail-Zentrale nicht als zugeordnet markiert werden — er bleibt dort in „Braucht Antwort" stehen.</>
              : <>Der Lead zu „{backchannelWarning.subject}" wurde angelegt, aber der Thread konnte in der E-Mail-Zentrale nicht als übernommen markiert werden — er bleibt dort in „Braucht Antwort" stehen.</>}{' '}
            <Link to={`/crm/deals/${backchannelWarning.dealId}`} className="font-semibold underline">Deal öffnen</Link>
          </p>
          <button onClick={() => setBackchannelWarning(null)} className="font-semibold underline shrink-0">Ausblenden</button>
        </div>
      )}

      {isLoading ? (
        <p className="text-meta text-muted-foreground py-10 text-center">Posteingang lädt…</p>
      ) : (
        <>
          <InboxFilterZeile
            filter={filter}
            onFilter={setFilter}
            zahlen={zahlen}
            neuesteZuerst={neuesteZuerst}
            onSortierung={() => setNeuesteZuerst((v) => !v)}
            jungAnzahl={jungAnzahl}
            zeigeJung={zeigeJung}
            onZeigeJung={() => setZeigeJung((v) => !v)}
          />

          {gefilterte.length === 0 ? (
            <Box className="py-16 text-center">
              <p className="text-body text-foreground">Nichts unbeantwortet</p>
              <p className="text-meta text-muted-foreground mt-1 max-w-sm mx-auto">
                Hier erscheint jede Kundennachricht, auf die seit {SCHWELLE_ARBEITSSTUNDEN} Arbeitsstunden niemand geantwortet hat,
                Eskalationen sofort. Beantwortetes findest du in der E-Mail-Zentrale.
              </p>
            </Box>
          ) : (
            <div className="bg-card border rounded-lg overflow-hidden divide-y">
              {gefilterte.map((e) => (e.item ? (
                <InboxItemCard
                  key={e.key}
                  item={e.item}
                  eintrag={e}
                  offen={e.key === offeneId}
                  onOeffnen={() => setOffenId(e.key)}
                  onConvert={handleConvert}
                  onAssign={setAssignItem}
                  onSupportTicket={setSupportItem}
                  onChanged={refresh}
                />
              ) : (
                <InboxThreadCard
                  key={e.key}
                  eintrag={e}
                  offen={e.key === offeneId}
                  onOeffnen={() => setOffenId(e.key)}
                  onChanged={refresh}
                />
              )))}
            </div>
          )}
        </>
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
          description: (convertItem.body || threadText || '').slice(0, 4000),
          email_thread_id: threadIdOf(convertItem) || '',
          linked_customer_name: convertItem.matched_customer_name || '',
        } : null}
        onSaved={handleDealSaved}
      />
    </div>
  );
}