import React from 'react';
import { Link } from 'react-router-dom';
import TicketStatusElement from '@/components/sprint/TicketStatusElement';
import { RITTLER, STATUS_COLORS, STATE_LABELS } from '@/components/sprint/sprintConfig';

// Aufgabenzeile der Heute-Ansicht: Status direkt umschaltbar + Kontextzeile.
export default function HeuteAufgabenZeile({ ticket, milestone, projectLabel, onStatusChange }) {
  const context = [
    projectLabel,
    milestone?.title,
    ticket.milestone_state ? STATE_LABELS[ticket.milestone_state] : null,
    ticket.target_hours ? `${ticket.target_hours} h Ziel` : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-[#e0e0e0] last:border-0">
      <Link
        to={`/sprint/milestones/${ticket.milestone_id}`}
        className="flex-1 min-w-0 px-2 -mx-2 py-1 rounded hover:bg-[#f5f5f5]"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm truncate" style={{ color: RITTLER.black, fontWeight: 500 }}>{ticket.title}</span>
          {ticket.blocks_others && ticket.status !== 'erledigt' && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[2px] shrink-0"
              style={{ color: STATUS_COLORS.attention, backgroundColor: STATUS_COLORS.attentionSurface }}
            >
              Blockiert andere
            </span>
          )}
        </div>
        {context.length > 0 && (
          <p className="text-xs mt-0.5 truncate" style={{ color: RITTLER.textSecondary }}>
            {context.join(' · ')}
          </p>
        )}
      </Link>
      <TicketStatusElement value={ticket.status} onChange={(s) => onStatusChange(ticket, s)} />
    </div>
  );
}