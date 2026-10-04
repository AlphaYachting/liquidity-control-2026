import React from 'react';
import { fmtH } from '@/lib/auslastung/auslastungRechnung';

export default function VorschauSaetze({ vorschau, rb }) {
  return (
    <div className="bg-white rounded border border-border divide-y divide-[#eeeeee]">
      {vorschau.personen.map((p) => (
        <div key={p.key} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6">
          <div className="sm:w-48 shrink-0">
            <p className="font-medium text-body">{p.name}</p>
            {p.unsicher && <span className="text-label uppercase px-1.5 py-0.5 rounded border border-border text-status-attention">unsicher</span>}
          </div>
          <div className="flex-1 text-body">
            {p.satz}
            {p.supportTickets >= 0.5 && <span className="text-muted-foreground"> Erwartet rund {fmtH(p.supportTickets)} neue Support-Tickets pro Monat.</span>}
          </div>
          <div className="sm:text-right shrink-0">
            <p className="text-label uppercase text-muted-foreground">Gesichert nach Abbau</p>
            <p className="text-value">{fmtH(p.gesichert)} h / Monat</p>
          </div>
        </div>
      ))}
      <p className="px-4 py-2 text-meta text-muted-foreground">
        Support im Schnitt: {fmtH(rb.supportNeuProMonat)} neue Tickets pro Monat · {fmtH(rb.stdJeSupportTicket)} h je Ticket (letzte sechs volle Monate).
      </p>
    </div>
  );
}