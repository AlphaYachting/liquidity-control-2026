import React from 'react';
import { Link } from 'react-router-dom';
import FaelligkeitKnopf from '@/components/sprint/FaelligkeitKnopf';
import TicketStatusElement from '@/components/sprint/TicketStatusElement';
import TypPill from '@/components/sprint/TypPill';
import SprintTimerStart from '@/components/sprint/timer/SprintTimerStart';
import { RITTLER, STATUS_COLORS, STATE_LABELS } from '@/components/sprint/sprintConfig';

// Aufgabenzeile der Heute-Ansicht: Status direkt umschaltbar + Kontextzeile.
// Optional: `typProjekt` zeigt die Typ-Pille, `timerProjekt` den Timer-Start auf diese Aufgabe.
export default function HeuteAufgabenZeile({ ticket, milestone, projectLabel, projektTyp = 'sprint', modulName, onStatusChange, typProjekt, timerProjekt, timerKunde }) {
  const istSprint = projektTyp === 'sprint';
  const context = istSprint ? [
    projectLabel,
    milestone?.title,
    ticket.milestone_state ? STATE_LABELS[ticket.milestone_state] : null,
    ticket.target_hours ? `${ticket.target_hours} h Ziel` : null,
  ].filter(Boolean) : [
    projectLabel,
    modulName,
    ticket.target_hours ? `${ticket.target_hours} h Ziel` : null,
  ].filter(Boolean);
  const ziel = istSprint || !milestone?.sprint_id
    ? `/sprint/milestones/${ticket.milestone_id}?aufgabe=${ticket.id}`
    : `/sprint/sprints/${milestone.sprint_id}${ticket.module_template_id ? `#modul-${ticket.module_template_id}` : ''}`;

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
      <Link
        to={ziel}
        className="flex-1 min-w-0 px-2 -mx-2 py-1 rounded hover:bg-muted"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm truncate" style={{ color: RITTLER.black, fontWeight: 500 }}>{ticket.title}</span>
          <FaelligkeitKnopf ticket={ticket} />
          {ticket.origin === 'change_request' && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[2px] shrink-0"
              style={{ color: STATUS_COLORS.attention, backgroundColor: STATUS_COLORS.attentionSurface }}
              title="Change Request — separat nach Aufwand abrechnen"
            >
              Separat abrechnen
            </span>
          )}
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
      {typProjekt && <span className="hidden lg:inline-flex"><TypPill project={typProjekt} /></span>}
      {timerProjekt && ticket.status !== 'erledigt' && (
        <SprintTimerStart project={timerProjekt} client={timerKunde} ticketId={ticket.id} variante="kompakt" label="Timer" />
      )}
      <TicketStatusElement value={ticket.status} onChange={(s) => onStatusChange(ticket, s)} />
    </div>
  );
}