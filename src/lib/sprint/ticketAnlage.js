import { base44 } from '@/api/base44Client';
import { zustaendigFelder, MAX_ZUSTAENDIGE } from '@/lib/sprint/zustaendige';

// GEMEINSAME TICKET-ANLAGE (Meeting-Import, Zusagen aus dem Projektakt).
// Eine Stelle für die Regeln, die bisher in jedem Anlagedialog einzeln stehen:
//  - Projekt, Etappe, Titel, mindestens eine zuständige Person und ein Termin sind Pflicht
//    (Person und Termin Pflicht seit Audit 24.10.2026)
//  - Zuständige nur über zustaendigFelder (höchstens vier)
//  - nach der Freigabe einer Etappe ist eine neue Aufgabe ein Change Request — das wird hier
//    nicht still umgedeutet, sondern muss bewusst bestätigt sein (origin 'change_request')
//    oder als Kundenwunsch zur Prüfung durch die Projektleitung markiert sein (cr_pruefen)
//  - Phase = Phase der Etappe, nach der Freigabe 'produktion'
//  - Reihenfolge: hinter die letzte Aufgabe der Etappe
// Bestehende Anlagedialoge nutzen diese Funktion (noch) nicht.

const istDatum = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const heute = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const etappeFreigegeben = (etappe) => !!etappe && (etappe.released === true || etappe.state === 'freigegeben');

// Prüft eine Zeile ohne zu speichern — für die Live-Prüfung im Dialog.
// Gibt eine Liste lesbarer Gründe zurück (leer = anlegbar).
export function pruefeZeile(zeile, etappe) {
  const gruende = [];
  if (!String(zeile?.title || '').trim()) gruende.push('Titel fehlt');
  const personen = (zeile?.assignee_emails || []).filter(Boolean);
  if (!personen.length) gruende.push('Person fehlt');
  if (personen.length > MAX_ZUSTAENDIGE) gruende.push('Höchstens vier zuständige Personen');
  if (!istDatum(zeile?.planned_for)) gruende.push('Termin fehlt');
  if (!zeile?.milestone_id || !etappe) gruende.push('Etappe fehlt');
  else if (etappeFreigegeben(etappe) && zeile.origin !== 'change_request' && !zeile.cr_pruefen) {
    gruende.push('Etappe freigegeben — Pflicht oder Change Request bestätigen');
  }
  return gruende;
}

// Legt die Zeilen an. Unvollständige Zeilen werden übersprungen und mit Grund zurückgegeben,
// die übrigen trotzdem angelegt. Rückgabe: { angelegt: Ticket[], fehler: [{ index, grund }] }
export async function legeTicketsAn(zeilen, { projectId }) {
  const ergebnis = { angelegt: [], fehler: [] };
  if (!projectId) throw new Error('Projekt fehlt');
  if (!zeilen?.length) return ergebnis;

  // Etappen frisch laden — der Freigabestand kann sich seit dem Öffnen geändert haben
  const ids = [...new Set(zeilen.map((z) => z.milestone_id).filter(Boolean))];
  const etappen = ids.length ? await base44.entities.Milestone.filter({ id: { $in: ids } }, 'order', 200) : [];
  const etappeVon = Object.fromEntries(etappen.map((m) => [m.id, m]));

  const gueltig = [];
  zeilen.forEach((z, index) => {
    const etappe = etappeVon[z.milestone_id];
    const gruende = pruefeZeile(z, etappe);
    if (gruende.length) ergebnis.fehler.push({ index, grund: gruende.join(', ') });
    else gueltig.push({ z, index, etappe });
  });

  // Je Etappe: hinter die letzte vorhandene Aufgabe hängen, dann in einem Aufruf anlegen
  const jeEtappe = {};
  gueltig.forEach((g) => { (jeEtappe[g.etappe.id] ||= []).push(g); });

  const jetzt = new Date().toISOString();
  for (const [etappeId, gruppe] of Object.entries(jeEtappe)) {
    const etappe = gruppe[0].etappe;
    try {
      const vorhanden = await base44.entities.Ticket.filter({ milestone_id: etappeId }, '-order', 1);
      const start = Number(vorhanden[0]?.order) || 0;
      const freigegeben = etappeFreigegeben(etappe);
      const daten = gruppe.map(({ z }, i) => {
        const wartet = z.status === 'wartet';
        return {
          project_id: projectId,
          milestone_id: etappeId,
          order: start + i + 1,
          title: String(z.title).trim(),
          ...(z.description ? { description: z.description } : {}),
          ...(z.role ? { role: z.role } : {}),
          ...zustaendigFelder(z.assignee_emails),
          planned_for: z.planned_for,
          target_hours: Number(z.target_hours) || 0,
          milestone_state: !freigegeben && etappe.state && etappe.state !== 'freigegeben' ? etappe.state : 'produktion',
          origin: z.origin === 'change_request' ? 'change_request' : 'pflicht',
          status: wartet ? 'wartet' : 'offen',
          ...(wartet ? {
            wartet_auf: z.wartet_auf || 'kunde',
            wartet_seit: istDatum(z.wartet_seit) ? z.wartet_seit : heute(),
            ...(z.wartet_worauf ? { wartet_worauf: z.wartet_worauf } : {}),
          } : {}),
          ...(z.cr_pruefen ? { cr_pruefen: true, cr_pruefen_begruendung: z.cr_pruefen_begruendung || '' } : {}),
          last_status_change: jetzt,
        };
      });
      const neu = await base44.entities.Ticket.bulkCreate(daten);
      ergebnis.angelegt.push(...(Array.isArray(neu) ? neu : []));
    } catch (e) {
      const grund = e?.response?.data?.message || e?.message || 'Anlage fehlgeschlagen';
      gruppe.forEach(({ index }) => ergebnis.fehler.push({ index, grund }));
    }
  }
  return ergebnis;
}
