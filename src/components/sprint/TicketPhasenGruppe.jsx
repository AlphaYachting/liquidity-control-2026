import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { STATE_LABELS, RITTLER } from '@/components/sprint/sprintConfig';
import TicketZeile from '@/components/sprint/TicketZeile';

// V5 — Gruppenkopf mit Gewicht; nur die Gruppe des aktuellen Zustands ist offen.
export default function TicketPhasenGruppe({
  phase, tickets, visibleTickets, currentState, members, currentUserEmail, locked, onStatus, onAssignee,
}) {
  const [open, setOpen] = useState(phase === currentState);
  const doneCount = tickets.filter((t) => t.status === 'erledigt').length;
  const allDone = tickets.length > 0 && doneCount === tickets.length;
  const rows = visibleTickets || tickets;

  return (
    <div className="mb-3 last:mb-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full h-11 flex items-center gap-2 px-3 text-left"
        style={{ backgroundColor: RITTLER.surface }}
      >
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        <span className="text-[13px] font-bold uppercase tracking-[1px] flex-1" style={{ color: RITTLER.black }}>
          {STATE_LABELS[phase]}
        </span>
        <span className="text-[13px] font-bold flex items-center gap-1" style={{ color: RITTLER.black }}>
          {doneCount} von {tickets.length}
          {allDone && <> · geschafft <Check className="w-3.5 h-3.5" strokeWidth={3} /></>}
        </span>
      </button>

      {open && (
        <div>
          {rows.map((t) => (
            <TicketZeile
              key={t.id}
              ticket={t}
              members={members}
              currentUserEmail={currentUserEmail}
              editable={!locked || t.milestone_state === 'kundenfeedback'}
              onStatus={onStatus}
              onAssignee={onAssignee}
            />
          ))}
          {rows.length === 0 && (
            <p className="text-sm px-4 py-3" style={{ color: RITTLER.textSecondary }}>
              {tickets.length === 0 ? 'Keine Aufgaben in dieser Phase.' : 'Keine Aufgaben im gewählten Filter.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}