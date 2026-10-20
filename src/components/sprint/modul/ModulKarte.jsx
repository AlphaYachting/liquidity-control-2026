import React from 'react';
import PersonenChip from '@/components/sprint/PersonenChip';
import { zustaendigeVon, zustaendigeAendern, personVon } from '@/lib/sprint/zustaendige';
import RoutineZeile from './RoutineZeile';
import StartAbschnitt from './StartAbschnitt';

const haeufigste = (liste) => {
  const n = {};
  liste.forEach((e) => { if (e) n[e] = (n[e] || 0) + 1; });
  return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || null;
};

export default function ModulKarte({ name, tickets, matches, members, myEmail, istPm, onStatus, onAssignee, onRefresh }) {
  const routinen = tickets.filter((t) => t.rhythmus);
  const offeneRoutinen = routinen.filter((t) => t.status !== 'erledigt');
  // Betreuer = wer in den meisten offenen Routinen zuständig ist (Einzelauswahl, eine Rolle)
  const betreuer = haeufigste(offeneRoutinen.flatMap(zustaendigeVon));
  const ketten = Object.values(routinen.reduce((acc, t) => {
    const k = t.ticket_template_id || t.title;
    (acc[k] = acc[k] || []).push(t);
    return acc;
  }, {})).filter((k) => k.some(matches));
  const einmalig = tickets.filter((t) => !t.rhythmus);

  // Betreuer wechseln: in jeder offenen Routine nur den bisherigen Betreuer ersetzen —
  // weitere Zuständige der Routine bleiben stehen.
  const betreuerSetzen = async (email) => {
    await Promise.all(offeneRoutinen.map((t) => zustaendigeAendern(t.id, email
      ? { ersetzen: { alt: betreuer, neu: email } }
      : { weg: betreuer })));
    onRefresh();
  };

  return (
    <div className="bg-white rounded-lg border border-border p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">{name}</h3>
        {routinen.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Betreuer</span>
            <PersonenChip
              member={betreuer ? personVon(betreuer, members) : undefined}
              members={members}
              isMe={betreuer === myEmail}
              disabled={!istPm || !offeneRoutinen.length}
              onAssign={betreuerSetzen}
            />
          </div>
        )}
      </div>
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