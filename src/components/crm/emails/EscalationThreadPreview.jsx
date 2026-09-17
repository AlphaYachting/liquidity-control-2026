import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { emailApi } from '@/components/crm/emails/emailApi';
import { Loader2 } from 'lucide-react';
import EscalationMessage from '@/components/crm/emails/EscalationMessage';

// System-Mails (Unzustellbarkeits-Berichte, Exchange/Postmaster) gehören nicht in die Vorschau.
const isSystemMail = (m) => {
  const from = String(m.from || '').toLowerCase();
  if (from.includes('microsoftexchange') || from.startsWith('postmaster@') || from.startsWith('mailer-daemon@')) return true;
  return /couldn'?t be delivered|undeliverable|unzustellbar|zustellung .*fehlgeschlagen/i.test(String(m.text || '').slice(0, 300));
};

// Vollständiger Verlauf eines eskalierten Threads — der Fall ist ohne Wechsel
// in die E-Mail-Zentrale beurteilbar.
export default function EscalationThreadPreview({ threadId, start = 5 }) {
  const [alle, setAlle] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['escalation-preview', threadId],
    queryFn: () => emailApi('thread', { params: { id: threadId, msgs: 50, full: 1 } }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" /> Verlauf lädt…
      </p>
    );
  }
  if (isError) return <p className="text-xs text-muted-foreground">Verlauf nicht verfügbar.</p>;

  const messages = (data?.messages || []).filter((m) => !isSystemMail(m));
  if (messages.length === 0) return <p className="text-xs text-muted-foreground">Keine Nachrichten gefunden.</p>;

  const sichtbar = alle ? messages : messages.slice(0, start);

  return (
    <div className="space-y-2">
      {sichtbar.map((m) => <EscalationMessage key={m.id} nachricht={m} />)}
      {messages.length > sichtbar.length && (
        <button
          type="button"
          onClick={() => setAlle(true)}
          className="text-xs text-primary hover:underline"
        >
          Ältere Nachrichten anzeigen ({messages.length - sichtbar.length})
        </button>
      )}
    </div>
  );
}