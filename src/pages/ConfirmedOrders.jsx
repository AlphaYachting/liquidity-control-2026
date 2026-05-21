import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import StatusBadge from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/liquidityUtils';
import { calculateOrderReconciliation } from '@/lib/reconciliationUtils';

export default function ConfirmedOrders() {
  const navigate = useNavigate();

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list()
  });
  const { data: blocks = [], isLoading: blocksLoading } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoiceRecords'], queryFn: () => base44.entities.InvoiceRecord.list()
  });

  const isLoading = ordersLoading || blocksLoading || invoicesLoading;

  const enriched = orders.map(order => {
    const orderBlocks = blocks.filter(b => b.confirmed_order_id === order.id);
    const orderInvoices = invoices.filter(i => i.confirmed_order_id === order.id);
    const recon = calculateOrderReconciliation(order, orderBlocks, orderInvoices);
    return { ...order, recon, blockCount: orderBlocks.length, invoiceCount: orderInvoices.length };
  });

  const totalOrderValue = enriched.reduce((s, o) => s + o.recon.total_order_net, 0);
  const totalInvoiced = enriched.reduce((s, o) => s + o.recon.adjusted_invoiced_net, 0);
  const totalOpen = enriched.reduce((s, o) => s + o.recon.total_open_to_invoice, 0);
  const criticalCount = enriched.filter(o => o.recon.reconciliation_status === 'critical').length;
  const warningCount = enriched.filter(o => o.recon.reconciliation_status === 'warning').length;

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-4 gap-4">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auftragsbestätigungen"
        subtitle={`${orders.length} Aufträge`}
        icon={ClipboardList}
        actions={
          <Button onClick={() => navigate('/confirmed-orders/new')}>
            <Plus className="w-4 h-4 mr-1" /> Neue AB
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Gesamt Auftragsvolumen" value={formatCurrency(totalOrderValue)} variant="info" />
        <KpiCard title="Bereits verrechnet" value={formatCurrency(totalInvoiced)} variant="success" />
        <KpiCard title="Noch zu verrechnen" value={formatCurrency(totalOpen)} variant="warning" />
        <KpiCard title="Probleme" value={`${criticalCount} kritisch / ${warningCount} Warnung`}
          variant={criticalCount > 0 ? 'destructive' : warningCount > 0 ? 'warning' : 'default'} />
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-3 font-medium text-muted-foreground">Kunde</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Projekt / AB-Nr.</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Auftragssumme</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Pakete</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Verrechnet</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Offen</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Abstimmung</th>
            </tr>
          </thead>
          <tbody>
            {enriched.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Noch keine Auftragsbestätigungen</td></tr>
            ) : (
              enriched.map(order => (
                <tr
                  key={order.id}
                  className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/confirmed-orders/${order.id}`)}
                >
                  <td className="p-3 font-medium">{order.customer}</td>
                  <td className="p-3">
                    <p>{order.project_name}</p>
                    {order.order_number && <p className="text-xs text-muted-foreground">{order.order_number}</p>}
                  </td>
                  <td className="p-3 text-right font-semibold">{formatCurrency(order.recon.total_order_net)}</td>
                  <td className="p-3 text-right">
                    <span className={order.blockCount === 0 ? 'text-amber-600' : ''}>
                      {order.blockCount}
                      {Math.abs(order.recon.difference_order_vs_blocks) > 1 && (
                        <span className="ml-1 text-amber-500" title="Differenz zu Auftrag">⚠</span>
                      )}
                    </span>
                  </td>
                  <td className="p-3 text-right text-emerald-600">{formatCurrency(order.recon.adjusted_invoiced_net)}</td>
                  <td className="p-3 text-right text-amber-600 font-medium">{formatCurrency(order.recon.total_open_to_invoice)}</td>
                  <td className="p-3"><StatusBadge status={order.status} /></td>
                  <td className="p-3">
                    {order.recon.reconciliation_status === 'balanced'
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      : order.recon.reconciliation_status === 'critical'
                        ? <AlertTriangle className="w-4 h-4 text-red-500" />
                        : <AlertTriangle className="w-4 h-4 text-amber-500" />
                    }
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}