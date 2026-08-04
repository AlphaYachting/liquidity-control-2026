// EINE gemeinsame Quelle für Absenderlisten — geteilt mit den Backend-Funktionen.
import { INTERNAL_DOMAINS, FREEMAIL_DOMAINS, SYSTEM_DOMAINS } from '../../../../base44/shared/senderLists.js';

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

// DB liefert UTC-Zeitstempel ("YYYY-MM-DD HH:MM:SS") — in lokale Zeit umrechnen
export const formatMailDate = (s) => {
  if (!s) return '—';
  const d = new Date(String(s).slice(0, 19).replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return String(s).slice(0, 16);
  return d.toLocaleString('de-AT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// Kollegen-Erkennung: Absender aus den eigenen Firmen-Domains
export { INTERNAL_DOMAINS };
export const isInternalSender = (from) =>
  INTERNAL_DOMAINS.some((d) => String(from || '').toLowerCase().includes('@' + d));

// Domains, aus denen kein Firmenname ableitbar ist (Freemail + System/Tool)
const GENERIC_DOMAINS = [...FREEMAIL_DOMAINS, ...SYSTEM_DOMAINS];

// Kundenlabel aus der Absender-Domain ableiten (z.B. office@holzbau-maier.at → "Holzbau-maier")
export const deriveCustomerFromEmail = (from) => {
  const m = String(from || '').toLowerCase().match(/@([a-z0-9.\-]+\.[a-z]{2,})/);
  if (!m) return null;
  const domain = m[1];
  if (INTERNAL_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) return null;
  if (GENERIC_DOMAINS.includes(domain)) return null;
  const parts = domain.split('.');
  const core = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  if (!core) return null;
  return core.charAt(0).toUpperCase() + core.slice(1);
};

// Wartezeit in Tagen seit der letzten Nachricht (DB liefert UTC "YYYY-MM-DD HH:MM:SS")
export const waitingDaysSince = (s) => {
  if (!s) return null;
  const d = new Date(String(s).slice(0, 19).replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
};

// Hat nach der letzten Kundennachricht bereits ein Kollege geschrieben?
// (Nachrichten sind neueste zuerst sortiert)
export const colleagueRepliedLast = (messages) => {
  const m = messages?.[0];
  return !!m && m.direction !== 'in' && isInternalSender(m.from);
};