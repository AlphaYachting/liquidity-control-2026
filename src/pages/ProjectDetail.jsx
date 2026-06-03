import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, FolderKanban, Plus, Pencil, Check, X, AlertTriangle,
  Link2, Unlink, RefreshCw, ClipboardList, ExternalLink, Info
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

import { calculateBillingBlockStatus } from '@/lib/reconciliationUtils';
import { calculateProjectFinancials } from '@/lib/projectFinancials';
import BillingLiquiditySection from '@/components/billing/BillingLiquiditySection';
import { calculateAworkStatusForBillingBlock, getTasksForBillingBlock } from '@/lib/aworkReadinessUtils';
import OrderItemsView from '@/components/projects/OrderItemsView';
import ProjectInvoiceSection from '@/components/projects/ProjectInvoiceSection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import PdfViewerDialog from '@/components/shared/PdfViewerDialog';
import { FileText } from 'lucide-react';
import BillingHistoryTimeline from '@/components/projects/BillingHistoryTimeline';
import RealProgressValidator from '@/components/projects/RealProgressValidator';
import NextMonthsBillingPreview from '@/components/projects/NextMonthsBillingPreview';
import WebsiteMilestoneGuide from '@/components/projects/WebsiteMilestoneGuide';

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
  const [pdfViewer, setPdfViewer] = useState(null); // { url, title }
  const [editingNextInvoiceNote, setEditingNextInvoiceNote] = useState(false);
  const [nextInvoiceNote, setNextInvoiceNote] = useState('');

  // ── Data loading ──────────────────────────────────────────────────────────
  const { data: projects = [], isLoading: lpLoading } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });
  const project = projects.find(p => p.id === projectId);

  const { data: allOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list()
  });

  const { data: allBlocks = [], isLoading: blocksLoading } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });

  const { data: allInvoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoiceRecords'], queryFn: () => base44.entities.InvoiceRecord.list()
  });

  // ── awork data ─────────────────────────────────────────────────────────────
  const effectiveAworkProjectId =
    project?.awork_project_id || null;

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

  // ── Use shared financial helper ───────────────────────────────────────────
  const fin = useMemo(() => {
    if (!project) return null;
    return calculateProjectFinancials({
      project,
      allOrders,
      allBlocks,
      allInvoices,
    });
  }, [project, allOrders, allBlocks, allInvoices]);

  // Convenience aliases
  const linkedOrders = fin?.linkedOrders || [];
  const linkedOrderIds = fin?.linkedOrderIds || new Set();
  const projectBlocks = fin?.linkedBlocks || [];
  const projectInvoices = fin?.linkedInvoices || [];
  const orphanOrderInvoices = fin?.orphanOrderInvoices || [];
  const likelyUnmatchedInvoices = fin?.likelyUnmatchedInvoices || [];
  const finWarnings = fin?.warnings || [];

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateProjectMutation = useMutation({
    mutationFn: (data) => base44.entities.LiquidityProject.update(projectId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] })
  });

  const saveBlockMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProjectBillingBlock.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billingBlocks'] })
  });

  const { data: allOrderItems = [] } = useQuery({
    queryKey: ['orderItems'],
    queryFn: () => base44.entities.ConfirmedOrderItem.list(),
    enabled: !!project
  });

  const promoteItemsToBlocksMutation = useMutation({
    mutationFn: async () => {
      const items = allOrderItems.filter(i =>
        linkedOrderIds.has(i.confirmed_order_id) && !i.is_discount && (i.total_price || 0) > 0
      );
      for (const item of items) {
        await base44.entities.ProjectBillingBlock.create({
          project_id: projectId,
          confirmed_order_id: item.confirmed_order_id,
          title: item.title,
          description: item.description || '',
          amount_net: item.total_price || 0,
          amount_gross: (item.total_price || 0) * 1.2,
          customer: project.customer,
          project_name: project.project_name,
          sort_order: item.position || 0,
          invoice_readiness_status: 'not_ready',
          work_status: item.status || 'not_started',
        });
      }
    },
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

  const handleConfirmReadiness = (block) => {
    saveBlockMutation.mutate({ id: block.id, data: { invoice_readiness_status: 'ready' } });
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

  // ── KPIs from shared helper ───────────────────────────────────────────────
  const commercialBaseNet = fin?.commercialBaseNet || 0;
  const adjustedInvoicedNet = fin?.adjustedInvoicedNet || 0;
  const totalPaidGross = fin?.paidGross || 0;
  const openReceivableGross = fin?.openReceivableGross || 0;

  // ── awork task aggregation ────────────────────────────────────────────────
  const aworkTaskStats = useMemo(() => {
    if (!aworkTasks.length) return null;
    const budgetMinutes = aworkTasks.reduce((s, t) => s + (Number(t.planned_duration_minutes) || 0), 0);
    const trackedMinutes = aworkTasks.reduce((s, t) => s + (Number(t.tracked_duration_minutes) || 0), 0);
    const blocked = aworkTasks.filter(t => t.task_status_type === 'blocked' || t.is_blocked).length;
    const total = aworkTasks.length;
    const done = aworkTasks.filter(t => t.task_status_type === 'done' || t.is_done).length;
    const open = total - done - blocked;

    // Task-completion ratio (unweighted by hours)
    const taskCompletionPct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Hours burn ratio (nur wenn Budgetdaten vorhanden)
    const hoursBurnPct = budgetMinutes > 0
      ? Math.min(100, Math.round((trackedMinutes / budgetMinutes) * 100))
      : null;

    // Kombinierter Index:
    // Wenn Stundendaten vorhanden: gewichteter Durchschnitt (60% Tasks, 40% Stunden)
    // Sonst: nur Task-Completion
    const combinedProgress = hoursBurnPct !== null
      ? Math.round(taskCompletionPct * 0.6 + hoursBurnPct * 0.4)
      : taskCompletionPct;

    // Verhältnis: Ø Minuten pro Task (um zu beurteilen ob Tasks "schwer" oder "leicht" sind)
    const avgMinutesPerTask = total > 0 && budgetMinutes > 0 ? Math.round(budgetMinutes / total) : null;
    const avgMinutesPerDoneTask = done > 0 && budgetMinutes > 0
      ? Math.round(aworkTasks.filter(t => t.is_done || t.task_status_type === 'done').reduce((s, t) => s + (Number(t.planned_duration_minutes) || 0), 0) / done)
      : null;

    const syncDates = aworkTasks.map(t => t.last_synced_at).filter(Boolean).sort().reverse();
    const activityDates = aworkTasks.map(t => t.last_activity_at).filter(Boolean).sort().reverse();
    const lastSyncedAt = syncDates[0] || null;
    const lastActivityAt = activityDates[0] || null;
    const hasStaleData = lastSyncedAt
      ? (new Date() - new Date(lastSyncedAt)) > 24 * 60 * 60 * 1000
      : true;
    return {
      budget_minutes: budgetMinutes,
      tracked_minutes: trackedMinutes,
      blocked_tasks: blocked,
      total_tasks: total,
      done_tasks: done,
      open_tasks: open,
      task_completion_pct: taskCompletionPct,
      hours_burn_pct: hoursBurnPct,
      progress_percent: combinedProgress,
      avg_minutes_per_task: avgMinutesPerTask,
      avg_minutes_per_done_task: avgMinutesPerDoneTask,
      last_activity_at: lastActivityAt,
      last_synced_at: lastSyncedAt,
      has_stale_data: hasStaleData
    };
  }, [aworkTasks]);

  // ── primaryOrder for awork (first linked order) ───────────────────────────
  const primaryOrder = linkedOrders[0] || null;

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





      {/* ── Fortschrittsvergleich ─────────────────────────────────────────── */}
      {(() => {
        const totalOrderNet = fin?.commercialBaseNet || 0;
        const totalOrderGross = totalOrderNet * 1.2;
        const alreadyInvoicedNet = fin?.adjustedInvoicedNet || 0;
        const alreadyPaidGross = fin?.paidGross || 0;
        const billingPct = totalOrderNet > 0 ? (alreadyInvoicedNet / totalOrderNet) * 100 : 0;
        const paymentPct = totalOrderGross > 0 ? (alreadyPaidGross / totalOrderGross) * 100 : 0;
        const aworkProgress = aworkTaskStats?.progress_percent ?? project?.awork_progress_percent ?? null;
        const blockAvgProgress = projectBlocks.length > 0
          ? projectBlocks.filter(b => b.awork_progress_percent > 0).reduce((s, b) => s + (b.awork_progress_percent || 0), 0) /
            Math.max(1, projectBlocks.filter(b => b.awork_progress_percent > 0).length)
          : null;
        const performancePct = aworkProgress ?? blockAvgProgress ?? 0;

        const perfSubtitle = aworkTaskStats
          ? aworkTaskStats.hours_burn_pct !== null
            ? `Tasks: ${aworkTaskStats.task_completion_pct}% · Stunden: ${aworkTaskStats.hours_burn_pct}%`
            : `${aworkTaskStats.done_tasks}/${aworkTaskStats.total_tasks} Tasks erledigt`
          : null;

        const bars = [
          { label: 'Leistungsfortschritt', value: performancePct, color: 'bg-emerald-500', textColor: 'text-emerald-700', subtitle: perfSubtitle },
          { label: 'Abrechnungsfortschritt', value: billingPct, color: 'bg-blue-500', textColor: 'text-blue-700', subtitle: null },
          { label: 'Zahlungsfortschritt', value: paymentPct, color: 'bg-purple-500', textColor: 'text-purple-700', subtitle: null },
        ];

        return (
          <div className="grid grid-cols-3 gap-3">
            {bars.map(bar => (
              <div key={bar.label} className="bg-card border rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{bar.label}</p>
                  <span className={`text-sm font-bold ${bar.textColor}`}>{Math.round(bar.value)}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${bar.color}`}
                    style={{ width: `${Math.min(100, Math.max(0, bar.value))}%` }} />
                </div>
                {bar.subtitle && <p className="text-xs text-muted-foreground">{bar.subtitle}</p>}
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Real Progress Validator (moved above notes) ─────────────────── */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-0.5">
          awork-Fortschritt entspricht Realität?
        </p>
        <RealProgressValidator
          aworkProgressPct={aworkTaskStats?.progress_percent ?? project.awork_progress_percent ?? 0}
          realProgressChecked={project.real_progress_checked || false}
          realProgressPct={project.real_progress_percent || 0}
          progressDifferenceReason={project.progress_difference_reason || ''}
          isSaving={updateProjectMutation.isPending}
          onSave={(data) => updateProjectMutation.mutate(data)}
        />
      </div>

      {/* ── Anmerkungen für nächste Rechnung ────────────────────────────── */}
      <div className="bg-card border rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Anmerkungen für nächste Rechnung</h3>
          {!editingNextInvoiceNote && (
            <button onClick={() => { setNextInvoiceNote(project.notes_next_invoice || ''); setEditingNextInvoiceNote(true); }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Bearbeiten
            </button>
          )}
        </div>
        {editingNextInvoiceNote ? (
          <div className="space-y-2">
            <textarea
              value={nextInvoiceNote}
              onChange={e => setNextInvoiceNote(e.target.value)}
              rows={3}
              placeholder="Hinweise für die nächste Rechnung, Vorbedingungen, Meilensteine..."
              className="w-full text-sm border rounded-lg p-2 resize-none bg-background"
            />
            <div className="flex gap-2">
              <button onClick={() => { updateProjectMutation.mutate({ notes_next_invoice: nextInvoiceNote }); setEditingNextInvoiceNote(false); }}
                className="text-xs px-3 py-1 bg-primary text-primary-foreground rounded-md">
                Speichern
              </button>
              <button onClick={() => setEditingNextInvoiceNote(false)}
                className="text-xs px-3 py-1 border rounded-md text-muted-foreground hover:text-foreground">
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <p className={`text-sm ${project.notes_next_invoice ? 'text-foreground' : 'text-muted-foreground italic'}`}>
            {project.notes_next_invoice || 'Noch keine Anmerkungen eingegeben.'}
          </p>
        )}
      </div>

      {/* ── Verrechnungsplanung 4 Monate ────────────────────────────────── */}
      <NextMonthsBillingPreview
        project={project}
        fin={fin}
        linkedOrders={linkedOrders}
      />

      {/* ── Abrechnung & Liquidität (incl. Reminder + Abrechnungsanweisung) */}
      <BillingLiquiditySection
        project={project}
        fin={fin}
        aworkTaskStats={aworkTaskStats}
        projectBlocks={projectBlocks}
        linkedOrders={linkedOrders}
      />

      {/* ── Verrechnungshistorie nach Monat ─────────────────────────────── */}
      <BillingHistoryTimeline projectInvoices={projectInvoices} commercialBaseNet={commercialBaseNet} />

      {/* ── Website Meilenstein-Leitfaden ─────────────────────────────── */}
      {(project.category === 'web_project' || (project.project_name || '').toLowerCase().includes('website')) && (
        <WebsiteMilestoneGuide
          billingPct={fin?.commercialBaseNet > 0 ? ((fin?.adjustedInvoicedNet || 0) / fin.commercialBaseNet) * 100 : 0}
          commercialBaseNet={fin?.commercialBaseNet || 0}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* ── Billing Blocks (rich view) ──────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Auftragspakete — Operative Umsetzung ({projectBlocks.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {projectBlocks.length === 0 ? (
                (() => {
                  const promotableItems = allOrderItems.filter(i =>
                    linkedOrderIds.has(i.confirmed_order_id) && !i.is_discount && (i.total_price || 0) > 0
                  );
                  return (
                    <div className="text-center py-6 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Keine Auftragspakete verknüpft.
                      </p>
                      {promotableItems.length > 0 && (
                        <div className="border border-dashed border-primary/40 rounded-xl p-4 bg-primary/5 space-y-2">
                          <p className="text-sm font-medium text-primary">
                            {promotableItems.length} Leistungsposition(en) aus der AB gefunden
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Auftragspakete aus den Leistungspositionen erstellen, um awork-Verknüpfung und Abrechnungssteuerung zu aktivieren.
                          </p>
                          <Button
                            size="sm"
                            disabled={promoteItemsToBlocksMutation.isPending}
                            onClick={() => promoteItemsToBlocksMutation.mutate()}
                          >
                            {promoteItemsToBlocksMutation.isPending ? 'Erstelle Pakete…' : `${promotableItems.length} Pakete aus AB-Positionen erstellen`}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()
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

                    // Derive effective work_status from awork progress if not manually set
                    const effectiveWorkStatus = (() => {
                      if (hasAwork && block.awork_progress_percent >= 100) return 'completed';
                      if (hasAwork && block.awork_progress_percent > 0) return 'in_progress';
                      return block.work_status || 'not_started';
                    })();

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
                              <Select value={block.billing_month || ''} onValueChange={v => saveBlockMutation.mutate({ id: block.id, data: { billing_month: v } })}>
                                <SelectTrigger className="h-5 text-xs border-0 px-1 py-0 bg-transparent text-muted-foreground hover:bg-muted/50 w-auto gap-0.5 shadow-none">
                                  <SelectValue placeholder="Monat wählen" />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 3 }, (_, yi) => 2025 + yi).flatMap(y =>
                                    Array.from({ length: 12 }, (_, mi) => {
                                      const val = `${y}-${String(mi + 1).padStart(2, '0')}`;
                                      const label = new Date(y, mi, 1).toLocaleString('de-AT', { month: 'short', year: '2-digit' });
                                      return <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>;
                                    })
                                  )}
                                </SelectContent>
                              </Select>
                              <Badge className={`text-xs ${
                                effectiveWorkStatus === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                effectiveWorkStatus === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                effectiveWorkStatus === 'blocked' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {WORK_STATUS_LABELS[effectiveWorkStatus] || 'Nicht begonnen'}
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
                              {(() => {
                                // Per-block: sum hours from aworkTasks linked to this block
                                const blockTasks = aworkTasks.filter(t => {
                                  if (t.linked_billing_block_id === block.id) return true;
                                  if (block.awork_mapping_type === 'task_list' && block.awork_task_list_id && t.task_list_id === block.awork_task_list_id) return true;
                                  if (block.awork_mapping_type === 'tasks' && block.awork_task_ids) {
                                    try { return JSON.parse(block.awork_task_ids).includes(t.awork_task_id); } catch { return false; }
                                  }
                                  return false;
                                });
                                const budgetMin = blockTasks.reduce((s, t) => s + (Number(t.planned_duration_minutes) || 0), 0);
                                const trackedMin = blockTasks.reduce((s, t) => s + (Number(t.tracked_duration_minutes) || 0), 0);
                                const bh = budgetMin > 0 ? (budgetMin / 60).toFixed(1) : null;
                                const th = trackedMin > 0 ? (trackedMin / 60).toFixed(1) : null;
                                if (th || bh) return (
                                  <span className="text-xs text-muted-foreground">
                                    {th ? `${th} h` : '—'} {bh ? `/ ${bh} h Budget` : ''}
                                  </span>
                                );
                                return <span className="text-xs text-muted-foreground italic">keine Stundendaten</span>;
                              })()}
                              {block.awork_tasks_blocked > 0 && <span className="text-xs text-red-600 font-medium">⊘ {block.awork_tasks_blocked} blockiert</span>}
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
                                    disabled={saveBlockMutation.isPending}
                                    onClick={(e) => { e.stopPropagation(); handleConfirmReadiness(block); }}>
                                    ✓ Bereit bestätigen
                                  </Button>
                                )}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">nicht verknüpft</span>
                          )}

                          <div className={`flex items-center gap-1 ${hasAwork ? '' : 'ml-auto'}`}>
                            {effectiveAworkProjectId ? (
                              <Button size="sm" variant="ghost" className="h-6 text-xs"
                                onClick={() => setLinkingBlock(block)}>
                                <Link2 className="w-3 h-3 mr-1" />
                                {hasAwork ? 'Ändern' : 'Verknüpfen'}
                              </Button>
                            ) : (
                              !hasAwork && (
                                <span className="text-xs text-muted-foreground italic ml-auto">
                                  Zuerst awork-Projekt verknüpfen ↑
                                </span>
                              )
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

          {/* ── Leistungspositionen aus AB ──────────────────────────────── */}
          <OrderItemsView linkedOrders={linkedOrders} />

          {/* ── Invoice / Payment Table ─────────────────────────────────── */}
          <ProjectInvoiceSection
            projectId={projectId}
            projectBlocks={projectBlocks}
            linkedOrders={linkedOrders}
            projectInvoices={projectInvoices}
            likelyUnmatchedInvoices={likelyUnmatchedInvoices}
            adjustedInvoicedNet={adjustedInvoicedNet}
            totalPaidGross={totalPaidGross}
            openReceivableGross={openReceivableGross}
            customerName={project.customer}
          />
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
                    <Select value={pmValue} onValueChange={v => { setPmValue(v); updateProjectMutation.mutate({ project_manager: v }); setEditingPM(false); }}>
                      <SelectTrigger className="h-7 w-36 text-sm">
                        <SelectValue placeholder="PM wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {['Anna', 'Lara', 'Mathias', 'Pascal', 'Sebastian'].map(pm => (
                          <SelectItem key={pm} value={pm}>{pm}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
          {(() => {
            // All orders relevant to this project: directly linked + indirectly (via customer invoices)
            const customerKey = (project.customer || '').toLowerCase();
            const allRelevantOrders = allOrders.filter(o =>
              o.project_id === projectId ||
              (fin?.linkedInvoices || []).some(inv => inv.confirmed_order_id === o.id)
            );
            // Deduplicate
            const seenIds = new Set();
            const displayOrders = allRelevantOrders.filter(o => {
              if (seenIds.has(o.id)) return false;
              seenIds.add(o.id);
              return true;
            });
            return (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Auftragsabwicklung ({displayOrders.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {displayOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">Keine AB verknüpft</p>
                  ) : (
                    displayOrders.map(o => (
                      <div key={o.id} className="border rounded-lg p-2 space-y-1.5 hover:bg-muted/20 transition-colors">
                        <Link to={`/confirmed-orders/${o.id}`}
                          className="flex items-center justify-between group">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{o.project_name}</p>
                            <p className="text-xs text-muted-foreground">{o.order_number || ''} · {formatCurrency(o.total_net_amount)}</p>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0 ml-2" />
                        </Link>
                        {o.document_url && (
                          <button
                            onClick={() => setPdfViewer({ url: o.document_url, title: `AB: ${o.project_name || o.order_number || 'Auftragsbestätigung'}` })}
                            className="flex items-center gap-1.5 text-xs text-primary hover:underline pl-0.5">
                            <FileText className="w-3 h-3 flex-shrink-0" />
                            AB-Dokument anzeigen
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Invoice documents */}
          {(() => {
            const invoiceDocs = projectInvoices.filter(inv => inv.source_file || inv.sevdesk_invoice_url || inv.sevdesk_id);
            if (invoiceDocs.length === 0) return null;
            return (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Verknüpfte Rechnungen ({invoiceDocs.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {invoiceDocs.map((inv, i) => {
                    const fileUrl = inv.source_file || inv.sevdesk_invoice_url;
                    const sevdeskUrl = inv.sevdesk_id
                      ? `https://my.sevdesk.de/#/fi/edit/type/RE/id/${inv.sevdesk_id}`
                      : null;
                    return (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/30 transition-colors text-xs">
                        <FileText className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium">{inv.invoice_number || '—'}</p>
                          {inv.invoice_date && <p className="text-muted-foreground">{inv.invoice_date}</p>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {fileUrl && (
                            <button onClick={() => setPdfViewer({ url: fileUrl, title: `Rechnung ${inv.invoice_number || '—'}` })}
                              title="PDF anzeigen"
                              className="p-1 rounded hover:bg-muted text-primary">
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {sevdeskUrl && (
                            <a href={sevdeskUrl} target="_blank" rel="noopener noreferrer"
                              title="In sevDesk öffnen"
                              className="p-1 rounded hover:bg-muted text-primary flex items-center">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })()}
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
      <PdfViewerDialog
        open={!!pdfViewer}
        onClose={() => setPdfViewer(null)}
        url={pdfViewer?.url}
        title={pdfViewer?.title}
      />
    </div>
  );
}