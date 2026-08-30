// Beschriftungen und Folgen des Assistenten — höchstens elf Zeichen je Schalter.
export const ABSICHTEN = [
  { key: 'antwort', label: 'Antwort' },
  { key: 'termin', label: 'Termin' },
  { key: 'angebot', label: 'Angebot' },
  { key: 'nachfassen', label: 'Nachfassen' },
  { key: 'besprechung', label: 'Besprechung' },
  { key: 'absage', label: 'Absage' },
];

export const LANGTITEL = {
  antwort: 'Antwort auf die Anfrage',
  termin: 'Terminvorschlag',
  angebot: 'Angebots-E-Mail',
  nachfassen: 'Nachfass-E-Mail',
  besprechung: 'Besprechung zum Angebot',
  absage: 'Absage',
};

export const FORMAT_LABEL = { vor_ort: 'vor Ort', telefon: 'telefonisch', video: 'Videocall' };

export const dateLabel = (d) =>
  d ? new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

export const slotLabel = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return `${d.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} um ${d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })} Uhr`;
};

export const betragLabel = (n) => {
  const wert = Math.round(Number(n) || 0);
  return wert > 0 ? `${wert.toLocaleString('de-AT')} € netto` : 'Betrag noch nicht erfasst';
};

// Was beim Bestätigen geschieht — im Klartext für den Dialog.
export function sendeFolgen(intent, { slotCount = 0 } = {}) {
  const eintrag = 'Eintrag im Verlauf';
  if (intent === 'termin')
    return [`${slotCount} Termine werden als vorgeschlagen angelegt`, 'Phase: Termin geplant', eintrag];
  if (intent === 'besprechung')
    return [`${slotCount} Termine werden als vorgeschlagen angelegt`, 'Wiedervorlage in 7 Tagen', eintrag];
  if (intent === 'angebot') return ['Phase: Angebot übermittelt', 'Wiedervorlage in 7 Tagen', eintrag];
  if (intent === 'nachfassen') return ['Wiedervorlage in 7 Tagen', eintrag];
  if (intent === 'absage') return ['Deal wird als verloren geführt', eintrag];
  return [eintrag];
}