import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import EscalationThreadPreview from '@/components/crm/emails/EscalationThreadPreview';
import { threadIdOf } from '@/components/crm/inboxDecision';

// Inhalt einer Posteingangs-Anfrage, damit der Fall ohne Wechsel in die E-Mail-Zentrale beurteilbar ist.
// Mit E-Mail-Verlauf steht die NEUESTE Nachricht oben (Entscheidung 06.10.2026) — der Text der
// ursprünglichen Anfrage ist dann nur noch auf Klick zu sehen. Ohne Verlauf (Telefon-KI, manuell)
// steht der erfasste Text.
export default function InboxItemBody({ item }) {
  const [textOpen, setTextOpen] = useState(false);
  const [anfrageOpen, setAnfrageOpen] = useState(false);

  const body = (item.body || '').trim();
  const isLong = body.length > 320;
  // Neue Einträge tragen thread_id, ältere nur email_message_id "thread:<id>"
  const threadId = threadIdOf(item);

  const anfrageText = body && (
    <p className={`rounded-lg bg-muted px-3.5 py-3 text-body text-foreground whitespace-pre-wrap ${textOpen || !isLong ? '' : 'line-clamp-6'}`}>
      {body}
    </p>
  );
  const ganzLesen = body && isLong && (
    <Button size="sm" variant="ghost" onClick={() => setTextOpen((v) => !v)}>
      {textOpen ? <ChevronUp /> : <ChevronDown />}
      {textOpen ? 'Text einklappen' : 'Ganze Anfrage lesen'}
    </Button>
  );

  if (!threadId) {
    return (
      <div className="space-y-2">
        {anfrageText}
        {ganzLesen && <div className="flex flex-wrap gap-2">{ganzLesen}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <EscalationThreadPreview threadId={threadId} start={3} />
      {body && (
        <>
          <Button size="sm" variant="ghost" onClick={() => setAnfrageOpen((v) => !v)}>
            <FileText />
            {anfrageOpen ? 'Ursprüngliche Anfrage ausblenden' : 'Ursprüngliche Anfrage anzeigen'}
          </Button>
          {anfrageOpen && (
            <>
              {anfrageText}
              {ganzLesen && <div className="flex flex-wrap gap-2">{ganzLesen}</div>}
            </>
          )}
        </>
      )}
    </div>
  );
}
