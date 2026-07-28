import { isInternalSender, waitingDaysSince } from '@/components/crm/emails/emailConfig';

// System-/Benachrichtigungs-Absender — nie "Braucht Antwort"
const NOISE_DOMAINS = [
  'awork.com', 'awork.io', 'microsoft.com', 'microsoftonline.com', 'teams.microsoft.com',
  'office365.com', 'sevdesk.de', 'sevdesk.com', 'brevo.com', 'm.brevo.com', 'google.com',
  'linkedin.com', 'mailchimp.com', 'atlassian.com', 'base44.com', 'wordpress.com',
  'calendly.com', 'notion.so', 'slack.com', 'zoom.us', 'dropbox.com',
];

const NOISE_LOCALPARTS = ['no-reply', 'noreply', 'donotreply', 'notification', 'notifications', 'mailer-daemon', 'postmaster', 'newsletter', 'info@awork'];

// Betreff-Muster von Systemmails, Kalendereinladungen und Newslettern
const NOISE_SUBJECTS = [
  'hat eine aufgabe kommentiert', 'hat dir eine aufgabe', 'aufgabe zugewiesen', 'task assigned',
  'einladung:', 'invitation:', 'besprechung:', 'meeting:', 'abgesagt:', 'canceled:', 'aktualisiert:', 'updated invitation',
  'terminserie', 'teams-besprechung', 'microsoft teams', 'annahme:', 'accepted:', 'abgelehnt:', 'declined:',
  'newsletter', 'rechnungsbeleg', 'zahlungsbestätigung', 'automatische antwort', 'automatic reply', 'abwesenheit',
  'passwort', 'password reset', 'verifizierungscode', 'security alert',
];

const isNoise = (from, subject) => {
  const f = String(from || '').toLowerCase();
  const s = String(subject || '').toLowerCase();
  if (NOISE_DOMAINS.some((d) => f.includes('@' + d) || f.endsWith('.' + d))) return true;
  if (NOISE_LOCALPARTS.some((p) => f.startsWith(p) || f.includes(p + '@'))) return true;
  if (NOISE_SUBJECTS.some((p) => s.includes(p))) return true;
  return false;
};

/**
 * "Braucht Antwort" — harte Kriterien, unabhängig vom KI-Status:
 *  1. Die LETZTE Nachricht im Verlauf ist eingehend (direction = 'in')
 *  2. Der letzte Absender ist extern (kein Kollege aus rittler.co / rico-office.at)
 *  3. Kein System-/Benachrichtigungs-/Kalender-/Newsletter-Absender oder -Betreff
 *  → Sobald wir (oder ein Kollege) geantwortet haben, fällt der Thread automatisch raus.
 */
export const needsReply = (t) => {
  if (t.last_direction !== 'in') return false;
  if (isInternalSender(t.last_from)) return false;
  if (isNoise(t.last_from, t.subject)) return false;
  return true;
};

// Reklamationen zuerst, danach längste Wartezeit oben
export const triageSort = (a, b) => {
  const rek = (t) => (t.category === 'reklamation' ? 0 : 1);
  if (rek(a) !== rek(b)) return rek(a) - rek(b);
  return (b._waiting_days || 0) - (a._waiting_days || 0);
};

export const buildTriageList = (threads) =>
  (threads || [])
    .filter(needsReply)
    .map((t) => ({ ...t, _waiting_days: waitingDaysSince(t.last_message_at) }))
    .sort(triageSort);