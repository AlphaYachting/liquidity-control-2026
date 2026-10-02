// Projekttyp bestimmt Abrechnungsmodell und ob sofort ein laufender Behälter entsteht.
export const PROJECT_TYPES = {
  sprint: { label: 'Sprintprojekt', model: 'sprint', container: false, style: { pillBg: '#FBEAF0', pillText: '#72243E', icon: 'bolt', short: 'Sprint' } },
  support: { label: 'Supportprojekt', model: 'aufwand', container: true, style: { pillBg: '#FAEEDA', pillText: '#633806', icon: 'headset', short: 'Support' } },
  container: { label: 'Retainer', model: 'paket', container: true, style: { pillBg: '#E1F5EE', pillText: '#085041', icon: 'refresh', short: 'Retainer' } },
  regie: { label: 'Regie-Projekt', model: 'aufwand', container: true, style: { pillBg: '#E6F1FB', pillText: '#0C447C', icon: 'clock', short: 'Regie' } },
  legacy: { label: 'Altprojekt', model: null, container: true, style: { pillBg: '#F1EFE8', pillText: '#444441', icon: 'archive', short: 'Alt' } },
  intern: { label: 'Internes Projekt', model: 'intern', container: true, style: { pillBg: '#EEEDFE', pillText: '#3C3489', icon: 'building', short: 'Intern' } },
};

export const PROJECT_TYPE_ORDER = ['sprint', 'container', 'support', 'regie', 'intern', 'legacy'];

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
  return project.aufwand_art === 'regie' ? 'regie' : 'support';
}

// Support und Regie verhalten sich gleich — nur Label, Pille und Kopftext unterscheiden sich
export function istNachAufwand(project) {
  const t = projectTypeOf(project);
  return t === 'support' || t === 'regie';
}

// Retainer-Art (nur Darstellung) — Wartungsverträge bekommen eine eigene Pille, alles andere bleibt Retainer
export const RETAINER_ARTEN = [
  { value: 'online_marketing', label: 'Online Marketing' },
  { value: 'wartung', label: 'Wartungsvertrag' },
  { value: 'sonstiges', label: 'Sonstiger Retainer' },
];

export const WARTUNG_STYLE = { pillBg: '#EEF2DC', pillText: '#3E4A12', icon: 'wrench', short: 'Wartung' };

export function istWartung(project) {
  return !!project && typeof project === 'object'
    && projectTypeOf(project) === 'container'
    && project.retainer_art === 'wartung';
}

// Darstellung (Farbe, Icon, Kurzwort) zum Typ eines Projekts
export function typeStyleOf(project) {
  if (istWartung(project)) return WARTUNG_STYLE;
  return PROJECT_TYPES[projectTypeOf(project)].style;
}