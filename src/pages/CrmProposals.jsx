import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, FileText, Search, X } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import ProposalCreateDialog from '@/components/crm/proposals/ProposalCreateDialog';
import ProposalListCard from '@/components/crm/proposals/ProposalListCard';
import { PROPOSAL_STATUSES, MODE_LABELS, OFFER_TYPES } from '@/components/crm/proposals/proposalConfig';
import { QUOTE_STATUS } from '@/components/crm/quotes/quoteConfig';

const TYPE_FILTERS = [
  { key: 'all', label: 'Alle' },
  { key: 'neukunde', label: 'Neukunde' },
  { key: 'bestand', label: 'Bestand' },
  { key: 'email', label: 'E-Mail' },
];

export default function CrmProposals() {
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ['crm-proposals'],
    queryFn: () => base44.entities.CrmProposal.list('-updated_date', 200),
  });
  // E-Mail-Angebote (CrmQuote) erscheinen in derselben Liste
  const { data: emailQuotes = [] } = useQuery({
    queryKey: ['crm-email-quotes'],
    queryFn: () => base44.entities.CrmQuote.filter({ offer_type: 'email' }, '-updated_date', 200),
  });

  const entries = useMemo(() => [
    ...proposals.map(p => {
      const st = PROPOSAL_STATUSES[p.status] || PROPOSAL_STATUSES.input;
      return {
        id: `p_${p.id}`, href: `/crm/proposals/${p.id}`, title: p.title,
        customer: p.customer_company,
        typeKey: p.offer_type || (p.mode === 'short' ? 'bestand' : p.mode === 'email' ? 'email' : 'neukunde'),
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
        typeKey: 'email',
        typeLabel: OFFER_TYPES.email.label,
        typeChip: OFFER_TYPES.email.chip,
        statusLabel: st.label || q.status,
        statusColor: st.color || 'bg-muted text-muted-foreground',
        sprint: false, updated: q.updated_date,
      };
    }),
  ].sort((a, b) => new Date(b.updated) - new Date(a.updated)), [proposals, emailQuotes]);

  // Statusfilter aus den tatsächlich vorhandenen Status-Labels aufbauen
  const statusOptions = useMemo(() => {
    const seen = new Map();
    entries.forEach(e => { if (e.statusLabel && !seen.has(e.statusLabel)) seen.set(e.statusLabel, e.statusLabel); });
    return [...seen.keys()];
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e => {
      if (typeFilter !== 'all' && e.typeKey !== typeFilter) return false;
      if (statusFilter !== 'all' && e.statusLabel !== statusFilter) return false;
      if (q && !(`${e.title || ''} ${e.customer || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [entries, search, typeFilter, statusFilter]);

  const hasActiveFilter = search.trim() || typeFilter !== 'all' || statusFilter !== 'all';

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

      {/* Suche + Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Titel oder Kunde suchen…"
            className="pl-8 h-9"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {TYPE_FILTERS.map(f => (
            <button key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                typeFilter === f.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:text-foreground'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-xs h-9 px-2 rounded-md border border-border bg-card text-muted-foreground cursor-pointer">
          <option value="all">Status: alle</option>
          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} von {entries.length}
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Lädt…</p>
      ) : entries.length === 0 ? (
        <div className="border rounded-xl bg-card p-10 text-center">
          <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Noch keine Angebote. Lege das erste an.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-xl bg-card p-10 text-center space-y-2">
          <Search className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Kein Angebot passt zur Suche.</p>
          {hasActiveFilter && (
            <button onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); }}
              className="text-xs text-primary hover:underline">
              Filter zurücksetzen
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(e => <ProposalListCard key={e.id} entry={e} />)}
        </div>
      )}

      <ProposalCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}