import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, AlertTriangle, CheckCircle2, AlertCircle, ExternalLink, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { calculateOrderReconciliation, calculateBillingBlockStatus } from '@/lib/reconciliationUtils';
import InvoiceRecordForm from '@/components/orders/InvoiceRecordForm';

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
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);

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
      setShowInvoiceForm(false);
      setEditingInvoice(null);
    }
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: (id) => base44.entities.InvoiceRecord.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoiceRecords'] })
  });

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

      {/* Warnings */}
      {recon.warnings.length > 0 && (
        <div className="space-y-2">
          {recon.warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

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
              <CardTitle className="text-base">Abrechnungspakete ({orderBlocks.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {orderBlocks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Keine Pakete verknüpft</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left pb-2 font-medium">Paket</th>
                        <th className="text-right pb-2 font-medium">Betrag</th>
                        <th className="text-left pb-2 font-medium pl-3">Monat</th>
                        <th className="text-left pb-2 font-medium pl-3">Arbeit</th>
                        <th className="text-left pb-2 font-medium pl-3">Rechnung</th>
                        <th className="text-right pb-2 font-medium">Noch offen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderBlocks.map(block => {
                        const blockInvoices = orderInvoices.filter(i => i.billing_block_id === block.id);
                        const bs = calculateBillingBlockStatus(block, blockInvoices);
                        return (
                          <tr key={block.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2">
                              <p className="font-medium">{block.title}</p>
                              {block.responsible_person && <p className="text-xs text-muted-foreground">{block.responsible_person}</p>}
                              {bs.is_overdue_to_invoice && (
                                <Badge className="text-xs bg-red-100 text-red-700 mt-0.5">Überfällig</Badge>
                              )}
                            </td>
                            <td className="py-2 text-right font-semibold">{formatCurrency(block.amount_net)}</td>
                            <td className="py-2 pl-3 text-muted-foreground">{block.billing_month || '—'}</td>
                            <td className="py-2 pl-3">
                              <Badge className={`text-xs ${block.work_status === 'completed' ? 'bg-emerald-100 text-emerald-700' : block.work_status === 'blocked' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                {WORK_STATUS_LABELS[block.work_status] || 'Nicht begonnen'}
                              </Badge>
                            </td>
                            <td className="py-2 pl-3">
                              <Badge className={`text-xs ${block.invoice_readiness_status === 'ready' ? 'bg-emerald-100 text-emerald-700' : block.invoice_readiness_status === 'invoiced' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                                {READINESS_LABELS[block.invoice_readiness_status] || '—'}
                              </Badge>
                            </td>
                            <td className="py-2 text-right">
                              {bs.remaining_to_invoice > 0
                                ? <span className="text-amber-600 font-medium">{formatCurrency(bs.remaining_to_invoice)}</span>
                                : <span className="text-emerald-600">✓</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoice Records */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Rechnungen ({orderInvoices.length})</CardTitle>
              <Button size="sm" onClick={() => { setEditingInvoice(null); setShowInvoiceForm(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Rechnung hinzufügen
              </Button>
            </CardHeader>
            <CardContent>
              {showInvoiceForm && (
                <div className="mb-4 p-4 border rounded-xl bg-muted/30">
                  <InvoiceRecordForm
                    invoice={editingInvoice}
                    confirmedOrderId={orderId}
                    billingBlocks={orderBlocks}
                    onSave={(data) => saveInvoiceMutation.mutate({ id: editingInvoice?.id, data })}
                    onCancel={() => { setShowInvoiceForm(false); setEditingInvoice(null); }}
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
                        <th className="text-right pb-2 font-medium">Bezahlt</th>
                        <th className="text-left pb-2 font-medium pl-2">Status</th>
                        <th className="text-left pb-2 font-medium pl-2">Matching</th>
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
                          <td className="py-2 pl-2"><StatusBadge status={inv.payment_status} /></td>
                          <td className="py-2 pl-2">
                            <div className="flex items-center gap-1">
                              <Badge className={`text-xs ${MATCH_COLORS[inv.match_status] || ''}`}>
                                {inv.match_confidence ? `${inv.match_confidence}%` : '?'}
                              </Badge>
                            </div>
                          </td>
                          <td className="py-2">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditingInvoice(inv); setShowInvoiceForm(true); }}>
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
                        <td colSpan={3}></td>
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
            <CardHeader className="pb-2"><CardTitle className="text-sm">Auftragsinfos</CardTitle></CardHeader>
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
    </div>
  );
}