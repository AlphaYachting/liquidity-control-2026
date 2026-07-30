import React from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import TicketStatusPunkt from '@/components/sprint/TicketStatusPunkt';
import { RITTLER, TICKET_STATUS_LABELS } from '@/components/sprint/sprintConfig';

function Zeile({ ticket }) {
  return (
    <Link
      to={`/sprint/milestones/${ticket.milestone_id}`}
      className="flex items-center gap-3 py-2 border-b border-[#e0e0e0] last:border-0 hover:bg-[#f5f5f5] px-2 -mx-2 rounded"
    >
      <TicketStatusPunkt status={ticket.status} />
      <span className="flex-1 text-sm" style={{ color: RITTLER.black }}>{ticket.title}</span>
      <span className="text-xs" style={{ color: RITTLER.textSecondary }}>{TICKET_STATUS_LABELS[ticket.status]}</span>
    </Link>
  );
}

// U5 — Erledigtes verschwindet nicht und wird nie ausgegraut; es rutscht unter "GESCHAFFT".
export default function HeuteAufgabenliste({ tickets, projectTitle, emptyText = 'Keine Aufgaben.' }) {
  const done = tickets.filter((t) => t.status === 'erledigt');
  const open = tickets.filter((t) => t.status !== 'erledigt');
  const tagGeschafft = tickets.length > 0 && open.length === 0;

  return (
    <div>
      {tickets.length === 0 && <p className="text-sm" style={{ color: RITTLER.textSecondary }}>{emptyText}</p>}

      {tagGeschafft ? (
        <div className="py-10 text-center">
          <Check className="w-14 h-14 mx-auto" strokeWidth={3} style={{ color: RITTLER.black }} />
          <p className="mt-4 text-xl font-extrabold uppercase tracking-tight" style={{ color: RITTLER.black }}>
            Tag geschafft
          </p>
          <p className="mt-1 text-sm" style={{ color: RITTLER.textSecondary }}>
            {done.length} {done.length === 1 ? 'Aufgabe' : 'Aufgaben'} erledigt{projectTitle ? ` · ${projectTitle}` : ''}
          </p>
        </div>
      ) : (
        open.map((t) => <Zeile key={t.id} ticket={t} />)
      )}

      {done.length > 0 && (
        <div className="mt-5 pt-3 border-t" style={{ borderColor: RITTLER.line }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: RITTLER.black }}>
            Geschafft ({done.length})
          </p>
          {done.map((t) => <Zeile key={t.id} ticket={t} />)}
        </div>
      )}
    </div>
  );
}