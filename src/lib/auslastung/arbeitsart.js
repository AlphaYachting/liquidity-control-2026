// Arbeitsart aus Projekt (Abrechnungsmodell, Aufwandsart, Retainer-Art) und Ticket (origin)
export const ARTEN = [
  { key: 'fix', label: 'Fixprojekte', farbe: 'hsl(var(--chart-1))' },
  { key: 'support', label: 'Support', farbe: 'hsl(var(--chart-2))' },
  { key: 'regie', label: 'Regie', farbe: 'hsl(var(--chart-3))' },
  { key: 'om', label: 'Retainer Online-Marketing', farbe: 'hsl(var(--chart-5))' },
  { key: 'wartung', label: 'Wartungsverträge', farbe: 'hsl(var(--chart-4))' },
  { key: 'intern', label: 'Intern', farbe: 'hsl(var(--muted-foreground))' },
];
export const LAUFEND = ['support', 'regie', 'om', 'wartung'];
export const ART_LABEL = Object.fromEntries(ARTEN.map((a) => [a.key, a.label]));

export function artVon(project, ticket) {
  if (!project) return null;
  if (ticket?.origin === 'support') return 'support';
  const m = project.abrechnungsmodell;
  if (m === 'intern') return 'intern';
  if (m === 'sprint') return 'fix';
  if (m === 'paket') {
    if (project.retainer_art === 'online_marketing') return 'om';
    if (project.retainer_art === 'wartung') return 'wartung';
    return 'fix';
  }
  if (m === 'support' || m === 'aufwand') return project.aufwand_art === 'regie' ? 'regie' : 'support';
  return null;
}