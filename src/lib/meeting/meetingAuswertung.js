import { base44 } from '@/api/base44Client';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import { NICHT_ARCHIVIERT } from '@/lib/sprint/aktivFilter';
import { etappeFreigegeben } from '@/lib/sprint/ticketAnlage';

// Meeting-Import: Kontext laden und Transkript auswerten. Schreibt nichts in die Datenbank.

const istDatum = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const norm = (s) => String(s || '').trim().toLowerCase();

// Alles, was Auswertung und Prüfliste über das Projekt brauchen — ein Aufruf beim Öffnen.
export async function ladeMeetingKontext(projectId) {
  const projekt = await base44.entities.Project.get(projectId);
  const [kunde, sprints, team, tickets] = await Promise.all([
    projekt.client_id ? base44.entities.Client.get(projekt.client_id).catch(() => null) : null,
    base44.entities.Sprint.filter({ project_id: projectId }, 'start_date', 50),
    base44.entities.TeamMember.filter({ active: { $ne: false } }, 'name', 200),
    base44.entities.Ticket.filter({ project_id: projectId, status: { $ne: 'erledigt' }, ...NICHT_ARCHIVIERT }, 'order', 1000),
  ]);
  const sprintIds = sprints.map((s) => s.id);
  const etappenRoh = sprintIds.length
    ? await base44.entities.Milestone.filter({ sprint_id: { $in: sprintIds } }, 'order', 300)
    : [];
  // Laufende Sprints zuerst, innerhalb nach Reihenfolge
  const sprintRang = Object.fromEntries(sprints.map((s, i) => [s.id, (s.status === 'laufend' ? 0 : 1000) + i]));
  const etappen = etappenRoh
    .slice()
    .sort((a, b) => (sprintRang[a.sprint_id] - sprintRang[b.sprint_id]) || ((a.order || 0) - (b.order || 0)));
  return {
    projekt,
    kunde,
    projekttyp: projectTypeOf(projekt),
    etappen,
    team: team.filter((m) => m.email),
    offeneTickets: tickets,
  };
}

const SCHEMA = {
  type: 'object',
  properties: {
    zusammenfassung: { type: 'string' },
    vereinbarungen: { type: 'array', items: { type: 'string' } },
    offene_fragen: { type: 'array', items: { type: 'string' } },
    teilnehmer: { type: 'string' },
    aufgaben: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titel: { type: 'string' },
          art: { type: 'string', enum: ['rittler', 'kunde'] },
          person_genannt: { type: 'string' },
          person_email: { type: 'string' },
          termin: { type: 'string' },
          etappe_id: { type: 'string' },
          neuer_wunsch: { type: 'boolean' },
          begruendung: { type: 'string' },
          aehnliches_ticket_id: { type: 'string' },
          beleg: { type: 'string' },
        },
      },
    },
  },
};

function promptFuer({ text, meetingDatum, ctx, teil }) {
  const { projekt, kunde, etappen, team, offeneTickets, projekttyp } = ctx;
  const etappenListe = etappen.length
    ? etappen.map((m) => `- ${m.id} | ${m.title}${etappeFreigegeben(m) ? ' | FREIGEGEBEN' : ''}`).join('\n')
    : '(keine)';
  const teamListe = team.map((m) => `- ${m.name} <${m.email}>`).join('\n');
  const ticketListe = offeneTickets.length
    ? offeneTickets.slice(0, 300).map((t) => `- ${t.id} | ${t.title}${t.description ? ` — ${String(t.description).slice(0, 160).replace(/\s+/g, ' ')}` : ''}`).join('\n')
    : '(keine)';
  return `Du wertest ein Besprechungstranskript für die Agentur Rittler & Co aus.
Projekt: ${projekt.title || projekt.project_name || '—'} | Kunde: ${kunde?.name || '—'} | Projekttyp: ${projekttyp}
Datum des Meetings: ${meetingDatum}
${teil ? `Dies ist Teil ${teil.nr} von ${teil.von} des Transkripts.\n` : ''}
Team von Rittler (einzige gültige Personen):
${teamListe}

Etappen des Projekts (id | Titel):
${etappenListe}

Offene Tickets des Projekts (id | Titel):
${ticketListe}

TRANSKRIPT:
"""${text}"""

REGELN — streng einhalten:
1. Nichts erfinden. Nimm nur Aufgaben auf, die im Gespräch ausdrücklich vereinbart, zugesagt oder beauftragt wurden. Bloße Ideen oder Überlegungen sind keine Aufgaben.
2. art: 'rittler', wenn jemand von Rittler etwas erledigt; 'kunde', wenn der Kunde etwas liefert, freigibt oder entscheidet.
3. person_genannt: der Name genau so, wie er im Transkript steht (leer, wenn niemand genannt).
4. person_email: NUR wenn der genannte Name eindeutig genau einer Person aus der Teamliste entspricht. „John“ (John Soliman) und „Johannes“ (Johannes Fechter) sind ZWEI verschiedene Personen. „Mathias“ oder „Matthias“ ist Mathias Galler. Im geringsten Zweifel leer lassen. Bei art 'kunde' leer lassen.
5. termin: nur wenn ein Termin oder eine Frist genannt wurde, als YYYY-MM-DD. Relative Angaben („bis Freitag“, „nächste Woche“) vom Meetingdatum aus umrechnen. Sonst leer.
6. etappe_id: eine id aus der Etappenliste, wenn die Aufgabe klar dorthin gehört; sonst leer.
7. neuer_wunsch: true, wenn der Kunde etwas verlangt, das nach dem Gespräch neu oder zusätzlich zum bisherigen Auftrag ist; begruendung in einem Satz. Sonst false und leer.
8. aehnliches_ticket_id: id eines offenen Tickets, das dieselbe Sache meint; sonst leer.
9. beleg: kurzes wörtliches Zitat aus dem Transkript (höchstens 25 Wörter), auf dem die Aufgabe beruht.
10. titel: sachlich, als Tätigkeit formuliert, höchstens 10 Wörter.
11. Außerdem: zusammenfassung (5–8 sachliche Sätze), vereinbarungen (Liste verbindlicher Absprachen), offene_fragen (Liste), teilnehmer (wie genannt, kommagetrennt).
Antworte auf Deutsch.`;
}

// Lange Transkripte in überlappende Abschnitte teilen (an Zeilengrenzen, wenn möglich)
export function teileText(text, groesse = 30000, ueberlappung = 2000) {
  if (text.length <= 40000) return [text];
  const teile = [];
  let start = 0;
  while (start < text.length) {
    let ende = Math.min(text.length, start + groesse);
    if (ende < text.length) {
      const umbruch = text.lastIndexOf('\n', ende);
      if (umbruch > start + groesse * 0.6) ende = umbruch;
    }
    teile.push(text.slice(start, ende));
    if (ende >= text.length) break;
    start = Math.max(ende - ueberlappung, start + 1);
  }
  return teile;
}

async function frageKi(prompt) {
  const res = await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: SCHEMA });
  if (!res || typeof res !== 'object') throw new Error('Die Auswertung lieferte kein Ergebnis');
  return res;
}

// Ergebnisse mehrerer Abschnitte zusammenführen und doppelte Aufgaben entfernen
async function fuehreZusammen(teilergebnisse, ctx, meetingDatum) {
  const aufgabenRoh = teilergebnisse.flatMap((r) => r.aufgaben || []);
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `Führe die Auswertung eines in Abschnitten verarbeiteten Meetings vom ${meetingDatum} zusammen (Projekt ${ctx.projekt.title || ''}).
Entferne doppelte Aufgaben (gleiche Sache, auch anders formuliert) — behalte jeweils die vollständigste Fassung mit allen Feldern. Erfinde nichts dazu.
Schreibe eine gemeinsame zusammenfassung (5–8 Sätze) und vereinige vereinbarungen, offene_fragen und teilnehmer ohne Doppelungen.

Zusammenfassungen der Abschnitte:
${teilergebnisse.map((r, i) => `[${i + 1}] ${r.zusammenfassung || ''}`).join('\n')}

Vereinbarungen: ${JSON.stringify(teilergebnisse.flatMap((r) => r.vereinbarungen || []))}
Offene Fragen: ${JSON.stringify(teilergebnisse.flatMap((r) => r.offene_fragen || []))}
Teilnehmer: ${teilergebnisse.map((r) => r.teilnehmer).filter(Boolean).join(', ')}
Aufgaben: ${JSON.stringify(aufgabenRoh)}`,
    response_json_schema: SCHEMA,
  });
  if (!res || typeof res !== 'object') throw new Error('Zusammenführung fehlgeschlagen');
  return res;
}

// Vorschläge der KI prüfen — was nicht belegbar ist, wird geleert, nicht geraten.
function bereinige(res, ctx) {
  const teamMails = new Set(ctx.team.map((m) => norm(m.email)));
  const etappeVon = Object.fromEntries(ctx.etappen.map((m) => [m.id, m]));
  const ticketVon = Object.fromEntries(ctx.offeneTickets.map((t) => [t.id, t]));
  const crMoeglich = ['sprint', 'legacy'].includes(ctx.projekttyp);
  // Eine einzige offene Etappe (Retainer, Support, Regie …) wird fest gesetzt
  const offeneEtappen = ctx.etappen.filter((m) => !etappeFreigegeben(m));
  const standardEtappe = ctx.etappen.length === 1 ? ctx.etappen[0]
    : (!crMoeglich && offeneEtappen.length === 1 ? offeneEtappen[0] : null);

  const aufgaben = (res.aufgaben || [])
    .filter((a) => String(a?.titel || '').trim())
    .map((a, i) => {
      const art = a.art === 'kunde' ? 'kunde' : 'rittler';
      const email = art === 'rittler' && teamMails.has(norm(a.person_email)) ? norm(a.person_email) : '';
      const etappe = etappeVon[a.etappe_id] || standardEtappe || null;
      const aehnlich = ticketVon[a.aehnliches_ticket_id] || null;
      const neuerWunsch = a.neuer_wunsch === true;
      return {
        key: `a${i}`,
        titel: String(a.titel).trim(),
        art,
        person_genannt: String(a.person_genannt || '').trim(),
        assignee_emails: email ? [email] : [],
        termin: istDatum(a.termin) ? a.termin : '',
        milestone_id: etappe?.id || '',
        neuer_wunsch: neuerWunsch,
        begruendung: String(a.begruendung || '').trim(),
        change_request_vorschlag: neuerWunsch && crMoeglich && etappeFreigegeben(etappe),
        aehnliches_ticket: aehnlich ? { id: aehnlich.id, title: aehnlich.title, milestone_id: aehnlich.milestone_id } : null,
        beleg: String(a.beleg || '').trim(),
      };
    });

  return {
    zusammenfassung: String(res.zusammenfassung || '').trim(),
    vereinbarungen: (res.vereinbarungen || []).map((v) => String(v).trim()).filter(Boolean),
    offene_fragen: (res.offene_fragen || []).map((v) => String(v).trim()).filter(Boolean),
    teilnehmer: String(res.teilnehmer || '').trim(),
    aufgaben,
    cr_moeglich: crMoeglich,
  };
}

export async function werteMeetingAus({ text, meetingDatum, ctx, onFortschritt }) {
  const teile = teileText(text);
  if (teile.length === 1) {
    onFortschritt?.(1, 1);
    return bereinige(await frageKi(promptFuer({ text, meetingDatum, ctx })), ctx);
  }
  const ergebnisse = [];
  for (let i = 0; i < teile.length; i++) {
    onFortschritt?.(i + 1, teile.length + 1);
    ergebnisse.push(await frageKi(promptFuer({ text: teile[i], meetingDatum, ctx, teil: { nr: i + 1, von: teile.length } })));
  }
  onFortschritt?.(teile.length + 1, teile.length + 1);
  return bereinige(await fuehreZusammen(ergebnisse, ctx, meetingDatum), ctx);
}
