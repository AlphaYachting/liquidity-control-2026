export const EMAIL_CATEGORIES = {
  abnahme_freigabe: { label: 'Abnahme/Freigabe', color: 'bg-emerald-100 text-emerald-700' },
  rechnung_zahlung: { label: 'Rechnung/Zahlung', color: 'bg-blue-100 text-blue-700' },
  reklamation: { label: 'Reklamation', color: 'bg-red-100 text-red-700' },
  anforderung_change: { label: 'Anforderung/Change', color: 'bg-violet-100 text-violet-700' },
  terminabstimmung: { label: 'Terminabstimmung', color: 'bg-amber-100 text-amber-700' },
  rueckfrage_antwort: { label: 'Rückfrage/Antwort', color: 'bg-sky-100 text-sky-700' },
  sonstiges: { label: 'Sonstiges', color: 'bg-muted text-muted-foreground' },
};

export const EMAIL_THREAD_STATUSES = {
  offen: { label: 'Offen', color: 'bg-amber-100 text-amber-700' },
  beantwortet: { label: 'Beantwortet', color: 'bg-sky-100 text-sky-700' },
  erledigt: { label: 'Erledigt ✓', color: 'bg-emerald-100 text-emerald-600' },
  wartet_auf_kunde: { label: 'Wartet auf Kunde', color: 'bg-violet-100 text-violet-700' },
};

export const DIRECTION_META = {
  in: { label: 'Eingehend', color: 'bg-blue-100 text-blue-700' },
  out: { label: 'Ausgehend', color: 'bg-emerald-100 text-emerald-700' },
  intern: { label: 'Intern', color: 'bg-muted text-muted-foreground' },
};

export const SENTIMENT_META = {
  positiv: { label: 'Positiv', color: 'bg-emerald-100 text-emerald-700' },
  neutral: { label: 'Neutral', color: 'bg-muted text-muted-foreground' },
  angespannt: { label: 'Angespannt', color: 'bg-amber-100 text-amber-700' },
  negativ: { label: 'Negativ', color: 'bg-red-100 text-red-700' },
};

export const formatMailDate = (s) => (s ? String(s).slice(0, 16) : '—');

// Kollegen-Erkennung: Absender aus den eigenen Firmen-Domains
export const INTERNAL_DOMAINS = ['rittler.co', 'rico-office.at'];
export const isInternalSender = (from) =>
  INTERNAL_DOMAINS.some((d) => String(from || '').toLowerCase().includes('@' + d));

// Hat nach der letzten Kundennachricht bereits ein Kollege geschrieben?
// (Nachrichten sind neueste zuerst sortiert)
export const colleagueRepliedLast = (messages) => {
  const m = messages?.[0];
  return !!m && m.direction !== 'in' && isInternalSender(m.from);
};