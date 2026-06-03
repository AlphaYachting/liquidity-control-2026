import React, { useMemo, useState } from 'react';
import { ChevronRight, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/masterImportUtils';
import { normalizeCustomerName } from '@/lib/masterImportUtils';

const THRESH = { balanced: 1, minor: 5, warning: 50 };

function reconcileStatus(diff) {
  if (diff <= THRESH.balanced) return 'balanced';
  if (diff <= THRESH.minor) return 'minor';
  if (diff <= THRESH.warning) return 'warning';
  return 'critical';
}

const STATUS_COLORS = { balanced: 'text-emerald-600', minor: 'text-blue-600', warning: 'text-amber-600', critical: 'text-red-600' };
const STATUS_BG = { balanced: 'bg-emerald-50', minor: 'bg-blue-50', warning: 'bg-amber-50', critical: 'bg-red-50 border border-red-200' };
const STATUS_LABELS = { balanced: 'OK', minor: 'Kleine Diff.', warning: 'Warnung', critical: 'Kritisch' };

export default function StepReconcile({ classifiedRows, existingInvoices, existingOrders, onConfirm }) {
  const [filter, setFilter] = useState('all');

  const reconciled = useMemo(() => {
    return classifiedRows
      .filter(c => ['active_billing_relevant', 'future_billing_relevant'].includes(c.effectiveRelevance) && c.row)
      .map(c => {
        const row = c.row;
        const proj = c.matchedProject;
        const normCustomer = (row.customer_name_normalized || '').toLowerCase();

        // Linked invoices: by project or by customer name
        const linkedInvoices = existingInvoices.filter(i => {
          if (i.payment_status === 'cancelled') return false;
          if (proj && i.project_id === proj.id) return true;
          if (!proj) {
            const custSim = normalizeCustomerName(i.customer_name || '').toLowerCase() === normCustomer;
            return custSim;
          }
          return false;
        });

        const realInvoices = linkedInvoices.filter(i => !i.is_credit_note);
        const appInvoicedNet = realInvoices.reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
        const appPaidGross = realInvoices.filter(i => i.payment_status === 'paid').reduce((s, i) => s + (Number(i.gross_amount) || 0), 0);
        const appOpenGross = realInvoices.filter(i => ['open', 'partially_paid', 'overdue'].includes(i.payment_status)).reduce((s, i) => s + (Number(i.open_amount) || 0), 0);

        const excelInvoiced = row.already_invoiced_net || 0;
        const excelOpen = row.open_amount_net || 0;
        const excelTotal = row.total_order_amount_net || 0;

        // Linked orders
        const linkedOrder = proj ? existingOrders.find(o => o.project_id === proj.id) : null;
        const appOrderTotal = linkedOrder?.total_net_amount || 0;

        const invoicedDiff = Math.abs(excelInvoiced - appInvoicedNet);
        const totalDiff = Math.abs(excelTotal - appOrderTotal);

        const invoicedStatus = reconcileStatus(invoicedDiff);
        const totalStatus = reconcileStatus(totalDiff);
        const overallStatus = ['critical', 'warning', 'minor', 'balanced'].find(s =>
          invoicedStatus === s || totalStatus === s
        ) || 'balanced';

        const warnings = [];
        if (invoicedStatus !== 'balanced') warnings.push(`Verrechnungsdifferenz: Excel €${Math.round(excelInvoiced)} vs. App €${Math.round(appInvoicedNet)}`);
        if (totalStatus !== 'balanced' && appOrderTotal > 0) warnings.push(`Auftragsdifferenz: Excel €${Math.round(excelTotal)} vs. AB €${Math.round(appOrderTotal)}`);
        if (linkedInvoices.length === 0 && excelInvoiced > 0) warnings.push('Keine Rechnungen im App gefunden, aber Excel zeigt bereits verrechnet');
        if (!linkedOrder && excelTotal > 0) warnings.push('Keine Auftragsbestätigung verknüpft');

        return {
          c, row, proj, linkedInvoices, linkedOrder,
          appInvoicedNet, appPaidGross, appOpenGross, appOrderTotal,
          excelInvoiced, excelOpen, excelTotal,
          invoicedDiff, totalDiff, invoicedStatus, totalStatus, overallStatus,
          warnings,
        };
      });
  }, [classifiedRows, existingInvoices, existingOrders]);

  const filtered = reconciled.filter(r => {
    if (filter === 'critical') return r.overallStatus === 'critical';
    if (filter === 'warning') return ['critical', 'warning'].includes(r.overallStatus);
    if (filter === 'missing_order') return !r.linkedOrder;
    if (filter === 'missing_invoices') return r.linkedInvoices.length === 0;
    return true;
  });

  const criticalCount = reconciled.filter(r => r.overallStatus === 'critical').length;
  const warningCount = reconciled.filter(r => r.overallStatus === 'warning').length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Schritt 6: Finanzabgleich Excel ↔ App/Verrechnungssystem</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Excel-Planwerte werden gegen tatsächliche InvoiceRecords und ConfirmedOrders verglichen. Differenzen werden angezeigt — aber <strong>nichts wird automatisch überschrieben</strong>.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-sm">
        <span className="text-red-600 flex items-center gap-1 font-medium"><XCircle className="w-4 h-4" /> {criticalCount} Kritisch</span>
        <span className="text-amber-600 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {warningCount} Warnung</span>
        <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {reconciled.filter(r => r.overallStatus === 'balanced').length} OK</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'all', label: 'Alle' },
          { key: 'critical', label: 'Kritisch' },
          { key: 'warning', label: 'Warnung+' },
          { key: 'missing_order', label: 'Keine AB' },
          { key: 'missing_invoices', label: 'Keine Rechnungen' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filter === f.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="border rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 bg-muted px-4 py-2 text-xs font-medium text-muted-foreground gap-2">
          <span className="col-span-3">Projekt</span>
          <span className="col-span-2 text-right">Excel Auftrag</span>
          <span className="col-span-2 text-right">AB Auftrag</span>
          <span className="col-span-2 text-right">Excel Verr.</span>
          <span className="col-span-2 text-right">App Verr.</span>
          <span className="col-span-1 text-center">Status</span>
        </div>
        <div className="divide-y max-h-[500px] overflow-y-auto">
          {filtered.map((r, i) => (
            <div key={i} className={`grid grid-cols-12 gap-2 px-4 py-3 items-start text-sm ${STATUS_BG[r.overallStatus] || ''}`}>
              <div className="col-span-3 min-w-0">
                <p className="font-medium truncate text-xs">{r.row.project_name_raw || '—'}</p>
                <p className="text-xs text-muted-foreground truncate">{r.row.customer_name_normalized || '—'}</p>
                {r.warnings.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {r.warnings.map((w, wi) => <p key={wi} className="text-xs text-amber-700">⚠ {w}</p>)}
                  </div>
                )}
              </div>
              <span className={`col-span-2 text-right text-xs ${r.totalStatus !== 'balanced' && r.appOrderTotal > 0 ? STATUS_COLORS[r.totalStatus] : ''}`}>{formatCurrency(r.excelTotal)}</span>
              <span className={`col-span-2 text-right text-xs ${r.totalStatus !== 'balanced' && r.appOrderTotal > 0 ? STATUS_COLORS[r.totalStatus] : 'text-muted-foreground'}`}>{r.appOrderTotal > 0 ? formatCurrency(r.appOrderTotal) : <span className="italic">keine AB</span>}</span>
              <span className={`col-span-2 text-right text-xs ${r.invoicedStatus !== 'balanced' ? STATUS_COLORS[r.invoicedStatus] : ''}`}>{formatCurrency(r.excelInvoiced)}</span>
              <span className={`col-span-2 text-right text-xs ${r.invoicedStatus !== 'balanced' ? STATUS_COLORS[r.invoicedStatus] : 'text-muted-foreground'}`}>{formatCurrency(r.appInvoicedNet)} <span className="text-muted-foreground">({r.linkedInvoices.length})</span></span>
              <div className="col-span-1 flex justify-center">
                <span className={`text-xs font-semibold ${STATUS_COLORS[r.overallStatus]}`}>{STATUS_LABELS[r.overallStatus]}</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-center py-8 text-sm text-muted-foreground">Keine Einträge für diesen Filter.</div>}
        </div>
      </div>

      <Button onClick={() => onConfirm(reconciled)} className="gap-2">
        Abgleich abschließen & Aktionen anwenden
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}