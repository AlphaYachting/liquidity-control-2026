import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ListChecks, Pencil } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import TicketStatusElement from '@/components/sprint/TicketStatusElement';
import PersonenChip from '@/components/sprint/PersonenChip';
import TicketDetailPanel from '@/components/sprint/ticket/TicketDetailPanel';
import TicketInlineDetail from '@/components/sprint/ticket/TicketInlineDetail';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

const ORIGIN_LABEL = { addon: 'Zusatz', change_request: 'Change Request · nach Aufwand abrechenbar' };

// V3 — feste Zeilenhöhe, senkrechte Achsen, genau ein Bedienelement für den Status.
export default function TicketZeile({ ticket, members, currentUserEmail, editable, onStatus, onAssignee }) {
  const member = members.find((m) => m.email === ticket.assignee_email);
  const isMe = !!ticket.assignee_email && ticket.assignee_email === currentUserEmail;
  const originLabel = ORIGIN_LABEL[ticket.origin];
  const [offen, setOffen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const queryClient = useQueryClient();

  const checklist = ticket.checklist || [];
  const erledigt = checklist.filter((c) => c.done).length;
  const stop = (e) => e.stopPropagation();

  return (
    <>
      <div
        onClick={() => setOffen((v) => !v)}
        className="flex items-center gap-3 min-h-[56px] pr-2 border-b border-[#eeeeee] last:border-0 hover:bg-[#fafafa] cursor-pointer group"
        style={{ paddingLeft: 16, borderLeft: isMe ? `3px solid ${RITTLER.black}` : '3px solid transparent' }}
      >
        <div onClick={stop}>
          <PersonenChip
            member={member}
            members={members}
            role={ticket.role}
            isMe={isMe}
            disabled={!editable}
            onAssign={(email) => onAssignee(ticket, email)}
          />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[15px] truncate flex items-center gap-1.5" style={{ color: RITTLER.black, fontWeight: isMe ? 600 : 500 }}>
            {offen ? <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: RITTLER.textSecondary }} />
                   : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: RITTLER.textSecondary }} />}
            {ticket.title}
            {ticket.blocks_others && (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: STATUS_COLORS.attention }} title="blockiert andere Aufgaben" />
            )}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {originLabel && (
              <span
                className="inline-block text-[11px] px-1.5 py-0.5 rounded"
                style={{ color: RITTLER.black, backgroundColor: RITTLER.surface }}
              >
                {originLabel}
              </span>
            )}
            {checklist.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: RITTLER.textSecondary }}
                title="Checkliste vorhanden">
                <ListChecks className="w-3.5 h-3.5" />{erledigt}/{checklist.length}
              </span>
            )}
          </div>
        </div>

        <span className="hidden sm:block w-[120px] text-right text-[13px] shrink-0" style={{ color: RITTLER.textSecondary }}>
          {[ticket.role, ticket.target_hours ? `${ticket.target_hours} h` : null].filter(Boolean).join(' · ')}
        </span>

        <button
          onClick={(e) => { stop(e); setDetailOpen(true); }}
          title="Detail bearbeiten"
          className="shrink-0 p-1.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>

        <div className="w-[130px] shrink-0" onClick={stop}>
          <TicketStatusElement value={ticket.status} onChange={(s) => onStatus(ticket, s)} disabled={!editable} />
        </div>
      </div>

      {offen && (
        <TicketInlineDetail
          ticket={ticket}
          editable={editable}
          onChecklist={async (checklist) => {
            await base44.entities.Ticket.update(ticket.id, { checklist });
            queryClient.invalidateQueries();
          }}
        />
      )}

      <TicketDetailPanel
        ticket={ticket}
        members={members}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSaved={() => queryClient.invalidateQueries()}
      />
    </>
  );
}