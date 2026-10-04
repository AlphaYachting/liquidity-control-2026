import React, { useState } from 'react';
import { RefreshCw, CalendarDays } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { STATUS_COLORS, RITTLER, fmtDate, todayIso } from '@/components/sprint/sprintConfig';
import { istUeberfaellig } from '@/lib/sprint/faelligkeit';
import { ladeAnsichtenNachTicketAenderung } from '@/lib/sprint/ansichtenNeuLaden';

const RHYTHMUS_LABEL = { woechentlich: 'wöchentlich', '14taegig': 'alle 14 Tage', monatlich: 'monatlich', '2monatlich': 'alle 2 Monate', quartalsweise: 'quartalsweise', halbjaehrlich: 'halbjährlich', jaehrlich: 'jährlich', manuell: 'manuell' };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Fälligkeit einer Aufgabe — anzeigen und verschieben.
export default function FaelligkeitKnopf({ ticket, disabled = false }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const ueberfaellig = istUeberfaellig(ticket, todayIso());
  const farbe = ueberfaellig ? STATUS_COLORS.critical : RITTLER.textSecondary;

  const speichern = async (d) => {
    setOpen(false);
    if (!d && ticket.rhythmus) return;
    await base44.entities.Ticket.update(ticket.id, { planned_for: d ? iso(d) : null });
    ladeAnsichtenNachTicketAenderung(queryClient);
  };

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
      {ticket.rhythmus && (
        <span title={RHYTHMUS_LABEL[ticket.rhythmus]} className="inline-flex">
          <RefreshCw className="text-muted-foreground" style={{ width: 12, height: 12 }} />
        </span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            type="button"
            title={disabled ? undefined : ticket.planned_for ? 'Fälligkeit ändern' : 'Fälligkeit setzen'}
            className="inline-flex items-center gap-1 text-xs px-1 py-0.5 rounded hover:bg-muted hover:text-foreground whitespace-nowrap"
            style={{ color: farbe }}
          >
            {ueberfaellig
              ? <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS.critical }} />
              : <CalendarDays className="w-3 h-3 shrink-0" />}
            {ticket.planned_for ? fmtDate(ticket.planned_for).slice(0, 6) : 'ohne Termin'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={ticket.planned_for ? new Date(`${ticket.planned_for}T00:00:00`) : undefined}
            onSelect={speichern}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </span>
  );
}