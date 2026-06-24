import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Server, Plus, Sparkles } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency, calcOverdueDays } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import EditContractDialog from '@/components/maintenance/EditContractDialog';
import ExtractHostingContractsDialog from '@/components/hosting/ExtractHostingContractsDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function Hosting() {
  const queryClient = useQueryClient();
  const [editingContract, setEditingContract] = useState(null);
  const [activeTab, setActiveTab] = useState('hosting');
  const [showExtract, setShowExtract] = useState(false);

  const { data: allContracts = [], isLoading } = useQuery({
    queryKey: ['hosting-contracts'],
    queryFn: () => base44.entities.RecurringContract.list(),
    select: (data) => data.filter(c => c.contract_type === 'hosting' || c.contract_type === 'domain')
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RecurringContract.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hosting-contracts'] })
  });

  const contracts = allContracts.filter(c => c.contract_type === activeTab);

  const annual = contracts.reduce((s, c) => s + (Number(c.annual_amount) || 0), 0);
  const active = contracts.filter(c => c.status === 'active').length;
  const dueSoon = contracts.filter(c => {
    if (!c.due_date) return false;
    const days = -calcOverdueDays(c.due_date);
    return days >= 0 && days <= 90;
  });

  const newContractDefaults = (type) => ({
    customer: '', project_name: '', status: 'active',
    billing_interval: 'yearly', contract_type: type,
    annual_amount: 0, monthly_fixed_price: 0
  });

  const columns = [
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'customer', label: 'Kunde' },
    { key: 'project_name', label: activeTab === 'hosting' ? 'Hosting-Paket / Server' : 'Domain' },
    { key: 'billing_interval', label: 'Intervall' },
    { key: 'annual_amount', label: 'Jahresbetrag', render: (v) => formatCurrency(v), cellClass: 'text-right font-medium' },
    { key: 'monthly_fixed_price', label: 'Monatlich', render: (v) => v > 0 ? formatCurrency(v) : '—', cellClass: 'text-right' },
    { key: 'due_date', label: 'Fälligkeit / Ablauf', render: (v) => {
      if (!v) return '—';
      const days = -calcOverdueDays(v);
      if (days <= 30 && days >= 0) return <Badge className="bg-red-100 text-red-700 border-red-200">{v} ({days}T)</Badge>;
      if (days <= 90 && days >= 0) return <Badge className="bg-amber-100 text-amber-700 border-amber-200">{v} ({days}T)</Badge>;
      return v;
    }},
    { key: 'notes', label: 'Notizen', render: (v) => v ? <span className="text-xs text-muted-foreground truncate max-w-[140px] block">{v}</span> : '—' },
    { key: 'id', label: 'Aktionen', sortable: false, render: (v, row) => (
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setEditingContract(row); }}>
        Bearbeiten
      </Button>
    )},
  ];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hosting & Domains"
        subtitle={`${allContracts.length} Einträge gesamt`}
        icon={Server}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setEditingContract(newContractDefaults(activeTab))}>
              <Plus className="w-4 h-4" />
              Neuer Eintrag
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setShowExtract(true)}>
              <Sparkles className="w-4 h-4 text-purple-500" />
              Aus sevDesk extrahieren
            </Button>
          </div>
        }
      />

      <ExtractHostingContractsDialog open={showExtract} onClose={() => setShowExtract(false)} />
      <EditContractDialog
        contract={editingContract}
        onSave={(form) => {
          if (form.id) {
            updateMutation.mutate({ id: form.id, data: form });
          } else {
            base44.entities.RecurringContract.create(form).then(() => queryClient.invalidateQueries({ queryKey: ['hosting-contracts'] }));
          }
        }}
        onClose={() => setEditingContract(null)}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="hosting">🖥️ Hosting ({allContracts.filter(c => c.contract_type === 'hosting').length})</TabsTrigger>
          <TabsTrigger value="domain">🌐 Domains ({allContracts.filter(c => c.contract_type === 'domain').length})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title="Jahresvolumen" value={formatCurrency(annual)} variant="info" />
            <KpiCard title="Aktive Einträge" value={active} variant="success" />
            <KpiCard title="Fällig in 90 Tagen" value={dueSoon.length} variant={dueSoon.length > 0 ? 'warning' : 'default'} />
            <KpiCard title="Gesamt Einträge" value={contracts.length} />
          </div>
          <DataTable columns={columns} data={contracts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}