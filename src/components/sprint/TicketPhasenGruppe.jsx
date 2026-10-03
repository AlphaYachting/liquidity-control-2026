import React, { useState } from 'react';
import { ChevronRight, Check } from 'lucide-react';
import { STATE_LABELS } from '@/components/sprint/sprintConfig';
import EtappeAufgabeZeile from '@/components/sprint/etappe/EtappeAufgabeZeile';
import SortierbareAufgaben from '@/components/sprint/SortierbareAufgaben';

// Phasengruppe der Etappenseite: Kopf mit Zähler, „aktuelle Phase“ als Hinweis.
// Offen sind die aktuelle Phase, frühere Phasen mit offenen Aufgaben und die Phase einer
// direkt angesprungenen Aufgabe (?aufgabe=id).
export default function TicketPhasenGruppe({
  phase, tickets, visibleTickets, currentState, members, currentUserEmail, locked, onStatus, onAssignee,
  startOffen, aufgabeId,
}) {
  const [open, setOpen] = useState(startOffen ?? phase === currentState);
  const doneCount = tickets.filter((t) => t.status === 'erledigt').length;
  const allDone = tickets.length > 0 && doneCount === tickets.length;
  const rows = visibleTickets || tickets;
  const aktuell = phase === currentState;

  return (
    <div className="border-t border-[#EEEEEE]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 bg-[#FAFAFA] px-5 py-[11px] text-left text-foreground hover:bg-[#F5F5F5]"
      >
        <ChevronRight className={`w-[15px] h-[15px] shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="flex-1 text-xs font-bold uppercase tracking-[0.1em]">
          {STATE_LABELS[phase]}
          {aktuell && <span className="ml-2 font-medium normal-case tracking-normal text-[#9A9A9A]">aktuelle Phase</span>}
        </span>
        <span className="flex items-center gap-1 text-[13px] font-semibold">
          {tickets.length === 0 ? '—' : `${doneCount} von ${tickets.length}`}
          {allDone && <> · geschafft <Check className="w-3.5 h-3.5" strokeWidth={3} /></>}
        </span>
      </button>

      {open && (
        <div className="pb-3 pl-3 pr-5 pt-2">
          <SortierbareAufgaben
            id={`phase-${phase}`}
            tickets={[...rows].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))}
            renderZeile={(t) => (
              <EtappeAufgabeZeile
                key={t.id}
                ticket={t}
                members={members}
                currentUserEmail={currentUserEmail}
                editable={!locked || t.milestone_state === 'kundenfeedback'}
                onStatus={onStatus}
                onAssignee={onAssignee}
                startOffen={t.id === aufgabeId}
              />
            )}
          />
          {rows.length === 0 && (
            <p className="my-1 pl-6 text-[13px] text-muted-foreground">
              {tickets.length === 0 ? 'Keine Aufgaben in dieser Phase.' : 'Keine Aufgaben im gewählten Filter.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
