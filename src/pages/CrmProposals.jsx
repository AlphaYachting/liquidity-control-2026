import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus, FileText } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import ProposalCreateDialog from '@/components/crm/proposals/ProposalCreateDialog';
import { PROPOSAL_STATUSES, MODE_LABELS, OFFER_TYPES } from '@/components/crm/proposals/proposalConfig';
import { QUOTE_STATUS } from '@/components/crm/quotes/quoteConfig';
import moment from 'moment';

export default function CrmProposals() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ['crm-proposals'],
    queryFn: () => base44.entities.CrmProposal.list('-updated_date', 200),
  });
  // E-Mail-Angebote (CrmQuote) erscheinen in derselben Liste
  const { data: emailQuotes = [] } = useQuery({
    queryKey: ['crm-email-quotes'],
    queryFn: () => base44.entities.CrmQuote.filter({ offer_type: 'email' }, '-updated_date', 200),
  });

  const entries = [
    ...proposals.map(p => {
      const st = PROPOSAL_STATUSES[p.status] || PROPOSAL_STATUSES.input;
      return {
        id: `p_${p.id}`, href: `/crm/proposals/${p.id}`, title: p.title,
        customer: p.customer_company,
        typeLabel: OFFER_TYPES[p.offer_type]?.label || MODE_LABELS[p.mode] || '—',
        typeChip: OFFER_TYPES[p.offer_type]?.chip || 'bg-muted text-muted-foreground',
        statusLabel: st.label, statusColor: st.color,
        sprint: p.sprint_mode, updated: p.updated_date,
      };
    }),
    ...emailQuotes.map(q => {
      const st = QUOTE_STATUS[q.status] || {};
      return {
        id: `q_${q.id}`, href: `/crm/quotes/${q.id}`, title: q.title,
        customer: q.customer_name,
        typeLabel: OFFER_TYPES.email.label,
        typeChip: OFFER_TYPES.email.chip,
        statusLabel: st.label || q.status,
        statusColor: st.color || 'bg-muted text-muted-foreground',
        sprint: false, updated: q.updated_date,
      };
    }),
  ].sort((a, b) => new Date(b.updated) - new Date(a.updated));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Angebots-Studio"
        subtitle="Drei Angebotstypen — Neukunde (Langform), Bestand (Kurzform) und E-Mail-Angebot"
        actions={
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> Neues Angebot
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Lädt…</p>
      ) : entries.length === 0 ? (
        <div className="border rounded-xl bg-card p-10 text-center">
          <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Noch keine Angebote. Lege das erste an.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {entries.map(e => (
            <Link key={e.id} to={e.href}
              className="border rounded-xl bg-card p-4 hover:shadow-md transition-shadow block">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-sm">{e.title}</p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${e.statusColor}`}>
                  {e.statusLabel}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{e.customer || '—'}</p>
              <div className="flex gap-2 mt-2 text-[10px]">
                <span className={`px-1.5 py-0.5 rounded font-medium ${e.typeChip}`}>{e.typeLabel}</span>
                {e.sprint && <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Sprint</span>}
                <span className="ml-auto text-muted-foreground">{moment(e.updated).format('DD.MM.YYYY')}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <ProposalCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}