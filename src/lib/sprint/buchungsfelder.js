import { base44 } from '@/api/base44Client';

export const KATEGORIE_TEXT = {
  sprint: 'Sprint · zählt gegen das Sprintbudget',
  support: 'Support · zählt gegen das Kontingent',
  aufwand: 'Nach Aufwand · wird fakturiert',
  paket: 'Paket · Indikator',
  intern: 'Intern · nicht abrechenbar',
};

// Laufender Sprint des Projekts; bei mehreren der mit dem frühesten Liefertermin
export const laufenderSprint = (sprints = []) =>
  sprints
    .filter((s) => s.status === 'laufend')
    .sort((a, b) => (a.delivery_date || '9999-12-31').localeCompare(b.delivery_date || '9999-12-31'))[0] || null;

// Alle Pflichtfelder einer Buchung — ohne jede Auswahl durch den Nutzer.
export async function ermittleBuchungsfelder(projectId) {
  const [project, sprints] = await Promise.all([
    base44.entities.Project.get(projectId),
    base44.entities.Sprint.filter({ project_id: projectId }, 'delivery_date', 50),
  ]);
  const kategorie = project.abrechnungsmodell || 'sprint';
  const sprint = laufenderSprint(sprints);

  let stundensatz;
  if (kategorie === 'aufwand') {
    if (project.stundensatz) {
      stundensatz = project.stundensatz;
    } else {
      const settings = await base44.entities.Setting.filter({ key: 'standard_stundensatz' }, 'key', 1);
      stundensatz = Number(settings[0]?.value) || undefined;
    }
  }

  return {
    client_id: project.client_id || '',
    project_id: projectId,
    sprint_id: sprint?.id || '',
    kategorie,
    abrechenbar: kategorie !== 'intern',
    abrechnungsstatus: 'offen',
    ...(stundensatz ? { stundensatz } : {}),
  };
}