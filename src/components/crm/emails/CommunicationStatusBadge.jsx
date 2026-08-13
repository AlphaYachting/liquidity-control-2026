import React, { useState } from 'react';
import { Mail, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useCustomerEmailThreads, deriveCommunicationStatus } from '@/hooks/useCustomerEmailThreads';
import CommunicationStatusDialog from '@/components/crm/emails/CommunicationStatusDialog';

// Zeigt den kommunikationsbasierten Projekt-Status (aus der E-Mail-Datenbank) als Badge.
// Klick öffnet die betroffenen E-Mail-Threads direkt — ohne Suche in der E-Mail-Zentrale.
export default function CommunicationStatusBadge({ customer }) {
  const { data, isLoading, isError } = useCustomerEmailThreads(customer);
  const [open, setOpen] = useState(false);
  if (!customer || isLoading || isError) return null;

  const status = deriveCommunicationStatus(data);
  const styles = {
    critical: 'bg-status-critical-surface text-status-critical border-status-critical/30',
    attention: 'bg-status-attention-surface text-status-attention border-status-attention/30',
    ok: 'bg-status-done-surface text-status-done-text border-status-done/40',
    pending: 'bg-muted text-status-neutral border-border',
    none: 'bg-muted text-muted-foreground border-border',
  };
  const Icon = status.level === 'critical' ? AlertTriangle
    : status.level === 'attention' ? Clock
    : status.level === 'ok' ? CheckCircle2
    : Mail;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 text-xs rounded-md px-2 py-1 border font-medium transition-opacity hover:opacity-80 cursor-pointer ${styles[status.level]}`}
        title="Klicken für Details — Status basierend auf der E-Mail-Kommunikation der letzten 90 Tage"
      >
        <Icon className="w-3 h-3" />
        {status.label}
      </button>
      {open && (
        <CommunicationStatusDialog
          open={open}
          onClose={() => setOpen(false)}
          customer={customer}
          status={status}
          threads={data?.results || []}
        />
      )}
    </>
  );
}