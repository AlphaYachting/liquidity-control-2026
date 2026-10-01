import React from 'react';
import { formatCurrency } from '@/lib/liquidityUtils';
import { rechnungsStatus, istEntwurf, nettoVorzeichen, TON_KLASSEN } from '@/lib/billing/rechnungsStatus';

const ART = { advance_invoice: 'Anzahlung', partial_invoice: 'Teilrechnung', final_invoice: 'Schlussrechnung', correction: 'Gutschrift', credit_note: 'Gutschrift' };
const tag = (d) => (d ? new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

export default function RechnungenTabelle({ invoices }) {
  if (!invoices.length) return null;
  const sortiert = [...invoices].sort((a, b) => (b.invoice_date || '').localeCompare(a.invoice_date || ''));
  return (
    <div className="bg-card border rounded-xl p-4 space-y-2">
      <h3 className="text-sm font-semibold">Rechnungen</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground text-left">
            <tr><th className="py-1 pr-3">Nummer</th><th className="pr-3">Datum</th><th className="pr-3">Art</th><th className="pr-3 text-right">netto</th><th className="pr-3">Status</th><th className="text-right">offen brutto</th></tr>
          </thead>
          <tbody>
            {sortiert.map((inv) => {
              const st = rechnungsStatus(inv);
              return (
                <tr key={inv.id} className="border-t border-border">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{istEntwurf(inv) ? <span className="text-muted-foreground italic">ohne Nummer</span> : inv.invoice_number || '—'}</td>
                  <td className="pr-3 whitespace-nowrap">{tag(inv.invoice_date)}</td>
                  <td className="pr-3">{inv.is_credit_note ? 'Gutschrift' : ART[inv.invoice_type] || '—'}</td>
                  <td className="pr-3 text-right whitespace-nowrap">{formatCurrency(nettoVorzeichen(inv))}</td>
                  <td className="pr-3"><span className={`px-2 py-0.5 rounded whitespace-nowrap ${TON_KLASSEN[st.ton]}`}>{st.label}</span></td>
                  <td className="text-right whitespace-nowrap">{st.zaehltAlsVerrechnet && !inv.is_credit_note ? formatCurrency(inv.open_amount) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}