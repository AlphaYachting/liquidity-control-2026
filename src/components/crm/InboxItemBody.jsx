import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, MessagesSquare } from 'lucide-react';
import EscalationThreadPreview from '@/components/crm/emails/EscalationThreadPreview';
import { threadIdOf } from '@/components/crm/inboxDecision';

// Inhalt einer Posteingangs-Anfrage: voller Anfragetext plus E-Mail-Verlauf,
// damit der Fall ohne Wechsel in die E-Mail-Zentrale beurteilbar ist.
export default function InboxItemBody({ item }) {
  const [textOpen, setTextOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);

  const body = (item.body || '').trim();
  const isLong = body.length > 320;
  // Neue Einträge tragen thread_id, ältere nur email_message_id "thread:<id>"
  const threadId = threadIdOf(item);

  return (
    <div className="space-y-2">
      {body && (
        <p className={`rounded-lg bg-muted px-3.5 py-3 text-body text-foreground whitespace-pre-wrap ${textOpen || !isLong ? '' : 'line-clamp-6'}`}>
          {body}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {body && isLong && (
          <Button size="sm" variant="ghost" onClick={() => setTextOpen((v) => !v)}>
            {textOpen ? <ChevronUp /> : <ChevronDown />}
            {textOpen ? 'Text einklappen' : 'Ganze Anfrage lesen'}
          </Button>
        )}
        {threadId && (
          <Button size="sm" variant="ghost" onClick={() => setThreadOpen((v) => !v)}>
            <MessagesSquare />
            {threadOpen ? 'Verlauf ausblenden' : 'E-Mail-Verlauf anzeigen'}
          </Button>
        )}
      </div>

      {threadOpen && threadId && <EscalationThreadPreview threadId={threadId} start={8} />}
    </div>
  );
}