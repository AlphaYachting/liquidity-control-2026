import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, ExternalLink, Info, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import FilterBar from '@/components/shared/FilterBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, getMonthLabel, MONTHS_2026 } from '@/lib/liquidityUtils';
import { Alert, AlertDescription } from '@/components/ui/alert';

const READINESS_LABELS = {
  not_ready:   { label: 'Nicht bereit',      color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'In Bearbeitung',    color: 'bg-blue-100 text-blue-700' },
  ready:       { label: 'Abrechnungsbereit', color: 'bg-emerald-100 text-emerald-700' },
  invoiced:    { label: 'Verrechnet',        color: 'bg-purple-100 text-purple-700' },
  paid:        { label: 'Bezahlt',           color: 'bg-teal-100 text-teal-700' },
};

const BACKOFFICE_LABELS = {
  not_ready:            { label: 'Nicht bereit',           color: 'bg-gray-100 text-gray-600' },
  ready_for_backoffice: { label: 'Bereit für Backoffice',  color: 'bg-emerald-100 text-emerald-700' },
  sent_to_backoffice:   { label: 'An Backoffice gesendet', color: 'bg-blue-100 text-blue-700' },
  invoice_created:      { label: 'Rechnung erstellt',      color: 'bg-purple-100 text-purple-700' },
  paid:                 { label: 'Bezahlt',                color: 'bg-teal-100 text-teal-700' },
  blocked:              { label: 'Blockiert',              color: 'bg-red-100 text-red-700' },
};

const INVOICE_TYPE_LABELS = {
  advance_invoice: 'Anzahlung',
  partial_invoice: 'Teilrechnung',
  final_invoice:   'Schlussrechnung',
  correction:      'Korrektur',
  credit_note:     'Gutschrift',
};

const AWORK_SIGNAL_LABELS = {
  ready_candidate: { label: 'Bereit (awork)',  color: 'bg-emerald-100 text-emerald-700' },
  likely_ready:    { label: 'Wahrsch. bereit', color: 'bg-blue-100 text-blue-700' },
  review_needed:   { label: 'Überprüfen',      color: 'bg-amber-100 text-amber-700' },
  blocked:         { label: 'Blockiert',       color: 'bg-red-100 text-red-700' },
};

const CURRENT_MONTH = '2026-05';

function isBlockActionable(block) {
  return (
    block.invoice_readiness_status === 'ready' ||
    block.invoice_readiness_status === 'in_progress' ||
    block.backoffice_status === 'ready_for_backoffice' ||
    block.backoffice_status === 'sent_to_backoffice' ||
    (block.awork_readiness_signal === 'ready_candidate') ||
    (block.planned_invoice_date && block.planned_invoice_date <= new Date().toISOString().slice(0, 10))
  );
}

export default function InvoiceReady() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ billing_month: '', readiness: '', backoffice: '' });
  const [expandedId, setExpandedId] = useState(null);

  const { data: blocks = [], isLoading: b1 } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });
  const { data: projects = [], isLoading: b2 } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });
  const { data: orders = [], isLoading: b3 } = useQuery({
    queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list()
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProjectBillingBlock.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billingBlocks'] })
  });

  const isLoading = b1 || b2 || b3;

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const orderMap = Object.fromEntries(orders.map(o => [o.id, o]));

  const enriched = blocks
    .map(b => ({ ...b, project: projectMap[b.project_id], order: orderMap[b.confirmed_order_id] }))
    .filter(isBlockActionable);

  const filtered = enriched.filter(b => {
    if (filters.billing_month && b.billing_month !== filters.billing_month) return false;
    if (filters.readiness && b.invoice_readiness_status !== filters.readiness) return false;
    if (filters.backoffice && b.backoffice_status !== filters.backoffice) return false;
    return true;
  });

  const readyForBackoffice = filtered.filter(b => b.backoffice_status === 'ready_for_backoffice' || b.invoice_readiness_status === 'ready');
  const sentToBackoffice = filtered.filter(b => b.backoffice_status === 'sent_to_backoffice');
  const invoiceCreated = filtered.filter(b => b.backoffice_status === 'invoice_created');

  const readyAmount = readyForBackoffice.reduce((s, b) => s + (Number(b.planned_invoice_amount) || Number(b.amount_net) || 0), 0);

  const MONTH_OPTIONS = MONTHS_2026.map(m => ({ value: m, label: getMonthLabel(m) }));
  const READINESS_OPTIONS = Object.entries(READINESS_LABELS).map(([v, { label }]) => ({ value: v, label }));
  const BACKOFFICE_OPTIONS = Object.entries(BACKOFFICE_LABELS).map(([v, { label }]) => ({ value: v, label }));

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
        subtitle="Abrechnungsreife Leistungspakete und Anweisungen an das Backoffice"
        icon={CheckSquare}
      />

      <Alert className="border-blue-200 bg-blue-50">
        <Info className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-xs">
          Diese Ansicht zeigt <strong>abrechnungsreife Leistungspakete</strong> und Anweisungen an das Backoffice.
          Pakete erscheinen hier wenn sie als bereit markiert sind, ein geplantes Rechnungsdatum haben oder awork einen Bereit-Status meldet.
          PM definiert die Anweisung im <strong>Projekt-Cockpit</strong> je Leistungspaket.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard title="Bereit / Zu senden" value={formatCurrency(readyAmount)}
          subtitle={`${readyForBackoffice.length} Paket(e)`} variant="success" />
        <KpiCard title="An Backoffice gesendet" value={`${sentToBackoffice.length} Paket(e)`}
          subtitle={formatCurrency(sentToBackoffice.reduce((s, b) => s + (Number(b.planned_invoice_amount) || Number(b.amount_net) || 0), 0))} variant="warning" />
        <KpiCard title="Rechnung erstellt" value={`${invoiceCreated.length} Paket(e)`}
          subtitle="" variant="info" />
      </div>

      <FilterBar
        filters={[
          { key: 'billing_month', label: 'Monat', options: MONTH_OPTIONS },
          { key: 'readiness', label: 'Abrechnungsstatus', options: READINESS_OPTIONS },
          { key: 'backoffice', label: 'Backoffice-Status', options: BACKOFFICE_OPTIONS },
        ]}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onReset={() => setFilters({ billing_month: '', readiness: '', backoffice: '' })}
      />

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Keine abrechnungsreifen Pakete gefunden.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(block => {
            const rl = READINESS_LABELS[block.invoice_readiness_status] || READINESS_LABELS.not_ready;
            const bl = BACKOFFICE_LABELS[block.backoffice_status] || BACKOFFICE_LABELS.not_ready;
            const aworkSignal = AWORK_SIGNAL_LABELS[block.awork_readiness_signal];
            const isExpanded = expandedId === block.id;
            const invoiceAmount = Number(block.planned_invoice_amount) || Number(block.amount_net) || 0;

            return (
              <Card key={block.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4 px-5">
                  {/* Main row */}
                  <div className="flex flex-col md:flex-row md:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-sm">{block.title}</p>
                        <Badge className={rl.color}>{rl.label}</Badge>
                        <Badge className={bl.color}>{bl.label}</Badge>
                        {block.invoice_type && (
                          <Badge variant="outline" className="text-xs">{INVOICE_TYPE_LABELS[block.invoice_type] || block.invoice_type}</Badge>
                        )}
                        {aworkSignal && (
                          <Badge className={`text-xs ${aworkSignal.color}`}>{aworkSignal.label}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <strong>{block.project?.customer || block.customer || '—'}</strong>
                        {block.project?.project_name && ` · ${block.project.project_name}`}
                        {block.order?.order_number && ` · AB ${block.order.order_number}`}
                        {block.responsible_person && ` · PM: ${block.responsible_person}`}
                        {block.assigned_backoffice_user && ` · BO: ${block.assigned_backoffice_user}`}
                      </p>
                      {block.planned_invoice_date && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          📅 Geplant: {block.planned_invoice_date}
                          {block.billing_month && ` · ${getMonthLabel(block.billing_month)}`}
                        </p>
                      )}
                      {block.invoice_reason && (
                        <p className="text-xs text-amber-700 mt-0.5 font-medium">Grund: {block.invoice_reason}</p>
                      )}
                      {block.invoice_instruction_text && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">„{block.invoice_instruction_text}"</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="font-bold text-base">{formatCurrency(invoiceAmount)}</p>
                        {block.planned_invoice_amount > 0 && block.planned_invoice_amount !== block.amount_net && (
                          <p className="text-xs text-muted-foreground">Paket: {formatCurrency(block.amount_net)}</p>
                        )}
                      </div>

                      {/* Backoffice status quick-action */}
                      <Select
                        value={block.backoffice_status || 'not_ready'}
                        onValueChange={v => updateMutation.mutate({ id: block.id, data: { backoffice_status: v } })}
                      >
                        <SelectTrigger className="w-44 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(BACKOFFICE_LABELS).map(([v, { label }]) => (
                            <SelectItem key={v} value={v} className="text-xs">{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => navigate(`/projects/${block.project_id}`)}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>

                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => setExpandedId(isExpanded ? null : block.id)}>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                        <div>
                          <p className="text-muted-foreground font-medium mb-1">Abrechnungsstatus</p>
                          <Select
                            value={block.invoice_readiness_status || 'not_ready'}
                            onValueChange={v => updateMutation.mutate({ id: block.id, data: { invoice_readiness_status: v } })}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(READINESS_LABELS).map(([v, { label }]) => (
                                <SelectItem key={v} value={v} className="text-xs">{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <p className="text-muted-foreground font-medium mb-1">Rechnungstyp</p>
                          <p>{INVOICE_TYPE_LABELS[block.invoice_type] || '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground font-medium mb-1">Geplanter Betrag</p>
                          <p className="font-semibold">{formatCurrency(block.planned_invoice_amount || block.amount_net)}</p>
                        </div>
                        {block.invoice_instruction_text && (
                          <div className="col-span-2 md:col-span-3">
                            <p className="text-muted-foreground font-medium mb-1">Rechnungstext / Anweisung</p>
                            <p className="bg-muted/40 rounded-lg p-2">{block.invoice_instruction_text}</p>
                          </div>
                        )}
                        {block.invoice_reason && (
                          <div className="col-span-2">
                            <p className="text-muted-foreground font-medium mb-1">Abrechnungsgrund</p>
                            <p>{block.invoice_reason}</p>
                          </div>
                        )}
                        {block.linked_invoice_id && (
                          <div>
                            <p className="text-muted-foreground font-medium mb-1">Verknüpfte Rechnung</p>
                            <p className="text-primary text-xs">{block.linked_invoice_id}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => navigate(`/projects/${block.project_id}`)}>
                          <ExternalLink className="w-3 h-3 mr-1" /> Im Cockpit öffnen
                        </Button>
                        {(block.backoffice_status === 'not_ready' || block.backoffice_status === 'ready_for_backoffice') && (
                          <Button size="sm" className="h-7 text-xs"
                            onClick={() => updateMutation.mutate({ id: block.id, data: { backoffice_status: 'sent_to_backoffice' } })}>
                            ✓ Als gesendet markieren
                          </Button>
                        )}
                        {block.backoffice_status === 'sent_to_backoffice' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs border-purple-300 text-purple-700"
                            onClick={() => updateMutation.mutate({ id: block.id, data: { backoffice_status: 'invoice_created' } })}>
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