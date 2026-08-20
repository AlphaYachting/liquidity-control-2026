import React from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

// Aufgeklappte Zeile: Beschreibung lesen, Checkliste direkt abhaken, Verweise öffnen.
export default function TicketInlineDetail({ ticket, editable, onChecklist }) {
  const checklist = ticket.checklist || [];
  const links = ticket.links || [];
  const erledigt = checklist.filter((c) => c.done).length;
  const leer = !ticket.description && checklist.length === 0 && links.length === 0;

  const toggle = (i) => {
    if (!editable || !onChecklist) return;
    onChecklist(checklist.map((it, k) => (k === i ? { ...it, done: !it.done } : it)));
  };

  return (
    <div className="border-b border-[#eeeeee] bg-[#fbfbfb]">
      <div className="ml-[56px] mr-4 my-3 pl-4 border-l-2 space-y-4" style={{ borderColor: RITTLER.line }}>
        {ticket.description && (
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: RITTLER.textSecondary }}>
            {ticket.description}
          </p>
        )}

        {checklist.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1px] mb-2" style={{ color: RITTLER.textSecondary }}>
              Checkliste · {erledigt}/{checklist.length}
            </p>
            <ul className="space-y-0.5">
              {checklist.map((it, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    disabled={!editable}
                    className="w-full flex items-start gap-2.5 text-left py-1 px-1.5 -mx-1.5 rounded hover:bg-white disabled:cursor-default"
                  >
                    <span
                      className="w-[18px] h-[18px] mt-[1px] rounded flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: it.done ? STATUS_COLORS.done : '#ffffff',
                        border: it.done ? 'none' : `1.5px solid ${RITTLER.line}`,
                        color: '#ffffff',
                      }}
                    >
                      {it.done && <Check className="w-3 h-3" strokeWidth={3} />}
                    </span>
                    <span
                      className="text-[13px] leading-[20px]"
                      style={{
                        color: it.done ? RITTLER.textSecondary : RITTLER.black,
                        textDecoration: it.done ? 'line-through' : 'none',
                      }}
                    >
                      {it.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {links.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1px] mb-2" style={{ color: RITTLER.textSecondary }}>
              Verweise
            </p>
            <div className="space-y-1">
              {links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 truncate text-[13px] text-primary hover:underline">
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />{l.label || l.url}
                </a>
              ))}
            </div>
          </div>
        )}

        {leer && (
          <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>
            Noch keine Details erfasst — über das Stift-Symbol ergänzen.
          </p>
        )}
      </div>
    </div>
  );
}