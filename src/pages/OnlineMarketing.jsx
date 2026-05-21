import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Megaphone, AlertCircle } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function OnlineMarketing() {
  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => base44.entities.RecurringContract.list(),
    select: (data) => data.filter(c => c.contract_type === 'online_marketing' || c.source_sheet?.includes('OM'))
  });

  const mrr = contracts.filter(c => c.status === 'active').reduce((s, c) => s + (Number(c.monthly_fixed_price) || 0), 0);
  const annual = contracts.reduce((s, c) => s + (Number(c.annual_amount) || 0), 0);
  const oneTime = contracts.reduce((s, c) => s + (Number(c.one_time_payment) || 0), 0);
  const unclearContracts = contracts.filter(c => c.status === 'active' && (!c.monthly_fixed_price || c.monthly_fixed_price === 0));

  const columns = [
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'customer', label: 'Kunde' },
    { key: 'project_name', label: 'Projekt' },
    { key: 'project_manager', label: 'PM' },
    { key: 'monthly_fixed_price', label: 'Mtl. Fixpreis', render: (v) => formatCurrency(v), cellClass: 'text-right font-medium' },
    { key: 'annual_amount', label: 'Jahresbetrag', render: (v) => formatCurrency(v), cellClass: 'text-right' },
    { key: 'one_time_payment', label: 'Einmalig', render: (v) => v > 0 ? formatCurrency(v) : '—', cellClass: 'text-right' },
    { key: 'billing_interval', label: 'Intervall' },
    { key: 'start_date', label: 'Start' },
    { key: 'notes', label: 'Notizen', render: (v) => v ? <span className="text-xs text-muted-foreground truncate max-w-[150px] block">{v}</span> : '—' },
  ];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Online-Marketing & Laufende Umsetzungen" subtitle={`${contracts.length} Verträge`} icon={Megaphone} />

      {unclearContracts.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>{unclearContracts.length} aktive Verträge</strong> haben keinen monatlichen Fixpreis — Abrechnungsklärung nötig.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="MRR (Monthly Recurring)" value={formatCurrency(mrr)} variant="success" />
        <KpiCard title="Annualized Run Rate" value={formatCurrency(mrr * 12)} variant="info" />
        <KpiCard title="Jahresumsatz gesamt" value={formatCurrency(annual)} />
        <KpiCard title="Einmalzahlungen" value={formatCurrency(oneTime)} />
      </div>

      <DataTable columns={columns} data={contracts} />
    </div>
  );
}