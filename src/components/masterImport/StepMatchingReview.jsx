import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle, Plus, Link2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  findProjectMatches, findOrderMatches, findInvoiceMatches,
  reconcileFinancials, formatCurrency, RECONCILIATION_COLORS, MATCH_STATUS_COLORS
} from '@/lib/masterImportUtils';

function ReconciliationBadge({ status }) {
  const labels = { balanced: 'OK', minor_difference: 'Kleine Diff.', warning: 'Warnung', critical: 'Kritisch', unchecked: '—' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RECONCILIATION_COLORS[status] || RECONCILIATION_COLORS.unchecked}`}>
      {labels[status] || status}
    </span>
  );
}

function RowDetail({ row, existingProjects, existingOrders, existingInvoices, decisions, onDecision }) {
  const projectMatches = useMemo(() => findProjectMatches(row, existingProjects), [row, existingProjects]);
  const matchedProjectId = decisions[row.row_number]?.project_id;
  const orderMatches = useMemo(() => findOrderMatches(row, existingOrders, matchedProjectId), [row, existingOrders, matchedProjectId]);
  const matchedOrderId = decisions[row.row_number]?.order_id;
  const invoiceMatches = useMemo(() => findInvoiceMatches(row, existingInvoices, matchedProjectId, matchedOrderId), [row, existingInvoices, matchedProjectId, matchedOrderId]);

  const appData = useMemo(() => {
    const matchedOrder = existingOrders.find(o => o.id === matchedOrderId);
    const matchedInvoices = invoiceMatches.filter(m => (decisions[row.row_number]?.invoice_ids || []).includes(m.invoice.id));
    return {
      order_total_net: matchedOrder?.total_net_amount || 0,
      invoiced_net: matchedInvoices.reduce((s, m) => s + (m.invoice.net_amount || 0), 0),
      open_to_invoice_net: 0,
    };
  }, [existingOrders, matchedOrderId, invoiceMatches, decisions, row.row_number]);

  const reconciliation = useMemo(() => reconcileFinancials(row, appData), [row, appData]);
  const dec = decisions[row.row_number] || {};

  return (
    <div className="bg-muted/30 border-t px-6 py-4 space-y-4">
      {/* Project matching */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Projektabgleich</p>
        {projectMatches.length === 0 ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Kein bestehendes Projekt gefunden.</span>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
              onClick={() => onDecision(row.row_number, { ...dec, project_action: 'create' })}>
              <Plus className="w-3 h-3" /> Neu anlegen
            </Button>
            {dec.project_action === 'create' && <span className="text-xs text-emerald-600 font-medium">✓ Wird neu angelegt</span>}
          </div>
        ) : (
          <div className="space-y-1.5">
            {projectMatches.slice(0, 2).map(m => (
              <div key={m.project.id} className={`flex items-center gap-3 p-2.5 rounded-lg border text-sm ${dec.project_id === m.project.id ? 'border-emerald-400 bg-emerald-50' : 'border-border bg-card'}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{m.project.project_name}</p>
                  <p className="text-xs text-muted-foreground">{m.project.customer} · {m.reason}</p>
                </div>
                <span className={`text-xs font-bold ${m.score >= 0.8 ? 'text-emerald-600' : m.score >= 0.6 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {Math.round(m.score * 100)}%
                </span>
                {dec.project_id === m.project.id
                  ? <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => onDecision(row.row_number, { ...dec, project_id: null })}>Lösen</Button>
                  : <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onDecision(row.row_number, { ...dec, project_id: m.project.id, project_action: 'link' })}>Verknüpfen</Button>
                }
              </div>
            ))}
            {!dec.project_id && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
                onClick={() => onDecision(row.row_number, { ...dec, project_action: 'create', project_id: null })}>
                <Plus className="w-3 h-3" /> Stattdessen neu anlegen
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Order matching */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Auftragsbestätigung</p>
        {orderMatches.length === 0 ? (
          <span className="text-sm text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Keine passende AB gefunden. Dokument hochladen oder Platzhalter erstellen.</span>
        ) : (
          <div className="space-y-1.5">
            {orderMatches.slice(0, 2).map(m => (
              <div key={m.order.id} className={`flex items-center gap-3 p-2.5 rounded-lg border text-sm ${dec.order_id === m.order.id ? 'border-emerald-400 bg-emerald-50' : 'border-border bg-card'}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{m.order.project_name || m.order.order_number}</p>
                  <p className="text-xs text-muted-foreground">{m.order.customer} · {formatCurrency(m.order.total_net_amount)} · {m.reason}</p>
                </div>
                <span className={`text-xs font-bold ${m.score >= 60 ? 'text-emerald-600' : m.score >= 40 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {m.score}%
                </span>
                {dec.order_id === m.order.id
                  ? <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => onDecision(row.row_number, { ...dec, order_id: null })}>Lösen</Button>
                  : <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onDecision(row.row_number, { ...dec, order_id: m.order.id })}>Verknüpfen</Button>
                }
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invoice matching */}
      {invoiceMatches.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Rechnungsabgleich</p>
          <div className="space-y-1">
            {invoiceMatches.map(m => {
              const linked = (dec.invoice_ids || []).includes(m.invoice.id);
              return (
                <div key={m.invoice.id} className={`flex items-center gap-3 p-2 rounded-lg border text-xs ${linked ? 'border-emerald-300 bg-emerald-50' : 'border-border'}`}>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{m.invoice.invoice_number || '—'}</span>
                    <span className="text-muted-foreground ml-2">{m.invoice.invoice_date} · {formatCurrency(m.invoice.net_amount)}</span>
                  </div>
                  <span className="text-muted-foreground">{m.score}% · {m.reason}</span>
                  <button
                    onClick={() => {
                      const ids = dec.invoice_ids || [];
                      const newIds = linked ? ids.filter(i => i !== m.invoice.id) : [...ids, m.invoice.id];
                      onDecision(row.row_number, { ...dec, invoice_ids: newIds });
                    }}
                    className={`flex-shrink-0 text-xs px-2 py-0.5 rounded border ${linked ? 'border-red-300 text-red-600' : 'border-primary text-primary'}`}>
                    {linked ? 'Lösen' : 'Verknüpfen'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reconciliation */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Finanzabgleich</p>
        <div className="grid grid-cols-3 gap-2">
          {reconciliation.checks.map(c => (
            <div key={c.label} className={`rounded-lg p-2.5 text-xs ${RECONCILIATION_COLORS[c.status]}`}>
              <p className="font-medium">{c.label}</p>
              <p className="mt-1">Excel: {formatCurrency(c.excel)}</p>
              <p>App: {formatCurrency(c.app)}</p>
              {c.diff > 0 && <p className="font-bold mt-0.5">Δ {formatCurrency(c.diff)}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function StepMatchingReview({ rows, existingProjects, existingOrders, existingInvoices, onConfirm }) {
  const [expanded, setExpanded] = useState({});
  const [decisions, setDecisions] = useState({});
  const [filter, setFilter] = useState('all');

  function onDecision(rowNum, dec) {
    setDecisions(prev => ({ ...prev, [rowNum]: dec }));
  }

  const filters = [
    { key: 'all', label: 'Alle' },
    { key: 'no_project', label: 'Kein Projekt' },
    { key: 'no_order', label: 'Keine AB' },
    { key: 'critical', label: 'Kritisch' },
  ];

  const filteredRows = rows.filter(row => {
    if (filter === 'no_project') return !decisions[row.row_number]?.project_id;
    if (filter === 'no_order') return !decisions[row.row_number]?.order_id;
    return true;
  });

  const confirmedCount = rows.filter(r => decisions[r.row_number]?.project_id || decisions[r.row_number]?.project_action === 'create').length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Schritt 4–9: Abgleich & Review</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Jede Zeile zeigt vorgeschlagene Verknüpfungen zu bestehenden Projekten, ABs und Rechnungen.
          Klicke eine Zeile auf um Details zu sehen und Entscheidungen zu treffen.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {filters.map(f => (
          <button key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filter === f.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{confirmedCount}/{rows.length} Entscheidungen getroffen</span>
      </div>

      <div className="border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 bg-muted px-4 py-2 text-xs font-medium text-muted-foreground gap-2">
          <span className="col-span-3">Kunde / Projekt</span>
          <span className="col-span-1">PM</span>
          <span className="col-span-1">Excel Auftrag</span>
          <span className="col-span-1">Excel Offen</span>
          <span className="col-span-2">Projekt-Match</span>
          <span className="col-span-2">AB-Match</span>
          <span className="col-span-1">Finanz</span>
          <span className="col-span-1"></span>
        </div>

        {filteredRows.length === 0 && (
          <div className="text-center py-10 text-sm text-muted-foreground">Keine Zeilen für diesen Filter.</div>
        )}

        <div className="divide-y">
          {filteredRows.map(row => {
            const isExpanded = expanded[row.row_number];
            const dec = decisions[row.row_number] || {};
            const projMatches = findProjectMatches(row, existingProjects);
            const topProj = projMatches[0];
            const orderMatches = findOrderMatches(row, existingOrders, dec.project_id);
            const topOrder = orderMatches[0];

            return (
              <div key={row.row_number}>
                <div
                  className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm hover:bg-muted/20 cursor-pointer"
                  onClick={() => setExpanded(prev => ({ ...prev, [row.row_number]: !prev[row.row_number] }))}>
                  <div className="col-span-3 min-w-0">
                    <p className="font-medium truncate">{row.customer_name_normalized || row.customer_name_raw || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">{row.project_name_raw || '—'}</p>
                  </div>
                  <span className="col-span-1 text-xs text-muted-foreground truncate">{row.project_manager || '—'}</span>
                  <span className="col-span-1 text-xs font-medium">{formatCurrency(row.total_order_amount_net)}</span>
                  <span className="col-span-1 text-xs">{formatCurrency(row.open_amount_net)}</span>
                  <div className="col-span-2 min-w-0">
                    {dec.project_id
                      ? <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Verknüpft</span>
                      : dec.project_action === 'create'
                      ? <span className="text-xs text-blue-600 flex items-center gap-1"><Plus className="w-3 h-3" /> Neu</span>
                      : topProj
                      ? <span className="text-xs text-amber-600">{Math.round(topProj.score * 100)}% Vorschlag</span>
                      : <span className="text-xs text-red-500 flex items-center gap-1"><XCircle className="w-3 h-3" /> Kein Match</span>}
                  </div>
                  <div className="col-span-2 min-w-0">
                    {dec.order_id
                      ? <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Verknüpft</span>
                      : topOrder
                      ? <span className="text-xs text-amber-600">{topOrder.score}% Vorschlag</span>
                      : <span className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Fehlt</span>}
                  </div>
                  <div className="col-span-1">
                    <ReconciliationBadge status="unchecked" />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>
                {isExpanded && (
                  <RowDetail
                    row={row}
                    existingProjects={existingProjects}
                    existingOrders={existingOrders}
                    existingInvoices={existingInvoices}
                    decisions={decisions}
                    onDecision={onDecision}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Button onClick={() => onConfirm(decisions)} className="gap-2">
        Abgleich abschließen & Import vorbereiten
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}