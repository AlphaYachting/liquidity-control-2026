import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, ClipboardList, AlertTriangle, CheckCircle2, ExternalLink,
  FolderKanban, Link2, Info
} from 'lucide-react';
// Note: InvoiceRecordForm and InvoiceScanUploader removed — invoice management moved to Project Cockpit
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { calculateOrderReconciliation } from '@/lib/reconciliationUtils';
import OrderItemsTable from '@/components/orders/OrderItemsTable';

function ProjectPickerInline({ projects, order, orderBlocks, onLink, isSaving, onCancel }) {
  const [selectedId, setSelectedId] = React.useState('');
  const [alsoLinkBlocks, setAlsoLinkBlocks] = React.useState(false);

  const blocksWithoutProject = orderBlocks.filter(b => !b.project_id);
  const blocksWithDifferentProject = orderBlocks.filter(b => b.project_id && b.project_id !== selectedId);

  const activeProjects = projects.filter(p => p.status === 'active' || p.status === 'on_hold' || p.status === 'unclear');
  const selectedProject = projects.find(p => p.id === selectedId);

  return (
    <div className="border rounded-xl p-4 bg-white space-y-3">
      <p className="text-sm font-medium">Projekt-Cockpit auswählen:</p>
      <div className="max-h-48 overflow-y-auto space-y-1.5">
        {activeProjects.map(p => (
          <button key={p.id} onClick={() => setSelectedId(p.id)}
            className={`w-full text-left p-2 rounded-lg border text-sm transition-colors ${selectedId === p.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'}`}>
            <p className="font-medium">{p.project_name}</p>
            <p className="text-xs text-muted-foreground">{p.customer}{p.project_manager ? ` · PM: ${p.project_manager}` : ''}</p>
          </button>
        ))}
      </div>
      {selectedId && blocksWithoutProject.length > 0 && (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={alsoLinkBlocks} onChange={e => setAlsoLinkBlocks(e.target.checked)} className="rounded" />
          <span>Leistungspakete ({blocksWithoutProject.length}) ebenfalls diesem Projekt-Cockpit zuordnen</span>
        </label>
      )}
      {selectedId && blocksWithDifferentProject.length > 0 && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {blocksWithDifferentProject.length} Leistungspaket(e) sind bereits einem anderen internen Projekt zugeordnet. Diese werden nicht verändert.
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button size="sm" disabled={!selectedId || isSaving} onClick={() => onLink({ projectId: selectedId, alsoLinkBlocks })}>
          <CheckCircle2 className="w-4 h-4 mr-1" /> {isSaving ? 'Speichert…' : 'Verknüpfen'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Abbrechen</Button>
      </div>
    </div>
  );
}

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
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [linkingBlocks, setLinkingBlocks] = useState(false);
  // Ownership note: this page is the commercial source/document view.
  // Operative management (BillingBlocks, Invoices, awork) lives in Project Cockpit.

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

  // Extended invoice filter: confirmed_order_id OR billing_block_id belonging to this order
  // De-duplicated via Set to prevent double-counting
  const orderBlockIds = new Set(orderBlocks.map(b => b.id));
  const orderInvoiceIds = new Set();
  const orderInvoices = invoices.filter(i => {
    if (i.payment_status === 'cancelled') return false;
    const match = i.confirmed_order_id === orderId || (i.billing_block_id && orderBlockIds.has(i.billing_block_id));
    if (match) { orderInvoiceIds.add(i.id); return true; }
    return false;
  });

  const { data: orderItems = [] } = useQuery({
    queryKey: ['confirmedOrderItems', orderId],
    queryFn: () => base44.entities.ConfirmedOrderItem.filter({ confirmed_order_id: orderId })
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });
  const linkedProject = projects.find(p => p.id === order?.project_id);

  const linkProjectMutation = useMutation({
    mutationFn: async ({ projectId, alsoLinkBlocks }) => {
      await base44.entities.ConfirmedOrder.update(orderId, { project_id: projectId });
      if (alsoLinkBlocks) {
        const blocksToUpdate = orderBlocks.filter(b => !b.project_id);
        await Promise.all(blocksToUpdate.map(b =>
          base44.entities.ProjectBillingBlock.update(b.id, { project_id: projectId })
        ));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['confirmedOrders'] });
      queryClient.invalidateQueries({ queryKey: ['billingBlocks'] });
      setShowProjectPicker(false);
      setLinkingBlocks(false);
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

      {/* Missing project_id warning + active link flow */}
      {!order.project_id && (
        <div className="p-4 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Kein Projekt-Cockpit verknüpft</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Diese Auftragsbestätigung ist noch keinem Projekt-Cockpit zugeordnet. Dadurch können Rechnungen, Leistungspakete und Forecast-Werte im Projekt-Cockpit fehlen oder falsch erscheinen.
              </p>
            </div>
          </div>
          {!showProjectPicker ? (
            <Button size="sm" variant="outline" className="border-amber-400 text-amber-800 hover:bg-amber-100"
              onClick={() => setShowProjectPicker(true)}>
              <Link2 className="w-4 h-4 mr-1.5" /> Mit Projekt-Cockpit verknüpfen
            </Button>
          ) : (
            <ProjectPickerInline
              projects={projects}
              order={order}
              orderBlocks={orderBlocks}
              onLink={({ projectId, alsoLinkBlocks }) => linkProjectMutation.mutate({ projectId, alsoLinkBlocks })}
              isSaving={linkProjectMutation.isPending}
              onCancel={() => setShowProjectPicker(false)}
            />
          )}
        </div>
      )}

      {/* Ownership notice */}
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-lg">
        <Info className="w-3.5 h-3.5 flex-shrink-0" />
        Diese Ansicht ist die kaufmännische Auftragsbasis. Operative Bearbeitung (Pakete, Rechnungen, awork/eWork) erfolgt im Projekt-Cockpit.
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

          {/* Leistungsübersicht */}
          <OrderItemsTable items={orderItems} />

          {/* Billing Blocks — simplified reference */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Leistungspakete ({orderBlocks.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200 mb-3">
                <FolderKanban className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  Leistungspakete werden im <strong>Projekt-Cockpit</strong> verwaltet. Diese Ansicht ist die kaufmännische Auftragsbasis.
                </p>
              </div>
              {orderBlocks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Keine Pakete definiert.</p>
              ) : (
                <div className="space-y-1.5">
                  {orderBlocks.map(block => (
                    <div key={block.id} className="flex items-center justify-between p-2.5 rounded-lg border text-sm">
                      <span className="font-medium">{block.title}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground text-xs">{block.billing_month || '—'}</span>
                        <span className="font-semibold">{formatCurrency(block.amount_net)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t text-sm">
                    <span className="text-muted-foreground font-medium">Summe Pakete</span>
                    <span className="font-bold">{formatCurrency(recon.sum_billing_blocks_net)}</span>
                  </div>
                </div>
              )}
              {linkedProject && (
                <Link to={`/projects/${linkedProject.id}`} className="block mt-3">
                  <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5">
                    <FolderKanban className="w-3.5 h-3.5" />
                    Leistungspakete im Projekt-Cockpit öffnen →
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Invoices — reference only, managed in Cockpit */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rechnungsübersicht ({orderInvoices.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200 mb-3">
                <FolderKanban className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  Rechnungen und Teilrechnungen werden im <strong>Projekt-Cockpit</strong> erfasst und verwaltet.
                </p>
              </div>
              {orderInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Keine Rechnungen verknüpft</p>
              ) : (
                <div className="space-y-1.5">
                  {orderInvoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-lg border text-sm">
                      <div>
                        <span className="font-medium">{inv.invoice_number || '—'}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{inv.invoice_date || ''}</span>
                        {inv.is_credit_note && <Badge className="text-xs ml-2 bg-purple-100 text-purple-700">Gutschrift</Badge>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{formatCurrency(inv.net_amount)}</span>
                        <StatusBadge status={inv.payment_status} />
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t text-sm font-medium">
                    <span className="text-muted-foreground">Bezahlt</span>
                    <span className="text-emerald-600">{formatCurrency(recon.total_paid)}</span>
                  </div>
                </div>
              )}
              {linkedProject && (
                <Link to={`/projects/${linkedProject.id}`} className="block mt-3">
                  <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5">
                    <FolderKanban className="w-3.5 h-3.5" />
                    Rechnungen im Projekt-Cockpit öffnen →
                  </Button>
                </Link>
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

          {/* awork — reference only */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">a</span>
                </div>
                awork/eWork
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                awork/eWork wird im <strong>Projekt-Cockpit</strong> je Leistungspaket verwaltet.
              </p>
              {linkedProject && (
                <Link to={`/projects/${linkedProject.id}`} className="block mt-2">
                  <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1">
                    <FolderKanban className="w-3 h-3" /> awork/eWork im Projekt-Cockpit öffnen →
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

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