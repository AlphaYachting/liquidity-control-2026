import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import PaymentFreshnessWarning from '@/components/shared/PaymentFreshnessWarning';
import KpiCard from '@/components/shared/KpiCard';
import FilterBar from '@/components/shared/FilterBar';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency, calcOverdueDays, getAgingBucket, AGING_LABELS } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ACTION_LABELS = {
  call_customer: '📞 Anrufen', send_reminder: '📧 Mahnung', send_final_notice: '⚠️ Letzte Mahnung',
  clarify_internally: '🔍 Intern klären', legal_review: '⚖️ Inkasso prüfen', write_off_candidate: '❌ Abschreibung', none: '—'
};

export default function Receivables() {
  const [filters, setFilters] = useState({});
  const queryClient = useQueryClient();

  const { data: receivables = [], isLoading } = useQuery({
    queryKey: ['receivables'], queryFn: () => base44.entities.Receivable.list()
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Receivable.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['receivables'] })
  });

  const enriched = receivables.map(r => ({
    ...r,
    calc_overdue_days: calcOverdueDays(r.due_date),
    aging_bucket: getAgingBucket(calcOverdueDays(r.due_date))
  }));

  const filtered = enriched.filter(r => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.collection_risk && r.collection_risk !== filters.collection_risk) return false;
    if (filters.aging && r.aging_bucket !== filters.aging) return false;
    return true;
  });

  const totalOpen = filtered.filter(r => r.status !== 'paid').reduce((s, r) => s + (Number(r.gross_amount) || 0), 0);
  const totalOverdue = filtered.filter(r => r.calc_overdue_days > 0 && r.status !== 'paid').reduce((s, r) => s + (Number(r.gross_amount) || 0), 0);
  const criticalCount = filtered.filter(r => r.collection_risk === 'critical' || r.collection_risk === 'high').length;

  const columns = [
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'customer', label: 'Kunde' },
    { key: 'invoice_number', label: 'RE-Nr.' },
    { key: 'invoice_date', label: 'RE-Datum' },
    { key: 'gross_amount', label: 'Brutto', render: (v) => formatCurrency(v), cellClass: 'text-right font-medium' },
    { key: 'due_date', label: 'Fällig' },
    { key: 'calc_overdue_days', label: 'Überfällig', render: (v) => v > 0 ? <Badge className="bg-red-100 text-red-700">{v} Tage</Badge> : <Badge className="bg-emerald-100 text-emerald-700">OK</Badge> },
    { key: 'dunning_level', label: 'Mahnstufe', render: (v) => v > 0 ? <Badge className="bg-amber-100 text-amber-700">Stufe {v}</Badge> : '—' },
    { key: 'next_action', label: 'Aktion', render: (v, row) => (
      <Select value={v || 'none'} onValueChange={val => updateMutation.mutate({ id: row.id, data: { next_action: val } })}>
        <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(ACTION_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    )},
    { key: 'collection_risk', label: 'Risiko', render: (v) => <StatusBadge status={v} /> },
  ];

  const { data: invoiceRecords = [] } = useQuery({
    queryKey: ['invoiceRecords'], queryFn: () => base44.entities.InvoiceRecord.list()
  });

  const navigate = useNavigate();

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offene Forderungen / Mahnwesen"
        subtitle={`${filtered.length} Forderungen`}
        icon={AlertTriangle}
        actions={
          <button
            onClick={() => navigate('/payment-consistency')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Konsistenzprüfung
          </button>
        }
      />
      <PaymentFreshnessWarning invoiceRecords={invoiceRecords} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Offene Forderungen" value={formatCurrency(totalOpen)} variant="warning" />
        <KpiCard title="Überfällig" value={formatCurrency(totalOverdue)} variant="danger" />
        <KpiCard title="Kritische Fälle" value={criticalCount} variant={criticalCount > 0 ? 'danger' : 'default'} />
        <KpiCard title="Gesamt Positionen" value={filtered.length} />
      </div>

      <FilterBar
        filters={[
          { key: 'status', label: 'Status', options: ['open', 'overdue', 'partially_paid', 'paid', 'disputed'].map(v => ({ value: v, label: v })) },
          { key: 'collection_risk', label: 'Risiko', options: ['low', 'medium', 'high', 'critical'].map(v => ({ value: v, label: v })) },
          { key: 'aging', label: 'Alter', options: Object.entries(AGING_LABELS).map(([v, l]) => ({ value: v, label: l })) },
        ]}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onReset={() => setFilters({})}
      />

      <DataTable columns={columns} data={filtered} />
    </div>
  );
}