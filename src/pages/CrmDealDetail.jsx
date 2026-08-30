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
import CustomerContextCard from '@/components/crm/CustomerContextCard';
import CompanyMasterDataCard from '@/components/crm/CompanyMasterDataCard';
import DealProposalCard from '@/components/crm/DealProposalCard';
import DealDetailHeader from '@/components/crm/DealDetailHeader';
import { PIPELINES, STAGE_LABELS } from '@/components/crm/stages';

export default function CrmDealDetail() {
  const { dealId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [closeMode, setCloseMode] = useState(null);

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
    <div className="space-y-4 max-w-5xl">
      <DealDetailHeader
        deal={deal}
        onEdit={() => setEditOpen(true)}
        onClose={setCloseMode}
        onReopen={reopenDeal}
        onDelete={deleteDeal}
        onStageChange={changeStage}
        onRefresh={refreshAll}
      />

      {/* Beauftragen öffnet das Übergabeblatt direkt hier — vor der Freigabe entsteht nichts */}
      {closeMode === 'won' && (
        <UebergabeblattSection
          deal={deal}
          onCancel={() => setCloseMode(null)}
          onDone={() => { setCloseMode(null); refreshAll(); }}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Timeline */}
        <div className="lg:col-span-2 space-y-3">
          <DealProposalCard deal={deal} activities={activities} onChanged={refreshAll} />

          <CollapsibleSection
            icon={FileText}
            title="Anfrage"
            defaultOpen
            hint={deal.description ? null : 'noch leer'}
          >
            <DealInquiryCard deal={deal} onChanged={refreshAll} />
          </CollapsibleSection>

          <KiAssistent
            deal={deal}
            activities={activities}
            appointments={appointments}
            onChanged={refreshAll}
          />

          {deal.email_thread_id && (
            <CollapsibleSection icon={Mail} title="E-Mail-Verlauf">
              <DealEmailThreadCard deal={deal} />
            </CollapsibleSection>
          )}

          <DealVerlauf dealId={deal.id} activities={activities} onChanged={refreshAll} />
        </div>

        {/* Facts */}
        <div className="space-y-4">
          <CompanyMasterDataCard deal={deal} onChanged={refreshAll} />

          <div className="border rounded-xl bg-card p-4">
            <AppointmentSection
              deal={deal}
              appointments={appointments}
              onChanged={refreshAll}
            />
          </div>

          {deal.pipeline === 'existing_customer' && (
            <CustomerContextCard customerName={deal.linked_customer_name || deal.company_name} />
          )}
        </div>
      </div>

      <DealFormDialog open={editOpen} onOpenChange={setEditOpen} initialData={deal} onSaved={refreshAll} />
      <WonLostDialog open={closeMode === 'lost'} onOpenChange={(o) => { if (!o) setCloseMode(null); }} deal={deal} mode={closeMode} onSaved={refreshAll} />
    </div>
  );
}