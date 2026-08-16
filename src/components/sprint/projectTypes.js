// Projekttyp bestimmt Abrechnungsmodell und ob sofort ein laufender Behälter entsteht.
export const PROJECT_TYPES = {
  sprint: { label: 'Sprintprojekt', model: 'sprint', container: false },
  support: { label: 'Supportprojekt', model: 'aufwand', container: true },
  container: { label: 'Containerkunde', model: 'paket', container: true },
  legacy: { label: 'Altprojekt', model: null, container: true },
  intern: { label: 'Internes Projekt', model: 'intern', container: true },
};

export const PROJECT_TYPE_ORDER = ['sprint', 'support', 'container', 'legacy', 'intern'];

export const MODEL_OPTIONS = [
  { value: 'sprint', label: 'Sprint' },
  { value: 'support', label: 'Support' },
  { value: 'aufwand', label: 'Nach Aufwand' },
  { value: 'paket', label: 'Paket / Kontingent' },
  { value: 'intern', label: 'Intern' },
];

// Bestehendes Projekt auf einen Typ zurückführen (für den Bearbeiten-Modus)
export function projectTypeOf(project) {
  if (!project) return 'sprint';
  if (project.is_legacy) return 'legacy';
  if (project.abrechnungsmodell === 'intern') return 'intern';
  if (project.abrechnungsmodell === 'paket') return 'container';
  if (project.abrechnungsmodell === 'sprint') return 'sprint';
  return 'support';
}