import React from 'react';
import { useMemo } from 'react';
import { formatCurrency } from '@/lib/liquidityUtils';
import { format, parseISO, differenceInDays } from 'date-fns';
import { de } from 'date-fns/locale';

const INVOICE_TYPE_SHORT = {
  advance_invoice: 'AZ',
  partial_invoice: 'TR',
  final_invoice: 'ER',
  correction: 'KO',
  credit_note: 'GS',
};

/**
 * Task 6: Improved billing history timeline.
 * Shows per-month: amount, %, invoice type, days ago.
 */
export default function BillingHistoryTimeline({ projectInvoices = [], commercialBaseNet = 0 }) {
  const today = new Date();

  const monthlyData = useMemo(() => {
    const map = {};
    projectInvoices
      .filter(inv => inv.invoice_date && !inv.is_credit_note)
      .forEach(inv => {
        const month = inv.invoice_date.slice(0, 7);
        if (!map[month]) map[month] = { net: 0, invoices: [] };
        map[month].net += Number(inv.net_amount) || 0;
        map[month].invoices.push(inv);
      });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [projectInvoices]);

  if (monthlyData.length === 0) return null;

  const totalInvoiced = monthlyData.reduce((s, [, d]) => s + d.net, 0);
  // Show last 6 months max for readability
  const visible = monthlyData.slice(-6);

  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Verrechnungshistorie</h3>
        <span className="text-xs text-muted-foreground">
          {monthlyData.length} Monat(e) · {formatCurrency(totalInvoiced)} netto gesamt
        </span>
      </div>

      {/* Timeline cards */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {visible.map(([month, data]) => {
          const pct = commercialBaseNet > 0 ? Math.round((data.net / commercialBaseNet) * 100) : null;
          const lastInvDate = data.invoices.reduce((latest, inv) =>
            inv.invoice_date > latest ? inv.invoice_date : latest, '');
          const daysAgo = lastInvDate
            ? differenceInDays(today, parseISO(lastInvDate))
            : null;
          const types = [...new Set(data.invoices.map(i => INVOICE_TYPE_SHORT[i.invoice_type] || '?'))];

          const notes = data.invoices
            .map(i => i.notes)
            .filter(Boolean)
            .join(' / ');

          return (
            <div key={month} className="flex-shrink-0 border rounded-lg p-3 min-w-[140px] bg-muted/20 space-y-1.5 text-center">
              <p className="text-xs font-semibold text-muted-foreground">
                {format(parseISO(month + '-01'), 'MMM yy', { locale: de })}
              </p>
              <p className="text-sm font-bold text-emerald-700">{formatCurrency(data.net)}</p>
              <div className="flex items-center justify-center gap-1 flex-wrap">
                {pct !== null && (
                  <span className="text-xs font-medium text-blue-700">{pct}%</span>
                )}
                {types.map((t, i) => (
                  <span key={i} className={`text-xs px-1.5 py-0 rounded font-medium ${
                    t === 'AZ' ? 'bg-purple-100 text-purple-700' :
                    t === 'ER' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{t}</span>
                ))}
              </div>
              {daysAgo !== null && (
                <p className={`text-xs ${daysAgo > 90 ? 'text-red-500 font-medium' : daysAgo > 30 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  vor {daysAgo}d
                </p>
              )}
              {notes && (
                <p className="text-xs text-muted-foreground italic leading-tight text-left border-t pt-1 mt-1" title={notes}>
                  „{notes.length > 60 ? notes.substring(0, 60) + '…' : notes}"
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Warning: no invoice in 3+ months */}
      {(() => {
        const lastMonth = monthlyData[monthlyData.length - 1];
        if (!lastMonth) return null;
        const lastDate = lastMonth[1].invoices.reduce((l, i) => i.invoice_date > l ? i.invoice_date : l, '');
        const days = lastDate ? differenceInDays(today, parseISO(lastDate)) : null;
        if (days !== null && days > 90) {
          return (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              ⚠ Letzte Rechnung vor {days} Tagen — 10% TR-Planung prüfen
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
}