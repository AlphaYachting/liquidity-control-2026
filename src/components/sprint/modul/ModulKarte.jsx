import React from 'react';
import RoutineZeile from './RoutineZeile';
import StartAbschnitt from './StartAbschnitt';

// Modul eines Retainers: wiederkehrende Routinen plus einmalige Aufgaben.
// Kein eigener Modul-„Betreuer“ mehr (29.10.2026): zuständig ist, wer an der einzelnen
// Routine bzw. Aufgabe steht — die Projektleitung steht im Projektkopf.
export default function ModulKarte({ name, tickets, matches, members, myEmail, onStatus, onAssignee }) {
  const routinen = tickets.filter((t) => t.rhythmus);
  const ketten = Object.values(routinen.reduce((acc, t) => {
    const k = t.ticket_template_id || t.title;
    (acc[k] = acc[k] || []).push(t);
    return acc;
  }, {})).filter((k) => k.some(matches));
  const einmalig = tickets.filter((t) => !t.rhythmus);

  return (
    <div className="bg-white rounded-lg border border-border p-5">
      <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">{name}</h3>
      {ketten.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-1">Wiederkehrend</p>
          {ketten.map((k) => (
            <RoutineZeile key={k[0].id} kette={k} members={members} myEmail={myEmail} onStatus={onStatus} onAssignee={onAssignee} />
          ))}
        </div>
      )}
      <StartAbschnitt
        tickets={einmalig.filter(matches)}
        alle={einmalig}
        members={members}
        myEmail={myEmail}
        onStatus={onStatus}
        onAssignee={onAssignee}
      />
    </div>
  );
}
