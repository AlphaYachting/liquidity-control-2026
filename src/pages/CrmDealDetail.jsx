import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Pencil, Trophy, XCircle, Building2, Mail, Phone, User, RotateCcw, Trash2, Linkedin } from 'lucide-react';
import ActivityTimeline from '@/components/crm/ActivityTimeline';
import ActivityComposer from '@/components/crm/ActivityComposer';
import AppointmentSection from '@/components/crm/AppointmentSection';
import DealFormDialog from '@/components/crm/DealFormDialog';
import WonLostDialog from '@/components/crm/WonLostDialog';
import CustomerContextCard from '@/components/crm/CustomerContextCard';
import DealInquiryCard from '@/components/crm/DealInquiryCard';
import CompanyMasterDataCard from '@/components/crm/CompanyMasterDataCard';
import ProposalHandoffButton from '@/components/crm/ProposalHandoffButton';
import { PIPELINES, STAGE_LABELS, SOURCE_LABELS, eur, isClosedStage, isWonStage } from '@/components/crm/stages';

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

  // Beim ersten Öffnen als "gesehen" markieren — entfernt die NEU-Markierung in der Pipeline
  useEffect(() => {
    if (deal && !deal.seen_at) {
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
  const closed = isClosedStage(deal.stage);

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
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" asChild>
          <Link to="/crm"><ArrowLeft className="w-4 h-4" /> Pipeline</Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight truncate">{deal.title}</h1>
          <p className="text-xs text-muted-foreground">
            {config.label} · {SOURCE_LABELS[deal.source] || deal.source}
            {deal.value_net > 0 && <> · <strong className="text-foreground">{eur(deal.value_net)}</strong> netto ({deal.probability_percent}%)</>}
          </p>
        </div>
        <div className="flex gap-2">
          {!closed && (
            <>
              <ProposalHandoffButton deal={deal} onDone={refreshAll} />
              <Button size="sm" variant="outline" className="gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => setCloseMode('won')}>
                <Trophy className="w-3.5 h-3.5" /> Gewonnen
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setCloseMode('lost')}>
                <XCircle className="w-3.5 h-3.5" /> Verloren
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditOpen(true)}>
            <Pencil className="w-3.5 h-3.5" /> Bearbeiten
          </Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-red-600" onClick={deleteDeal} title="Deal löschen">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {closed ? (
        <div className={`rounded-xl border p-3 text-sm font-medium flex items-center justify-between gap-3 ${
          isWonStage(deal.stage) ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <span>
            {STAGE_LABELS[deal.stage]} am {deal.closed_at ? new Date(deal.closed_at).toLocaleDateString('de-AT') : '—'}
            {deal.lost_reason && <span className="font-normal"> · Grund: {deal.lost_reason}</span>}
          </span>
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0 bg-background" onClick={reopenDeal}>
            <RotateCcw className="w-3.5 h-3.5" /> Wieder öffnen
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Phase:</span>
          <Select value={deal.stage} onValueChange={changeStage}>
            <SelectTrigger className="h-8 w-56 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {config.stages.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Timeline */}
        <div className="lg:col-span-2 space-y-3">
          <DealInquiryCard deal={deal} onChanged={refreshAll} />
          <ActivityComposer dealId={deal.id} onAdded={refreshAll} />
          <div className="border rounded-xl bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Aktivitäten-Verlauf</h3>
            <ActivityTimeline activities={activities} />
          </div>
        </div>

        {/* Facts */}
        <div className="space-y-4">
          <div className="border rounded-xl bg-card p-4 space-y-2.5">
            <h3 className="text-sm font-semibold">Kontakt</h3>
            {deal.company_name && <p className="text-sm flex items-center gap-2"><Building2 className="w-3.5 h-3.5 text-muted-foreground" /> {deal.company_name}</p>}
            {deal.contact_name && (
              <p className="text-sm flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-muted-foreground" /> {deal.contact_name}
                {deal.contact_position && <span className="text-xs text-muted-foreground">· {deal.contact_position}</span>}
              </p>
            )}
            {deal.contact_linkedin_url && (
              <a href={deal.contact_linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sm flex items-center gap-2 text-primary hover:underline">
                <Linkedin className="w-3.5 h-3.5" /> LinkedIn-Profil
              </a>
            )}
            {deal.contact_email && (
              <a href={`mailto:${deal.contact_email}`} className="text-sm flex items-center gap-2 text-primary hover:underline">
                <Mail className="w-3.5 h-3.5" /> {deal.contact_email}
              </a>
            )}
            {deal.contact_phone && <p className="text-sm flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> {deal.contact_phone}</p>}
            {deal.contact_background && <p className="text-xs text-muted-foreground whitespace-pre-wrap pt-1 border-t mt-2">{deal.contact_background}</p>}
          </div>

          <CompanyMasterDataCard deal={deal} onChanged={refreshAll} />

          <div className="border rounded-xl bg-card p-4">
            <AppointmentSection deal={deal} appointments={appointments} onChanged={refreshAll} />
          </div>

          {deal.pipeline === 'existing_customer' && (
            <CustomerContextCard customerName={deal.linked_customer_name || deal.company_name} />
          )}
        </div>
      </div>

      <DealFormDialog open={editOpen} onOpenChange={setEditOpen} initialData={deal} onSaved={refreshAll} />
      <WonLostDialog open={Boolean(closeMode)} onOpenChange={(o) => { if (!o) setCloseMode(null); }} deal={deal} mode={closeMode} onSaved={refreshAll} />
    </div>
  );
}