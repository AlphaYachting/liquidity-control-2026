import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ListChecks, Pencil } from 'lucide-react';
import { setzeOffenesTicket } from '@/lib/sprint/offenesTicket';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import FaelligkeitKnopf from '@/components/sprint/FaelligkeitKnopf';
import TicketStatusElement from '@/components/sprint/TicketStatusElement';
import PersonenChip from '@/components/sprint/PersonenChip';
import TicketDetailPanel from '@/components/sprint/ticket/TicketDetailPanel';
import TicketInlineDetail from '@/components/sprint/ticket/TicketInlineDetail';
import { schreibeSystemEintrag } from '@/lib/sprint/systemComment';
import { RITTLER, STATUS_COLORS, todayIso } from '@/components/sprint/sprintConfig';
import { istUeberfaellig } from '@/lib/sprint/faelligkeit';
import { ladeAnsichtenNachTicketAenderung } from '@/lib/sprint/ansichtenNeuLaden';

const ORIGIN_LABEL = { addon: 'Zusatz', change_request: 'Change Request · nach Aufwand abrechenbar' };

// V3 — feste Zeilenhöhe, senkrechte Achsen, genau ein Bedienelement für den Status.
export default function TicketZeile({ ticket, members, currentUserEmail, editable, onStatus, onAssignee }) {
  const member = members.find((m) => m.email === ticket.assignee_email);
  const isMe = !!ticket.assignee_email && ticket.assignee_email === currentUserEmail;
  const originLabel = ORIGIN_LABEL[ticket.origin];
  // Direktsprung aus der Übersicht (?aufgabe=id): Aufgabe aufgeklappt öffnen
  const [offen, setOffen] = useState(() => new URLSearchParams(window.location.search).get('aufgabe') === ticket.id);
  useEffect(() => {
    if (offen && new URLSearchParams(window.location.search).get('aufgabe') === ticket.id) {
      document.getElementById(`aufgabe-${ticket.id}`)?.scrollIntoView({ block: 'center' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [detailOpen, setDetailOpen] = useState(false);
  const queryClient = useQueryClient();

  // Ist das Panel offen, kennt der Timer die Aufgabe.
  useEffect(() => {
    setzeOffenesTicket(detailOpen ? ticket.id : null);
    return () => setzeOffenesTicket(null);
  }, [detailOpen, ticket.id]);

  const checklist = ticket.checklist || [];
  const erledigt = checklist.filter((c) => c.done).length;
  const stop = (e) => e.stopPropagation();
  const heute = todayIso();
  const ueberfaellig = istUeberfaellig(ticket, heute);
  // „fällig": heute fällig, im Toleranzfenster oder in den nächsten 2 Tagen
  const bald = new Date(); bald.setDate(bald.getDate() + 2);
  const baldIso = `${bald.getFullYear()}-${String(bald.getMonth() + 1).padStart(2, '0')}-${String(bald.getDate()).padStart(2, '0')}`;
  const faellig = !ueberfaellig && ticket.status !== 'erledigt' && !!ticket.planned_for && ticket.planned_for <= baldIso;

  return (
    <>
      <div
        id={`aufgabe-${ticket.id}`}
        onClick={() => setOffen((v) => !v)}
        className={`flex items-center gap-3 min-h-[56px] pr-2 border-b border-[#eeeeee] last:border-0 cursor-pointer group ${ueberfaellig ? 'bg-status-critical-surface hover:bg-status-critical-surface/70' : faellig ? 'bg-status-attention-surface/60 hover:bg-status-attention-surface' : 'hover:bg-[#fafafa]'}`}
        style={{ paddingLeft: 16, borderLeft: ueberfaellig ? `4px solid ${STATUS_COLORS.critical}` : faellig ? `3px solid ${STATUS_COLORS.attention}` : isMe ? `3px solid ${RITTLER.black}` : '3px solid transparent' }}
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
            {ueberfaellig && <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-status-critical text-primary-foreground">Überfällig</span>}
            {faellig && <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-status-attention-surface text-status-attention">Fällig</span>}
            {ticket.blocks_others && (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: STATUS_COLORS.attention }} title="blockiert andere Aufgaben" />
            )}
            <FaelligkeitKnopf ticket={ticket} disabled={!editable} />
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
          aria-label="Aufgabe bearbeiten"
          // Immer sichtbar (Rückmeldung John 06.10.2026): nur beim Darüberfahren war er nicht auffindbar, am Tablet gar nicht
          className="shrink-0 p-1.5 rounded text-muted-foreground/60 group-hover:text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>

        <div className="w-[130px] shrink-0" onClick={stop}>
          <TicketStatusElement
            value={ticket.status}
            onChange={async (s) => {
              await onStatus(ticket, s);
              await schreibeSystemEintrag({
                project_id: ticket.project_id,
                milestone_id: ticket.milestone_id,
                ticket_id: ticket.id,
                text: `Status von „${ticket.status}" auf „${s}" gesetzt.`,
              });
            }}
            disabled={!editable}
          />
        </div>
      </div>

      {offen && (
        <TicketInlineDetail
          ticket={ticket}
          editable={editable}
          onBearbeiten={() => setDetailOpen(true)}
          onChecklist={async (checklist) => {
            await base44.entities.Ticket.update(ticket.id, { checklist });
            ladeAnsichtenNachTicketAenderung(queryClient);
          }}
        />
      )}

      <TicketDetailPanel
        ticket={ticket}
        members={members}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSaved={() => ladeAnsichtenNachTicketAenderung(queryClient)}
      />
    </>
  );
}