import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Megaphone, AlertCircle, Plus, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import EditContractDialog from '@/components/maintenance/EditContractDialog';
import CsvExportButton from '@/components/shared/CsvExportButton';

const CSV_COLUMNS = [
  { key: 'status', label: 'Status' },
  { key: 'customer', label: 'Kunde' },
  { key: 'project_name', label: 'Projekt / Retainer' },
  { key: 'project_manager', label: 'PM' },
  { key: 'monthly_fixed_price', label: 'Mtl. Fixpreis (EUR)' },
  { key: 'annual_amount', label: 'Jahresbetrag (EUR)' },
  { key: 'one_time_payment', label: 'Einmalig (EUR)' },
  { key: 'billing_interval', label: 'Intervall' },
  { key: 'start_date', label: 'Start' },
  { key: 'notes', label: 'Notizen' },
];

const NEW_CONTRACT_DEFAULTS = {
  contract_type: 'online_marketing',
  status: 'active',
  billing_interval: 'monthly',
  monthly_fixed_price: 0,
  annual_amount: 0,
  one_time_payment: 0,
};

export default function OnlineMarketing() {
  const queryClient = useQueryClient();
  const [editingContract, setEditingContract] = useState(null);

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => base44.entities.RecurringContract.list(),
    select: (data) => data.filter(c => c.contract_type === 'online_marketing' || c.source_sheet?.includes('OM'))
  });

  const saveMutation = useMutation({
    mutationFn: (form) => form.id
      ? base44.entities.RecurringContract.update(form.id, form)
      : base44.entities.RecurringContract.create({ ...form, contract_type: 'online_marketing' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.RecurringContract.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  });

  const mrr = contracts.filter(c => c.status === 'active').reduce((s, c) => s + (Number(c.monthly_fixed_price) || 0), 0);
  const annual = contracts.reduce((s, c) => s + (Number(c.annual_amount) || 0), 0);
  const oneTime = contracts.reduce((s, c) => s + (Number(c.one_time_payment) || 0), 0);
  const unclearContracts = contracts.filter(c => c.status === 'active' && (!c.monthly_fixed_price || c.monthly_fixed_price === 0));

  const columns = [
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'customer', label: 'Kunde' },
    { key: 'project_name', label: 'Projekt / Retainer' },
    { key: 'project_manager', label: 'PM' },
    { key: 'monthly_fixed_price', label: 'Mtl. Fixpreis', render: (v) => formatCurrency(v), cellClass: 'text-right font-medium' },
    { key: 'annual_amount', label: 'Jahresbetrag', render: (v) => formatCurrency(v), cellClass: 'text-right' },
    { key: 'one_time_payment', label: 'Einmalig', render: (v) => v > 0 ? formatCurrency(v) : '—', cellClass: 'text-right' },
    { key: 'billing_interval', label: 'Intervall' },
    { key: 'start_date', label: 'Start' },
    { key: 'notes', label: 'Notizen', render: (v) => v ? <span className="text-xs text-muted-foreground truncate max-w-[150px] block">{v}</span> : '—' },
    {
      key: 'id', label: '', render: (v, row) => (
        <div className="flex gap-1 justify-end">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); setEditingContract(row); }}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); if (confirm('Vertrag löschen?')) deleteMutation.mutate(v); }}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )
    },
  ];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Online-Marketing & Laufende Umsetzungen"
        subtitle={`${contracts.length} Verträge / Retainer`}
        icon={Megaphone}
        actions={
          <div className="flex gap-2">
            <CsvExportButton data={contracts} columns={CSV_COLUMNS} filename="online-marketing-vertraege.csv" />
            <Button className="gap-2" onClick={() => setEditingContract({ ...NEW_CONTRACT_DEFAULTS })}>
              <Plus className="w-4 h-4" />
              Neuer Retainer
            </Button>
          </div>
        }
      />

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

      <EditContractDialog
        contract={editingContract}
        title={editingContract?.id ? 'Retainer bearbeiten' : 'Neuer Retainer / Online-Marketing'}
        onSave={(form) => saveMutation.mutate(form)}
        onClose={() => setEditingContract(null)}
      />
    </div>
  );
}