import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { emailApi } from '@/components/crm/emails/emailApi';
import { Loader2 } from 'lucide-react';
import { formatMailDate, DIRECTION_META } from '@/components/crm/emails/emailConfig';

// System-Mails (Unzustellbarkeits-Berichte, Exchange/Postmaster) gehören nicht in die Vorschau.
const isSystemMail = (m) => {
  const from = String(m.from || '').toLowerCase();
  if (from.includes('microsoftexchange') || from.startsWith('postmaster@') || from.startsWith('mailer-daemon@')) return true;
  return /couldn'?t be delivered|undeliverable|unzustellbar|zustellung .*fehlgeschlagen/i.test(String(m.text || '').slice(0, 300));
};

// Nachrichten-Vorschau eines eskalierten Threads — direkt im Alert sichtbar,
// damit der Fall ohne Wechsel in die E-Mail-Zentrale beurteilbar ist.
export default function EscalationThreadPreview({ threadId, limit = 3 }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['escalation-preview', threadId],
    queryFn: () => emailApi('thread', { params: { id: threadId, msgs: 8, full: 1 } }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" /> Vorschau lädt…
      </p>
    );
  }
  if (isError) return <p className="text-xs text-muted-foreground">Vorschau nicht verfügbar.</p>;

  const messages = (data?.messages || []).filter((m) => !isSystemMail(m)).slice(0, limit);
  if (messages.length === 0) return <p className="text-xs text-muted-foreground">Keine Nachrichten gefunden.</p>;

  return (
    <div className="space-y-2">
      {messages.map((m) => {
        const dir = DIRECTION_META[m.direction] || DIRECTION_META.intern;
        return (
          <div key={m.id} className="border rounded-lg bg-card p-2.5">
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className={`px-1.5 py-0.5 rounded-full font-medium ${dir.color}`}>{dir.label}</span>
              <span className="font-medium">{m.from_name || m.from}</span>
              {m.from_name && m.from && <span className="text-muted-foreground">&lt;{m.from}&gt;</span>}
              {m.to && <span className="text-muted-foreground">→ {m.to}</span>}
              <span className="text-muted-foreground ml-auto">{formatMailDate(m.received_at)}</span>
            </div>
            <p className="text-xs mt-1.5 whitespace-pre-wrap line-clamp-6 text-foreground/90">
              {(m.text || '').trim().slice(0, 1200) || '(kein Textinhalt)'}
            </p>
          </div>
        );
      })}
    </div>
  );
}