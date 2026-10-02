// Gemeinsame Ladefilter: archivierte Tickets und abgeschlossene Projekte erreichen
// die Arbeitsansichten gar nicht erst. `$ne: true` greift auch für Altdatensätze ohne Feld.
export const NICHT_ARCHIVIERT = { archiviert: { $ne: true } };
// aktiv oder pausiert — `$ne` statt `$in`, damit auch Projekte ohne gesetzten Status mitkommen
export const PROJEKT_LAUFEND = { status: { $ne: 'abgeschlossen' } };
// Nur aktive Projekte erzeugen Arbeit in „Heute" und neue Routinen-Durchläufe
export const istAktiv = (project) => !!project && project.status !== 'abgeschlossen' && project.status !== 'pausiert';
export const ohneArchiv = (q = {}) => ({ ...q, ...NICHT_ARCHIVIERT });

export const ARCHIV_GRUENDE = [
  { value: 'altbestand_awork', label: 'Altbestand aWork' },
  { value: 'doppelt', label: 'Doppelt angelegt' },
  { value: 'nicht_mehr_relevant', label: 'Nicht mehr relevant' },
  { value: 'storniert', label: 'Vom Kunden storniert' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

export const ARCHIV_GRUND_LABEL = {
  ...Object.fromEntries(ARCHIV_GRUENDE.map((g) => [g.value, g.label])),
  routine_beendet: 'Routine beendet',
  projekt_abgeschlossen: 'Projekt abgeschlossen',
};
