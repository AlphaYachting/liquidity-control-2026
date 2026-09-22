import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import DealVerlauf from '@/components/crm/DealVerlauf';
import KiAssistent from '@/components/crm/KiAssistent';
import CollapsibleSection from '@/components/crm/CollapsibleSection';
import DealInquiryCard from '@/components/crm/DealInquiryCard';
import DealEmailThreadCard from '@/components/crm/DealEmailThreadCard';
import { FileText, Mail } from 'lucide-react';
import AppointmentSection from '@/components/crm/AppointmentSection';
import DealFormDialog from '@/components/crm/DealFormDialog';
import WonLostDialog from '@/components/crm/WonLostDialog';
import UebergabeblattSection from '@/components/crm/handover/UebergabeblattSection';
import ExternesAngebotLeser from '@/components/crm/handover/ExternesAngebotLeser';
import CustomerContextCard from '@/components/crm/CustomerContextCard';
import CompanyMasterDataCard from '@/components/crm/CompanyMasterDataCard';
import DealProposalCard from '@/components/crm/DealProposalCard';
import DealDetailHeader from '@/components/crm/DealDetailHeader';
import Phasenleiste from '@/components/crm/Phasenleiste';
import NaechsterSchritt from '@/components/crm/NaechsterSchritt';
import AngebotEtikett from '@/components/crm/AngebotEtikett';
import ProposalHandoffButton from '@/components/crm/ProposalHandoffButton';
import Kennzahlleiste from '@/components/shared/Kennzahlleiste';
import Abschnittstitel from '@/components/shared/Abschnittstitel';
import { Box, BoxKopf, BoxInhalt } from '@/components/shared/Box';
import { Presentation } from 'lucide-react';
import { PIPELINES, STAGE_LABELS, eur, isClosedStage } from '@/components/crm/stages';

export default function CrmDealDetail() {
  const { dealId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [closeMode, setCloseMode] = useState(null);
  const [start, setStart] = useState({ intent: null, n: 0 });

  const { data: deal, isLoading } = useQuery({
    queryKey: ['crm-deal', dealId],
    queryFn: () => base44.entities.CrmDeal.get(dealId),
  });
  const { data: activities = [] } = useQuery({
    queryKey: ['crm-activities', dealId],
    queryFn: () => base44.entities.CrmActivity.filter({ deal_id: dealId }, '-activity_date', 200),
  });
  const { data: appointments = [] } = useQuery({
    queryKey: ['crm-appointments', dealId],
    queryFn: () => base44.entities.CrmAppointment.filter({ deal_id: dealId }, '-scheduled_at', 50),
  });

  // Beim ersten Öffnen als "gesehen" markieren — entfernt die NEU-Markierung in der Pipeline.
  // Erst jetzt startet auch die Web-/LinkedIn-Recherche, nie beim automatischen Anlegen.
  useEffect(() => {
    if (deal && !deal.seen_at) {
      if (deal.enrichment_status === 'pending') {
        base44.functions.invoke('enrichCrmLead', { deal_id: deal.id })
          .then(() => queryClient.invalidateQueries({ queryKey: ['crm-deal', deal.id] }))
          .catch(() => {});
      }
      base44.entities.CrmDeal.update(deal.id, { seen_at: new Date().toISOString() }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['crm-deals'] });
        queryClient.invalidateQueries({ queryKey: ['crm-new-deals'] });
      });
    }
  }, [deal?.id, deal?.seen_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['crm-deal', dealId] });
    queryClient.invalidateQueries({ queryKey: ['crm-activities', dealId] });
    queryClient.invalidateQueries({ queryKey: ['crm-appointments', dealId] });
    queryClient.invalidateQueries({ queryKey: ['crm-deals'] });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground py-10 text-center">Deal lädt…</p>;
  if (!deal) return <p className="text-sm text-muted-foreground py-10 text-center">Deal nicht gefunden.</p>;

  const config = PIPELINES[deal.pipeline];

  const reopenDeal = async () => {
    await base44.entities.CrmDeal.update(deal.id, { stage: config.stages[0].key, lost_reason: '' });
    await base44.entities.CrmActivity.create({
      deal_id: deal.id, activity_type: 'stage_change',
      title: 'Deal wieder geöffnet', activity_date: new Date().toISOString(),
    });
    refreshAll();
  };

  const deleteDeal = async () => {
    if (!window.confirm('Deal endgültig löschen? Alle Aktivitäten und Termine werden mitgelöscht.')) return;
    if (activities.length > 0) await base44.entities.CrmActivity.deleteMany({ deal_id: deal.id });
    if (appointments.length > 0) await base44.entities.CrmAppointment.deleteMany({ deal_id: deal.id });
    await base44.entities.CrmDeal.delete(deal.id);
    queryClient.invalidateQueries({ queryKey: ['crm-deals'] });
    navigate('/crm');
  };

  const changeStage = async (stage) => {
    await base44.entities.CrmDeal.update(deal.id, { stage });
    await base44.entities.CrmActivity.create({
      deal_id: deal.id, activity_type: 'stage_change',
      title: `Phase: ${STAGE_LABELS[stage]}`,
      activity_date: new Date().toISOString(),
    });
    refreshAll();
  };

  return (
    <div className="max-w-[1200px] space-y-4">
      <DealDetailHeader
        deal={deal}
        onEdit={() => setEditOpen(true)}
        onClose={setCloseMode}
        onReopen={reopenDeal}
        onDelete={deleteDeal}
      />

      {/* Beauftragen öffnet das Übergabeblatt direkt hier — vor der Freigabe entsteht nichts */}
      {closeMode === 'won' && (
        <UebergabeblattSection
          deal={deal}
          onCancel={() => setCloseMode(null)}
          onDone={() => { setCloseMode(null); refreshAll(); }}
        />
      )}

      <Phasenleiste
        deal={deal}
        activities={activities}
        onStageChange={changeStage}
        onBeauftragen={() => setCloseMode('won')}
      />

      <Kennzahlleiste
        werte={[
          { label: 'Auftragswert netto', wert: deal.value_net > 0 ? eur(deal.value_net) : '—' },
          { label: 'Wahrscheinlichkeit', wert: deal.probability_percent != null ? `${deal.probability_percent} %` : '—' },
          deal.expected_close_date
            ? { label: 'Erwarteter Abschluss', wert: new Date(deal.expected_close_date).toLocaleDateString('de-AT') }
            : { label: 'Erwarteter Abschluss', wert: 'nicht gesetzt', klein: true },
          { label: 'Angebot', klein: true, wert: <AngebotEtikett deal={deal} activities={activities} appointments={appointments} /> },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-4">
          <Abschnittstitel>Vorgang</Abschnittstitel>

          {!isClosedStage(deal.stage) && (
            <NaechsterSchritt
              deal={deal}
              activities={activities}
              appointments={appointments}
              onAktion={(intent) => setStart((s) => ({ intent, n: s.n + 1 }))}
              onBearbeiten={() => setEditOpen(true)}
            />
          )}

          {(deal.proposal_id || deal.quote_id) ? (
            <DealProposalCard deal={deal} activities={activities} onChanged={refreshAll} />
          ) : !isClosedStage(deal.stage) && (
            <Box>
              <BoxKopf
                symbol={Presentation}
                titel="Angebot"
                hinweis={deal.externes_angebot_url ? 'externes Angebot angehängt' : 'noch keins verknüpft'}
                aktion={<ProposalHandoffButton deal={deal} onDone={refreshAll} className="" />}
              />
              <BoxInhalt>
                <ExternesAngebotLeser key={deal.externes_angebot_url || 'leer'} deal={deal} onSaved={refreshAll} rahmen={false} />
              </BoxInhalt>
            </Box>
          )}

          <KiAssistent
            deal={deal}
            activities={activities}
            appointments={appointments}
            onChanged={refreshAll}
            startIntent={start.intent}
            startSignal={start.n}
          />

          <CollapsibleSection
            icon={FileText}
            title="Anfrage"
            defaultOpen
            hint={deal.description ? null : 'noch leer'}
          >
            <DealInquiryCard deal={deal} onChanged={refreshAll} />
          </CollapsibleSection>

          {deal.email_thread_id && (
            <CollapsibleSection icon={Mail} title="E-Mail-Verlauf">
              <DealEmailThreadCard deal={deal} />
            </CollapsibleSection>
          )}

          <DealVerlauf dealId={deal.id} activities={activities} onChanged={refreshAll} />
        </div>

        <div className="space-y-4">
          <Abschnittstitel>Kunde</Abschnittstitel>

          <CompanyMasterDataCard deal={deal} onChanged={refreshAll} />

          {deal.pipeline === 'existing_customer' && (
            <CustomerContextCard customerName={deal.linked_customer_name || deal.company_name} />
          )}

          <Box>
            <BoxInhalt>
              <AppointmentSection deal={deal} appointments={appointments} onChanged={refreshAll} />
            </BoxInhalt>
          </Box>
        </div>
      </div>

      <DealFormDialog open={editOpen} onOpenChange={setEditOpen} initialData={deal} onSaved={refreshAll} />
      <WonLostDialog open={closeMode === 'lost'} onOpenChange={(o) => { if (!o) setCloseMode(null); }} deal={deal} mode={closeMode} onSaved={refreshAll} />
    </div>
  );
}