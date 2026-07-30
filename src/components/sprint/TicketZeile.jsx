import React from 'react';
import { AlertTriangle } from 'lucide-react';
import TicketStatusElement from '@/components/sprint/TicketStatusElement';
import PersonenChip from '@/components/sprint/PersonenChip';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

const ORIGIN_LABEL = { addon: 'Zusatz', change_request: 'Change Request' };

// V3 — feste Zeilenhöhe, senkrechte Achsen, genau ein Bedienelement für den Status.
export default function TicketZeile({ ticket, members, currentUserEmail, editable, onStatus, onAssignee }) {
  const member = members.find((m) => m.email === ticket.assignee_email);
  const isMe = !!ticket.assignee_email && ticket.assignee_email === currentUserEmail;
  const originLabel = ORIGIN_LABEL[ticket.origin];

  return (
    <div
      className="flex items-center gap-3 min-h-[56px] pr-2 border-b border-[#eeeeee] last:border-0 hover:bg-[#fafafa]"
      style={{ paddingLeft: 16, borderLeft: isMe ? `3px solid ${RITTLER.black}` : '3px solid transparent' }}
    >
      <PersonenChip
        member={member}
        members={members}
        role={ticket.role}
        isMe={isMe}
        disabled={!editable}
        onAssign={(email) => onAssignee(ticket, email)}
      />

      <div className="flex-1 min-w-0">
        <p className="text-[15px] truncate flex items-center gap-1.5" style={{ color: RITTLER.black, fontWeight: isMe ? 600 : 500 }}>
          {ticket.title}
          {ticket.blocks_others && (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: STATUS_COLORS.attention }} title="blockiert andere Aufgaben" />
          )}
        </p>
        {originLabel && (
          <span
            className="inline-block mt-0.5 text-[11px] px-1.5 py-0.5 rounded"
            style={{ color: RITTLER.black, backgroundColor: RITTLER.surface }}
          >
            {originLabel}
          </span>
        )}
      </div>

      <span className="hidden sm:block w-[120px] text-right text-[13px] shrink-0" style={{ color: RITTLER.textSecondary }}>
        {[ticket.role, ticket.target_hours ? `${ticket.target_hours} h` : null].filter(Boolean).join(' · ')}
      </span>

      <div className="w-[130px] shrink-0">
        <TicketStatusElement value={ticket.status} onChange={(s) => onStatus(ticket, s)} disabled={!editable} />
      </div>
    </div>
  );
}