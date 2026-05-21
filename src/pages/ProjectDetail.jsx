import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FolderKanban, Plus, FileText } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import StatusBadge from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, getMonthLabel } from '@/lib/liquidityUtils';
import BillingBlockList from '@/components/projects/BillingBlockList';
import BillingBlockForm from '@/components/projects/BillingBlockForm';
import ConfirmedOrderPanel from '@/components/projects/ConfirmedOrderPanel';

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [editingBlock, setEditingBlock] = useState(null);

  const { data: projects = [], isLoading: lpLoading } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });
  const project = projects.find(p => p.id === projectId);

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list()
  });
  const order = orders.find(o => o.project_id === projectId);

  const { data: blocks = [], isLoading: blocksLoading } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });
  const projectBlocks = blocks.filter(b => b.project_id === projectId)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const saveBlockMutation = useMutation({
    mutationFn: ({ id, data }) => id
      ? base44.entities.ProjectBillingBlock.update(id, data)
      : base44.entities.ProjectBillingBlock.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billingBlocks'] });
      setShowBlockForm(false);
      setEditingBlock(null);
    }
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id) => base44.entities.ProjectBillingBlock.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billingBlocks'] })
  });

  const isLoading = lpLoading || ordersLoading || blocksLoading;

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-4 gap-4">{Array(4).fill(0).map((_,i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );

  if (!project) return (
    <div className="text-center py-20 text-muted-foreground">
      Projekt nicht gefunden.
      <Button variant="link" onClick={() => navigate('/projects')}>Zurück zu Projekte</Button>
    </div>
  );

  const totalBlocks = projectBlocks.reduce((s, b) => s + (Number(b.amount_net) || 0), 0);
  const invoicedBlocks = projectBlocks.filter(b => b.invoice_readiness_status === 'invoiced' || b.invoice_readiness_status === 'paid')
    .reduce((s, b) => s + (Number(b.amount_net) || 0), 0);
  const readyBlocks = projectBlocks.filter(b => b.invoice_readiness_status === 'ready');
  const readyAmount = readyBlocks.reduce((s, b) => s + (Number(b.amount_net) || 0), 0);

  const handleSaveBlock = (data) => {
    const payload = { ...data, project_id: projectId, customer: project.customer, project_name: project.project_name };
    saveBlockMutation.mutate({ id: editingBlock?.id, data: payload });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <PageHeader
          title={project.project_name}
          subtitle={project.customer}
          icon={FolderKanban}
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge status={project.status} />
              <StatusBadge status={project.risk_status} />
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Auftragsvolumen" value={formatCurrency(project.total_net_amount)} variant="info" />
        <KpiCard title="Bereits verrechnet" value={formatCurrency(invoicedBlocks || project.already_invoiced_amount)} variant="success" />
        <KpiCard title="Abrechnungsbereit" value={formatCurrency(readyAmount)} variant={readyAmount > 0 ? 'warning' : 'default'}
          subtitle={readyBlocks.length > 0 ? `${readyBlocks.length} Paket(e)` : 'Kein Paket bereit'} />
        <KpiCard title="Offen" value={formatCurrency(project.open_amount)} variant="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Abrechnungspakete</CardTitle>
              <Button size="sm" onClick={() => { setEditingBlock(null); setShowBlockForm(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Paket hinzufügen
              </Button>
            </CardHeader>
            <CardContent>
              {showBlockForm && (
                <div className="mb-4 p-4 border rounded-xl bg-muted/30">
                  <BillingBlockForm
                    block={editingBlock}
                    onSave={handleSaveBlock}
                    onCancel={() => { setShowBlockForm(false); setEditingBlock(null); }}
                    isSaving={saveBlockMutation.isPending}
                  />
                </div>
              )}
              <BillingBlockList
                blocks={projectBlocks}
                onEdit={(b) => { setEditingBlock(b); setShowBlockForm(true); }}
                onDelete={(id) => deleteBlockMutation.mutate(id)}
                onStatusChange={(id, status) => saveBlockMutation.mutate({ id, data: { invoice_readiness_status: status } })}
              />
              {projectBlocks.length > 0 && (
                <div className="flex items-center justify-between pt-3 mt-3 border-t text-sm">
                  <span className="text-muted-foreground">Summe Pakete</span>
                  <span className="font-semibold">{formatCurrency(totalBlocks)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <ConfirmedOrderPanel projectId={projectId} order={order} project={project} />

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base text-sm">Projektinfos</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Projektmanager</span><span>{project.project_manager || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Auftragsnr.</span><span>{project.order_number || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Kategorie</span><span>{project.category || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Erw. Monat</span><span>{project.expected_invoice_month ? getMonthLabel(project.expected_invoice_month) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Externe Kosten</span><span>{formatCurrency(project.external_costs)}</span></div>
              {project.notes && <div className="pt-2 border-t"><p className="text-xs text-muted-foreground">{project.notes}</p></div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}