import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CreditCard, Plus, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import FilterBar from '@/components/shared/FilterBar';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ToolCostDialog from '@/components/tools/ToolCostDialog';
import CsvExportButton from '@/components/shared/CsvExportButton';

const DECISION_LABELS = { keep: 'Behalten', cancel: 'Kündigen', review: 'Prüfen', undecided: 'Offen' };
const EXPORT_COLUMNS = [
  { key: 'tool_name', label: 'Tool' },
  { key: 'department', label: 'Abteilung' },
  { key: 'annual_cost', label: 'Jahreskosten (EUR)' },
  { key: 'monthly_cost', label: 'Monatlich (EUR)' },
  { key: 'payment_status', label: 'Zahlung' },
  { key: 'payment_interval', label: 'Intervall' },
  { key: 'needed', label: 'Benötigt' },
  { key: 'customer_recharge', label: 'Weiterverrechnung' },
  { key: 'decision_status', label: 'Entscheidung' },
  { key: 'notes', label: 'Notizen' },
];

const DEPT_LABELS = { design: 'Design', marketing: 'Marketing', programming: 'Programmierung', project_management: 'PM', general: 'Allgemein', other: 'Sonstiges' };
const DECISION_COLORS = { keep: 'bg-emerald-100 text-emerald-700', cancel: 'bg-red-100 text-red-700', review: 'bg-amber-100 text-amber-700', undecided: 'bg-gray-100 text-gray-500' };

export default function Tools() {
  const [filters, setFilters] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTool, setEditingTool] = useState(null);
  const queryClient = useQueryClient();

  const { data: tools = [], isLoading } = useQuery({
    queryKey: ['tools'], queryFn: () => base44.entities.ToolCost.list()
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ToolCost.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tools'] })
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ToolCost.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tools'] })
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ToolCost.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tools'] })
  });

  const openNew = () => { setEditingTool(null); setDialogOpen(true); };
  const openEdit = (tool) => { setEditingTool(tool); setDialogOpen(true); };
  const handleClose = () => { setDialogOpen(false); setEditingTool(null); };

  const handleSave = (formData) => {
    if (editingTool) {
      updateMutation.mutate({ id: editingTool.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
    handleClose();
  };

  const handleDelete = (tool, e) => {
    e.stopPropagation();
    if (confirm(`„${tool.tool_name}" wirklich löschen?`)) {
      deleteMutation.mutate(tool.id);
    }
  };

  const filtered = tools.filter(t => {
    if (filters.department && t.department !== filters.department) return false;
    if (filters.decision_status && t.decision_status !== filters.decision_status) return false;
    if (filters.needed && t.needed !== (filters.needed === 'true')) return false;
    return true;
  });

  const annual = filtered.reduce((s, t) => s + (Number(t.annual_cost) || 0), 0);
  const monthly = filtered.reduce((s, t) => s + (Number(t.monthly_cost) || 0), 0);
  const notNeeded = filtered.filter(t => !t.needed).length;
  const rechargeable = filtered.filter(t => t.customer_recharge).reduce((s, t) => s + (Number(t.annual_cost) || 0), 0);

  const columns = [
    { key: 'tool_name', label: 'Tool' },
    { key: 'department', label: 'Abteilung', render: (v) => DEPT_LABELS[v] || v },
    { key: 'annual_cost', label: 'Jahreskosten', render: (v) => formatCurrency(v), cellClass: 'text-right font-medium' },
    { key: 'monthly_cost', label: 'Monatlich', render: (v) => formatCurrency(v), cellClass: 'text-right' },
    { key: 'payment_status', label: 'Zahlung', render: (v) => <StatusBadge status={v} /> },
    { key: 'payment_interval', label: 'Intervall' },
    { key: 'needed', label: 'Benötigt', render: (v) => v ? <Badge className="bg-emerald-100 text-emerald-700">Ja</Badge> : <Badge className="bg-red-100 text-red-700">Nein</Badge> },
    { key: 'customer_recharge', label: 'Weiterverr.', render: (v) => v || '—' },
    { key: 'decision_status', label: 'Entscheidung', render: (v, row) => (
      <div className="flex gap-1">
        {['keep', 'cancel', 'review'].map(d => (
          <Button key={d} size="sm" variant="ghost" className={`h-6 text-xs px-2 ${v === d ? DECISION_COLORS[d] : ''}`}
            onClick={(e) => { e.stopPropagation(); updateMutation.mutate({ id: row.id, data: { decision_status: d } }); }}>
            {d === 'keep' ? '✓' : d === 'cancel' ? '✕' : '?'}
          </Button>
        ))}
      </div>
    )},
    { key: '_actions', label: '', sortable: false, render: (_, row) => (
      <div className="flex gap-1 justify-end">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => handleDelete(row, e)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    )},
  ];

  const exportData = filtered.map((t) => ({
    ...t,
    department: DEPT_LABELS[t.department] || t.department || '',
    annual_cost: t.annual_cost ?? 0,
    monthly_cost: t.monthly_cost ?? 0,
    needed: t.needed ? 'Ja' : 'Nein',
    decision_status: DECISION_LABELS[t.decision_status] || t.decision_status || '',
  }));

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Toolkosten 2026"
        subtitle={`${filtered.length} Tools`}
        icon={CreditCard}
        actions={
          <div className="flex gap-2">
            <CsvExportButton data={exportData} columns={EXPORT_COLUMNS} filename="toolkosten-2026.csv" />
            <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" />Tool hinzufügen</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Jahreskosten" value={formatCurrency(annual)} variant="danger" />
        <KpiCard title="Ø Monatlich" value={formatCurrency(monthly)} />
        <KpiCard title="Nicht benötigt" value={notNeeded} variant={notNeeded > 0 ? 'warning' : 'default'} />
        <KpiCard title="Weiterverrechenbar" value={formatCurrency(rechargeable)} variant="success" />
      </div>

      <FilterBar
        filters={[
          { key: 'department', label: 'Abteilung', options: Object.entries(DEPT_LABELS).map(([v, l]) => ({ value: v, label: l })) },
          { key: 'decision_status', label: 'Entscheidung', options: ['keep', 'cancel', 'review', 'undecided'].map(v => ({ value: v, label: v })) },
          { key: 'needed', label: 'Benötigt', options: [{ value: 'true', label: 'Ja' }, { value: 'false', label: 'Nein' }] },
        ]}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onReset={() => setFilters({})}
      />

      <DataTable columns={columns} data={filtered} />

      <ToolCostDialog
        open={dialogOpen}
        onClose={handleClose}
        onSave={handleSave}
        tool={editingTool}
      />
    </div>
  );
}