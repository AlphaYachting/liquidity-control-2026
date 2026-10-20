import React, { useState } from 'react';
import SectionLabel from '@/components/sprint/SectionLabel';
import AufgabenFilter from '@/components/sprint/AufgabenFilter';
import ModulAnsicht from '@/components/sprint/ModulAnsicht';
import StundenNachBereich from '@/components/sprint/projekt/StundenNachBereich';
import BehaelterAufgaben from '@/components/sprint/projekt/BehaelterAufgaben';
import useTicketStatus from '@/hooks/useTicketStatus';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import { istZustaendig, hatZustaendige, zustaendigeAendern, alsAenderung } from '@/lib/sprint/zustaendige';

// Hauptinhalt der Projektseite für Nicht-Sprint-Projekte.
// aktionen: Knöpfe wie „Aufgabe hinzufügen“ — stehen direkt über der Aufgabenliste.
export default function BehaelterInhalt({ project, tickets, members, timeEntries, myEmail, onRefresh, aktionen }) {
  const [filter, setFilter] = useState('alle');
  const { setStatus, dialog } = useTicketStatus(onRefresh);
  const istContainer = projectTypeOf(project) === 'container';

  const counts = {
    alle: tickets.length,
    meine: tickets.filter((t) => istZustaendig(t, myEmail)).length,
    offen_zuweisung: tickets.filter((t) => !hatZustaendige(t)).length,
  };
  const matches = (t) => {
    if (filter === 'meine') return istZustaendig(t, myEmail);
    if (filter === 'offen_zuweisung') return !hatZustaendige(t);
    return true;
  };
  const onAssignee = async (ticket, wert) => {
    await zustaendigeAendern(ticket.id, alsAenderung(wert));
    onRefresh();
  };

  return (
    <div className="space-y-3">
      {istContainer && <StundenNachBereich timeEntries={timeEntries} />}
      <div className="bg-card rounded border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <SectionLabel>Aufgaben</SectionLabel>
          {aktionen}
        </div>
        <AufgabenFilter value={filter} onChange={setFilter} counts={counts} />
        {istContainer ? (
          <div className="mt-4">
            <ModulAnsicht
              tickets={tickets}
              matches={matches}
              members={members}
              myEmail={myEmail}
              project={project}
              onStatus={setStatus}
              onAssignee={onAssignee}
              onRefresh={onRefresh}
            />
          </div>
        ) : (
          <BehaelterAufgaben tickets={tickets} matches={matches} members={members} myEmail={myEmail} onStatus={setStatus} onAssignee={onAssignee} />
        )}
      </div>
      {dialog}
    </div>
  );
}