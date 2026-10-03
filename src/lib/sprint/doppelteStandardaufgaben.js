import { base44 } from '@/api/base44Client';
import { ticketBereinigen } from '@/lib/sprint/ticketBereinigen';

// Erkennt Etappen, die beim Anlegen dieselben Standardaufgaben eines mehrfach gewählten Moduls
// bekommen haben (z. B. „Website Service / Anpassung" für mehrere Positionen).
// Vorschlag je Etappe: eine Aufgabe mit dem Etappennamen, Planstunden zusammengezählt.
// Unangetastet bleiben die erste Etappe eines Moduls, freigegebene Etappen und jede Etappe,
// in der schon gearbeitet oder Zeit gebucht wurde.
const schluessel = (liste) => liste.map((t) => (t.title || '').trim().toLowerCase()).sort().join('|');

export function doppelteStandardaufgaben({ milestones = [], tickets = [], timeEntries = [] }) {
  const gebucht = new Set(timeEntries.map((e) => e.ticket_id).filter(Boolean));
  const nachModul = {};
  [...milestones]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach((m) => {
      if (!m.module_template_id) return;
      (nachModul[m.module_template_id] = nachModul[m.module_template_id] || []).push(m);
    });

  const vorschlaege = [];
  Object.entries(nachModul).forEach(([modulId, etappen]) => {
    if (etappen.length < 2) return;
    const info = etappen.map((m) => {
      const eigene = tickets.filter((t) => t.milestone_id === m.id);
      return { m, eigene, key: schluessel(eigene) };
    });
    const anzahl = {};
    info.forEach((i) => { anzahl[i.key] = (anzahl[i.key] || 0) + 1; });

    info.forEach((i, idx) => {
      const { m, eigene, key } = i;
      if (idx === 0 || m.state === 'freigegeben' || eigene.length < 2 || anzahl[key] < 2) return;
      if (eigene.some((t) => t.status !== 'offen' || gebucht.has(t.id))) return;
      const haupt = eigene.find((t) => t.milestone_state === 'produktion' && t.assignee_email)
        || eigene.find((t) => t.assignee_email)
        || eigene[0];
      vorschlaege.push({
        milestone: m,
        modulId,
        alte: eigene,
        neu: {
          title: m.title,
          assignee_email: haupt.assignee_email || undefined,
          role: haupt.role || undefined,
          milestone_state: 'produktion',
          target_hours: eigene.reduce((s, t) => s + (Number(t.target_hours) || 0), 0),
        },
      });
    });
  });
  return vorschlaege;
}

// „Etappen 2–8" bei lückenloser Folge, sonst „Etappen 2, 4 und 6"
export function etappenText(vorschlaege) {
  const nr = vorschlaege.map((v) => v.milestone.order).filter((n) => n != null).sort((a, b) => a - b);
  if (!nr.length) return 'Mehrere Etappen';
  if (nr.length === 1) return `Etappe ${nr[0]}`;
  const lueckenlos = nr.every((n, i) => i === 0 || n === nr[i - 1] + 1);
  if (lueckenlos) return `Etappen ${nr[0]}–${nr[nr.length - 1]}`;
  return `Etappen ${nr.slice(0, -1).join(', ')} und ${nr[nr.length - 1]}`;
}

// Archiviert die alten Aufgaben (Grund „doppelt", jederzeit wiederherstellbar) und legt je Etappe,
// deren alte Aufgaben vollständig archiviert wurden, die eine neue Aufgabe an.
export async function zusammenfuehren(vorschlaege, projectId) {
  const ids = vorschlaege.flatMap((v) => v.alte.map((t) => t.id));
  const ergebnis = await ticketBereinigen('archivieren', ids, 'doppelt');
  const archiviert = new Set(ergebnis.erledigt);
  const jetzt = new Date().toISOString();
  const neu = vorschlaege
    .filter((v) => v.alte.every((t) => archiviert.has(t.id)))
    .map((v) => ({
      milestone_id: v.milestone.id,
      project_id: projectId,
      order: 1,
      status: 'offen',
      origin: 'pflicht',
      last_status_change: jetzt,
      ...v.neu,
    }));
  if (neu.length) await base44.entities.Ticket.bulkCreate(neu);
  return {
    alt: archiviert.size,
    neu: neu.length,
    abgelehnt: ergebnis.abgelehnt,
  };
}
