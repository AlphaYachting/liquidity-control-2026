import React, { useState } from 'react';
import RoutineErledigtDialog from '@/components/sprint/RoutineErledigtDialog';
import SupportOhneZeitDialog from '@/components/sprint/SupportOhneZeitDialog';
import { ticketStatusSetzen } from '@/lib/sprint/routine';
import { supportOhneZeit } from '@/lib/sprint/supportErledigt';

// Statuswechsel für Tickets — Routinen fragen beim Erledigen nach dem nächsten Termin,
// Support-Tickets ohne gebuchte Zeit nach Zeit oder Grund (21.10.2026).
export default function useTicketStatus(onDone) {
  const [offen, setOffen] = useState(null);
  const [ohneZeit, setOhneZeit] = useState(null);

  const weiter = async (ticket, status) => {
    if (status === 'erledigt' && ticket.rhythmus && ticket.status !== 'erledigt') {
      setOffen(ticket);
      return;
    }
    await ticketStatusSetzen(ticket, status);
    onDone();
  };

  const setStatus = async (ticket, status) => {
    if (status === 'erledigt' && ticket.status !== 'erledigt') {
      const pruef = await supportOhneZeit(ticket);
      if (pruef) {
        setOhneZeit({ ticket, project: pruef.project });
        return;
      }
    }
    await weiter(ticket, status);
  };

  const dialog = (
    <>
      <RoutineErledigtDialog
        ticket={offen}
        onCancel={() => setOffen(null)}
        onConfirm={async (folgetermin) => {
          await ticketStatusSetzen(offen, 'erledigt', { folgetermin });
          setOffen(null);
          onDone();
        }}
      />
      <SupportOhneZeitDialog
        offen={ohneZeit}
        onCancel={() => setOhneZeit(null)}
        onConfirm={async () => {
          const t = ohneZeit.ticket;
          setOhneZeit(null);
          await weiter(t, 'erledigt');
        }}
      />
    </>
  );

  return { setStatus, dialog };
}
