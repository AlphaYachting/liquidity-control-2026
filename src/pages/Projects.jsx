import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, CheckSquare, Square } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import FilterBar from '@/components/shared/FilterBar';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateProjectFinancials } from '@/lib/projectFinancials';
import BillingProgressBar from '@/components/projects/BillingProgressBar';
import ProjectStateCell from '@/components/projects/ProjectStateCell';
import { computeProjectState, aggregateOpenTasks, PROJECT_STATE_RANK } from '@/lib/aworkProjectState';

const PM_OPTIONS = ['Anna', 'Lara', 'Mathias', 'Pascal', 'Sebastian'].map(v => ({ value: v, label: v }));
const STATUS_OPTIONS = ['active', 'completed', 'on_hold', 'cancelled', 'unclear'].map(v => ({ value: v, label: v }));
const RISK_OPTIONS = ['none', 'low', 'medium', 'high', 'critical'].map(v => ({ value: v, label: v }));
const PROJECT_STATE_OPTIONS = [
  { value: 'critical', label: 'Handlung nötig' },
  { value: 'attention', label: 'Aufmerksamkeit' },
  { value: 'plan', label: 'im Plan' },
  { value: 'none', label: 'nicht verknüpft' },
];
const BILLING_STATUS_OPTIONS = [
  { value: 'open', label: 'offen' },
  { value: 'planned', label: 'geplant' },
  { value: 'in_review', label: 'in Prüfung' },
  { value: 'ready_for_invoice', label: 'bereit' },
  { value: 'sent_to_backoffice', label: 'in Verrechnung' },
  { value: 'invoiced', label: 'verrechnet' },
  { value: 'on_hold', label: 'on hold' },
  { value: 'postponed', label: 'verschoben' },
];
const BILLING_STATUS_DISPLAY = {
  open: 'offen', planned: 'geplant', in_review: 'in Prüfung',
  ready_for_invoice: 'bereit', sent_to_backoffice: 'in Verrechnung',
  invoiced: 'verrechnet', postponed: 'verschoben', on_hold: 'on hold',
};
const BILLING_STATUS_COLORS = {
  open: 'bg-slate-100 text-slate-600',
  planned: 'bg-blue-100 text-blue-700',
  in_review: 'bg-amber-100 text-amber-700',
  ready_for_invoice: 'bg-emerald-100 text-emerald-700',
  sent_to_backoffice: 'bg-orange-100 text-orange-700',
  invoiced: 'bg-emerald-100 text-emerald-700',
  postponed: 'bg-gray-100 text-gray-500',
  on_hold: 'bg-red-100 text-red-600',
};

const INVOICE_TYPE_SHORT = { advance_invoice:'AZ', partial_invoice:'TR', final_invoice:'ER', correction:'KO', credit_note:'GS' };
const SUBMITTED_STATUSES = ['sent_to_backoffice', 'invoice_created', 'paid'];

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
}
function getNextMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
}

export default function Projects() {
  const [filters, setFilters] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('projects_filters') || '{}'); } catch { return {}; }
  });
  const [sortOverride, setSortOverride] = useState(() => {
    return sessionStorage.getItem('projects_sortOverride') || null;
  });
  const [showArchived, setShowArchived] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentMonth = getCurrentMonth();
  const nextMonth = getNextMonth();

  const currentMonthLabel = new Date().toLocaleString('de-DE', { month: 'long' });
  const nextMonthLabel = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toLocaleString('de-DE', { month: 'long' });
  })();

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoiceRecords'], queryFn: () => base44.entities.InvoiceRecord.list()
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list()
  });

  const { data: allBlocks = [], isLoading: blocksLoading } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });

  const { data: aworkSnapshots = [] } = useQuery({
    queryKey: ['aworkSnapshots'], queryFn: () => base44.entities.AworkProjectSnapshot.list()
  });

  const { data: openAworkTasks = [] } = useQuery({
    queryKey: ['openAworkTasks'], queryFn: () => base44.entities.AworkTaskSnapshot.filter({ is_done: false })
  });

  const { data: billingPlans = [] } = useQuery({
    queryKey: ['monthlyBillingPlansAll'], queryFn: () => base44.entities.MonthlyBillingPlan.list()
  });
  const { data: billingInstructions = [] } = useQuery({
    queryKey: ['billingInstructions'], queryFn: () => base44.entities.BillingInstruction.list()
  });

  // Mutation für Billing-Status direkt in der Übersicht
  const updatePlanBillingStatusMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MonthlyBillingPlan.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monthlyBillingPlansAll'] })
  });

  const updatePlanMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MonthlyBillingPlan.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monthlyBillingPlansAll'] })
  });
  const createPlanMutation = useMutation({
    mutationFn: (data) => base44.entities.MonthlyBillingPlan.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monthlyBillingPlansAll'] })
  });

  // Map awork_project_id -> snapshot for fast lookup
  const aworkSnapshotMap = useMemo(() => {
    const map = {};
    aworkSnapshots.forEach(s => { map[s.awork_project_id] = s; });
    return map;
  }, [aworkSnapshots]);

  // Offene awork-Aufgaben je Projekt: blockierte, früheste Frist, überfällige
  const openTaskAggMap = useMemo(() => aggregateOpenTasks(openAworkTasks), [openAworkTasks]);

  // Projektstand je Projekt aus dem awork-Snapshot
  const projectStateMap = useMemo(() => {
    const map = {};
    projects.forEach(p => {
      const pid = p.awork_project_id;
      map[p.id] = computeProjectState(pid ? aworkSnapshotMap[pid] : null, pid ? openTaskAggMap[pid] : null);
    });
    return map;
  }, [projects, aworkSnapshotMap, openTaskAggMap]);

  // Lookup: plans per project
  const plansByProject = useMemo(() => {
    const map = {};
    billingPlans.forEach(p => {
      if (!map[p.project_id]) map[p.project_id] = [];
      map[p.project_id].push(p);
    });
    return map;
  }, [billingPlans]);

  // Helper: planned amount for a given month from billing plans
  const getPlannedForMonth = (month) => {
    let total = 0;
    billingPlans
      .filter(p => p.planning_month === month && !['invoiced','postponed','on_hold'].includes(p.billing_status))
      .forEach(p => total += Number(p.planned_amount_net) || 0);
    // From BillingInstructions planned for that month (not already in a plan)
    billingInstructions.filter(i => {
      if (['invoiced','paid','cancelled'].includes(i.status)) return false;
      return i.planned_invoice_date?.startsWith(month);
    }).forEach(i => {
      const alreadyInPlan = billingPlans.some(p => p.linked_billing_instruction_id === i.id);
      if (!alreadyInPlan) total += Number(i.instruction_amount_net) || 0;
    });
    return total;
  };

  const expectedCurrentMonth = useMemo(() => getPlannedForMonth(currentMonth), [billingPlans, billingInstructions, currentMonth]);
  const expectedNextMonth = useMemo(() => getPlannedForMonth(nextMonth), [billingPlans, billingInstructions, nextMonth]);

  // Abgerechnet = BillingInstructions die tatsächlich an sevDesk übermittelt wurden
  // (status: sent_to_backoffice, invoice_created, paid) für akt. oder nächsten Monat
  const billedThisMonth = useMemo(() => {
    return billingInstructions
      .filter(i => SUBMITTED_STATUSES.includes(i.status) && i.planned_invoice_date?.startsWith(currentMonth))
      .reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0);
  }, [billingInstructions, currentMonth]);
  const billedNextMonth = useMemo(() => {
    return billingInstructions
      .filter(i => SUBMITTED_STATUSES.includes(i.status) && i.planned_invoice_date?.startsWith(nextMonth))
      .reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0);
  }, [billingInstructions, nextMonth]);

  // Per-project financials using shared helper — allBlocks now passed correctly
  const projectFinancialsMap = useMemo(() => {
    const map = {};
    projects.forEach(p => {
      map[p.id] = calculateProjectFinancials({
        project: p,
        allOrders: orders,
        allBlocks,
        allInvoices: invoices,
      });
    });
    return map;
  }, [projects, orders, allBlocks, invoices]);

  const isLoading = projectsLoading || invoicesLoading || ordersLoading || blocksLoading;

  const STATUS_SORT_ORDER = { active: 0, on_hold: 1, unclear: 2, completed: 3, cancelled: 4 };

  // Per-project: expected current month amount (for sorting)
  const expectedByProject = useMemo(() => {
    const map = {};
    projects.forEach(p => {
      const plans = (plansByProject[p.id] || []).filter(pl =>
        pl.planning_month === currentMonth && !['invoiced','postponed','on_hold'].includes(pl.billing_status) && (Number(pl.planned_amount_net) || 0) > 0
      );
      map[p.id] = plans.reduce((s, pl) => s + (Number(pl.planned_amount_net) || 0), 0);
    });
    return map;
  }, [projects, plansByProject, currentMonth]);

  const filtered = projects
    .filter(p => {
      // Billing relevance filter — default: hide archived/not_billing_relevant
      if (!showArchived) {
        const rel = p.billing_relevance_status;
        if (rel && ['archived', 'not_billing_relevant'].includes(rel)) return false;
        if (p.excluded_from_project_cockpit) return false;
      }
      if (filters.project_manager && p.project_manager !== filters.project_manager) return false;
      if (filters.status && p.status !== filters.status) return false;
      if (filters.risk_status && p.risk_status !== filters.risk_status) return false;
      if (filters.billing_status) {
        const pPlans = plansByProject[p.id] || [];
        const hasStatus = pPlans.some(plan => plan.billing_status === filters.billing_status);
        if (!hasStatus) return false;
      }
      if (filters.billing_relevance) {
        if (p.billing_relevance_status !== filters.billing_relevance) return false;
      }
      if (filters.project_state) {
        if ((projectStateMap[p.id]?.status || 'none') !== filters.project_state) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortOverride === 'erwartung_desc') {
        return (expectedByProject[b.id] || 0) - (expectedByProject[a.id] || 0);
      }
      if (sortOverride === 'handlungsbedarf') {
        const stA = projectStateMap[a.id] || { status: 'none' };
        const stB = projectStateMap[b.id] || { status: 'none' };
        const rA = PROJECT_STATE_RANK[stA.status] ?? 99;
        const rB = PROJECT_STATE_RANK[stB.status] ?? 99;
        if (rA !== rB) return rA - rB;
        return (stA.dueDate || '9999-12-31').localeCompare(stB.dueDate || '9999-12-31');
      }
      const sA = STATUS_SORT_ORDER[a.status] ?? 99;
      const sB = STATUS_SORT_ORDER[b.status] ?? 99;
      if (sA !== sB) return sA - sB;
      return (a.customer || '').localeCompare(b.customer || '', 'de');
    });

  // Order-ID -> project_id map für indirekte Rechnungsverknüpfung
  const orderProjectMap = useMemo(() => {
    const map = {};
    orders.forEach(o => { if (o.id && o.project_id) map[o.id] = o.project_id; });
    return map;
  }, [orders]);

  // Block-ID -> project_id map
  const blockProjectMap = useMemo(() => {
    const map = {};
    allBlocks.forEach(b => { if (b.id && b.project_id) map[b.id] = b.project_id; });
    return map;
  }, [allBlocks]);

  // Letzte Rechnung pro Projekt — direkt, über Order oder über Block
  const lastInvoiceDateMap = useMemo(() => {
    const map = {};
    invoices
      .filter(inv => inv.invoice_date && !inv.is_credit_note)
      .forEach(inv => {
        const pid = inv.project_id
          || orderProjectMap[inv.confirmed_order_id]
          || blockProjectMap[inv.billing_block_id];
        if (!pid) return;
        if (!map[pid] || inv.invoice_date > map[pid]) map[pid] = inv.invoice_date;
      });
    return map;
  }, [invoices, orderProjectMap, blockProjectMap]);

  // Erweiterte Projekte mit live-berechneten Werten (shared helper)
  const filteredWithLive = filtered.map(p => {
    const fin = projectFinancialsMap[p.id] || {};
    const lastInvDate = lastInvoiceDateMap[p.id] || null;
    const daysSince = lastInvDate
      ? Math.floor((new Date() - new Date(lastInvDate)) / (1000 * 60 * 60 * 24))
      : null;
    return {
      ...p,
      _invoiced: fin.adjustedInvoicedNet || 0,
      _open: Math.max(0, fin.openToInvoiceNet ?? (fin.commercialBaseNet || p.total_net_amount || 0)),
      _paid: fin.paidGross || 0,
      _lastInvoiceDate: lastInvDate,
      _daysSinceInvoice: daysSince,
    };
  });

  const totalNet = filteredWithLive.reduce((s, p) => {
    const fin = projectFinancialsMap[p.id] || {};
    return s + (fin.commercialBaseNet || Number(p.total_net_amount) || 0);
  }, 0);
  const totalOpen = filteredWithLive
    .filter(p => p.status !== 'completed' && p.status !== 'cancelled')
    .reduce((s, p) => s + p._open, 0);
  const activeCount = filteredWithLive.filter(p => p.status === 'active').length;

  // Toggle planning-checked for a project/month
  const handleToggleChecked = (e, project, field) => {
    e.stopPropagation();
    const plans = plansByProject[project.id] || [];
    const curPlan = plans.find(p => p.planning_month === (field === 'current_month_checked' ? currentMonth : nextMonth));
    if (curPlan) {
      updatePlanMutation.mutate({ id: curPlan.id, data: { [field]: !curPlan[field] } });
    } else {
      // Create a minimal plan record just to store the check
      // IMPORTANT: no planned_amount_net here so 0€ doesn't appear in cockpit
      // We use a special marker billing_status 'open' but planned_amount_net stays undefined
      createPlanMutation.mutate({
        project_id: project.id,
        planning_month: field === 'current_month_checked' ? currentMonth : nextMonth,
        planning_type: field === 'current_month_checked' ? 'current_month' : 'next_month',
        billing_status: 'open',
        planned_amount_net: null,
        planned_amount_gross: null,
        [field]: true,
        assigned_pm: project.project_manager || '',
      });
    }
  };

  const columns = [
    // 0. Geprüft (erste Spalte)
    { key: '_checked', label: 'Geprüft', width: '70px', render: (_, row) => {
      const plans = plansByProject[row.id] || [];
      const curPlan = plans.find(p => p.planning_month === currentMonth);
      const nxtPlan = plans.find(p => p.planning_month === nextMonth);
      const curChecked = curPlan?.current_month_checked || false;
      const nxtChecked = nxtPlan?.next_month_checked || false;
      return (
        <div className="flex flex-col items-center gap-1">
          <button title="Planung dieser Monat geprüft" onClick={e => handleToggleChecked(e, row, 'current_month_checked')}
            className={`text-xs flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors ${curChecked ? 'text-emerald-600 bg-emerald-50' : 'text-muted-foreground hover:text-foreground'}`}>
            {curChecked ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
            <span>M</span>
          </button>
          <button title="Planung Folgemonat geprüft" onClick={e => handleToggleChecked(e, row, 'next_month_checked')}
            className={`text-xs flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors ${nxtChecked ? 'text-amber-600 bg-amber-50' : 'text-muted-foreground hover:text-foreground'}`}>
            {nxtChecked ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
            <span>F</span>
          </button>
        </div>
      );
    }},
    // 1. Abrechnungsfortschritt (primary billing indicator)
    { key: '_billing', label: 'Abrechnung', width: '140px', render: (_, row) => {
      const fin = projectFinancialsMap[row.id] || {};
      const billingPct = fin.commercialBaseNet > 0 ? (fin.adjustedInvoicedNet / fin.commercialBaseNet) * 100 : 0;
      // Leistungsfortschritt = erledigte Aufgaben, keine gemischte Kennzahl
      const snap = row.awork_project_id ? aworkSnapshotMap[row.awork_project_id] : null;
      const snapTotal = Number(snap?.tasks_count) || 0;
      const aworkPct = snapTotal > 0
        ? Math.round(((Number(snap.tasks_done_count) || 0) / snapTotal) * 100)
        : 0;
      return <BillingProgressBar billingPct={billingPct} performancePct={aworkPct} />;
    }},
    // 2. Kunde / Projekt
    { key: 'customer', label: 'Kunde / Projekt', width: '400px', render: (v, row) => (
      <div style={{ maxWidth: '400px', overflow: 'hidden' }}>
        <p className="font-medium text-sm leading-tight truncate" title={v}>{v}</p>
        <p className="text-xs text-muted-foreground leading-tight truncate mt-0.5" title={row.project_name}>
          {(row.project_name || '').replace(/^(order confirmation|auftragsbestätigung)\s*[|]\s*/i, '').trim()}
        </p>
      </div>
    )},
    // 3. Projektstand (awork)
    { key: '_projectState', label: 'Projektstand', width: '190px', render: (_, row) => (
      <ProjectStateCell state={projectStateMap[row.id]} />
    )},
    // 4. Letzte Rechnung
    { key: '_lastInvoiceDate', label: 'Letzte Rechnung', width: '130px', render: (v, row) => {
      if (!v) return <span className="text-xs text-muted-foreground italic">keine</span>;
      const days = row._daysSinceInvoice;
      const color = days === null ? '' : days > 90 ? 'text-red-600 font-semibold' : days > 30 ? 'text-amber-600' : 'text-emerald-600';
      const fin = projectFinancialsMap[row.id] || {};
      // Find last invoice type from fin.linkedInvoices
      return (
        <div className="space-y-0.5">
          <p className="text-xs font-medium">{v}</p>
          <p className={`text-xs ${color}`}>{days !== null ? `vor ${days}d` : '—'}</p>
        </div>
      );
    }},
    // 4. Erwartung dieser Monat
    { key: '_curPlan', label: 'Erwartung d. Monat', width: '130px', render: (_, row) => {
      const plans = (plansByProject[row.id] || []).filter(p => p.planning_month === currentMonth && !['invoiced','postponed'].includes(p.billing_status) && (Number(p.planned_amount_net) || 0) > 0);
      const risk = row.risk_status;
      const amtColor = risk === 'critical' ? 'text-red-800 font-bold'
        : risk === 'high' ? 'text-red-600 font-semibold'
        : risk === 'medium' ? 'text-amber-600 font-semibold'
        : 'text-emerald-700 font-semibold';
      if (!plans.length) return <span className="text-xs text-muted-foreground">—</span>;
      const total = plans.reduce((s, p) => s + (Number(p.planned_amount_net) || 0), 0);
      const pct = plans.reduce((s, p) => s + (Number(p.planned_percent) || 0), 0);
      const types = [...new Set(plans.map(p => p.planned_invoice_type))];
      return (
        <div className="text-right space-y-0.5">
          <p className={`text-xs ${amtColor}`}>{formatCurrency(total)}</p>
          <div className="flex gap-1 justify-end flex-wrap">
            {pct > 0 && <span className="text-xs text-muted-foreground">{Math.round(pct)}%</span>}
            {types.map(t => <span key={t} className="text-xs bg-blue-100 text-blue-700 rounded px-1 font-medium">{t}</span>)}
          </div>
        </div>
      );
    }},
    // 5. Verrechnungsstatus (vor Gesamtbetrag)
    { key: '_billing_status', label: 'Verr.-Status', width: '120px', render: (_, row) => {
      const plans = plansByProject[row.id] || [];
      const activePlan = plans.find(p => p.planning_month === currentMonth)
        || plans.find(p => p.planning_month === nextMonth)
        || plans.sort((a, b) => (b.planning_month || '').localeCompare(a.planning_month || ''))[0];
      const status = activePlan?.billing_status || 'open';
      if (!activePlan) {
        return <span className="text-xs text-muted-foreground">—</span>;
      }
      return (
        <select
          value={status}
          onClick={e => e.stopPropagation()}
          onChange={e => {
            e.stopPropagation();
            updatePlanBillingStatusMutation.mutate({ id: activePlan.id, data: { billing_status: e.target.value } });
          }}
          className={`text-xs rounded px-1.5 py-0.5 border-0 cursor-pointer ${BILLING_STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}
        >
          {Object.entries(BILLING_STATUS_DISPLAY).map(([val, lbl]) => (
            <option key={val} value={val}>{lbl}</option>
          ))}
        </select>
      );
    }},
    // 6. Gesamt netto
    { key: 'total_net_amount', label: 'Gesamt netto', render: (v) => <span className="text-sm font-medium">{formatCurrency(v)}</span>, cellClass: 'text-right' },
    // 7. Noch zu verrechnen
    { key: '_open', label: 'Offen', render: (v) => <span className={Number(v) > 0 ? 'text-amber-600 font-semibold' : 'text-emerald-600'}>{formatCurrency(v)}</span>, cellClass: 'text-right' },
    // 8. Risiko
    { key: 'risk_status', label: 'Risiko', width: '80px', render: (v) => <StatusBadge status={v} /> },
    // 9. PM
    { key: 'project_manager', label: 'PM', width: '70px', render: v => <span className="text-xs">{v || '—'}</span> },
    // 10. Projektstatus
    { key: 'status', label: 'Status', width: '90px', render: (v) => <StatusBadge status={v} /> },
  ];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Projekt-Cockpit" subtitle={`${filtered.length} aktive Projekte · Operativer Status, awork, Abrechnung, Zahlungen`} icon={FolderKanban} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard title="Gesamtvolumen" value={formatCurrency(totalNet)} variant="info" subtitle={`${activeCount} aktive Projekte`} />
        <KpiCard title="Offene Beträge" value={formatCurrency(totalOpen)} variant="warning" />
        <KpiCard
          title={`Geplant ${currentMonthLabel}`}
          value={formatCurrency(expectedCurrentMonth)}
          variant="success"
          subtitle={billedThisMonth > 0 ? `✓ ${formatCurrency(billedThisMonth)} übermittelt` : 'noch nicht übermittelt'}
        />
        <KpiCard
          title={`Geplant ${nextMonthLabel}`}
          value={formatCurrency(expectedNextMonth)}
          variant="info"
          subtitle={billedNextMonth > 0 ? `✓ ${formatCurrency(billedNextMonth)} übermittelt` : 'noch nicht übermittelt'}
        />
        <KpiCard
          title="Übermittelt gesamt"
          value={formatCurrency(billedThisMonth + billedNextMonth)}
          subtitle={`${billingInstructions.filter(i => SUBMITTED_STATUSES.includes(i.status)).length} Anweisungen`}
          variant={billedThisMonth + billedNextMonth > 0 ? 'success' : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterBar
          filters={[
            { key: 'project_manager', label: 'PM', options: PM_OPTIONS },
            { key: 'billing_status', label: 'Verr.-Status', options: BILLING_STATUS_OPTIONS },
            { key: 'risk_status', label: 'Risiko', options: RISK_OPTIONS },
            { key: 'status', label: 'Projektstatus', options: STATUS_OPTIONS },
            { key: 'project_state', label: 'Projektstand', options: PROJECT_STATE_OPTIONS },
          ]}
          values={filters}
          onChange={(k, v) => setFilters(f => {
            const next = { ...f, [k]: v };
            sessionStorage.setItem('projects_filters', JSON.stringify(next));
            return next;
          })}
          onReset={() => {
            setFilters({});
            setSortOverride(null);
            sessionStorage.removeItem('projects_filters');
            sessionStorage.removeItem('projects_sortOverride');
          }}
        />
        <button
          onClick={() => setSortOverride(s => {
            const next = s === 'erwartung_desc' ? null : 'erwartung_desc';
            if (next) sessionStorage.setItem('projects_sortOverride', next);
            else sessionStorage.removeItem('projects_sortOverride');
            return next;
          })}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${sortOverride === 'erwartung_desc' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
        >
          Sortieren: Erwartung ↓
        </button>
        <button
          onClick={() => setSortOverride(s => {
            const next = s === 'handlungsbedarf' ? null : 'handlungsbedarf';
            if (next) sessionStorage.setItem('projects_sortOverride', next);
            else sessionStorage.removeItem('projects_sortOverride');
            return next;
          })}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${sortOverride === 'handlungsbedarf' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
        >
          Sortieren: Handlungsbedarf
        </button>
        <button
          onClick={() => setShowArchived(s => !s)}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${showArchived ? 'bg-amber-100 text-amber-800 border-amber-300' : 'border-border text-muted-foreground hover:text-foreground'}`}
        >
          {showArchived ? 'Archivierte ausblenden' : 'Archivierte einblenden'}
        </button>
      </div>

      <DataTable columns={columns} data={filteredWithLive} onRowClick={(p) => navigate(`/projects/${p.id}`)} />

    </div>
  );
}