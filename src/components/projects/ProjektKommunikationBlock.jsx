import React from 'react';
import { useCustomerEmailThreads, deriveCommunicationStatus } from '@/hooks/useCustomerEmailThreads';
import CustomerEmailSection from '@/components/crm/emails/CustomerEmailSection';

// Kommunikation im Reiter "Projektstand" — einziger Kommunikationsblock der Seite.
// Reine Leseansicht, Bewertung kommt aus deriveCommunicationStatus.
export default function ProjektKommunikationBlock({ customer }) {
  const { data, isLoading, isError } = useCustomerEmailThreads(customer);
  if (!customer) return null;

  const status = isLoading || isError ? null : deriveCommunicationStatus(data);
  const hatThreads = (data?.results || []).length > 0;

  const zeile = !status
    ? null
    : !hatThreads
      ? 'Keine zugeordnete E-Mail-Kommunikation in den letzten 90 Tagen.'
      : status.label;

  const zeileClass = status?.level === 'critical'
    ? 'text-status-critical'
    : status?.level === 'attention'
      ? 'text-status-attention'
      : 'text-muted-foreground';

  return (
    <div className="space-y-2">
      <div className="px-0.5 space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Kommunikation</p>
        {zeile && <p className={`text-sm ${zeileClass}`}>{zeile}</p>}
      </div>
      <CustomerEmailSection customer={customer} />
    </div>
  );
}