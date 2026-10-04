// Fälligkeit neuer Support-Tickets: Standard 4 Tage, bei dringenden Störungen sofort (heute).
// Bewusst ohne KI-Aufruf — genutzt wird die Einordnung, die der Posteingang ohnehin schon hat
// (request_nature 'stoerung', Eskalation), dazu eine Stichwortprüfung im Text. Kostet keine Ladezeit.

export const SUPPORT_FRIST_TAGE = 4;

const DRINGEND = new RegExp([
  'dringend', 'dringlich', 'notfall', 'eilt', 'asap', 'urgent', 'umgehend',
  'schnellstm(ö|oe)glich', 'so schnell wie m(ö|oe)glich',
  'funktioniert (leider |gar |überhaupt |ueberhaupt )?nicht', 'funktionieren (leider |gar )?nicht',
  'geht (leider |gar )?nicht mehr', 'nicht (mehr )?(erreichbar|aufrufbar|abrufbar|verfügbar|verfuegbar)',
  'offline', 'ausgefallen', 'ausfall', 'st(ö|oe)rung', 'fehlermeldung', 'kaputt', 'gehackt',
  'seite ist down', 'website ist down', 'shop ist down',
].join('|'), 'i');

const lokalesDatum = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Fällt der Termin auf ein Wochenende, gilt der Montag danach.
export function faelligAm(dringend, heute = new Date()) {
  const d = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());
  if (!dringend) d.setDate(d.getDate() + SUPPORT_FRIST_TAGE);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return lokalesDatum(d);
}

// Rückgabe: { dringend, grund } — grund ist der Beleg für den Hinweis im Dialog.
export function dringlichkeit(item = {}, text = '') {
  if (item.request_nature === 'stoerung') return { dringend: true, grund: 'als Störung eingeordnet' };
  if (item.eskalation === true || Number(item.eskalation) === 1) return { dringend: true, grund: 'Eskalation' };
  const treffer = `${item.subject || ''}\n${item.body || ''}\n${text || ''}`.match(DRINGEND);
  return treffer ? { dringend: true, grund: `„${treffer[0]}" im Text` } : { dringend: false, grund: '' };
}
