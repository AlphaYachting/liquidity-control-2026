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

  // Für jeden ConfirmedOrder: project_id per order.id nachschlagen
  const orderProjectMap = useMemo(() => {
    const map = {};
    orders.forEach(o => { if (o.project_id) map[o.id] = o.project_id; });
    return map;
  }, [orders]);

  // Kundennamen pro Projekt (inkl. verknüpfte Orders)
  const projectCustomerNames = useMemo(() => {
    const map = {}; // projectId -> Set<lowerCaseName>
    projects.forEach(p => {
      map[p.id] = new Set();
      if (p.customer) map[p.id].add(p.customer.toLowerCase());
    });
    orders.forEach(o => {
      if (o.project_id && map[o.project_id] && o.customer) {
        map[o.project_id].add(o.customer.toLowerCase());
      }
    });
    return map;
  }, [projects, orders]);

  // Rechnungssummen pro Projekt berechnen (live aus InvoiceRecord)
  // Fallback: Kundennamen-Match für unverknüpfte Rechnungen
  const invoiceStatsByProject = useMemo(() => {
    const stats = {};

    // Build reverse map: customerName -> [projectId] for unmatched invoices
    const customerToProjects = {};
    projects.forEach(p => {
      const names = projectCustomerNames[p.id] || new Set();
      names.forEach(name => {
        if (!customerToProjects[name]) customerToProjects[name] = [];
        customerToProjects[name].push(p.id);
      });
    });

    invoices.forEach(inv => {
      let pid = inv.project_id || orderProjectMap[inv.confirmed_order_id];

      // Fallback: match by customer name if not explicitly linked
      if (!pid && !inv.billing_block_id && inv.payment_status !== 'cancelled') {
        const custKey = (inv.customer_name || '').toLowerCase();
        const matches = customerToProjects[custKey] || [];
        if (matches.length === 1) pid = matches[0]; // only assign if unambiguous
      }

      if (!pid) return;
      if (!stats[pid]) stats[pid] = { invoiced: 0, open: 0 };
      if (!inv.is_credit_note && inv.payment_status !== 'cancelled') {
        stats[pid].invoiced += Number(inv.net_amount) || 0;
        stats[pid].open += Number(inv.open_amount) || 0;
      } else if (inv.is_credit_note) {
        stats[pid].invoiced -= Number(inv.net_amount) || 0;
      }
    });
    return stats;
  }, [invoices, orderProjectMap, projects, projectCustomerNames]);

  const isLoading = projectsLoading || invoicesLoading || ordersLoading;

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

  // Erweiterte Projekte mit live-berechneten Werten
  const filteredWithLive = filtered.map(p => ({
    ...p,
    _invoiced: invoiceStatsByProject[p.id]?.invoiced || 0,
    _open: Math.max(0, (p.total_net_amount || 0) - (invoiceStatsByProject[p.id]?.invoiced || 0)),
  }));

  const totalNet = filteredWithLive.reduce((s, p) => s + (Number(p.total_net_amount) || 0), 0);
  const totalInvoiced = filteredWithLive.reduce((s, p) => s + p._invoiced, 0);
  const totalOpen = filteredWithLive
    .filter(p => p.status !== 'completed' && p.status !== 'cancelled')
    .reduce((s, p) => s + p._open, 0);

  const columns = [
    { key: 'status', label: 'Status', width: '100px', render: (v) => <StatusBadge status={v} /> },
    { key: 'customer', label: 'Kunde' },
    { key: 'project_name', label: 'Projekt' },
    { key: 'project_manager', label: 'PM', width: '80px' },
    { key: 'total_net_amount', label: 'Gesamt netto', render: (v) => formatCurrency(v), cellClass: 'text-right font-medium' },
    { key: '_invoiced', label: 'Verrechnet', render: (v) => <span className={Number(v) > 0 ? 'text-green-600 font-medium' : ''}>{formatCurrency(v)}</span>, cellClass: 'text-right' },
    { key: '_open', label: 'Offen', render: (v) => <span className={Number(v) > 0 ? 'text-amber-600 font-medium' : ''}>{formatCurrency(v)}</span>, cellClass: 'text-right' },
    { key: 'expected_invoice_month', label: 'Erw. Monat', width: '100px' },
    { key: 'risk_status', label: 'Risiko', width: '90px', render: (v) => <StatusBadge status={v} /> },
    { key: 'notes', label: 'Notizen', render: (v) => v ? <span className="text-xs text-muted-foreground truncate max-w-[150px] block">{v}</span> : '—' },
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