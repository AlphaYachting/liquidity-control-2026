import { projectTypeOf, istWartung, PROJECT_TYPES, WARTUNG_STYLE } from '@/components/sprint/projectTypes';

// Gliederung der Projektliste: ein Abschnitt je Projekttyp, Wartungsverträge als eigene Klasse.
// Reihenfolge = Reihenfolge auf der Seite. Wartung steht zuletzt und ist anfangs eingeklappt,
// weil sie die größte Gruppe ist und selten täglich gebraucht wird.
export const PROJEKT_GRUPPEN = [
  { key: 'sprint', titel: 'Sprintprojekte', style: PROJECT_TYPES.sprint.style },
  { key: 'legacy', titel: 'Pauschalprojekte', style: PROJECT_TYPES.legacy.style },
  { key: 'retainer', titel: 'Retainer', style: PROJECT_TYPES.container.style },
  { key: 'regie', titel: 'Regie', style: PROJECT_TYPES.regie.style },
  { key: 'support', titel: 'Support', style: PROJECT_TYPES.support.style },
  { key: 'wartung', titel: 'Wartungsverträge', style: WARTUNG_STYLE, anfangsZu: true },
  { key: 'intern', titel: 'Intern', style: PROJECT_TYPES.intern.style },
  { key: 'legacy', titel: 'Pauschalprojekte', style: PROJECT_TYPES.legacy.style },
];

export function gruppeVon(project) {
  if (istWartung(project)) return 'wartung';
  const typ = projectTypeOf(project);
  return typ === 'container' ? 'retainer' : typ;
}

// Projektstand: alles, was nicht pausiert oder abgeschlossen ist, gilt als laufend.
export const STAND_OPTIONEN = [
  { key: 'laufend', label: 'Laufend' },
  { key: 'pausiert', label: 'Pausiert' },
  { key: 'abgeschlossen', label: 'Abgeschlossen' },
];

export function standVon(project) {
  if (project?.status === 'abgeschlossen') return 'abgeschlossen';
  if (project?.status === 'pausiert') return 'pausiert';
  return 'laufend';
}

const klein = (s) => String(s || '').trim().toLowerCase();

// „Meine": ich bin Projektverantwortlicher ODER habe eine offene Aufgabe im Projekt.
export function meineProjektIds({ projects = [], tickets = [], email }) {
  const ich = klein(email);
  const ids = new Set();
  if (!ich) return ids;
  projects.forEach((p) => { if (klein(p.pm_email) === ich) ids.add(p.id); });
  tickets.forEach((t) => {
    if (t.project_id && t.status !== 'erledigt' && klein(t.assignee_email) === ich) ids.add(t.project_id);
  });
  return ids;
}

// Suche in der Liste: Projekttitel, Kunde, Kürzel — jedes Wort muss vorkommen.
export function passtZurSuche(project, client, suche) {
  const worte = klein(suche).split(/\s+/).filter(Boolean);
  if (!worte.length) return true;
  const text = klein(`${project?.title} ${client?.name} ${project?.kuerzel}`);
  return worte.every((w) => text.includes(w));
}

// Gemerkte Wahl je Browser — die Seite muss auch ohne Speicher funktionieren.
export function merkLesen(key, fallback) {
  try {
    const roh = window.localStorage.getItem(key);
    return roh === null ? fallback : JSON.parse(roh);
  } catch {
    return fallback;
  }
}

export function merkSchreiben(key, wert) {
  try { window.localStorage.setItem(key, JSON.stringify(wert)); } catch { /* ohne Speicher weiter */ }
}
