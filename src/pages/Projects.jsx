import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { FolderKanban } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import FilterBar from '@/components/shared/FilterBar';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateProjectFinancials } from '@/lib/projectFinancials';

const PM_OPTIONS = ['Lara', 'Sebastian', 'Pascal', 'Anna'].map(v => ({ value: v, label: v }));
const STATUS_OPTIONS = ['active', 'completed', 'on_hold', 'cancelled', 'unclear'].map(v => ({ value: v, label: v }));
const RISK_OPTIONS = ['none', 'low', 'medium', 'high', 'critical'].map(v => ({ value: v, label: v }));

export default function Projects() {
  const [filters, setFilters] = useState({});
  const navigate = useNavigate();

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

  // Map awork_project_id -> snapshot for fast lookup
  const aworkSnapshotMap = useMemo(() => {
    const map = {};
    aworkSnapshots.forEach(s => { map[s.awork_project_id] = s; });
    return map;
  }, [aworkSnapshots]);

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
  const totalInvoiced = filteredWithLive.reduce((s, p) => s + p._invoiced, 0);
  const totalOpen = filteredWithLive
    .filter(p => p.status !== 'completed' && p.status !== 'cancelled')
    .reduce((s, p) => s + p._open, 0);

  const columns = [
    { key: 'status', label: 'Status', width: '100px', render: (v) => <StatusBadge status={v} /> },
    { key: 'customer', label: 'Kunde / Projekt', render: (v, row) => {
      const fin = projectFinancialsMap[row.id] || {};
      const billingPct = fin.commercialBaseNet > 0
        ? Math.round((fin.adjustedInvoicedNet / fin.commercialBaseNet) * 100)
        : null;
      const aworkPct = row.awork_progress_percent ?? 0;
      const gap = billingPct !== null ? (aworkPct - billingPct) : 0;
      return (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-sm leading-tight truncate">{v}</p>
            {gap >= 25 && row.status === 'active' && (
              <span title={`awork ${aworkPct}% → Abrechnung ${billingPct}% (Lücke ${gap}%)`}
                className="flex-shrink-0 text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded px-1 py-0 leading-4 font-medium">
                ⚠ +{gap}%
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-tight truncate mt-0.5">{row.project_name}</p>
        </div>
      );
    }},
    { key: 'project_manager', label: 'PM', width: '80px' },
    { key: '_lastInvoiceDate', label: 'Letzte Rechnung', width: '130px', render: (v, row) => {
      if (!v) return <span className="text-xs text-muted-foreground">—</span>;
      const days = row._daysSinceInvoice;
      const color = days === null ? '' : days > 90 ? 'text-red-600' : days > 30 ? 'text-amber-600' : 'text-emerald-600';
      return (
        <div className="space-y-0.5">
          <p className="text-xs font-medium">{v}</p>
          <p className={`text-xs font-semibold ${color}`}>{days !== null ? `vor ${days} T.` : '—'}</p>
        </div>
      );
    }},
    { key: 'total_net_amount', label: 'Gesamt netto', render: (v) => formatCurrency(v), cellClass: 'text-right font-medium' },
    { key: '_invoiced', label: 'Verrechnet netto', render: (v) => <span className={Number(v) > 0 ? 'text-green-600 font-medium' : ''}>{formatCurrency(v)}</span>, cellClass: 'text-right' },
    { key: '_open', label: 'Noch zu verr.', render: (v) => <span className={Number(v) > 0 ? 'text-amber-600 font-medium' : ''}>{formatCurrency(v)}</span>, cellClass: 'text-right' },
    { key: '_awork', label: 'awork / Stunden', width: '160px', render: (_, row) => {
        if (!row.awork_project_id) return <span className="text-xs text-muted-foreground">—</span>;
        const pct = row.awork_progress_percent ?? 0;
        const snap = aworkSnapshotMap[row.awork_project_id];
        const budgetMin = snap?.time_budget_minutes ?? 0;
        const trackedMin = snap?.tracked_duration_minutes ?? 0;
        const budgetH = budgetMin > 0 ? (budgetMin / 60).toFixed(1) : null;
        const trackedH = trackedMin > 0 ? (trackedMin / 60).toFixed(1) : null;
        const budgetPct = budgetMin > 0 ? Math.min(100, Math.round((trackedMin / budgetMin) * 100)) : null;
        const barPct = budgetPct ?? pct;
        const barColor = budgetPct !== null
          ? budgetPct >= 90 ? 'bg-red-500' : budgetPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
          : 'bg-blue-500';
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full ${barColor} rounded-full`} style={{ width: `${barPct}%` }} />
              </div>
              {budgetPct !== null && <span className="text-xs font-medium text-blue-700">{budgetPct}%</span>}
            </div>
            {(trackedH || budgetH) && (
              <div className="text-xs text-muted-foreground">
                {trackedH && <span className="text-emerald-700">{trackedH}h</span>}
                {trackedH && budgetH && <span> / </span>}
                {budgetH && <span>{budgetH}h</span>}
              </div>
            )}
          </div>
        );
      }
    },
    { key: 'expected_invoice_month', label: 'Erw. Monat', width: '100px' },
    { key: 'risk_status', label: 'Risiko', width: '90px', render: (v) => <StatusBadge status={v} /> },
  ];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Projekt-Cockpit" subtitle={`${filtered.length} aktive Projekte · Operativer Status, awork, Abrechnung, Zahlungen`} icon={FolderKanban} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Gesamtvolumen" value={formatCurrency(totalNet)} variant="info" />
        <KpiCard title="Bereits verrechnet" value={formatCurrency(totalInvoiced)} variant="success" />
        <KpiCard title="Offene Beträge" value={formatCurrency(totalOpen)} variant="warning" />
        <KpiCard title="Projekte" value={filtered.length} subtitle={`${filtered.filter(p => p.status === 'active').length} aktiv`} />
      </div>

      <FilterBar
        filters={[
          { key: 'project_manager', label: 'PM', options: PM_OPTIONS },
          { key: 'status', label: 'Status', options: STATUS_OPTIONS },
          { key: 'risk_status', label: 'Risiko', options: RISK_OPTIONS },
        ]}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onReset={() => setFilters({})}
      />

      <DataTable columns={columns} data={filteredWithLive} onRowClick={(p) => navigate(`/projects/${p.id}`)} />

    </div>
  );
}