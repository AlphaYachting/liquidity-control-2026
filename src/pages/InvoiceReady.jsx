import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, ExternalLink, Info, AlertTriangle, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format } from 'date-fns';

const STATUS_CFG = {
  draft:                { label: 'Entwurf',                color: 'bg-gray-100 text-gray-600' },
  ready_for_backoffice: { label: 'Bereit für Backoffice',  color: 'bg-emerald-100 text-emerald-700' },
  sent_to_backoffice:   { label: 'An Backoffice gesendet', color: 'bg-blue-100 text-blue-700' },
  invoice_created:      { label: 'Rechnung erstellt',      color: 'bg-purple-100 text-purple-700' },
  paid:                 { label: 'Bezahlt',                color: 'bg-teal-100 text-teal-700' },
  blocked:              { label: 'Blockiert',              color: 'bg-red-100 text-red-700' },
  cancelled:            { label: 'Storniert',              color: 'bg-gray-200 text-gray-500' },
};

const INVOICE_TYPE_LABELS = {
  advance_invoice: 'Anzahlung',
  partial_invoice: 'Teilrechnung',
  final_invoice:   'Schlussrechnung',
  correction:      'Korrektur',
  credit_note:     'Gutschrift',
};

const TYPE_LABELS = {
  package_based: 'Paket',
  percentage_based: 'Prozentual',
  manual_amount: 'Frei',
};

const BACKOFFICE_STATUSES_SHOWN = ['draft', 'ready_for_backoffice', 'sent_to_backoffice', 'invoice_created', 'blocked', 'paid', 'cancelled'];

export default function InvoiceReady() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [filters, setFilters] = useState({ status: '', pm: '', customer: '', invoice_type: '' });

  const { data: instructions = [], isLoading: i1 } = useQuery({
    queryKey: ['billingInstructions'],
    queryFn: () => base44.entities.BillingInstruction.list()
  });
  const { data: projects = [], isLoading: i2 } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });
  const { data: orders = [], isLoading: i3 } = useQuery({
    queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list()
  });
  const { data: blocks = [] } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BillingInstruction.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billingInstructions'] })
  });

  const isLoading = i1 || i2 || i3;

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const orderMap = Object.fromEntries(orders.map(o => [o.id, o]));
  const blockMap = Object.fromEntries(blocks.map(b => [b.id, b]));

  // Only show actionable statuses
  const actionable = instructions.filter(i => BACKOFFICE_STATUSES_SHOWN.includes(i.status));

  const filtered = actionable.filter(i => {
    if (filters.status && i.status !== filters.status) return false;
    if (filters.pm && !(i.requested_by_pm || '').toLowerCase().includes(filters.pm.toLowerCase())) return false;
    if (filters.customer && !(i.customer_name || '').toLowerCase().includes(filters.customer.toLowerCase())) return false;
    if (filters.invoice_type && i.invoice_type !== filters.invoice_type) return false;
    return true;
  });

  const readyCount = actionable.filter(i => i.status === 'ready_for_backoffice').length;
  const readyAmount = actionable.filter(i => i.status === 'ready_for_backoffice')
    .reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0);
  const sentCount = actionable.filter(i => i.status === 'sent_to_backoffice').length;
  const createdCount = actionable.filter(i => i.status === 'invoice_created').length;

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-3 gap-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abrechnungsanweisungen"
        subtitle="Anweisungen von PMs an das Backoffice zur Rechnungserstellung"
        icon={CheckSquare}
      />

      <Alert className="border-blue-200 bg-blue-50">
        <Info className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-xs">
          Diese Ansicht zeigt <strong>Abrechnungsanweisungen</strong> von Projektmanagern an das Backoffice.
          Anweisungen werden im <strong>Projekt-Cockpit</strong> erstellt (Abschnitt "Abrechnung & Liquidität").
        </AlertDescription>
      </Alert>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard title="Bereit für Backoffice" value={formatCurrency(readyAmount)}
          subtitle={`${readyCount} Anweisung(en)`} variant="success" />
        <KpiCard title="An Backoffice gesendet" value={`${sentCount} Anweisung(en)`}
          subtitle="" variant="warning" />
        <KpiCard title="Rechnung erstellt" value={`${createdCount} Anweisung(en)`}
          subtitle="" variant="info" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={filters.status || 'all'} onValueChange={v => setFilters(f => ({ ...f, status: v === 'all' ? '' : v }))}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Alle Status</SelectItem>
            {BACKOFFICE_STATUSES_SHOWN.map(s => (
              <SelectItem key={s} value={s} className="text-xs">{STATUS_CFG[s]?.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.invoice_type || 'all'} onValueChange={v => setFilters(f => ({ ...f, invoice_type: v === 'all' ? '' : v }))}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Rechnungstyp" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Alle Typen</SelectItem>
            {Object.entries(INVOICE_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Kunde filtern..." value={filters.customer}
          onChange={e => setFilters(f => ({ ...f, customer: e.target.value }))}
          className="h-8 text-xs w-40" />
        <Input placeholder="PM filtern..." value={filters.pm}
          onChange={e => setFilters(f => ({ ...f, pm: e.target.value }))}
          className="h-8 text-xs w-36" />
        {Object.values(filters).some(Boolean) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs"
            onClick={() => setFilters({ status: '', pm: '', customer: '', invoice_type: '' })}>
            Zurücksetzen
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Keine Abrechnungsanweisungen gefunden.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(instr => {
            const sc = STATUS_CFG[instr.status] || STATUS_CFG.draft;
            const project = projectMap[instr.project_id];
            const order = orderMap[instr.confirmed_order_id];
            const linkedBlock = blockMap[instr.billing_block_id];
            const isExpanded = expandedId === instr.id;

            return (
              <Card key={instr.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4 px-5">
                  <div className="flex flex-col md:flex-row md:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={sc.color}>{sc.label}</Badge>
                        <Badge variant="outline" className="text-xs">{TYPE_LABELS[instr.instruction_type] || '—'}</Badge>
                        <Badge variant="outline" className="text-xs">{INVOICE_TYPE_LABELS[instr.invoice_type] || '—'}</Badge>
                        {instr.additional_billing_percent > 0 && (
                          <span className="text-xs text-muted-foreground">+{Math.round(instr.additional_billing_percent)}%</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold">{instr.customer_name || '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {instr.project_name}
                        {order?.order_number && ` · AB ${order.order_number}`}
                        {instr.requested_by_pm && ` · PM: ${instr.requested_by_pm}`}
                        {instr.assigned_backoffice_user && ` · BO: ${instr.assigned_backoffice_user}`}
                      </p>
                      {instr.planned_invoice_date && (
                        <p className="text-xs text-muted-foreground mt-0.5">📅 Geplant: {instr.planned_invoice_date}</p>
                      )}
                      {instr.invoice_reason && (
                        <p className="text-xs text-amber-700 mt-0.5 font-medium truncate">Grund: {instr.invoice_reason}</p>
                      )}
                      {linkedBlock && (
                        <p className="text-xs text-muted-foreground mt-0.5">📦 {linkedBlock.title}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        <p className="font-bold text-base">{formatCurrency(instr.instruction_amount_net)}</p>
                        <p className="text-xs text-muted-foreground">netto</p>
                        {instr.instruction_amount_gross > 0 && (
                          <p className="text-xs text-muted-foreground">{formatCurrency(instr.instruction_amount_gross)} brutto</p>
                        )}
                      </div>

                      <Select value={instr.status} onValueChange={v => updateMutation.mutate({
                        id: instr.id, data: { status: v,
                          ...(v === 'sent_to_backoffice' ? { sent_to_backoffice_at: new Date().toISOString() } : {}),
                          ...(v === 'invoice_created' ? { invoice_created_at: new Date().toISOString() } : {}),
                        }
                      })}>
                        <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_CFG).map(([v, { label }]) => (
                            <SelectItem key={v} value={v} className="text-xs">{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => navigate(`/projects/${instr.project_id}`)}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>

                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => setExpandedId(isExpanded ? null : instr.id)}>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                        <div>
                          <p className="text-muted-foreground font-medium">Auftragswert netto</p>
                          <p>{formatCurrency(instr.total_order_net)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground font-medium">Bereits abgerechnet</p>
                          <p>{formatCurrency(instr.already_invoiced_net)} ({Math.round(instr.previous_billing_percent || 0)}%)</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground font-medium">Neuer Stand</p>
                          <p className="font-semibold">{Math.round(instr.new_billing_percent || 0)}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground font-medium">Leistungsfortschritt (Snapshot)</p>
                          <p>{instr.awork_progress_percent > 0 ? `${Math.round(instr.awork_progress_percent)}%` : '—'}</p>
                        </div>
                        {instr.linked_invoice_id && (
                          <div>
                            <p className="text-muted-foreground font-medium">Verknüpfte Rechnung</p>
                            <p className="text-primary">{instr.linked_invoice_id}</p>
                          </div>
                        )}
                        {instr.created_date && (
                          <div>
                            <p className="text-muted-foreground font-medium">Erstellt am</p>
                            <p>{format(new Date(instr.created_date), 'dd.MM.yyyy HH:mm')}</p>
                          </div>
                        )}
                      </div>

                      {instr.invoice_instruction_text && (
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">Rechnungstext / Anweisung</p>
                          <p className="text-xs mt-1 bg-white rounded-lg p-2 border">{instr.invoice_instruction_text}</p>
                        </div>
                      )}
                      {instr.backoffice_note && (
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">Backoffice-Notiz</p>
                          <p className="text-xs mt-1">{instr.backoffice_note}</p>
                        </div>
                      )}

                      {/* Payment terms from order */}
                      {order?.payment_terms && (
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">Zahlungsbedingungen (aus AB)</p>
                          <p className="text-xs mt-0.5">{order.payment_terms}</p>
                        </div>
                      )}

                      <div className="flex gap-2 pt-1 flex-wrap">
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => navigate(`/projects/${instr.project_id}`)}>
                          <ExternalLink className="w-3 h-3 mr-1" /> Im Cockpit öffnen
                        </Button>
                        {instr.status === 'ready_for_backoffice' && (
                          <Button size="sm" className="h-7 text-xs"
                            onClick={() => updateMutation.mutate({ id: instr.id, data: { status: 'sent_to_backoffice', sent_to_backoffice_at: new Date().toISOString() } })}>
                            ✓ Als gesendet markieren
                          </Button>
                        )}
                        {instr.status === 'sent_to_backoffice' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs border-purple-300 text-purple-700"
                            onClick={() => updateMutation.mutate({ id: instr.id, data: { status: 'invoice_created', invoice_created_at: new Date().toISOString() } })}>
                            ✓ Rechnung erstellt
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}