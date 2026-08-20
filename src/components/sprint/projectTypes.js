// Projekttyp bestimmt Abrechnungsmodell und ob sofort ein laufender Behälter entsteht.
export const PROJECT_TYPES = {
  sprint: { label: 'Sprintprojekt', model: 'sprint', container: false, style: { pillBg: '#FBEAF0', pillText: '#72243E', icon: 'bolt', short: 'Sprint' } },
  support: { label: 'Supportprojekt', model: 'aufwand', container: true, style: { pillBg: '#FAEEDA', pillText: '#633806', icon: 'headset', short: 'Support' } },
  container: { label: 'Containerkunde', model: 'paket', container: true, style: { pillBg: '#E1F5EE', pillText: '#085041', icon: 'refresh', short: 'Container' } },
  legacy: { label: 'Altprojekt', model: null, container: true, style: { pillBg: '#F1EFE8', pillText: '#444441', icon: 'archive', short: 'Alt' } },
  intern: { label: 'Internes Projekt', model: 'intern', container: true, style: { pillBg: '#EEEDFE', pillText: '#3C3489', icon: 'building', short: 'Intern' } },
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

// Darstellung (Farbe, Icon, Kurzwort) zum Typ eines Projekts
export function typeStyleOf(project) {
  return PROJECT_TYPES[projectTypeOf(project)].style;
}