import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { GitMerge, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/liquidityUtils';
import { matchInvoiceToOrder } from '@/lib/reconciliationUtils';

const MATCH_STATUS_LABELS = {
  auto_matched: 'Auto',
  manually_matched: 'Manuell',
  unmatched: 'Offen',
  disputed: 'Strittig',
};

const MATCH_STATUS_COLORS = {
  auto_matched: 'bg-emerald-100 text-emerald-700',
  manually_matched: 'bg-blue-100 text-blue-700',
  unmatched: 'bg-red-100 text-red-700',
  disputed: 'bg-amber-100 text-amber-700',
};

export default function InvoiceMatchingReview() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');

  const { data: invoices = [], isLoading: invLoading } = useQuery({
    queryKey: ['invoiceRecords'], queryFn: () => base44.entities.InvoiceRecord.list()
  });
  const { data: orders = [], isLoading: ordLoading } = useQuery({
    queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list()
  });
  const { data: blocks = [] } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.InvoiceRecord.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoiceRecords'] })
  });

  const isLoading = invLoading || ordLoading;

  const ordersById = Object.fromEntries(orders.map(o => [o.id, o]));
  const blocksById = Object.fromEntries(blocks.map(b => [b.id, b]));

  // Auto-suggest for unmatched invoices
  const suggestions = invoices.map(inv => {
    if (inv.match_status !== 'unmatched') return { inv, suggestion: null };
    const suggestion = matchInvoiceToOrder(inv, orders, blocks);
    return { inv, suggestion };
  });

  const filtered = suggestions.filter(({ inv }) => {
    if (filter === 'unmatched') return inv.match_status === 'unmatched';
    if (filter === 'disputed') return inv.match_status === 'disputed';
    if (filter === 'matched') return inv.match_status === 'auto_matched' || inv.match_status === 'manually_matched';
    return true;
  });

  const unmatchedCount = invoices.filter(i => i.match_status === 'unmatched').length;
  const disputedCount = invoices.filter(i => i.match_status === 'disputed').length;
  const matchedCount = invoices.filter(i => i.match_status !== 'unmatched' && i.match_status !== 'disputed').length;

  const handleAcceptSuggestion = (inv, suggestion) => {
    updateMutation.mutate({
      id: inv.id,
      data: {
        confirmed_order_id: suggestion.order?.id || null,
        billing_block_id: suggestion.block?.id || null,
        match_status: 'manually_matched',
        match_confidence: suggestion.confidence,
        match_notes: suggestion.reason,
      }
    });
  };

  const handleManualOrderLink = (inv, orderId) => {
    updateMutation.mutate({
      id: inv.id,
      data: {
        confirmed_order_id: orderId || null,
        match_status: orderId ? 'manually_matched' : 'unmatched',
        match_confidence: orderId ? 100 : 0,
        match_notes: orderId ? 'Manuell zugeordnet' : '',
      }
    });
  };

  const handleMarkDisputed = (inv) => {
    updateMutation.mutate({ id: inv.id, data: { match_status: 'disputed' } });
  };

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64" />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rechnungszuordnung"
        subtitle="Rechnungen Auftragsbestätigungen und Paketen zuordnen"
        icon={GitMerge}
      />

      <div className="grid grid-cols-3 gap-4">
        <KpiCard title="Nicht zugeordnet" value={unmatchedCount} variant={unmatchedCount > 0 ? 'destructive' : 'default'} />
        <KpiCard title="Strittig" value={disputedCount} variant={disputedCount > 0 ? 'warning' : 'default'} />
        <KpiCard title="Zugeordnet" value={matchedCount} variant="success" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[['all', 'Alle'], ['unmatched', 'Nicht zugeordnet'], ['disputed', 'Strittig'], ['matched', 'Zugeordnet']].map(([v, l]) => (
          <Button
            key={v}
            size="sm"
            variant={filter === v ? 'default' : 'outline'}
            onClick={() => setFilter(v)}
          >
            {l}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border rounded-xl">Keine Rechnungen in dieser Kategorie</div>
        ) : (
          filtered.map(({ inv, suggestion }) => {
            const linkedOrder = ordersById[inv.confirmed_order_id];
            const linkedBlock = blocksById[inv.billing_block_id];
            return (
              <div key={inv.id} className="border rounded-xl p-4 bg-card space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{inv.invoice_number || '(Ohne Nr.)'}</p>
                      {inv.is_credit_note && <Badge className="text-xs bg-purple-100 text-purple-700">Gutschrift</Badge>}
                      <Badge className={`text-xs ${MATCH_STATUS_COLORS[inv.match_status] || ''}`}>
                        {MATCH_STATUS_LABELS[inv.match_status] || inv.match_status}
                        {inv.match_confidence > 0 && ` · ${inv.match_confidence}%`}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {inv.customer_name} · {inv.invoice_date || '—'} · {formatCurrency(inv.net_amount)} netto
                    </p>
                    {inv.match_notes && <p className="text-xs text-muted-foreground italic mt-0.5">{inv.match_notes}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold">{formatCurrency(inv.gross_amount)}</p>
                    <p className="text-xs text-muted-foreground">brutto</p>
                  </div>
                </div>

                {/* Current linkage */}
                {linkedOrder && (
                  <div className="flex items-center gap-2 text-sm bg-emerald-50 rounded-lg px-3 py-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span>Verknüpft: <strong>{linkedOrder.project_name}</strong> ({linkedOrder.customer})</span>
                    {linkedBlock && <span className="text-muted-foreground">→ Paket: {linkedBlock.title}</span>}
                  </div>
                )}

                {/* Auto-suggestion for unmatched */}
                {inv.match_status === 'unmatched' && suggestion && suggestion.confidence >= 50 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium text-amber-800 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Vorschlag ({suggestion.confidence}% Konfidenz): {suggestion.reason}
                    </p>
                    {suggestion.order && (
                      <p className="text-sm text-amber-700">
                        → <strong>{suggestion.order.project_name}</strong> ({suggestion.order.customer})
                        {suggestion.block && <span> · Paket: {suggestion.block.title}</span>}
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-300 text-amber-800 hover:bg-amber-100"
                      onClick={() => handleAcceptSuggestion(inv, suggestion)}
                      disabled={updateMutation.isPending}
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Vorschlag übernehmen
                    </Button>
                  </div>
                )}

                {/* Manual assignment */}
                <div className="flex items-center gap-3">
                  <Select
                    value={inv.confirmed_order_id || ''}
                    onValueChange={(v) => handleManualOrderLink(inv, v)}
                  >
                    <SelectTrigger className="flex-1 h-8 text-xs">
                      <SelectValue placeholder="Auftrag manuell zuordnen…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>— Keine Zuordnung —</SelectItem>
                      {orders.map(o => (
                        <SelectItem key={o.id} value={o.id} className="text-xs">
                          {o.customer} · {o.project_name} {o.order_number ? `(${o.order_number})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {inv.match_status !== 'disputed' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-amber-600 hover:bg-amber-50 text-xs"
                      onClick={() => handleMarkDisputed(inv)}
                      disabled={updateMutation.isPending}
                    >
                      Als strittig markieren
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}