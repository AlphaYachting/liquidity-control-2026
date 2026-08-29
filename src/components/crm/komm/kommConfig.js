import { MessageSquare, CalendarClock, Mail, BellRing, HelpCircle, XCircle } from 'lucide-react';

// Feste Reihenfolge der Absichten — die Vorauswahl hebt hervor, sie sortiert nicht um.
export const ABSICHTEN = [
  { key: 'antwort', label: 'Antwort auf die Anfrage', icon: MessageSquare },
  { key: 'terminvorschlag', label: 'Terminvorschlag', icon: CalendarClock },
  { key: 'angebot', label: 'Angebot übermitteln', icon: Mail },
  { key: 'nachfassen', label: 'Nachfassen', icon: BellRing },
  { key: 'rueckfrage', label: 'Rückfrage', icon: HelpCircle },
  { key: 'absage', label: 'Absage', icon: XCircle },
];

export const ABSICHT_LABEL = ABSICHTEN.reduce((acc, a) => ({ ...acc, [a.key]: a.label }), {});

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
  if (intent === 'absage') return ['Phase → verloren', 'Grund wird festgehalten', eintrag];
  return [eintrag];
}