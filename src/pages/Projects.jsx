import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Plus } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import FilterBar from '@/components/shared/FilterBar';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const PM_OPTIONS = ['Lara', 'Sebastian', 'Pascal', 'Anna'].map(v => ({ value: v, label: v }));
const STATUS_OPTIONS = ['active', 'completed', 'on_hold', 'cancelled', 'unclear'].map(v => ({ value: v, label: v }));
const RISK_OPTIONS = ['none', 'low', 'medium', 'high', 'critical'].map(v => ({ value: v, label: v }));

export default function Projects() {
  const [filters, setFilters] = useState({});
  const navigate = useNavigate();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });

  const STATUS_SORT_ORDER = { active: 0, on_hold: 1, unclear: 2, completed: 3, cancelled: 4 };

  const filtered = projects
    .filter(p => {
      if (filters.project_manager && p.project_manager !== filters.project_manager) return false;
      if (filters.status && p.status !== filters.status) return false;
      if (filters.risk_status && p.risk_status !== filters.risk_status) return false;
      return true;
    })
    .sort((a, b) => {
      const sA = STATUS_SORT_ORDER[a.status] ?? 99;
      const sB = STATUS_SORT_ORDER[b.status] ?? 99;
      if (sA !== sB) return sA - sB;
      return (a.customer || '').localeCompare(b.customer || '', 'de');
    });

  const totalNet = filtered.reduce((s, p) => s + (Number(p.total_net_amount) || 0), 0);
  const invoiced = filtered.reduce((s, p) => s + (Number(p.already_invoiced_amount) || 0), 0);
  // Offene Beträge: nur aktive + on_hold Projekte (nicht completed/cancelled)
  const openAmt = filtered
    .filter(p => p.status !== 'completed' && p.status !== 'cancelled')
    .reduce((s, p) => s + (Number(p.open_amount) || 0), 0);

  const columns = [
    { key: 'status', label: 'Status', width: '100px', render: (v) => <StatusBadge status={v} /> },
    { key: 'customer', label: 'Kunde' },
    { key: 'project_name', label: 'Projekt' },
    { key: 'project_manager', label: 'PM', width: '80px' },
    { key: 'total_net_amount', label: 'Gesamt netto', render: (v) => formatCurrency(v), cellClass: 'text-right font-medium' },
    { key: 'already_invoiced_amount', label: 'Verrechnet', render: (v) => formatCurrency(v), cellClass: 'text-right' },
    { key: 'open_amount', label: 'Offen', render: (v) => <span className={Number(v) > 0 ? 'text-amber-600 font-medium' : ''}>{formatCurrency(v)}</span>, cellClass: 'text-right' },
    { key: 'expected_invoice_month', label: 'Erw. Monat', width: '100px' },
    { key: 'risk_status', label: 'Risiko', width: '90px', render: (v) => <StatusBadge status={v} /> },
    { key: 'notes', label: 'Notizen', render: (v) => v ? <span className="text-xs text-muted-foreground truncate max-w-[150px] block">{v}</span> : '—' },
  ];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Projekte 2026" subtitle={`${filtered.length} Projekte`} icon={FolderKanban} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Gesamtvolumen" value={formatCurrency(totalNet)} variant="info" />
        <KpiCard title="Bereits verrechnet" value={formatCurrency(invoiced)} variant="success" />
        <KpiCard title="Offene Beträge" value={formatCurrency(openAmt)} variant="warning" />
        <KpiCard title="Projekte" value={filtered.length} subtitle={`${filtered.filter(p => p.status === 'active').length} aktiv`} />
      </div>

      <FilterBar
        filters={[
          { key: 'project_manager', label: 'PM', options: PM_OPTIONS },
          { key: 'status', label: 'Status', options: STATUS_OPTIONS },
          { key: 'risk_status', label: 'Risiko', options: RISK_OPTIONS },
        ]}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onReset={() => setFilters({})}
      />

      <DataTable columns={columns} data={filtered} onRowClick={(p) => navigate(`/projects/${p.id}`)} />

    </div>
  );
}