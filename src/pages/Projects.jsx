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

const PM_OPTIONS = ['Lara', 'Sebastian', 'Pascal', 'Anna'].map(v => ({ value: v, label: v }));
const STATUS_OPTIONS = ['active', 'completed', 'on_hold', 'cancelled', 'unclear'].map(v => ({ value: v, label: v }));
const RISK_OPTIONS = ['none', 'low', 'medium', 'high', 'critical'].map(v => ({ value: v, label: v }));
const BILLING_STATUS_OPTIONS = ['open','planned','in_review','ready_for_invoice','sent_to_backoffice','invoiced','postponed','on_hold'].map(v => ({ value: v, label: v }));

const INVOICE_TYPE_SHORT = { advance_invoice:'AZ', partial_invoice:'TR', final_invoice:'ER', correction:'KO', credit_note:'GS' };

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
  const [filters, setFilters] = useState({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentMonth = getCurrentMonth();
  const nextMonth = getNextMonth();

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

  const { data: billingPlans = [] } = useQuery({
    queryKey: ['monthlyBillingPlansAll'], queryFn: () => base44.entities.MonthlyBillingPlan.list()
  });
  const { data: billingInstructions = [] } = useQuery({
    queryKey: ['billingInstructions'], queryFn: () => base44.entities.BillingInstruction.list()
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

  // Lookup: plans per project
  const plansByProject = useMemo(() => {
    const map = {};
    billingPlans.forEach(p => {
      if (!map[p.project_id]) map[p.project_id] = [];
      map[p.project_id].push(p);
    });
    return map;
  }, [billingPlans]);

  // Expected billing current month from plans + instructions + blocks
  const expectedCurrentMonth = useMemo(() => {
    let total = 0;
    // From MonthlyBillingPlan
    billingPlans.filter(p => p.planning_month === currentMonth && !['invoiced','postponed','on_hold'].includes(p.billing_status))
      .forEach(p => total += Number(p.planned_amount_net) || 0);
    // From BillingInstructions planned for current month
    billingInstructions.filter(i => {
      if (['invoiced','paid','cancelled'].includes(i.status)) return false;
      return i.planned_invoice_date?.startsWith(currentMonth);
    }).forEach(i => {
      // Avoid double-counting if already in plans
      const alreadyInPlan = billingPlans.some(p => p.linked_billing_instruction_id === i.id);
      if (!alreadyInPlan) total += Number(i.instruction_amount_net) || 0;
    });
    return total;
  }, [billingPlans, billingInstructions, currentMonth]);

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

  const filtered = projects
    .filter(p => {
      if (filters.project_manager && p.project_manager !== filters.project_manager) return false;
      if (filters.status && p.status !== filters.status) return false;
      if (filters.risk_status && p.risk_status !== filters.risk_status) return false;
      if (filters.billing_status) {
        const pPlans = plansByProject[p.id] || [];
        const hasStatus = pPlans.some(plan => plan.billing_status === filters.billing_status);
        if (!hasStatus) return false;
      }
      return true;
    })
    .sort((a, b) => {
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
      _open: Math.max(0, fin.openToInvoiceNet ?? (p.total_net_amount || 0)),
      _paid: fin.paidGross || 0,
      _lastInvoiceDate: lastInvDate,
      _daysSinceInvoice: daysSince,
    };
  });

  const totalNet = filteredWithLive.reduce((s, p) => s + (Number(p.total_net_amount) || 0), 0);
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
      createPlanMutation.mutate({
        project_id: project.id,
        planning_month: field === 'current_month_checked' ? currentMonth : nextMonth,
        planning_type: field === 'current_month_checked' ? 'current_month' : 'next_month',
        billing_status: 'open',
        [field]: true,
        assigned_pm: project.project_manager || '',
      });
    }
  };

  const columns = [
    // 1. Abrechnungsfortschritt (primary billing indicator)
    { key: '_billing', label: 'Abrechnung', width: '140px', render: (_, row) => {
      const fin = projectFinancialsMap[row.id] || {};
      const billingPct = fin.commercialBaseNet > 0 ? (fin.adjustedInvoicedNet / fin.commercialBaseNet) * 100 : 0;
      const aworkPct = row.awork_progress_percent ?? 0;
      return <BillingProgressBar billingPct={billingPct} performancePct={aworkPct} />;
    }},
    // 2. Kunde / Projekt
    { key: 'customer', label: 'Kunde / Projekt', render: (v, row) => (
      <div className="min-w-0">
        <p className="font-medium text-sm leading-tight truncate">{v}</p>
        <p className="text-xs text-muted-foreground leading-tight truncate mt-0.5">
          {(row.project_name || '').replace(/^(order confirmation|auftragsbestätigung)\s*[|]\s*/i, '').trim()}
        </p>
      </div>
    )},
    // 3. Letzte Rechnung
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
    // 4. Gesamt netto
    { key: 'total_net_amount', label: 'Gesamt netto', render: (v) => <span className="text-sm font-medium">{formatCurrency(v)}</span>, cellClass: 'text-right' },
    // 5. Noch zu verrechnen
    { key: '_open', label: 'Offen', render: (v) => <span className={Number(v) > 0 ? 'text-amber-600 font-semibold' : 'text-emerald-600'}>{formatCurrency(v)}</span>, cellClass: 'text-right' },
    // 6. Geplant nächster Monat
    { key: '_nextPlan', label: 'Nächster Monat', width: '120px', render: (_, row) => {
      const plans = (plansByProject[row.id] || []).filter(p => p.planning_month === nextMonth && !['invoiced','postponed'].includes(p.billing_status));
      if (!plans.length) return <span className="text-xs text-muted-foreground">—</span>;
      const total = plans.reduce((s, p) => s + (Number(p.planned_amount_net) || 0), 0);
      const pct = plans.reduce((s, p) => s + (Number(p.planned_percent) || 0), 0);
      const types = [...new Set(plans.map(p => p.planned_invoice_type))];
      return (
        <div className="text-right space-y-0.5">
          <p className="text-xs font-semibold text-amber-700">{formatCurrency(total)}</p>
          <div className="flex gap-1 justify-end flex-wrap">
            {pct > 0 && <span className="text-xs text-muted-foreground">{Math.round(pct)}%</span>}
            {types.map(t => <span key={t} className="text-xs bg-blue-100 text-blue-700 rounded px-1 font-medium">{t}</span>)}
          </div>
        </div>
      );
    }},
    // 7. Planung geprüft (current + next month checkboxes)
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
    // 8. Risiko
    { key: 'risk_status', label: 'Risiko', width: '80px', render: (v) => <StatusBadge status={v} /> },
    // 9. PM
    { key: 'project_manager', label: 'PM', width: '70px', render: v => <span className="text-xs">{v || '—'}</span> },
    // 10. Projektstatus (rightmost)
    { key: 'status', label: 'Status', width: '90px', render: (v) => <StatusBadge status={v} /> },
  ];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Projekt-Cockpit" subtitle={`${filtered.length} aktive Projekte · Operativer Status, awork, Abrechnung, Zahlungen`} icon={FolderKanban} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Gesamtvolumen" value={formatCurrency(totalNet)} variant="info" />
        <KpiCard title="Offene Beträge" value={formatCurrency(totalOpen)} variant="warning" />
        <KpiCard title="Aktive Projekte" value={activeCount} subtitle={`von ${filtered.length} gesamt`} />
        <KpiCard title="Geplant dieser Monat" value={formatCurrency(expectedCurrentMonth)} variant="success" subtitle="aus Planung + Anweisungen" />
      </div>

      <FilterBar
        filters={[
          { key: 'project_manager', label: 'PM', options: PM_OPTIONS },
          { key: 'billing_status', label: 'Abrechnungsstatus', options: BILLING_STATUS_OPTIONS },
          { key: 'risk_status', label: 'Risiko', options: RISK_OPTIONS },
          { key: 'status', label: 'Projektstatus', options: STATUS_OPTIONS },
        ]}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onReset={() => setFilters({})}
      />

      <DataTable columns={columns} data={filteredWithLive} onRowClick={(p) => navigate(`/projects/${p.id}`)} />

    </div>
  );
}