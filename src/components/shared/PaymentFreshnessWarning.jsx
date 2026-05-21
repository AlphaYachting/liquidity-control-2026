import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { getPaymentFreshnessLevel, getPaymentDataAgeDays, hasNoLivePaymentSource } from '@/lib/paymentDataUtils';

/**
 * Shows a contextual warning about payment data freshness.
 * - If sevDesk is the source: no warning.
 * - If import/manual and >14 days: stale warning.
 * - If import/manual and ≤14 days: soft info notice.
 */
export default function PaymentFreshnessWarning({ invoiceRecords }) {
  const level = getPaymentFreshnessLevel(invoiceRecords);
  const ageDays = getPaymentDataAgeDays(invoiceRecords);
  const noLive = hasNoLivePaymentSource(invoiceRecords);

  if (level === 'none') return null; // live sevDesk data, no warning needed

  if (level === 'stale') {
    return (
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold">Zahlungsdaten veraltet ({ageDays} Tage)</p>
          <p className="text-xs mt-0.5">
            Zahlungsstatus ist kein Live-Wert. Die Daten stammen aus Import oder manueller Pflege.
            Bitte vor Entscheidungen den Zahlungsstatus aktualisieren.
          </p>
        </div>
      </div>
    );
  }

  // level === 'warn'
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
      <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div>
        <p className="font-semibold">Importierter Zahlungsstand — kann veraltet sein</p>
        <p className="text-xs mt-0.5">
          Kein Live-Abgleich mit sevDesk aktiv. Zahlungsstatus basiert auf
          {noLive ? ' manuellen Einträgen oder Importen' : ' gemischten Quellen'}.
          {ageDays !== null ? ` Letzter Datenstand: vor ${ageDays} Tagen.` : ''}
        </p>
      </div>
    </div>
  );
}