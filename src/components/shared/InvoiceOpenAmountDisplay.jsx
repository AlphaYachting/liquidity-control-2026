import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { calculateInvoiceOpenAmount } from '@/lib/paymentDataUtils';
import { formatCurrency } from '@/lib/liquidityUtils';

/**
 * Shows calculated open amount vs. stored open amount for an invoice.
 * Displays warnings for status/amount inconsistencies.
 * Never overwrites data.
 */
export default function InvoiceOpenAmountDisplay({ invoice, compact = false }) {
  const calc = calculateInvoiceOpenAmount(invoice);

  if (compact) {
    return (
      <div className="text-right">
        <p className="font-semibold text-sm">{formatCurrency(calc.calculated_open)}</p>
        {calc.warnings.length > 0 && (
          <AlertTriangle className="w-3 h-3 text-amber-500 inline ml-1" title={calc.warnings.join(' ')} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Gezahlter Bruttobetrag</span>
        <span className="font-medium">{formatCurrency(calc.paid_gross)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Berechneter offener Betrag</span>
        <span className="font-semibold">{formatCurrency(calc.calculated_open)}</span>
      </div>
      {calc.stored_open !== null && calc.stored_vs_calculated_diff !== null && Math.abs(calc.stored_vs_calculated_diff) > 0.01 && (
        <div className="flex justify-between gap-4 text-amber-700">
          <span>Importierter offener Betrag</span>
          <span>{formatCurrency(calc.stored_open)} <span className="text-amber-500">(Δ {formatCurrency(calc.stored_vs_calculated_diff)})</span></span>
        </div>
      )}
      {calc.warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-1.5 p-1.5 rounded bg-amber-50 border border-amber-200 text-amber-800">
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}