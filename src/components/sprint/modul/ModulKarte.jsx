import React from 'react';
import { base44 } from '@/api/base44Client';
import PersonenChip from '@/components/sprint/PersonenChip';
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
  const betreuer = haeufigste(offeneRoutinen.map((t) => t.assignee_email));
  const ketten = Object.values(routinen.reduce((acc, t) => {
    const k = t.ticket_template_id || t.title;
    (acc[k] = acc[k] || []).push(t);
    return acc;
  }, {})).filter((k) => k.some(matches));
  const einmalig = tickets.filter((t) => !t.rhythmus);

  const betreuerSetzen = async (email) => {
    await Promise.all(offeneRoutinen.map((t) => base44.entities.Ticket.update(t.id, { assignee_email: email })));
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
              member={members.find((m) => m.email === betreuer)}
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