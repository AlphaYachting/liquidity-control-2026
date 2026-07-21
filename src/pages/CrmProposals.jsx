import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus, FileText } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import ProposalCreateDialog from '@/components/crm/proposals/ProposalCreateDialog';
import { PROPOSAL_STATUSES, MODE_LABELS } from '@/components/crm/proposals/proposalConfig';
import moment from 'moment';

export default function CrmProposals() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ['crm-proposals'],
    queryFn: () => base44.entities.CrmProposal.list('-updated_date', 200),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Angebots-Studio"
        subtitle="Visuelle Angebote nach dem Rittler-Skill — mit Analyse, Mapping und zwei Freigabe-Stopps"
        actions={
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> Neues Angebot
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Lädt…</p>
      ) : proposals.length === 0 ? (
        <div className="border rounded-xl bg-card p-10 text-center">
          <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Noch keine visuellen Angebote. Lege das erste an.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {proposals.map(p => {
            const st = PROPOSAL_STATUSES[p.status] || PROPOSAL_STATUSES.input;
            return (
              <Link key={p.id} to={`/crm/proposals/${p.id}`}
                className="border rounded-xl bg-card p-4 hover:shadow-md transition-shadow block">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm">{p.title}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${st.color}`}>
                    {st.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{p.customer_company || '—'}</p>
                <div className="flex gap-2 mt-2 text-[10px] text-muted-foreground">
                  <span className="px-1.5 py-0.5 rounded bg-muted">{MODE_LABELS[p.mode]}</span>
                  {p.sprint_mode && <span className="px-1.5 py-0.5 rounded bg-muted">Sprint</span>}
                  <span className="ml-auto">{moment(p.updated_date).format('DD.MM.YYYY')}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <ProposalCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}