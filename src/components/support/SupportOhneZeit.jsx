import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';

// Erledigte Tickets ohne offene Zeit — keine Position, aber sichtbar, damit nichts untergeht
export default function SupportOhneZeit({ tickets }) {
  const [offen, setOffen] = useState(false);
  if (!tickets.length) return null;
  return (
    <div className="text-xs">
      <button onClick={() => setOffen(o => !o)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
        {offen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Erledigt ohne offene Zeit ({tickets.length})
      </button>
      {offen && (
        <ul className="mt-1 ml-5 space-y-0.5">
          {tickets.map(t => (
            <li key={t.ticket_id}><Link to={t.link} className="hover:underline">{t.task_title}</Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}