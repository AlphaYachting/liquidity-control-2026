import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { STATE_LABELS, RITTLER } from '@/components/sprint/sprintConfig';
import TicketZeile from '@/components/sprint/TicketZeile';

// U12 — nur die Gruppe des aktuellen Zustands ist offen; Erledigtes verdichtet sich,
// die Leistungsangabe bleibt in der Kopfzeile sichtbar.
export default function TicketPhasenGruppe({ phase, tickets, currentState, members, locked, onStatus, onAssignee }) {
  const [open, setOpen] = useState(phase === currentState);
  const doneCount = tickets.filter((t) => t.status === 'erledigt').length;
  const allDone = tickets.length > 0 && doneCount === tickets.length;

  return (
    <div className="border-b border-[#e0e0e0] last:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 py-2.5 text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-[#6b6b6b]" /> : <ChevronRight className="w-4 h-4 text-[#6b6b6b]" />}
        <span className="text-xs font-bold uppercase tracking-wide flex-1" style={{ color: RITTLER.black }}>
          {STATE_LABELS[phase]}
        </span>
        <span className="text-sm font-semibold flex items-center gap-1" style={{ color: allDone ? RITTLER.black : RITTLER.textSecondary }}>
          {doneCount} von {tickets.length}
          {allDone && <> · geschafft <Check className="w-3.5 h-3.5" strokeWidth={3} /></>}
        </span>
      </button>

      {open && (
        <div className="pb-2 pl-6">
          {tickets.map((t) => (
            <TicketZeile
              key={t.id}
              ticket={t}
              members={members}
              editable={!locked || t.milestone_state === 'kundenfeedback'}
              onStatus={onStatus}
              onAssignee={onAssignee}
            />
          ))}
          {tickets.length === 0 && (
            <p className="text-sm py-2" style={{ color: RITTLER.textSecondary }}>Keine Aufgaben in dieser Phase.</p>
          )}
        </div>
      )}
    </div>
  );
}