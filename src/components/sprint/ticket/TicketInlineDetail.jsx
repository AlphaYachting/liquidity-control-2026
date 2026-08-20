import React from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

// Aufgeklappte Zeile: zeigt Beschreibung, Checkliste und Verweise zum Lesen — bearbeitet wird im Detail-Panel.
export default function TicketInlineDetail({ ticket }) {
  const checklist = ticket.checklist || [];
  const links = ticket.links || [];

  return (
    <div className="pl-[56px] pr-4 py-3 space-y-3 bg-[#fafafa] border-b border-[#eeeeee]">
      {ticket.description && (
        <p className="text-[13px] whitespace-pre-wrap" style={{ color: RITTLER.textSecondary }}>
          {ticket.description}
        </p>
      )}

      {checklist.length > 0 && (
        <ul className="space-y-1.5">
          {checklist.map((it, i) => (
            <li key={i} className="flex items-center gap-2 text-[13px]">
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: it.done ? STATUS_COLORS.doneSurface : 'transparent',
                  border: it.done ? 'none' : `1.5px solid ${RITTLER.line}`,
                  color: STATUS_COLORS.doneText,
                }}
              >
                {it.done && <Check className="w-2.5 h-2.5" />}
              </span>
              <span style={{ color: it.done ? RITTLER.textSecondary : RITTLER.black, textDecoration: it.done ? 'line-through' : 'none' }}>
                {it.text}
              </span>
            </li>
          ))}
        </ul>
      )}

      {links.length > 0 && (
        <div className="space-y-1">
          {links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noreferrer"
              className="block truncate text-[13px] text-primary hover:underline">
              <ExternalLink className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />{l.label || l.url}
            </a>
          ))}
        </div>
      )}

      {!ticket.description && checklist.length === 0 && links.length === 0 && (
        <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>Noch keine Details erfasst.</p>
      )}
    </div>
  );
}