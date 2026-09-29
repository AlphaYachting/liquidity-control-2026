import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import TicketZeile from '@/components/sprint/TicketZeile';

// Einmalige Tickets eines Moduls; vollständig erledigt → eingeklappt.
export default function StartAbschnitt({ tickets, alle, members, myEmail, onStatus, onAssignee }) {
  const fertig = alle.length > 0 && alle.every((t) => t.status === 'erledigt');
  const [offen, setOffen] = useState(!fertig);
  if (!tickets.length) return null;
  const sortiert = [...tickets].sort((a, b) => (a.status === 'erledigt') - (b.status === 'erledigt') || (a.order || 0) - (b.order || 0));

  return (
    <div className="mt-3">
      <button type="button" onClick={() => setOffen((v) => !v)} className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
        {offen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {fertig ? `Setup abgeschlossen (${alle.length}/${alle.length})` : 'Zum Start'}
      </button>
      {offen && sortiert.map((t) => (
        <TicketZeile key={t.id} ticket={t} members={members} currentUserEmail={myEmail} editable onStatus={onStatus} onAssignee={onAssignee} />
      ))}
    </div>
  );
}