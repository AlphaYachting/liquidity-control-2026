// Zuordnung der awork-Arbeitsarten auf die drei Tätigkeiten der Zeitbuchung.
const BERATUNG = ['beratung', 'konzept', 'strategie', 'workshop', 'meeting'];
const VERTRIEB = ['akquise', 'angebot', 'vertrieb', 'pitch'];

export function taetigkeitAusAwork(typeOfWorkName = '') {
  const n = String(typeOfWorkName).toLowerCase();
  if (VERTRIEB.some((w) => n.includes(w))) return 'vertrieb';
  if (BERATUNG.some((w) => n.includes(w))) return 'beratung';
  return 'umsetzung';
}