import React from 'react';
import { useCustomerEmailThreads, deriveCommunicationStatus } from '@/hooks/useCustomerEmailThreads';
import CustomerEmailSection from '@/components/crm/emails/CustomerEmailSection';
import Sektion from '@/components/projects/Sektion';
import { Mail } from 'lucide-react';

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
    <Sektion titel="Kommunikation" symbol={Mail}>
      {zeile && <p className={`text-sm ${zeileClass}`}>{zeile}</p>}
      <CustomerEmailSection customer={customer} />
    </Sektion>
  );
}