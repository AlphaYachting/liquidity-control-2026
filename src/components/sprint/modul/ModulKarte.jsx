import React from 'react';
import RoutineZeile from './RoutineZeile';
import StartAbschnitt from './StartAbschnitt';

// Routine-Ketten bilden (29.10.2026): zuerst über die Verknüpfung Vorgänger → Folgeinstanz,
// dann Instanzen mit gleicher Vorlage UND gleichem Titel zusammenführen (Alt-Instanzen ohne Verknüpfung).
// Vorher reichte die gleiche Vorlage — zwei verschiedene Routinen derselben Vorlage verschmolzen
// zu einer Zeile, und eine davon war unsichtbar.
function kettenBilden(routinen) {
  const eltern = {};
  const finde = (id) => {
    let r = id;
    while (eltern[r] !== r) r = eltern[r];
    return r;
  };
  const verbinde = (a, b) => {
    const ra = finde(a);
    const rb = finde(b);
    if (ra !== rb) eltern[ra] = rb;
  };
  routinen.forEach((t) => { eltern[t.id] = t.id; });
  routinen.forEach((t) => { if (t.vorgaenger_id && eltern[t.vorgaenger_id]) verbinde(t.id, t.vorgaenger_id); });
  const erster = {};
  routinen.forEach((t) => {
    const k = `${t.ticket_template_id || ''}|${String(t.title || '').trim().toLowerCase()}`;
    if (erster[k]) verbinde(t.id, erster[k]);
    else erster[k] = t.id;
  });
  const gruppen = {};
  routinen.forEach((t) => {
    const r = finde(t.id);
    (gruppen[r] = gruppen[r] || []).push(t);
  });
  return Object.values(gruppen);
}

// Letzte erledigte Instanz einer Kette ohne offene Runde
const letzteErledigte = (kette) => kette
  .filter((t) => t.status === 'erledigt')
  .sort((a, b) => (b.last_status_change || '').localeCompare(a.last_status_change || ''))[0] || null;

// Modul eines Retainers: wiederkehrende Routinen plus einmalige Aufgaben.
// Kein eigener Modul-„Betreuer“ mehr (29.10.2026): zuständig ist, wer an der einzelnen
// Routine bzw. Aufgabe steht — die Projektleitung steht im Projektkopf.
// beendetIds: erledigte Instanzen, deren Folgeinstanz über „Routine beenden“ archiviert wurde.
export default function ModulKarte({ name, tickets, alleTickets, matches, members, myEmail, onStatus, onAssignee, onRefresh, darfRoutine = false, beendetIds }) {
  const routinen = tickets.filter((t) => t.rhythmus);
  const nachfolgerVon = new Set((alleTickets || tickets).map((t) => t.vorgaenger_id).filter(Boolean));
  const ketten = kettenBilden(routinen)
    // Kette ohne offene Runde, deren letzte Instanz schon einen Nachfolger hat (z. B. auf
    // „nicht wiederkehrend“ gestellt): gehört nicht mehr in „Wiederkehrend“.
    .filter((k) => {
      if (k.some((t) => t.status !== 'erledigt')) return true;
      const letzte = letzteErledigte(k);
      return !(letzte && nachfolgerVon.has(letzte.id));
    })
    .filter((k) => k.some(matches));
  const einmalig = tickets.filter((t) => !t.rhythmus);

  return (
    <div className="bg-white rounded-lg border border-border p-5">
      <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">{name}</h3>
      {ketten.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-1">Wiederkehrend</p>
          {ketten.map((k) => {
            const letzte = letzteErledigte(k);
            return (
              <RoutineZeile
                key={k[0].id}
                kette={k}
                members={members}
                myEmail={myEmail}
                onStatus={onStatus}
                onAssignee={onAssignee}
                onRefresh={onRefresh}
                darfRoutine={darfRoutine}
                beendet={!!letzte && !!beendetIds?.has(letzte.id)}
              />
            );
          })}
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
