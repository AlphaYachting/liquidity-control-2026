import React, { useState } from 'react';
import SupportOhneZeitDialog from '@/components/sprint/SupportOhneZeitDialog';
import { ticketStatusSetzen } from '@/lib/sprint/routine';
import { supportOhneZeit } from '@/lib/sprint/supportErledigt';

// Statuswechsel für Tickets — Routinen gehen beim Erledigen sofort in die nächste Runde,
// Termin automatisch nach Rhythmus (29.10.2026, vorher Datumsabfrage);
// Support-Tickets ohne gebuchte Zeit fragen nach Zeit oder Grund (21.10.2026).
export default function useTicketStatus(onDone) {
  const [ohneZeit, setOhneZeit] = useState(null);

  const weiter = async (ticket, status) => {
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
