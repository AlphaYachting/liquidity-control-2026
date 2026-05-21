import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Wrench } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import FilterBar from '@/components/shared/FilterBar';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';

export default function Production() {
  const [filters, setFilters] = useState({});

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['planLines'],
    queryFn: () => base44.entities.LiquidityPlanLine.list(),
    select: (data) => data.filter(l => l.parent_type === 'production_support' || l.source_sheet?.includes('Produktion'))
  });

  const filtered = items.filter(i => {
    if (filters.status && i.status !== filters.status) return false;
    if (filters.category && i.category !== filters.category) return false;
    return true;
  });

  const totalNet = filtered.reduce((s, i) => s + (Number(i.amount_net) || 0), 0);
  const invoiced = filtered.filter(i => i.status === 'invoiced' || i.status === 'paid').reduce((s, i) => s + (Number(i.amount_net) || 0), 0);
  const open = filtered.filter(i => i.status === 'planned' || i.status === 'uncertain').reduce((s, i) => s + (Number(i.amount_net) || 0), 0);

  const categories = [...new Set(items.map(i => i.category).filter(Boolean))];

  const columns = [
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'customer_or_supplier', label: 'Kunde' },
    { key: 'title', label: 'Beschreibung' },
    { key: 'category', label: 'Kategorie' },
    { key: 'month', label: 'Monat' },
    { key: 'amount_net', label: 'Betrag netto', render: (v) => formatCurrency(v), cellClass: 'text-right font-medium' },
    { key: 'responsible_person', label: 'Verantwortlich' },
    { key: 'notes', label: 'Notizen', render: (v) => v ? <span className="text-xs text-muted-foreground truncate max-w-[120px] block">{v}</span> : '—' },
  ];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Produktion & Support 2026" subtitle={`${filtered.length} Positionen`} icon={Wrench} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard title="Gesamtvolumen" value={formatCurrency(totalNet)} variant="info" />
        <KpiCard title="Verrechnet" value={formatCurrency(invoiced)} variant="success" />
        <KpiCard title="Offen" value={formatCurrency(open)} variant="warning" />
      </div>

      <FilterBar
        filters={[
          { key: 'status', label: 'Status', options: ['planned', 'invoiced', 'paid', 'uncertain'].map(v => ({ value: v, label: v })) },
          { key: 'category', label: 'Kategorie', options: categories.map(v => ({ value: v, label: v })) },
        ]}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onReset={() => setFilters({})}
      />

      <DataTable columns={columns} data={filtered} />
    </div>
  );
}