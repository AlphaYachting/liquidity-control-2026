import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import FilterBar from '@/components/shared/FilterBar';
import DataTable from '@/components/shared/DataTable';
import DunningSection from '@/components/receivables/DunningSection';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency, calcOverdueDays, getAgingBucket, AGING_LABELS } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

export default function Receivables() {
  const [filters, setFilters] = useState({});
  const navigate = useNavigate();

  // Live-Forderungen direkt aus sevDesk (offen + teilbezahlt)
  const { data: liveData, isLoading } = useQuery({
    queryKey: ['sevdeskReceivablesLive'],
    queryFn: async () => (await base44.functions.invoke('fetchSevdeskReceivablesLive', {})).data,
    staleTime: 5 * 60 * 1000,
  });

  const { data: dunningRecords = [] } = useQuery({
    queryKey: ['dunningRecords'],
    queryFn: () => base44.entities.DunningRecord.list('-created_date', 500),
  });

  // Höchste aktive Mahnstufe pro sevDesk-Rechnung
  const dunningLevelByInvoice = {};
  dunningRecords.forEach(d => {
    if (d.status === 'rejected' || !d.sevdesk_invoice_id) return;
    dunningLevelByInvoice[d.sevdesk_invoice_id] = Math.max(
      dunningLevelByInvoice[d.sevdesk_invoice_id] || 0, d.dunning_level || 0
    );
  });

  const enriched = (liveData?.invoices || []).map(r => ({
    ...r,
    calc_overdue_days: calcOverdueDays(r.due_date),
    aging_bucket: getAgingBucket(calcOverdueDays(r.due_date)),
    dunning_level: dunningLevelByInvoice[r.id] || 0,
  }));

  const filtered = enriched.filter(r => {
    if (filters.status && r.payment_status !== filters.status) return false;
    if (filters.aging && r.aging_bucket !== filters.aging) return false;
    return true;
  });

  const totalOpen = filtered.reduce((s, r) => s + (Number(r.open_amount) || 0), 0);
  const totalOverdue = filtered.filter(r => r.calc_overdue_days > 0).reduce((s, r) => s + (Number(r.open_amount) || 0), 0);
  const criticalCount = filtered.filter(r => r.calc_overdue_days > 30).length;

  const columns = [
    { key: 'payment_status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'customer_name', label: 'Kunde' },
    { key: 'invoice_number', label: 'RE-Nr.' },
    { key: 'invoice_date', label: 'RE-Datum' },
    { key: 'gross_amount', label: 'Brutto', render: (v) => formatCurrency(v), cellClass: 'text-right' },
    { key: 'open_amount', label: 'Offen', render: (v) => formatCurrency(v), cellClass: 'text-right font-medium' },
    { key: 'due_date', label: 'Fällig' },
    { key: 'calc_overdue_days', label: 'Überfällig', render: (v) => v > 0 ? <Badge className="bg-red-100 text-red-700">{v} Tage</Badge> : <Badge className="bg-emerald-100 text-emerald-700">OK</Badge> },
    { key: 'dunning_level', label: 'Mahnstufe', render: (v) => v > 0 ? <Badge className="bg-amber-100 text-amber-700">Stufe {v}</Badge> : '—' },
  ];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offene Forderungen / Mahnwesen"
        subtitle={`${filtered.length} offene Rechnungen — live aus sevDesk`}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Offene Forderungen" value={formatCurrency(totalOpen)} subtitle="Summe offener Beträge (brutto)" variant="warning" />
        <KpiCard title="Überfällig" value={formatCurrency(totalOverdue)} subtitle="Offen & Fälligkeit überschritten" variant="danger" />
        <KpiCard title="Kritische Fälle" value={criticalCount} subtitle="> 30 Tage überfällig" variant={criticalCount > 0 ? 'danger' : 'default'} />
        <KpiCard title="Gesamt Positionen" value={filtered.length} subtitle="Offene Rechnungen in sevDesk" />
      </div>

      <DunningSection />

      <FilterBar
        filters={[
          { key: 'status', label: 'Status', options: [
            { value: 'open', label: 'Offen' },
            { value: 'partially_paid', label: 'Teilbezahlt' },
          ]},
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