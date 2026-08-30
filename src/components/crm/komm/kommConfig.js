// Feste Reihenfolge der Absichten — die Vorauswahl hebt hervor, sie sortiert nicht um.
// Kurze Beschriftungen ohne Symbole: die Feldüberschrift trägt die Bedeutung.
export const ABSICHTEN = [
  { key: 'antwort', label: 'Antwort' },
  { key: 'terminvorschlag', label: 'Termin' },
  { key: 'angebot', label: 'Angebot' },
  { key: 'nachfassen', label: 'Nachfassen' },
  { key: 'angebot_nachfrage', label: 'Nachfrage zum Angebot' },
  { key: 'rueckfrage', label: 'Rückfrage' },
  { key: 'absage', label: 'Absage' },
];

export const ABSICHT_LABEL = ABSICHTEN.reduce((acc, a) => ({ ...acc, [a.key]: a.label }), {});

// Langtitel für Verlaufseintrag und Sendedialog.
export const ABSICHT_TITEL = {
  antwort: 'Antwort auf die Anfrage',
  terminvorschlag: 'Terminvorschlag',
  angebot: 'Angebots-E-Mail',
  nachfassen: 'Nachfass-E-Mail',
  angebot_nachfrage: 'Nachfrage zum Angebot',
  rueckfrage: 'Rückfrage',
  absage: 'Absage',
};

export const eurLabel = (n) => `${Math.round(Number(n) || 0).toLocaleString('de-AT')} €`;

export const dateLabel = (d) =>
  d ? new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

export const slotLabel = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return `${d.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} um ${d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })} Uhr`;
};

export const FORMAT_LABEL = { vor_ort: 'Vor Ort', telefon: 'Telefonisch', video: 'Videocall' };

// Folgen des Sendens — je Absicht, nie fest verdrahtet im Dialog.
export function sendeFolgen(intent, ctx = {}) {
  const eintrag = 'Eintrag im Verlauf';
  if (intent === 'terminvorschlag') {
    return [`${ctx.slotCount || 0} Termine werden als vorgeschlagen angelegt`, 'Phase → Termin vorgeschlagen', eintrag];
  }
  if (intent === 'angebot') {
    return ['Phase → Angebot übermittelt', 'Wiedervorlage in 7 Tagen', eintrag];
  }
  if (intent === 'nachfassen') return ['Wiedervorlage in 7 Tagen', eintrag];
  if (intent === 'angebot_nachfrage') return ['Wiedervorlage in 5 Tagen', eintrag];
  if (intent === 'absage') return ['Phase → verloren', 'Grund wird festgehalten', eintrag];
  return [eintrag];
}