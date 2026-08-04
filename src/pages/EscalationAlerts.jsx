import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Bell, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

const OVERDUE_THRESHOLD_DAYS = 60;

export default function EscalationAlerts() {
  const navigate = useNavigate();

  const { data: projects = [], isLoading: pLoading } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });
  const { data: blocks = [], isLoading: bLoading } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });
  const { data: invoices = [], isLoading: iLoading } = useQuery({
    queryKey: ['invoiceRecords'], queryFn: () => base44.entities.InvoiceRecord.list()
  });
  const { data: orders = [] } = useQuery({
    queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list()
  });

  const isLoading = pLoading || bLoading || iLoading;

  const alerts = useMemo(() => {
    if (isLoading) return [];

    const orderProjectMap = {};
    orders.forEach(o => { if (o.id && o.project_id) orderProjectMap[o.id] = o.project_id; });

    const blockProjectMap = {};
    blocks.forEach(b => { if (b.id && b.project_id) blockProjectMap[b.id] = b.project_id; });

    // Last invoice date per project
    const lastInvoiceMap = {};
    invoices
      .filter(inv => inv.invoice_date && !inv.is_credit_note)
      .forEach(inv => {
        const pid = inv.project_id || orderProjectMap[inv.confirmed_order_id] || blockProjectMap[inv.billing_block_id];
        if (!pid) return;
        if (!lastInvoiceMap[pid] || inv.invoice_date > lastInvoiceMap[pid]) lastInvoiceMap[pid] = inv.invoice_date;
      });

    // Ready blocks per project
    const readyBlocksMap = {};
    blocks
      .filter(b => ['ready', 'invoiced'].includes(b.invoice_readiness_status) && b.backoffice_status === 'not_ready')
      .forEach(b => {
        if (!readyBlocksMap[b.project_id]) readyBlocksMap[b.project_id] = [];
        readyBlocksMap[b.project_id].push(b);
      });

    const result = [];

    projects
      .filter(p => p.status === 'active')
      .forEach(p => {
        const lastDate = lastInvoiceMap[p.id];
        const daysSince = lastDate
          ? Math.floor((new Date() - new Date(lastDate)) / (1000 * 60 * 60 * 24))
          : null;
        const readyBlocks = readyBlocksMap[p.id] || [];
        const readyAmount = readyBlocks.reduce((s, b) => s + (b.amount_net || 0), 0);

        // Alert: ready blocks but no invoice in 60+ days
        if (readyBlocks.length > 0 && (daysSince === null || daysSince >= OVERDUE_THRESHOLD_DAYS)) {
          result.push({
            type: 'overdue_ready',
            severity: daysSince === null ? 'high' : daysSince >= 90 ? 'critical' : 'high',
            project: p,
            daysSince,
            readyBlocks,
            readyAmount,
            message: daysSince === null
              ? `Noch nie verrechnet · ${readyBlocks.length} Block(s) bereit`
              : `Letzte Rechnung vor ${daysSince} Tagen · ${readyBlocks.length} Block(s) bereit`,
          });
        }

        // Alert: high risk projects with open amount
        if (['high', 'critical'].includes(p.risk_status) && (p.open_amount || 0) > 0) {
          result.push({
            type: 'risk_open',
            severity: p.risk_status === 'critical' ? 'critical' : 'medium',
            project: p,
            daysSince,
            readyBlocks: [],
            readyAmount: p.open_amount || 0,
            message: `Risikoprojekt (${p.risk_status}) · ${formatCurrency(p.open_amount)} noch offen`,
          });
        }

        // Alert: no invoice for 90+ days on active project with total_net_amount
        if (daysSince !== null && daysSince >= 90 && (p.total_net_amount || 0) > 0 && readyBlocks.length === 0) {
          result.push({
            type: 'long_inactive',
            severity: 'medium',
            project: p,
            daysSince,
            readyBlocks: [],
            readyAmount: 0,
            message: `Seit ${daysSince} Tagen keine Rechnungsaktivität`,
          });
        }
      });

    // Sort: critical first, then by daysSince desc
    result.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
      return (b.daysSince || 0) - (a.daysSince || 0);
    });

    return result;
  }, [projects, blocks, invoices, orders, isLoading]);

  const severityConfig = {
    critical: { color: 'bg-red-100 border-red-300 text-red-800', badge: 'bg-red-500 text-white', label: 'Kritisch', icon: AlertTriangle },
    high: { color: 'bg-amber-100 border-amber-300 text-amber-800', badge: 'bg-amber-500 text-white', label: 'Hoch', icon: AlertTriangle },
    medium: { color: 'bg-blue-50 border-blue-200 text-blue-800', badge: 'bg-blue-400 text-white', label: 'Mittel', icon: Clock },
    low: { color: 'bg-gray-50 border-gray-200 text-gray-700', badge: 'bg-gray-400 text-white', label: 'Niedrig', icon: CheckCircle },
  };

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const highCount = alerts.filter(a => a.severity === 'high').length;

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Eskalations-Alerts"
        subtitle={`${alerts.length} aktive Warnungen · ${criticalCount} kritisch · ${highCount} hoch`}
        icon={Bell}
      />

      {alerts.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <p className="text-lg font-semibold">Keine Eskalationen</p>
          <p className="text-sm text-muted-foreground mt-1">Alle aktiven Projekte sind im grünen Bereich.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert, idx) => {
            const cfg = severityConfig[alert.severity];
            const Icon = cfg.icon;
            const cleanName = (alert.project.project_name || '').replace(/^(order confirmation|auftragsbestätigung)\s*[|]\s*/i, '').trim();
            return (
              <div
                key={idx}
                onClick={() => navigate(`/projects/${alert.project.id}`)}
                className={`border rounded-xl p-4 flex items-start gap-4 cursor-pointer hover:shadow-md transition-shadow ${cfg.color}`}
              >
                <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{alert.project.customer}</span>
                    <span className="text-xs text-current/70 truncate">{cleanName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>{cfg.label}</span>
                  </div>
                  <p className="text-sm mt-1">{alert.message}</p>
                  {alert.readyAmount > 0 && (
                    <p className="text-sm font-semibold mt-1">{formatCurrency(alert.readyAmount)} abrechnungsbereit</p>
                  )}
                </div>
                <div className="text-xs font-medium flex-shrink-0">→ Projekt</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}