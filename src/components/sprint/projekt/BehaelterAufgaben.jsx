import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import SortierbareAufgaben from '@/components/sprint/SortierbareAufgaben';
import TicketZeile from '@/components/sprint/TicketZeile';
import { nachFaelligkeit, laufenderMonat } from '@/lib/sprint/behaelterZahlen';

// Manuelle Reihenfolge (order) zuerst, sonst nach Fälligkeit
const nachReihenfolge = (a, b) => {
  const oa = a.order ?? Infinity;
  const ob = b.order ?? Infinity;
  return oa !== ob ? oa - ob : nachFaelligkeit(a, b);
};

// Aufgabenliste für Support, Intern und Altprojekte — per Drag-and-Drop sortierbar
export default function BehaelterAufgaben({ tickets, matches, members, myEmail, onStatus, onAssignee }) {
  const [erledigtOffen, setErledigtOffen] = useState(false);
  const monat = laufenderMonat();
  const sortiert = tickets.filter((t) => t.status !== 'erledigt' && matches(t)).sort(nachReihenfolge);
  const offen = sortiert;

  const erledigt = tickets.filter((t) => t.status === 'erledigt' && matches(t)
    && (t.last_status_change || t.updated_date || '').startsWith(monat));
  const zeile = (t) => (
    <TicketZeile key={t.id} ticket={t} members={members} currentUserEmail={myEmail} editable onStatus={onStatus} onAssignee={onAssignee} />
  );

  return (
    <div className="mt-4">
      <SortierbareAufgaben id="aufgaben" tickets={offen} renderZeile={zeile} />
      {offen.length === 0 && <p className="text-sm text-muted-foreground py-2">Keine offenen Aufgaben.</p>}
      {erledigt.length > 0 && (
        <div className="mt-3">
          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setErledigtOffen(!erledigtOffen)}>
            {erledigtOffen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Erledigt diesen Monat ({erledigt.length})
          </button>
          {erledigtOffen && <div className="mt-1">{erledigt.map(zeile)}</div>}
        </div>
      )}
    </div>
  );
}