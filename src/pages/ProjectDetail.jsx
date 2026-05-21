import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, FolderKanban, Plus, Pencil, Check, X, AlertTriangle,
  Link2, Unlink, RefreshCw, ClipboardList, ExternalLink
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import StatusBadge from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, getMonthLabel } from '@/lib/liquidityUtils';
import AworkStatusBar from '@/components/awork/AworkStatusBar';
import AworkProjectPicker from '@/components/awork/AworkProjectPicker';
import AworkTaskLinker from '@/components/awork/AworkTaskLinker';
import AworkSignalBadge from '@/components/awork/AworkSignalBadge';
import PaymentSourceBadge from '@/components/shared/PaymentSourceBadge';
import PaymentFreshnessWarning from '@/components/shared/PaymentFreshnessWarning';
import InvoiceOpenAmountDisplay from '@/components/shared/InvoiceOpenAmountDisplay';
import { calculateBillingBlockStatus } from '@/lib/reconciliationUtils';
import { calculateAworkStatusForBillingBlock, getTasksForBillingBlock } from '@/lib/aworkReadinessUtils';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

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

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editingPM, setEditingPM] = useState(false);
  const [pmValue, setPmValue] = useState('');
  const [showAworkPicker, setShowAworkPicker] = useState(false);
  const [linkingBlock, setLinkingBlock] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────
  const { data: projects = [], isLoading: lpLoading } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });
  const project = projects.find(p => p.id === projectId);

  const { data: allOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list()
  });
  // All orders linked to this project
  const linkedOrders = allOrders.filter(o => o.project_id === projectId);
  // Primary order for awork fallback
  const primaryOrder = linkedOrders[0] || null;

  const { data: allBlocks = [], isLoading: blocksLoading } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });

  const { data: allInvoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoiceRecords'], queryFn: () => base44.entities.InvoiceRecord.list()
  });

  // ── awork data ─────────────────────────────────────────────────────────────
  const effectiveAworkProjectId =
    project?.awork_project_id || primaryOrder?.awork_project_id || null;

  const { data: aworkTasks = [] } = useQuery({
    queryKey: ['awork-tasks-project', effectiveAworkProjectId],
    queryFn: () => base44.entities.AworkTaskSnapshot.filter({ awork_project_id: effectiveAworkProjectId }),
    enabled: !!effectiveAworkProjectId
  });

  const { data: aworkSnapshots = [] } = useQuery({
    queryKey: ['awork-snapshot', effectiveAworkProjectId],
    queryFn: () => base44.entities.AworkProjectSnapshot.filter({ awork_project_id: effectiveAworkProjectId }),
    enabled: !!effectiveAworkProjectId
  });
  const aworkSnapshot = aworkSnapshots[0] || null;

  // ── Billing block aggregation (Task 4) ────────────────────────────────────
  const linkedOrderIds = new Set(linkedOrders.map(o => o.id));

  const projectBlocks = allBlocks
    .filter(b =>
      b.project_id === projectId ||
      (b.confirmed_order_id && linkedOrderIds.has(b.confirmed_order_id))
    )
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  // ── Invoice aggregation ───────────────────────────────────────────────────
  const projectBlockIds = new Set(projectBlocks.map(b => b.id));
  const projectInvoices = allInvoices.filter(i =>
    i.project_id === projectId ||
    (i.confirmed_order_id && linkedOrderIds.has(i.confirmed_order_id)) ||
    (i.billing_block_id && projectBlockIds.has(i.billing_block_id))
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateProjectMutation = useMutation({
    mutationFn: (data) => base44.entities.LiquidityProject.update(projectId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] })
  });

  const saveBlockMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProjectBillingBlock.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billingBlocks'] })
  });

  // ── awork handlers ────────────────────────────────────────────────────────
  const handleSelectAworkProject = async (snapshot) => {
    setShowAworkPicker(false);
    await updateProjectMutation.mutateAsync({
      awork_project_id: snapshot.awork_project_id,
      awork_project_name: snapshot.name,
      awork_project_status: snapshot.project_status,
      awork_progress_percent: snapshot.progress_percent,
      awork_last_synced_at: new Date().toISOString()
    });
    setIsSyncing(true);
    await base44.functions.invoke('syncAworkTasksForProject', { awork_project_id: snapshot.awork_project_id });
    queryClient.invalidateQueries({ queryKey: ['awork-tasks-project', snapshot.awork_project_id] });
    setIsSyncing(false);
  };

  const handleAworkSync = async () => {
    if (!effectiveAworkProjectId) return;
    setIsSyncing(true);
    await base44.functions.invoke('syncAworkTasksForProject', { awork_project_id: effectiveAworkProjectId });
    queryClient.invalidateQueries({ queryKey: ['awork-tasks-project', effectiveAworkProjectId] });
    for (const block of projectBlocks) {
      const blockTasks = getTasksForBillingBlock(block, aworkTasks);
      if (blockTasks.length > 0) {
        const status = calculateAworkStatusForBillingBlock(block, blockTasks);
        await base44.entities.ProjectBillingBlock.update(block.id, { ...status, awork_last_synced_at: new Date().toISOString() });
      }
    }
    queryClient.invalidateQueries({ queryKey: ['billingBlocks'] });
    await updateProjectMutation.mutateAsync({ awork_last_synced_at: new Date().toISOString() });
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

  // ── Commercial base (Task 1 + 2) ─────────────────────────────────────────
  const linkedOrdersTotalNet = linkedOrders.reduce((s, o) => s + (Number(o.total_net_amount) || 0), 0);
  const billingBlocksTotalNet = projectBlocks.reduce((s, b) => s + (Number(b.amount_net) || 0), 0);
  const importedProjectNet = project?.total_net_amount || 0;

  let commercialBaseNet;
  let commercialBaseLabel;
  if (linkedOrdersTotalNet > 0) {
    commercialBaseNet = linkedOrdersTotalNet;
    commercialBaseLabel = 'Basis: Summe Auftragsbestätigungen';
  } else if (billingBlocksTotalNet > 0) {
    commercialBaseNet = billingBlocksTotalNet;
    commercialBaseLabel = 'Basis: Summe Auftragspakete';
  } else {
    commercialBaseNet = importedProjectNet;
    commercialBaseLabel = 'Basis: importierter Projektwert';
  }

  const commercialDeviation = Math.abs(commercialBaseNet - importedProjectNet) > 1
    && importedProjectNet > 0
    && commercialBaseNet !== importedProjectNet;

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const realInvoices = projectInvoices.filter(i => !i.is_credit_note && i.payment_status !== 'cancelled');
  const creditNotes = projectInvoices.filter(i => i.is_credit_note);
  const adjustedInvoicedNet = realInvoices.reduce((s, i) => s + (Number(i.net_amount) || 0), 0)
    - creditNotes.reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
  // Task 4: totalPaid excludes credit notes
  const totalPaid = realInvoices.reduce((s, i) => s + (Number(i.paid_amount) || 0), 0);
  const totalPaidGross = totalPaid; // paid_amount is stored as gross
  const openReceivableGross = realInvoices.reduce((s, i) => s + (Number(i.gross_amount) || 0), 0) - totalPaidGross;
  // Task 1: use commercialBaseNet instead of project.total_net_amount
  const openToInvoice = commercialBaseNet - adjustedInvoicedNet;
  const readyBlocks = projectBlocks.filter(b => b.invoice_readiness_status === 'ready');
  const readyAmount = readyBlocks.reduce((s, b) => s + (Number(b.amount_net) || 0), 0);

  // ── awork task aggregation (Task 6) ───────────────────────────────────────
  const aworkTaskStats = useMemo(() => {
    if (!aworkTasks.length) return null;
    const total = aworkTasks.length;
    const done = aworkTasks.filter(t => t.task_status_type === 'done' || t.is_done).length;
    const blocked = aworkTasks.filter(t => t.task_status_type === 'blocked' || t.is_blocked).length;
    const open = aworkTasks.filter(t => t.task_status_type === 'open' || t.task_status_type === 'progress').length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    const syncDates = aworkTasks.map(t => t.last_synced_at).filter(Boolean).sort().reverse();
    const activityDates = aworkTasks.map(t => t.last_activity_at).filter(Boolean).sort().reverse();
    const lastSyncedAt = syncDates[0] || null;
    const lastActivityAt = activityDates[0] || null;
    const hasStaleData = lastSyncedAt
      ? (new Date() - new Date(lastSyncedAt)) > 24 * 60 * 60 * 1000
      : true;
    return { total_tasks: total, done_tasks: done, open_tasks: open, blocked_tasks: blocked, progress_percent: progress, last_activity_at: lastActivityAt, last_synced_at: lastSyncedAt, has_stale_data: hasStaleData };
  }, [aworkTasks]);

  // ── Unmatched invoice warning (Task 9) ────────────────────────────────────
  const customerNames = new Set([
    project?.customer?.toLowerCase(),
    ...linkedOrders.map(o => o.customer?.toLowerCase())
  ].filter(Boolean));
  const unmatchedCustomerInvoices = allInvoices.filter(i =>
    customerNames.has((i.customer_name || '').toLowerCase()) &&
    !i.project_id &&
    !i.confirmed_order_id &&
    !i.billing_block_id &&
    i.payment_status !== 'cancelled'
  );

  const isLoading = lpLoading || ordersLoading || blocksLoading || invoicesLoading;

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-4 gap-4">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );

  if (!project) return (
    <div className="text-center py-20 text-muted-foreground">
      Projekt nicht gefunden.
      <Button variant="link" onClick={() => navigate('/projects')}>Zurück zum Cockpit</Button>
    </div>
  );

  // awork data object — project fields take priority, fallback to order
  const aworkData = {
    awork_project_id: effectiveAworkProjectId,
    awork_project_name: project.awork_project_name || primaryOrder?.awork_project_name || aworkSnapshot?.name,
    awork_project_status: project.awork_project_status || primaryOrder?.awork_project_status || aworkSnapshot?.project_status,
    awork_progress_percent: aworkTaskStats?.progress_percent ?? project.awork_progress_percent ?? primaryOrder?.awork_progress_percent ?? 0,
    awork_last_synced_at: project.awork_last_synced_at || primaryOrder?.awork_last_synced_at,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <PageHeader
          title={project.project_name}
          subtitle={`${project.customer} · Projekt-Cockpit`}
          icon={FolderKanban}
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge status={project.status} />
              {project.risk_status && project.risk_status !== 'none' && <StatusBadge status={project.risk_status} />}
            </div>
          }
        />
      </div>

      {/* awork Status Card — Task 5, 6, 7 */}
      <AworkStatusBar
        data={aworkData}
        taskStats={aworkTaskStats}
        snapshot={aworkSnapshot}
        onSelectProject={() => setShowAworkPicker(true)}
        onSync={handleAworkSync}
        isSyncing={isSyncing}
      />
      {!project.awork_project_id && primaryOrder?.awork_project_id && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          awork-Projekt von verknüpfter Auftragsbestätigung übernommen. Klicke "Ändern" um es direkt am Cockpit zu speichern.
        </div>
      )}

      {/* Unmatched invoice warning — Task 9 */}
      {unmatchedCustomerInvoices.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-300 rounded-xl text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="flex-1 text-amber-800">
            Es gibt <strong>{unmatchedCustomerInvoices.length}</strong> nicht zugeordnete Rechnung(en) dieses Kunden.
            Diese können die Projektzahlen verfälschen.
          </span>
          <Link to="/invoice-matching" className="text-xs text-amber-700 underline hover:text-amber-900 flex-shrink-0">
            Invoice Matching Review öffnen
          </Link>
        </div>
      )}

      {/* Payment freshness warning */}
      <PaymentFreshnessWarning invoiceRecords={projectInvoices} />

      {/* KPI row — Tasks 1, 2, 3 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Auftragsvolumen netto */}
        <div className="bg-card border rounded-xl p-3 space-y-1">
          <p className="text-xs text-muted-foreground">Auftragsvolumen netto</p>
          <p className="text-lg font-bold">{formatCurrency(commercialBaseNet)}</p>
          <p className="text-xs text-muted-foreground">{commercialBaseLabel}</p>
          {commercialDeviation && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              <AlertTriangle className="w-3 h-3" />
              Importwert: {formatCurrency(importedProjectNet)}
            </span>
          )}
          {linkedOrdersTotalNet > 0 && billingBlocksTotalNet > 0 && (
            <p className="text-xs text-muted-foreground">Pakete: {formatCurrency(billingBlocksTotalNet)}</p>
          )}
        </div>

        {/* Verrechnet netto */}
        <div className="bg-card border rounded-xl p-3 space-y-1">
          <p className="text-xs text-muted-foreground">Verrechnet netto</p>
          <p className="text-lg font-bold text-emerald-600">{formatCurrency(adjustedInvoicedNet)}</p>
          <p className="text-xs text-muted-foreground">{realInvoices.length} Rechnung(en)</p>
          {creditNotes.length > 0 && (
            <p className="text-xs text-purple-600">– {formatCurrency(creditNotes.reduce((s,i) => s + (Number(i.net_amount)||0), 0))} Gutschriften</p>
          )}
        </div>

        {/* Noch zu verrechnen netto */}
        <div className={`bg-card border rounded-xl p-3 space-y-1 ${openToInvoice > 0 ? 'border-amber-200' : ''}`}>
          <p className="text-xs text-muted-foreground">Noch zu verrechnen netto</p>
          <p className={`text-lg font-bold ${openToInvoice > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{formatCurrency(openToInvoice)}</p>
          {readyAmount > 0 && <p className="text-xs text-emerald-700">davon bereit: {formatCurrency(readyAmount)}</p>}
        </div>

        {/* Bezahlt brutto */}
        <div className="bg-card border rounded-xl p-3 space-y-1">
          <p className="text-xs text-muted-foreground">Bezahlt brutto</p>
          <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalPaidGross)}</p>
          <p className="text-xs text-muted-foreground">inkl. MwSt.</p>
        </div>

        {/* Offene Forderung brutto */}
        <div className={`bg-card border rounded-xl p-3 space-y-1 ${openReceivableGross > 0 ? 'border-red-200' : ''}`}>
          <p className="text-xs text-muted-foreground">Offene Forderung brutto</p>
          <p className={`text-lg font-bold ${openReceivableGross > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(Math.max(0, openReceivableGross))}</p>
          <p className="text-xs text-muted-foreground">inkl. MwSt.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* ── Billing Blocks (rich view) ──────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Auftragspakete — Operative Umsetzung ({projectBlocks.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {projectBlocks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Keine Auftragspakete verknüpft. Pakete werden über Auftragsbestätigungen erstellt.
                </p>
              ) : (
                <div className="space-y-3">
                  {projectBlocks.map(block => {
                    const blockInvoices = projectInvoices.filter(i => i.billing_block_id === block.id);
                    const bs = calculateBillingBlockStatus(block, blockInvoices);
                    const hasAwork = block.awork_mapping_type && block.awork_mapping_type !== 'none';
                    // Project mismatch warning (Task 4)
                    const parentOrder = allOrders.find(o => o.id === block.confirmed_order_id);
                    const hasMismatch = block.confirmed_order_id && parentOrder?.project_id &&
                      block.project_id && block.project_id !== parentOrder.project_id;

                    return (
                      <div key={block.id} className="border rounded-xl p-4 hover:bg-muted/20 transition-colors">
                        {hasMismatch && (
                          <div className="flex items-start gap-2 mb-2 p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            Abweichende Projektzuordnung: Dieses Auftragspaket ist einem anderen internen Projekt zugeordnet als die Auftragsbestätigung.
                          </div>
                        )}

                        {/* Row 1: title + order ref + amounts */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{block.title}</p>
                            {parentOrder && (
                              <Link to={`/confirmed-orders/${parentOrder.id}`}
                                className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5">
                                <ClipboardList className="w-3 h-3" />
                                AB: {parentOrder.project_name || parentOrder.order_number}
                              </Link>
                            )}
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
                            {bs.payment_status === 'paid' && <p className="text-xs text-emerald-700 font-medium">✓ bezahlt</p>}
                            {bs.payment_status === 'partially_paid' && <p className="text-xs text-amber-600">teilw. bezahlt</p>}
                          </div>
                        </div>

                        {/* Row 2: awork progress — Task 8 */}
                        <div className="flex items-center gap-3 p-2.5 bg-muted/30 rounded-lg flex-wrap">
                          {hasAwork ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${block.awork_progress_percent || 0}%` }} />
                                </div>
                                <span className="text-xs font-medium">{block.awork_progress_percent || 0}%</span>
                              </div>
                              {block.awork_tasks_total > 0
                                ? <span className="text-xs text-muted-foreground">{block.awork_tasks_done}/{block.awork_tasks_total} erledigt</span>
                                : <span className="text-xs text-muted-foreground italic">keine Daten</span>
                              }
                              {block.awork_tasks_blocked > 0 && <span className="text-xs text-red-600 font-medium">⊘ {block.awork_tasks_blocked} blockiert</span>}
                              {block.awork_tasks_open > 0 && <span className="text-xs text-muted-foreground">{block.awork_tasks_open} offen</span>}
                              {block.awork_responsible_person && <span className="text-xs text-muted-foreground">👤 {block.awork_responsible_person}</span>}
                              {block.awork_last_activity_at && (
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(block.awork_last_activity_at), { addSuffix: true, locale: de })}
                                </span>
                              )}
                              {/* Sync freshness indicator */}
                              {block.awork_last_synced_at && (() => {
                                const stale = (new Date() - new Date(block.awork_last_synced_at)) > 24 * 60 * 60 * 1000;
                                return stale ? (
                                  <span className="text-xs text-amber-600 flex items-center gap-0.5">
                                    <AlertTriangle className="w-3 h-3" />
                                    Sync {formatDistanceToNow(new Date(block.awork_last_synced_at), { addSuffix: true, locale: de })}
                                  </span>
                                ) : null;
                              })()}
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
                            <span className="text-xs text-muted-foreground italic">nicht verknüpft</span>
                          )}

                          <div className={`flex items-center gap-1 ${hasAwork ? '' : 'ml-auto'}`}>
                            {effectiveAworkProjectId && (
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

                        {hasAwork && block.awork_signal_reason && (
                          <p className="text-xs text-muted-foreground mt-1.5 pl-1">awork: {block.awork_signal_reason}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Invoice / Payment Table ─────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rechnungen & Zahlungsstatus ({projectInvoices.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {projectInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Keine Rechnungen verknüpft</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left pb-2 font-medium">Rechnung</th>
                        <th className="text-left pb-2 font-medium pl-2">Typ</th>
                        <th className="text-right pb-2 font-medium">Netto</th>
                        <th className="text-right pb-2 font-medium">Bezahlt</th>
                        <th className="text-right pb-2 font-medium">Offen</th>
                        <th className="text-left pb-2 font-medium pl-2">Status</th>
                        <th className="text-left pb-2 font-medium pl-2">Quelle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectInvoices.map(inv => (
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
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/20">
                        <td colSpan={2} className="py-2 text-sm font-semibold">Summe</td>
                        <td className="py-2 text-right font-bold">{formatCurrency(adjustedInvoicedNet)}</td>
                        <td className="py-2 text-right font-bold text-emerald-600">{formatCurrency(totalPaid)}</td>
                        <td className="py-2 text-right font-bold text-amber-600">{formatCurrency(Math.max(0, openReceivableGross))}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Internal controlling info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Internes Controlling-Projekt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Projektmanager</span>
                {editingPM ? (
                  <div className="flex items-center gap-1">
                    <Input value={pmValue} onChange={e => setPmValue(e.target.value)} className="h-7 w-32 text-sm"
                      onKeyDown={e => { if (e.key === 'Enter') { updateProjectMutation.mutate({ project_manager: pmValue }); setEditingPM(false); } if (e.key === 'Escape') setEditingPM(false); }}
                      autoFocus />
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { updateProjectMutation.mutate({ project_manager: pmValue }); setEditingPM(false); }}><Check className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingPM(false)}><X className="w-3 h-3" /></Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span>{project.project_manager || '—'}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6 opacity-50 hover:opacity-100"
                      onClick={() => { setPmValue(project.project_manager || ''); setEditingPM(true); }}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Kategorie</span><span>{project.category || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Erw. Monat</span><span>{project.expected_invoice_month ? getMonthLabel(project.expected_invoice_month) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Externe Kosten</span><span>{formatCurrency(project.external_costs)}</span></div>
              {project.notes && <div className="pt-2 border-t"><p className="text-xs text-muted-foreground">{project.notes}</p></div>}
            </CardContent>
          </Card>

          {/* Linked commercial orders */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Auftragsbestätigungen ({linkedOrders.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {linkedOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">Keine AB verknüpft</p>
              ) : (
                linkedOrders.map(o => (
                  <Link key={o.id} to={`/confirmed-orders/${o.id}`}
                    className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/30 transition-colors group">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{o.project_name}</p>
                      <p className="text-xs text-muted-foreground">{o.order_number || ''} · {formatCurrency(o.total_net_amount)}</p>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0 ml-2" />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <AworkProjectPicker
        open={showAworkPicker}
        onClose={() => setShowAworkPicker(false)}
        onSelect={handleSelectAworkProject}
        selectedProjectId={effectiveAworkProjectId}
      />
      {linkingBlock && (
        <AworkTaskLinker
          open={!!linkingBlock}
          onClose={() => setLinkingBlock(null)}
          billingBlock={linkingBlock}
          aworkProjectId={effectiveAworkProjectId}
          onSave={handleSaveTaskLink}
        />
      )}
    </div>
  );
}