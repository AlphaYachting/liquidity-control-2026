import React, { useMemo } from 'react';
import { formatCurrency } from '@/lib/liquidityUtils';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

/**
 * Zeigt eine horizontale Monats-Tabelle mit verrechneten Beträgen pro Monat.
 * Wird in der ProjectDetail-Seite eingebunden.
 */
export default function InvoicingTimeline({ projectInvoices = [] }) {
  const monthlyData = useMemo(() => {
    const map = {};
    projectInvoices
      .filter(inv => inv.invoice_date && !inv.is_credit_note)
      .forEach(inv => {
        const month = inv.invoice_date.slice(0, 7); // YYYY-MM
        if (!map[month]) map[month] = { net: 0, gross: 0, count: 0, invoices: [] };
        map[month].net += Number(inv.net_amount) || 0;
        map[month].gross += Number(inv.gross_amount) || 0;
        map[month].count += 1;
        map[month].invoices.push(inv);
      });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [projectInvoices]);

  if (monthlyData.length === 0) return null;

  const totalNet = monthlyData.reduce((s, [, d]) => s + d.net, 0);

  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Verrechnungshistorie nach Monat</h3>
        <span className="text-xs text-muted-foreground">{monthlyData.length} Monat(e) · {formatCurrency(totalNet)} gesamt netto</span>
      </div>

      {/* Horizontal scroll table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-max">
          <thead>
            <tr>
              <td className="text-muted-foreground pr-3 py-1 font-medium whitespace-nowrap">Monat</td>
              {monthlyData.map(([month]) => (
                <td key={month} className="text-center px-3 py-1 font-semibold text-muted-foreground whitespace-nowrap border-l border-border">
                  {format(parseISO(month + '-01'), 'MMM yy', { locale: de })}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-muted-foreground pr-3 py-1.5 font-medium whitespace-nowrap">Verrechnet netto</td>
              {monthlyData.map(([month, data]) => (
                <td key={month} className="text-center px-3 py-1.5 font-bold text-emerald-700 whitespace-nowrap border-l border-border">
                  {formatCurrency(data.net)}
                </td>
              ))}
            </tr>
            <tr className="bg-muted/30">
              <td className="text-muted-foreground pr-3 py-1.5 font-medium whitespace-nowrap">Rechnungen</td>
              {monthlyData.map(([month, data]) => (
                <td key={month} className="text-center px-3 py-1.5 text-muted-foreground whitespace-nowrap border-l border-border">
                  {data.count} Rg.
                </td>
              ))}
            </tr>
            <tr>
              <td className="text-muted-foreground pr-3 py-1 font-medium whitespace-nowrap">Rechnungsnr.</td>
              {monthlyData.map(([month, data]) => (
                <td key={month} className="text-center px-3 py-1 whitespace-nowrap border-l border-border">
                  <div className="space-y-0.5">
                    {data.invoices.map((inv, i) => (
                      <div key={i} className="text-muted-foreground truncate max-w-[120px] mx-auto" title={inv.invoice_number}>
                        {inv.invoice_number || '—'}
                      </div>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}