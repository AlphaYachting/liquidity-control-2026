import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FileText } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import FilterBar from '@/components/shared/FilterBar';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

const PRIORITY_LABELS = { critical: 'Kritisch', normal: 'Normal', defer_possible: 'Aufschiebbar', unclear: 'Unklar', disputed: 'Strittig' };
const PRIORITY_COLORS = { critical: 'bg-red-100 text-red-700', normal: 'bg-blue-100 text-blue-700', defer_possible: 'bg-gray-100 text-gray-600', unclear: 'bg-amber-100 text-amber-700', disputed: 'bg-purple-100 text-purple-700' };

export default function Payables() {
  const [filters, setFilters] = useState({});

  const { data: payables = [], isLoading } = useQuery({
    queryKey: ['payables'], queryFn: () => base44.entities.Payable.list()
  });

  const filtered = payables.filter(p => {
    if (filters.status && p.status !== filters.status) return false;
    if (filters.priority && p.priority !== filters.priority) return false;
    return true;
  });

  const totalOpen = filtered.filter(p => p.status !== 'paid').reduce((s, p) => s + (Number(p.gross_amount) || 0), 0);
  const critical = filtered.filter(p => p.priority === 'critical' && p.status !== 'paid').reduce((s, p) => s + (Number(p.gross_amount) || 0), 0);

  const columns = [
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'supplier', label: 'Lieferant' },
    { key: 'invoice_number', label: 'RE-Nr.' },
    { key: 'invoice_date', label: 'RE-Datum' },
    { key: 'description', label: 'Beschreibung', render: (v) => <span className="text-sm truncate max-w-[200px] block">{v || '—'}</span> },
    { key: 'net_amount', label: 'Netto', render: (v) => formatCurrency(v), cellClass: 'text-right' },
    { key: 'gross_amount', label: 'Brutto', render: (v) => formatCurrency(v), cellClass: 'text-right font-medium' },
    { key: 'due_date', label: 'Fällig' },
    { key: 'priority', label: 'Priorität', render: (v) => <Badge className={PRIORITY_COLORS[v] || ''}>{PRIORITY_LABELS[v] || v}</Badge> },
    { key: 'payment_planned_date', label: 'Zahlung geplant' },
    { key: 'unclear_notes', label: 'Offen', render: (v) => v ? <span className="text-xs text-amber-600 truncate max-w-[120px] block">{v}</span> : '—' },
  ];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Eingangsrechnungen / Offene Kosten" subtitle={`${filtered.length} Rechnungen`} icon={FileText} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard title="Offene Verbindlichkeiten" value={formatCurrency(totalOpen)} variant="warning" />
        <KpiCard title="Kritische Zahlungen" value={formatCurrency(critical)} variant="danger" />
        <KpiCard title="Positionen" value={filtered.length} />
      </div>

      <FilterBar
        filters={[
          { key: 'status', label: 'Status', options: ['open', 'paid', 'scheduled', 'overdue', 'disputed', 'deferred'].map(v => ({ value: v, label: v })) },
          { key: 'priority', label: 'Priorität', options: Object.entries(PRIORITY_LABELS).map(([v, l]) => ({ value: v, label: l })) },
        ]}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onReset={() => setFilters({})}
      />

      <DataTable columns={columns} data={filtered} />
    </div>
  );
}