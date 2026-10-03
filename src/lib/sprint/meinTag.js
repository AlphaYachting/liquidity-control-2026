import { istUeberfaellig, istFaellig } from '@/lib/sprint/faelligkeit';
import { addCalendarDays } from '@/lib/sprint/deadlines';

// Sonntag der laufenden Woche — bis dahin reicht der Abschnitt „Diese Woche"
export function wochenEnde(heute) {
  const tag = new Date(`${heute}T00:00:00`).getDay();
  return addCalendarDays(heute, tag === 0 ? 0 : 7 - tag);
}

const nachTermin = (a, b) => (a.planned_for || '').localeCompare(b.planned_for || '')
  || (a.order || 0) - (b.order || 0);
const nachOrder = (a, b) => (a.order || 0) - (b.order || 0);

// Gliedert die eigenen Aufgaben für „Mein Tag". Jede Aufgabe landet in genau einem Abschnitt:
// wartet → überfällig → heute → diese Woche → später → in Arbeit ohne Termin → offen ohne Termin.
// Routinen und einmalige Aufgaben laufen gemeinsam.
export function gliedereMeinTag(tickets, heute) {
  const bisVorschau = wochenEnde(heute);
  const g = {
    ueberfaellig: [], heute: [], woche: [], spaeter: [],
    inArbeit: [], ohneTermin: [], wartet: [], erledigt: [],
  };
  for (const t of tickets) {
    if (t.status === 'erledigt') g.erledigt.push(t);
    else if (t.status === 'wartet') g.wartet.push(t);
    else if (istUeberfaellig(t, heute)) g.ueberfaellig.push(t);
    else if (istFaellig(t, heute)) g.heute.push(t);
    else if (t.planned_for && t.planned_for <= bisVorschau) g.woche.push(t);
    else if (t.planned_for) g.spaeter.push(t);
    else if (t.status === 'in_arbeit') g.inArbeit.push(t);
    else g.ohneTermin.push(t);
  }
  ['ueberfaellig', 'heute', 'woche', 'spaeter', 'wartet'].forEach((k) => g[k].sort(nachTermin));
  ['inArbeit', 'ohneTermin'].forEach((k) => g[k].sort(nachOrder));
  return g;
}

// Aufgaben ohne Termin nach Projekt bündeln; das Focus-Projekt des Tages steht vorne.
export function nachProjekt(tickets, projectById, focusProjectId) {
  const map = new Map();
  for (const t of tickets) {
    if (!map.has(t.project_id)) map.set(t.project_id, []);
    map.get(t.project_id).push(t);
  }
  return [...map.entries()]
    .map(([projectId, liste]) => ({
      projectId,
      project: projectById[projectId],
      // Laufendes zuerst, dann in der Reihenfolge des Projekts
      tickets: [...liste].sort((a, b) => (b.status === 'in_arbeit') - (a.status === 'in_arbeit')
        || (a.order || 0) - (b.order || 0)),
      inArbeit: liste.filter((t) => t.status === 'in_arbeit').length,
      stunden: liste.reduce((s, t) => s + (Number(t.target_hours) || 0), 0),
    }))
    // Focus-Projekt vorne, dann Projekte mit laufender Arbeit, dann alphabetisch
    .sort((a, b) => (b.projectId === focusProjectId) - (a.projectId === focusProjectId)
      || (b.inArbeit > 0) - (a.inArbeit > 0)
      || (a.project?.title || '').localeCompare(b.project?.title || ''));
}
