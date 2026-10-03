import React, { useEffect, useState } from 'react';
import { AlertTriangle, ListChecks } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { setzeOffenesTicket } from '@/lib/sprint/offenesTicket';
import FaelligkeitKnopf from '@/components/sprint/FaelligkeitKnopf';
import TicketStatusElement from '@/components/sprint/TicketStatusElement';
import PersonenChip from '@/components/sprint/PersonenChip';
import TicketDetailPanel from '@/components/sprint/ticket/TicketDetailPanel';
import { schreibeSystemEintrag } from '@/lib/sprint/systemComment';
import { STATUS_COLORS, todayIso } from '@/components/sprint/sprintConfig';
import { istUeberfaellig } from '@/lib/sprint/faelligkeit';
import { ladeAnsichtenNachTicketAenderung } from '@/lib/sprint/ansichtenNeuLaden';

const ORIGIN_LABEL = { addon: 'Zusatz', change_request: 'Change Request · nach Aufwand' };
const h = (v) => (Number(v) || 0).toLocaleString('de-AT', { maximumFractionDigits: 1 });

// Aufgabenzeile der Etappenseite — gleiche Karte wie in der Etappenliste der Projektseite.
// Klick öffnet das Aufgabenpanel; Person und Status bleiben direkt in der Zeile bedienbar.
export default function EtappeAufgabeZeile({ ticket, members, currentUserEmail, editable, onStatus, onAssignee, startOffen = false }) {
  const [panel, setPanel] = useState(startOffen);
  const queryClient = useQueryClient();
  const member = members.find((m) => m.email === ticket.assignee_email);
  const isMe = !!ticket.assignee_email && ticket.assignee_email === currentUserEmail;

  // Ist das Panel offen, kennt der Timer die Aufgabe.
  useEffect(() => {
    setzeOffenesTicket(panel ? ticket.id : null);
    return () => setzeOffenesTicket(null);
  }, [panel, ticket.id]);
  useEffect(() => {
    if (startOffen) document.getElementById(`aufgabe-${ticket.id}`)?.scrollIntoView({ block: 'center' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const heute = todayIso();
  const ueberfaellig = istUeberfaellig(ticket, heute);
  const bald = new Date(); bald.setDate(bald.getDate() + 2);
  const baldIso = `${bald.getFullYear()}-${String(bald.getMonth() + 1).padStart(2, '0')}-${String(bald.getDate()).padStart(2, '0')}`;
  const faellig = !ueberfaellig && ticket.status !== 'erledigt' && !!ticket.planned_for && ticket.planned_for <= baldIso;
  const checklist = ticket.checklist || [];
  const stop = (e) => e.stopPropagation();

  let rand = '#EEEEEE';
  if (isMe) rand = 'hsl(var(--foreground))';
  if (faellig) rand = STATUS_COLORS.attention;
  if (ueberfaellig) rand = STATUS_COLORS.critical;

  return (
    <>
      <div
        id={`aufgabe-${ticket.id}`}
        role="button"
        tabIndex={0}
        onClick={() => setPanel(true)}
        onKeyDown={(e) => { if (e.key === 'Enter') setPanel(true); }}
        className={`mb-1.5 flex cursor-pointer flex-wrap items-center gap-x-3.5 gap-y-2 rounded border border-[#EEEEEE] py-2 pl-3 pr-2 hover:border-[#D4D4D4] ${
          ueberfaellig ? 'bg-status-critical-surface' : 'bg-card'
        }`}
        style={{ borderLeft: `3px solid ${rand}` }}
      >
        <div className="flex min-w-0 flex-[1_1_260px] flex-col">
          <span className="flex items-center gap-1.5 text-sm text-foreground" style={{ fontWeight: isMe ? 600 : 500 }}>
            <span className="truncate">{ticket.title}</span>
            {ueberfaellig && <span className="shrink-0 rounded bg-status-critical px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">Überfällig</span>}
            {faellig && <span className="shrink-0 rounded bg-status-attention-surface px-1.5 py-0.5 text-[11px] font-semibold text-status-attention">Fällig</span>}
            {ticket.blocks_others && (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-status-attention" aria-label="blockiert andere Aufgaben" />
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {ticket.role && <span>{ticket.role}</span>}
            {ticket.role && <span aria-hidden="true">·</span>}
            <span className="-ml-1"><FaelligkeitKnopf ticket={ticket} disabled={!editable} /></span>
            {ORIGIN_LABEL[ticket.origin] && <><span aria-hidden="true">·</span><span>{ORIGIN_LABEL[ticket.origin]}</span></>}
            {checklist.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1" title="Checkliste">
                  <ListChecks className="w-3.5 h-3.5" />{checklist.filter((c) => c.done).length}/{checklist.length}
                </span>
              </>
            )}
          </span>
        </div>

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
        <span className="w-12 shrink-0 text-right text-[13px] text-muted-foreground">{h(ticket.target_hours)} h</span>
        <div className="w-[130px] shrink-0" onClick={stop}>
          <TicketStatusElement
            value={ticket.status}
            disabled={!editable}
            onChange={async (s) => {
              await onStatus(ticket, s);
              await schreibeSystemEintrag({
                project_id: ticket.project_id,
                milestone_id: ticket.milestone_id,
                ticket_id: ticket.id,
                text: `Status von „${ticket.status}" auf „${s}" gesetzt.`,
              });
            }}
          />
        </div>
      </div>

      <TicketDetailPanel
        ticket={ticket}
        members={members}
        open={panel}
        onOpenChange={setPanel}
        onSaved={() => ladeAnsichtenNachTicketAenderung(queryClient)}
      />
    </>
  );
}
