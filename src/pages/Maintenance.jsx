import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Shield, Bell, Sparkles, Plus } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency, calcOverdueDays } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ExtractMaintenanceContractsDialog from '@/components/maintenance/ExtractMaintenanceContractsDialog';
import EditContractDialog from '@/components/maintenance/EditContractDialog';
import CsvExportButton from '@/components/shared/CsvExportButton';

const CSV_COLUMNS = [
  { key: 'status', label: 'Status' },
  { key: 'customer', label: 'Kunde' },
  { key: 'project_name', label: 'Vertrag' },
  { key: 'billing_interval', label: 'Intervall' },
  { key: 'annual_amount', label: 'Jahresbetrag (EUR)' },
  { key: 'monthly_fixed_price', label: 'Monatlich (EUR)' },
  { key: 'due_date', label: 'Fälligkeit' },
  { key: 'notes', label: 'Notizen' },
];

export default function Maintenance() {
  const queryClient = useQueryClient();
  const [showExtract, setShowExtract] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => base44.entities.RecurringContract.list(),
    select: (data) => data.filter(c => c.contract_type === 'maintenance' || c.source_sheet?.includes('Wartung'))
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RecurringContract.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] })
  });

  const annual = contracts.reduce((s, c) => s + (Number(c.annual_amount) || 0), 0);
  const monthly = contracts.filter(c => c.status === 'active').reduce((s, c) => s + (Number(c.monthly_fixed_price) || 0), 0);

  const dueSoon = contracts.filter(c => {
    if (!c.due_date) return false;
    const days = -calcOverdueDays(c.due_date);
    return days >= 0 && days <= 90;
  });

  const columns = [
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'customer', label: 'Kunde' },
    { key: 'project_name', label: 'Vertrag' },
    { key: 'billing_interval', label: 'Intervall' },
    { key: 'annual_amount', label: 'Jahresbetrag', render: (v) => formatCurrency(v), cellClass: 'text-right font-medium' },
    { key: 'monthly_fixed_price', label: 'Monatlich', render: (v) => v > 0 ? formatCurrency(v) : '—', cellClass: 'text-right' },
    { key: 'due_date', label: 'Fälligkeit', render: (v, row) => {
      if (!v) return '—';
      const days = -calcOverdueDays(v);
      if (days <= 30 && days >= 0) return <Badge className="bg-red-100 text-red-700 border-red-200">{v} ({days}T)</Badge>;
      if (days <= 90 && days >= 0) return <Badge className="bg-amber-100 text-amber-700 border-amber-200">{v} ({days}T)</Badge>;
      return v;
    }},
    { key: 'notes', label: 'Notizen', render: (v) => v ? <span className="text-xs text-muted-foreground truncate max-w-[120px] block">{v}</span> : '—' },
    { key: 'id', label: 'Aktionen', sortable: false, render: (v, row) => (
      <div className="flex gap-1">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setEditingContract(row); }}>
          Bearbeiten
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); updateMutation.mutate({ id: v, data: { status: 'active', notes: (row.notes || '') + '\nAls verrechnet markiert ' + new Date().toLocaleDateString('de-AT') } }); }}>
          ✓ Verrechnet
        </Button>
      </div>
    )},
  ];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Wartungsverträge 2026" subtitle={`${contracts.length} Verträge`} icon={Shield}
        actions={
          <div className="flex gap-2">
            <CsvExportButton data={contracts} columns={CSV_COLUMNS} filename="wartungsvertraege.csv" />
            <Button variant="outline" className="gap-2" onClick={() => setEditingContract({ customer: '', project_name: '', status: 'active', billing_interval: 'yearly', contract_type: 'maintenance', annual_amount: 0, monthly_fixed_price: 0 })}>
              <Plus className="w-4 h-4" />
              Neuer Vertrag
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setShowExtract(true)}>
              <Sparkles className="w-4 h-4 text-purple-500" />
              Aus sevDesk extrahieren
            </Button>
          </div>
        }
      />
      <ExtractMaintenanceContractsDialog open={showExtract} onClose={() => setShowExtract(false)} />
      <EditContractDialog
        contract={editingContract}
        onSave={(form) => {
          if (form.id) {
            updateMutation.mutate({ id: form.id, data: form });
          } else {
            base44.entities.RecurringContract.create(form).then(() => queryClient.invalidateQueries({ queryKey: ['contracts'] }));
          }
        }}
        onClose={() => setEditingContract(null)}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Jahresvolumen" value={formatCurrency(annual)} variant="info" />
        <KpiCard title="Monatlich aktiv" value={formatCurrency(monthly)} variant="success" />
        <KpiCard title="Fällig in 90 Tagen" value={dueSoon.length} variant={dueSoon.length > 0 ? 'warning' : 'default'} />
        <KpiCard title="Aktive Verträge" value={contracts.filter(c => c.status === 'active').length} />
      </div>

      <DataTable columns={columns} data={contracts} />
    </div>
  );
}