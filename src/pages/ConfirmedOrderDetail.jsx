import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, ClipboardList, AlertTriangle, CheckCircle2, ExternalLink,
  Plus, FolderKanban
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { calculateOrderReconciliation } from '@/lib/reconciliationUtils';
import InvoiceScanUploader from '@/components/orders/InvoiceScanUploader';
import InvoiceRecordForm from '@/components/orders/InvoiceRecordForm';

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

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });
  const linkedProject = projects.find(p => p.id === order?.project_id);

  const saveInvoiceMutation = useMutation({
    mutationFn: ({ id, data }) => id
      ? base44.entities.InvoiceRecord.update(id, data)
      : base44.entities.InvoiceRecord.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoiceRecords'] });
      setEditingInvoice(null);
    }
  });

  const isLoading = ordersLoading || blocksLoading || invoicesLoading;

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-4 gap-4">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );

  if (!order) return (
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/confirmed-orders')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <PageHeader
          title={order.project_name}
          subtitle={`${order.customer}${order.order_number ? ` · ${order.order_number}` : ''} · Auftragsbestätigung`}
          icon={ClipboardList}
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge status={order.status} />
              {linkedProject ? (
                <Link to={`/projects/${linkedProject.id}`}>
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                    <FolderKanban className="w-3.5 h-3.5" />
                    Projekt-Cockpit öffnen
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground px-2 py-1 border rounded-md">
                  Kein Projekt-Cockpit verknüpft
                </span>
              )}
            </div>
          }
        />
      </div>

      {/* Reconciliation warnings */}
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

      {/* Commercial KPIs */}
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
            <p className={`text-xl font-bold mt-1 ${reconColor}`}>{formatCurrency(recon.total_open_to_invoice)}</p>
            <p className={`text-xs font-medium mt-0.5 ${reconColor}`}>
              {recon.reconciliation_status === 'balanced' ? '✓ Ausgeglichen' : recon.reconciliation_status === 'warning' ? '⚠ Warnung' : '✗ Kritisch'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">

          {/* Commercial Billing Blocks */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Auftragspakete — Kaufmännische Definition ({orderBlocks.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {orderBlocks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Keine Pakete definiert. Pakete werden im Projekt-Cockpit operativ verwaltet.
                </p>
              ) : (
                <div className="space-y-2">
                  {orderBlocks.map(block => (
                    <div key={block.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/20 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{block.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">{block.billing_month || '—'}</span>
                          {block.planned_invoice_date && (
                            <span className="text-xs text-muted-foreground">{block.planned_invoice_date}</span>
                          )}
                          <Badge className={`text-xs ${block.invoice_readiness_status === 'ready' ? 'bg-emerald-100 text-emerald-700' : block.invoice_readiness_status === 'invoiced' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                            {READINESS_LABELS[block.invoice_readiness_status] || '—'}
                          </Badge>
                        </div>
                        {block.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{block.notes}</p>}
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="font-bold text-sm">{formatCurrency(block.amount_net)}</p>
                        {block.amount_gross > 0 && (
                          <p className="text-xs text-muted-foreground">{formatCurrency(block.amount_gross)} brutto</p>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t text-sm">
                    <span className="text-muted-foreground font-medium">Summe Pakete</span>
                    <span className="font-bold">{formatCurrency(recon.sum_billing_blocks_net)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoice log — compact reference only */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Rechnungsübersicht ({orderInvoices.length})</CardTitle>
              <div className="flex items-center gap-2">
                {linkedProject && (
                  <Link to={`/projects/${linkedProject.id}`}>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-primary">
                      Alle Details im Cockpit →
                    </Button>
                  </Link>
                )}
                {!showInvoiceUploader && !editingInvoice && (
                  <Button size="sm" variant="outline" onClick={() => setShowInvoiceUploader(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Rechnung erfassen
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {showInvoiceUploader && (
                <div className="mb-4 p-4 border rounded-xl bg-muted/30">
                  <InvoiceScanUploader
                    confirmedOrderId={orderId}
                    customerName={order.customer}
                    billingBlocks={orderBlocks}
                    onSaved={() => { queryClient.invalidateQueries({ queryKey: ['invoiceRecords'] }); setShowInvoiceUploader(false); }}
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
                <p className="text-sm text-muted-foreground text-center py-4">Keine Rechnungen verknüpft</p>
              ) : (
                <div className="space-y-1.5">
                  {orderInvoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-lg border hover:bg-muted/20 text-sm">
                      <div>
                        <span className="font-medium">{inv.invoice_number || '—'}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{inv.invoice_date || ''}</span>
                        {inv.is_credit_note && <Badge className="text-xs ml-2 bg-purple-100 text-purple-700">Gutschrift</Badge>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{formatCurrency(inv.net_amount)}</span>
                        <StatusBadge status={inv.payment_status} />
                        <Button variant="ghost" size="sm" className="h-6 text-xs"
                          onClick={() => { setEditingInvoice(inv); setShowInvoiceUploader(false); }}>
                          Bearb.
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t text-sm font-medium">
                    <span className="text-muted-foreground">Bezahlt</span>
                    <span className="text-emerald-600">{formatCurrency(recon.total_paid)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-muted-foreground">Offene Forderung (brutto)</span>
                    <span>{formatCurrency(recon.total_open_receivable)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Linked project cockpit */}
          <Card className={`border-2 ${linkedProject ? 'border-primary/20' : 'border-dashed border-muted'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-primary" />
                Projekt-Cockpit
              </CardTitle>
            </CardHeader>
            <CardContent>
              {linkedProject ? (
                <div className="space-y-2">
                  <div>
                    <p className="font-medium text-sm">{linkedProject.project_name}</p>
                    <p className="text-xs text-muted-foreground">{linkedProject.customer}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={linkedProject.status} />
                  </div>
                  <Link to={`/projects/${linkedProject.id}`} className="block mt-2">
                    <Button size="sm" className="w-full h-8 text-xs gap-1.5">
                      <FolderKanban className="w-3.5 h-3.5" />
                      Cockpit öffnen
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-sm text-muted-foreground">Kein Projekt-Cockpit verknüpft</p>
                  <p className="text-xs text-muted-foreground mt-1">Verknüpfe diese AB mit einem internen Projekt über das Projekt-Cockpit.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Commercial order metadata */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Auftragsbestätigung — Kommerziell</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Auftragsnr.</span><span className="font-medium">{order.order_number || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Bestätigt am</span><span>{order.confirmation_date || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">PM</span><span>{order.responsible_project_manager || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Zahlungsbedingungen</span><span className="text-right max-w-[140px] text-xs">{order.payment_terms || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Quelle</span><span>{order.source_type || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">MwSt.</span><span>{order.vat_rate || 20}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Brutto</span><span className="font-semibold">{formatCurrency(order.total_gross_amount)}</span></div>
              {order.notes && <div className="pt-2 border-t"><p className="text-xs text-muted-foreground">{order.notes}</p></div>}
            </CardContent>
          </Card>

          {/* awork reference (read-only) */}
          {order.awork_project_id && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">a</span>
                  </div>
                  awork Projekt
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <p className="font-medium">{order.awork_project_name}</p>
                {order.awork_project_status && (
                  <p className="text-xs text-muted-foreground">{order.awork_project_status}</p>
                )}
                {order.awork_progress_percent > 0 && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${order.awork_progress_percent}%` }} />
                    </div>
                    <span className="text-xs">{order.awork_progress_percent}%</span>
                  </div>
                )}
                {linkedProject && (
                  <Link to={`/projects/${linkedProject.id}`} className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
                    <FolderKanban className="w-3 h-3" /> awork-Details im Cockpit verwalten
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          {order.document_url && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Dokument</CardTitle></CardHeader>
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