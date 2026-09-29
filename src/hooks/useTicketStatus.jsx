import React, { useState } from 'react';
import RoutineErledigtDialog from '@/components/sprint/RoutineErledigtDialog';
import { ticketStatusSetzen } from '@/lib/sprint/routine';

// Statuswechsel für Tickets — Routinen fragen beim Erledigen nach dem nächsten Termin.
export default function useTicketStatus(onDone) {
  const [offen, setOffen] = useState(null);

  const setStatus = async (ticket, status) => {
    if (status === 'erledigt' && ticket.rhythmus && ticket.status !== 'erledigt') {
      setOffen(ticket);
      return;
    }
    await ticketStatusSetzen(ticket, status);
    onDone();
  };

  const dialog = (
    <RoutineErledigtDialog
      ticket={offen}
      onCancel={() => setOffen(null)}
      onConfirm={async (folgetermin) => {
        await ticketStatusSetzen(offen, 'erledigt', { folgetermin });
        setOffen(null);
        onDone();
      }}
    />
  );

  return { setStatus, dialog };
}