import React, { useState } from 'react';
import { formatMailDate, DIRECTION_META } from '@/components/crm/emails/emailConfig';

const LANG = 2000;

// Eine Nachricht im Eskalationsverlauf — vollständig lesbar, sehr lange Mails
// lassen sich mit einem Klick ganz aufklappen.
export default function EscalationMessage({ nachricht: m }) {
  const [ganz, setGanz] = useState(false);
  const dir = DIRECTION_META[m.direction] || DIRECTION_META.intern;
  const text = (m.text || '').trim();
  const gekuerzt = !ganz && text.length > LANG;

  return (
    <div className="border rounded-lg bg-card p-2.5">
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <span className={`px-1.5 py-0.5 rounded-full font-medium ${dir.color}`}>{dir.label}</span>
        <span className="font-medium">{m.from_name || m.from}</span>
        {m.from_name && m.from && <span className="text-muted-foreground">&lt;{m.from}&gt;</span>}
        {m.to && <span className="text-muted-foreground">→ {m.to}</span>}
        <span className="text-muted-foreground ml-auto">{formatMailDate(m.received_at)}</span>
      </div>
      <p className="text-xs mt-1.5 whitespace-pre-wrap break-words text-foreground/90">
        {gekuerzt ? `${text.slice(0, LANG)}…` : (text || '(kein Textinhalt)')}
      </p>
      {text.length > LANG && (
        <button
          type="button"
          onClick={() => setGanz((v) => !v)}
          className="mt-1 text-[11px] text-primary hover:underline"
        >
          {ganz ? 'Nachricht einklappen' : 'Ganze Nachricht lesen'}
        </button>
      )}
    </div>
  );
}