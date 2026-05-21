import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, AlertTriangle, CheckCircle2, AlertCircle, ExternalLink, Plus, Link2, Unlink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { calculateOrderReconciliation, calculateBillingBlockStatus } from '@/lib/reconciliationUtils';
import InvoiceScanUploader from '@/components/orders/InvoiceScanUploader';
import InvoiceRecordForm from '@/components/orders/InvoiceRecordForm';
import AworkProjectPicker from '@/components/awork/AworkProjectPicker';
import AworkTaskLinker from '@/components/awork/AworkTaskLinker';
import AworkStatusBar from '@/components/awork/AworkStatusBar';
import AworkSignalBadge from '@/components/awork/AworkSignalBadge';
import { calculateAworkStatusForBillingBlock, getTasksForBillingBlock } from '@/lib/aworkReadinessUtils';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import PaymentFreshnessWarning from '@/components/shared/PaymentFreshnessWarning';
import PaymentSourceBadge from '@/components/shared/PaymentSourceBadge';
import InvoiceOpenAmountDisplay from '@/components/shared/InvoiceOpenAmountDisplay';
import { checkBillingBlockProjectMismatch } from '@/lib/paymentDataUtils';

const MATCH_COLORS = {
  auto_matched: 'bg-emerald-100 text-emerald-700',
  manually_matched: 'bg-blue-100 text-blue-700',
  unmatched: 'bg-red-100 text-red-700',
  disputed: 'bg-amber-100 text-amber-700',
};

const WORK_STATUS_LABELS = {
  not_started: 'Nicht begonnen',
  in_progress: 'In Arbeit',
  completed: 'Fertig',
  blocked: 'Blockiert',
};

const READINESS_LABELS = {
  not_ready: 'Nicht bereit',
  in_progress: 'In Bearbeitung',
  ready: 'Bereit',
  invoiced: 'Verrechnet',
  paid: 'Bezahlt',
};

export default function ConfirmedOrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showInvoiceUploader, setShowInvoiceUploader] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [showAworkPicker, setShowAworkPicker] = useState(false);
  const [linkingBlock, setLinkingBlock] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list()
  });
  const order = orders.find(o => o.id === orderId);

  const { data: blocks = [], isLoading: blocksLoading } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });
  const orderBlocks = blocks.filter(b => b.confirmed_order_id === orderId)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoiceRecords'], queryFn: () => base44.entities.InvoiceRecord.list()
  });
  const orderInvoices = invoices.filter(i => i.confirmed_order_id === orderId);

  const saveInvoiceMutation = useMutation({
    mutationFn: ({ id, data }) => id
      ? base44.entities.InvoiceRecord.update(id, data)
      : base44.entities.InvoiceRecord.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoiceRecords'] });
      setEditingInvoice(null);
    }
  });

  const saveBlockMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProjectBillingBlock.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billingBlocks'] })
  });

  const saveOrderMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ConfirmedOrder.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['confirmedOrders'] })
  });

  const { data: aworkTasks = [] } = useQuery({
    queryKey: ['awork-tasks-for-order', order?.awork_project_id],
    queryFn: () => base44.entities.AworkTaskSnapshot.filter({ awork_project_id: order.awork_project_id }),
    enabled: !!order?.awork_project_id
  });

  const handleSelectAworkProject = async (snapshot) => {
    setShowAworkPicker(false);
    await saveOrderMutation.mutateAsync({
      id: orderId,
      data: {
        awork_project_id: snapshot.awork_project_id,
        awork_project_name: snapshot.name,
        awork_project_status: snapshot.project_status,
        awork_progress_percent: snapshot.progress_percent,
        awork_match_status: 'manual',
        awork_last_synced_at: new Date().toISOString()
      }
    });
    // Trigger task sync
    setIsSyncing(true);
    await base44.functions.invoke('syncAworkTasksForProject', { awork_project_id: snapshot.awork_project_id });
    queryClient.invalidateQueries({ queryKey: ['awork-tasks-for-order', snapshot.awork_project_id] });
    setIsSyncing(false);
  };

  const handleAworkSync = async () => {
    if (!order?.awork_project_id) return;
    setIsSyncing(true);
    await base44.functions.invoke('syncAworkTasksForProject', { awork_project_id: order.awork_project_id });
    queryClient.invalidateQueries({ queryKey: ['awork-tasks-for-order', order.awork_project_id] });
    // Recalculate readiness for all blocks
    for (const block of orderBlocks) {
      const blockTasks = getTasksForBillingBlock(block, aworkTasks);
      if (blockTasks.length > 0) {
        const status = calculateAworkStatusForBillingBlock(block, blockTasks);
        await base44.entities.ProjectBillingBlock.update(block.id, { ...status, awork_last_synced_at: new Date().toISOString() });
      }
    }
    queryClient.invalidateQueries({ queryKey: ['billingBlocks'] });
    await saveOrderMutation.mutateAsync({ id: orderId, data: { awork_last_synced_at: new Date().toISOString() } });
    setIsSyncing(false);
  };

  const handleSaveTaskLink = async (data) => {
    const block = linkingBlock;
    setLinkingBlock(null);
    const updatedBlock = { ...block, ...data };
    const blockTasks = getTasksForBillingBlock(updatedBlock, aworkTasks);
    const signal = calculateAworkStatusForBillingBlock(updatedBlock, blockTasks);
    await saveBlockMutation.mutateAsync({ id: block.id, data: { ...data, ...signal, awork_last_synced_at: new Date().toISOString() } });
  };

  const handleConfirmReadiness = async (block) => {
    await saveBlockMutation.mutateAsync({ id: block.id, data: { invoice_readiness_status: 'ready' } });
  };

  const handleClearAworkLink = async (block) => {
    await saveBlockMutation.mutateAsync({
      id: block.id, data: {
        awork_mapping_type: 'none', awork_task_list_id: '', awork_task_list_name: '',
        awork_task_ids: '[]', awork_progress_percent: 0, awork_tasks_total: 0,
        awork_tasks_done: 0, awork_tasks_open: 0, awork_tasks_blocked: 0,
        awork_readiness_signal: 'unknown', awork_signal_reason: ''
      }
    });
  };

  const isLoading = ordersLoading || blocksLoading || invoicesLoading;

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-4 gap-4">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );

  if (!order || orderId === 'new') return (
    <div className="text-center py-20 text-muted-foreground">
      <p>Auftragsbestätigung nicht gefunden.</p>
      <Button variant="link" onClick={() => navigate('/confirmed-orders')}>Zurück zur Liste</Button>
    </div>
  );

  const recon = calculateOrderReconciliation(order, orderBlocks, orderInvoices);

  const reconColor = {
    balanced: 'text-emerald-600',
    warning: 'text-amber-600',
    critical: 'text-red-600',
  }[recon.reconciliation_status] || 'text-muted-foreground';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/confirmed-orders')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <PageHeader
          title={order.project_name}
          subtitle={`${order.customer}${order.order_number ? ` · ${order.order_number}` : ''}`}
          icon={ClipboardList}
          actions={<StatusBadge status={order.status} />}
        />
      </div>

      {/* awork Status Bar — Operative Umsetzung */}
      <AworkStatusBar
        order={order}
        onSelectProject={() => setShowAworkPicker(true)}
        onSync={handleAworkSync}
        isSyncing={isSyncing}
      />

      {/* Warnings */}
      <div className="space-y-2">
        {recon.warnings.map((w, i) => (
          <div key={i} className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {w}
          </div>
        ))}
        <PaymentFreshnessWarning invoiceRecords={orderInvoices} />
      </div>

      {/* Reconciliation KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Auftragssumme netto</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(recon.total_order_net)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Summe Pakete</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(recon.sum_billing_blocks_net)}</p>
            {Math.abs(recon.difference_order_vs_blocks) > 1 && (
              <p className="text-xs text-amber-600 mt-0.5">Δ {formatCurrency(recon.difference_order_vs_blocks)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Verrechnet (netto)</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(recon.adjusted_invoiced_net)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{recon.completion_percent}% abgerechnet</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Noch zu verrechnen</p>
            <p className="text-xl font-bold mt-1 text-amber-600">{formatCurrency(recon.total_open_to_invoice)}</p>
            <p className={`text-xs font-medium mt-0.5 ${reconColor}`}>
              {recon.reconciliation_status === 'balanced' ? '✓ Ausgeglichen' : recon.reconciliation_status === 'warning' ? '⚠ Warnung' : '✗ Kritisch'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Bezahlt</p>
            <p className="text-xl font-bold mt-1 text-emerald-600">{formatCurrency(recon.total_paid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Offene Forderung</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(recon.total_open_receivable)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Δ Auftrag vs Pakete</p>
            <p className={`text-xl font-bold mt-1 ${Math.abs(recon.difference_order_vs_blocks) > 1 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {formatCurrency(recon.difference_order_vs_blocks)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Δ Pakete vs Rechnungen</p>
            <p className={`text-xl font-bold mt-1 ${Math.abs(recon.difference_blocks_vs_invoices) > 1 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {formatCurrency(recon.difference_blocks_vs_invoices)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Billing Blocks */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Auftragspakete / Abrechnung ({orderBlocks.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {orderBlocks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Keine Pakete verknüpft</p>
              ) : (
                <div className="space-y-3">
                  {orderBlocks.map(block => {
                    const blockInvoices = orderInvoices.filter(i => i.billing_block_id === block.id);
                    const bs = calculateBillingBlockStatus(block, blockInvoices);
                    const hasAwork = block.awork_mapping_type && block.awork_mapping_type !== 'none';
                    const projectMismatch = checkBillingBlockProjectMismatch(block, order);
                    return (
                      <div key={block.id} className="border rounded-xl p-4 hover:bg-muted/20 transition-colors">
                        {projectMismatch && (
                          <div className="flex items-start gap-2 mb-2 p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            {projectMismatch}
                          </div>
                        )}
                        {/* Row 1: title + amounts + status */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{block.title}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs text-muted-foreground">{block.billing_month || '—'}</span>
                              <Badge className={`text-xs ${block.work_status === 'completed' ? 'bg-emerald-100 text-emerald-700' : block.work_status === 'blocked' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                {WORK_STATUS_LABELS[block.work_status] || 'Nicht begonnen'}
                              </Badge>
                              <Badge className={`text-xs ${block.invoice_readiness_status === 'ready' ? 'bg-emerald-100 text-emerald-700' : block.invoice_readiness_status === 'invoiced' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                                {READINESS_LABELS[block.invoice_readiness_status] || '—'}
                              </Badge>
                              {bs.is_overdue_to_invoice && <Badge className="text-xs bg-red-100 text-red-700">Überfällig</Badge>}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold text-sm">{formatCurrency(block.amount_net)}</p>
                            {bs.remaining_to_invoice > 0
                              ? <p className="text-xs text-amber-600">offen: {formatCurrency(bs.remaining_to_invoice)}</p>
                              : <p className="text-xs text-emerald-600">✓ abgerechnet</p>
                            }
                          </div>
                        </div>

                        {/* Row 2: awork status */}
                        <div className="flex items-center gap-3 p-2.5 bg-muted/30 rounded-lg flex-wrap">
                          {hasAwork ? (
                            <>
                              {/* Progress */}
                              <div className="flex items-center gap-1.5">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${block.awork_progress_percent || 0}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium">{block.awork_progress_percent || 0}%</span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {block.awork_tasks_done}/{block.awork_tasks_total} erledigt
                              </span>
                              {block.awork_tasks_blocked > 0 && (
                                <span className="text-xs text-red-600 font-medium">
                                  ⊘ {block.awork_tasks_blocked} blockiert
                                </span>
                              )}
                              {block.awork_tasks_open > 0 && (
                                <span className="text-xs text-muted-foreground">{block.awork_tasks_open} offen</span>
                              )}
                              {block.awork_responsible_person && (
                                <span className="text-xs text-muted-foreground">👤 {block.awork_responsible_person}</span>
                              )}
                              {block.awork_last_activity_at && (
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(block.awork_last_activity_at), { addSuffix: true, locale: de })}
                                </span>
                              )}
                              <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                                <AworkSignalBadge signal={block.awork_readiness_signal} />
                                {block.awork_readiness_signal === 'ready_candidate' && block.invoice_readiness_status !== 'ready' && (
                                  <Button size="sm" variant="outline"
                                    className="h-6 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                    onClick={() => handleConfirmReadiness(block)}>
                                    ✓ Bestätigen
                                  </Button>
                                )}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Keine awork-Aufgaben verknüpft</span>
                          )}

                          {/* Actions */}
                          <div className={`flex items-center gap-1 ${hasAwork ? '' : 'ml-auto'}`}>
                            {order?.awork_project_id && (
                              <Button size="sm" variant="ghost" className="h-6 text-xs"
                                onClick={() => setLinkingBlock(block)}>
                                <Link2 className="w-3 h-3 mr-1" />
                                {hasAwork ? 'Ändern' : 'Verknüpfen'}
                              </Button>
                            )}
                            {hasAwork && (
                              <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive"
                                onClick={() => handleClearAworkLink(block)}>
                                <Unlink className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Signal reason */}
                        {hasAwork && block.awork_signal_reason && (
                          <p className="text-xs text-muted-foreground mt-1.5 pl-1">
                            awork: {block.awork_signal_reason}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoice Records */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Rechnungen ({orderInvoices.length})</CardTitle>
              {!showInvoiceUploader && !editingInvoice && (
                <Button size="sm" onClick={() => setShowInvoiceUploader(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Rechnungen scannen & hochladen
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {showInvoiceUploader && (
                <div className="mb-4 p-4 border rounded-xl bg-muted/30">
                  <InvoiceScanUploader
                    confirmedOrderId={orderId}
                    customerName={order.customer}
                    billingBlocks={orderBlocks}
                    onSaved={() => {
                      queryClient.invalidateQueries({ queryKey: ['invoiceRecords'] });
                      setShowInvoiceUploader(false);
                    }}
                    onCancel={() => setShowInvoiceUploader(false)}
                  />
                </div>
              )}
              {editingInvoice && (
                <div className="mb-4 p-4 border rounded-xl bg-muted/30">
                  <InvoiceRecordForm
                    invoice={editingInvoice}
                    confirmedOrderId={orderId}
                    billingBlocks={orderBlocks}
                    onSave={(data) => saveInvoiceMutation.mutate({ id: editingInvoice.id, data })}
                    onCancel={() => setEditingInvoice(null)}
                    isSaving={saveInvoiceMutation.isPending}
                  />
                </div>
              )}
              {orderInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Keine Rechnungen verknüpft</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left pb-2 font-medium">Rechnungsnr.</th>
                        <th className="text-left pb-2 font-medium pl-2">Typ</th>
                        <th className="text-right pb-2 font-medium">Netto</th>
                        <th className="text-right pb-2 font-medium">Bezahlt brutto</th>
                        <th className="text-right pb-2 font-medium">Offen (ber.)</th>
                        <th className="text-left pb-2 font-medium pl-2">Status</th>
                        <th className="text-left pb-2 font-medium pl-2">Quelle</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderInvoices.map(inv => (
                        <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2">
                            <p className="font-medium">{inv.invoice_number || '—'}</p>
                            <p className="text-xs text-muted-foreground">{inv.invoice_date || ''}</p>
                            {inv.is_credit_note && <Badge className="text-xs bg-purple-100 text-purple-700">Gutschrift</Badge>}
                          </td>
                          <td className="py-2 pl-2 text-xs text-muted-foreground">{inv.invoice_type?.replace(/_/g, ' ') || '—'}</td>
                          <td className="py-2 text-right font-semibold">{formatCurrency(inv.net_amount)}</td>
                          <td className="py-2 text-right text-emerald-600">{formatCurrency(inv.paid_amount)}</td>
                          <td className="py-2 text-right">
                            <InvoiceOpenAmountDisplay invoice={inv} compact />
                          </td>
                          <td className="py-2 pl-2"><StatusBadge status={inv.payment_status} /></td>
                          <td className="py-2 pl-2">
                            <PaymentSourceBadge
                              sourceType={inv.source_type}
                              sourceFile={inv.source_file}
                              updatedDate={inv.updated_date}
                              showDate
                            />
                          </td>
                          <td className="py-2">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditingInvoice(inv); setShowInvoiceUploader(false); }}>
                              Bearbeiten
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/20">
                        <td colSpan={2} className="py-2 text-sm font-semibold">Summe</td>
                        <td className="py-2 text-right font-bold">{formatCurrency(recon.adjusted_invoiced_net)}</td>
                        <td className="py-2 text-right font-bold text-emerald-600">{formatCurrency(recon.total_paid)}</td>
                        <td colSpan={4}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Order info + document */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Auftragsbestätigung — Kommerziell</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Auftragsnr.</span><span className="font-medium">{order.order_number || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Bestätigt am</span><span>{order.confirmation_date || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">PM</span><span>{order.responsible_project_manager || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Zahlungsbedingungen</span><span className="text-right max-w-[140px]">{order.payment_terms || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Quelle</span><span>{order.source_type || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">MwSt.</span><span>{order.vat_rate || 20}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Brutto</span><span className="font-semibold">{formatCurrency(order.total_gross_amount)}</span></div>
              {order.notes && <div className="pt-2 border-t"><p className="text-xs text-muted-foreground">{order.notes}</p></div>}
            </CardContent>
          </Card>

          {order.document_url && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Auftragsbestätigung</CardTitle></CardHeader>
              <CardContent>
                <a href={order.document_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="w-full">
                    <ExternalLink className="w-4 h-4 mr-2" /> AB öffnen
                  </Button>
                </a>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* awork Modals */}
      <AworkProjectPicker
        open={showAworkPicker}
        onClose={() => setShowAworkPicker(false)}
        onSelect={handleSelectAworkProject}
        selectedProjectId={order?.awork_project_id}
      />
      {linkingBlock && (
        <AworkTaskLinker
          open={!!linkingBlock}
          onClose={() => setLinkingBlock(null)}
          billingBlock={linkingBlock}
          aworkProjectId={order?.awork_project_id}
          onSave={handleSaveTaskLink}
        />
      )}
    </div>
  );
}