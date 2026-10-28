import { etappeFreigegeben } from '@/lib/sprint/ticketAnlage';

// Regeln, wie aus einer Zeile der Prüfliste ein Ticket wird (Entscheidung 28.10.2026, Variante A):
//  - Alle im Projekt dürfen importieren.
//  - Ob ein Kundenwunsch als Change Request geführt wird, legen nur Projektleitung,
//    Führung oder Admin fest. Bei allen anderen entsteht die Aufgabe als „Pflicht“ und
//    ist für die Projektleitung zur Prüfung markiert (cr_pruefen).
//  - Change Request ist nur bei Pauschalprojekten (jederzeit) und Sprintprojekten
//    (nach Freigabe der Etappe) möglich.

export function crWaehlbar(projekttyp, etappe) {
  if (projekttyp === 'legacy') return true;
  return projekttyp === 'sprint' && etappeFreigegeben(etappe);
}

// Wie wird die Zeile angelegt? Ergebnis: 'pflicht' | 'change_request' | 'pruefen'
export function crArt(zeile, { leitung, projekttyp, etappe }) {
  if (!crWaehlbar(projekttyp, etappe)) return 'pflicht';
  if (leitung) return zeile.change_request ? 'change_request' : 'pflicht';
  // Ohne Leitungsrecht: in einer freigegebenen Etappe ist jede neue Aufgabe ein möglicher
  // Change Request, sonst nur ein erkannter neuer Wunsch — die Projektleitung entscheidet.
  if (etappeFreigegeben(etappe) || zeile.change_request_vorschlag) return 'pruefen';
  return 'pflicht';
}

export function zeileZuTicket(zeile, { leitung, projekttyp, etappe, meetingDatum, projektaktId }) {
  const art = crArt(zeile, { leitung, projekttyp, etappe });
  const datum = new Date(`${meetingDatum}T12:00:00`).toLocaleDateString('de-AT');
  const kunde = zeile.art === 'kunde';
  const beschreibung = [
    `Aus dem Meeting vom ${datum} (Eintrag im Projektakt).`,
    zeile.beleg ? `Im Gespräch: „${zeile.beleg}“` : '',
    zeile.person_genannt ? `Genannt: ${zeile.person_genannt}` : '',
    zeile.neuer_wunsch && zeile.begruendung ? `Neuer Kundenwunsch: ${zeile.begruendung}` : '',
  ].filter(Boolean).join('\n');
  return {
    title: zeile.titel,
    description: beschreibung,
    assignee_emails: zeile.assignee_emails || [],
    planned_for: zeile.termin,
    milestone_id: zeile.milestone_id,
    origin: art === 'change_request' ? 'change_request' : 'pflicht',
    pflicht_bestaetigt: art === 'pflicht' && leitung,
    ...(art === 'pruefen' ? { cr_pruefen: true, cr_pruefen_begruendung: zeile.begruendung || 'Neue Aufgabe in einer freigegebenen Etappe' } : {}),
    ...(kunde ? { status: 'wartet', wartet_auf: 'kunde', wartet_seit: meetingDatum, wartet_worauf: zeile.titel } : {}),
    ...(projektaktId ? { herkunft_projektakt_id: projektaktId } : {}),
  };
}
