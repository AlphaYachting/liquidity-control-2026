import { base44 } from '@/api/base44Client';
import { istInhaber } from '@/lib/auslastung/inhaber';

// Rückmeldungen der Kollegen: Fehler, Wünsche, Anregungen.
// Die Sammlung sieht ausschließlich der Inhaber; jede Person sieht ihre eigenen Meldungen samt Status.
// Achtung: NICHT mit der Tabelle "Feedback" verwechseln — die gehört zu den Kundenrückmeldungen der Sprint-Etappen.

export { istInhaber };

export const ARTEN = [
  { value: 'fehler', label: 'Fehler', hilfe: 'Was hast du gemacht, was ist passiert, was hättest du erwartet?' },
  { value: 'wunsch', label: 'Wunsch', hilfe: 'Was fehlt dir, und wofür brauchst du es im Alltag?' },
  { value: 'anregung', label: 'Anregung', hilfe: 'Was würdest du anders machen — und warum?' },
];
export const ART_LABEL = Object.fromEntries(ARTEN.map((a) => [a.value, a.label]));

export const STATUS = [
  { value: 'neu', label: 'Neu' },
  { value: 'angesehen', label: 'Angesehen' },
  { value: 'umgesetzt', label: 'Umgesetzt' },
  { value: 'spaeter', label: 'Später' },
  { value: 'abgelehnt', label: 'Nicht umgesetzt' },
];
export const STATUS_LABEL = Object.fromEntries(STATUS.map((s) => [s.value, s.label]));
export const OFFEN = ['neu', 'angesehen'];

export const MAX_BILDER = 5;
export const MAX_BYTES = 10 * 1024 * 1024;

export const datum = (d) =>
  d ? new Date(d).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

// Zähler für den Hinweis an den Inhaber — leichte Abfrage, nur die neuen.
export const NEU_KEY = ['rueckmeldungen-neu'];
export async function ladeNeue() {
  const liste = await base44.entities.Rueckmeldung.filter({ status: 'neu' }, '-created_date', 200);
  return { anzahl: liste.length, blockiert: liste.filter((r) => r.art === 'fehler' && r.blockiert).length };
}

// Eigene Meldungen der angemeldeten Person
export const EIGENE_KEY = (email) => ['rueckmeldungen-eigene', email];
export const ladeEigene = (email) => base44.entities.Rueckmeldung.filter({ person_email: email }, '-created_date', 50);

// Hat sich seit dem letzten Blick in "Meine Meldungen" etwas getan?
const GESEHEN = 'rueckmeldung.gesehen';
export function letzterBlick() {
  try { return window.localStorage.getItem(GESEHEN) || ''; } catch (e) { return ''; }
}
export function merkeBlick() {
  try { window.localStorage.setItem(GESEHEN, new Date().toISOString()); } catch (e) { /* ohne Speicher kein Punkt */ }
}
export function hatNeuigkeit(eigene = []) {
  const seit = letzterBlick();
  return eigene.some((r) => r.status !== 'neu' && r.bearbeitet_am && (!seit || r.bearbeitet_am > seit));
}
