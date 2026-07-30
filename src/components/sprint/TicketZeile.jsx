import React from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import TicketStatusElement from '@/components/sprint/TicketStatusElement';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

const ORIGIN_LABEL = { addon: 'Zusatz', change_request: 'Change Request' };

// U12 — ruhige Aufgabenzeile: Titel, Kürzel-Chip, ein Statuselement. Keine gefüllte Fläche.
export default function TicketZeile({ ticket, members, editable, onStatus, onAssignee }) {
  const member = members.find((m) => m.email === ticket.assignee_email);
  const originLabel = ORIGIN_LABEL[ticket.origin];

  return (
    <div className="flex items-center gap-3 py-2.5 px-1 border-b border-[#e0e0e0] last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[15px]" style={{ color: RITTLER.black }}>{ticket.title}</span>
          <span className="text-xs" style={{ color: RITTLER.textSecondary }}>
            {[ticket.role, ticket.target_hours ? `${ticket.target_hours} h` : null].filter(Boolean).join(' · ')}
          </span>
          {ticket.blocks_others && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: STATUS_COLORS.attention }}>
              <AlertTriangle className="w-3 h-3" /> blockiert
            </span>
          )}
        </div>
        {originLabel && (
          <span
            className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{ color: RITTLER.black, backgroundColor: RITTLER.surface }}
          >
            {originLabel}
          </span>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={!editable}
          title={member ? member.name : 'zuweisen'}
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold disabled:opacity-50"
          style={{
            backgroundColor: member ? RITTLER.surface : 'transparent',
            color: member ? RITTLER.black : RITTLER.textSecondary,
          }}
        >
          {member ? initials(member.name) : <Plus className="w-4 h-4" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onAssignee(ticket, '')}>nicht zugewiesen</DropdownMenuItem>
          {members.map((m) => (
            <DropdownMenuItem key={m.email} onClick={() => onAssignee(ticket, m.email)}>{m.name}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <TicketStatusElement value={ticket.status} onChange={(s) => onStatus(ticket, s)} disabled={!editable} />
    </div>
  );
}