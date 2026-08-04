import { isInternalSender, waitingDaysSince } from '@/components/crm/emails/emailConfig';
import { collapseAnsweredGroups } from '@/components/crm/emails/emailThreadGrouping';

/**
 * "Braucht Antwort" — Positiv-Kriterien statt Spam-Blacklist.
 *
 * Ein Thread landet nur in der Arbeitsliste, wenn ALLE gelten:
 *  1. Die letzte Nachricht im Verlauf ist eingehend ('in')
 *  2. Der Absender ist extern (kein Kollege aus rittler.co / rico-office.at)
 *  3. Der Thread wurde nicht bereits als Lead ins CRM übernommen
 *  4. Der Thread ist als Geschäftskonversation belegt — d.h. mindestens eines davon:
 *     • wir haben in diesem Verlauf schon einmal geantwortet (has_outbound)
 *     • der Verlauf hat mehr als eine Nachricht (echter Dialog)
 *     • die KI-Auswertung hat einen Kunden oder eine inhaltliche Kategorie zugeordnet
 *       ("sonstiges" zählt NICHT — das bekommt jeder Newsletter)
 *
 * Punkt 4 ist der entscheidende Filter: Spam, Phishing und Newsletter sind
 * einmalige Nachrichten, die niemand beantwortet hat und die keiner Zuordnung haben.
 */
export const needsReply = (t) => {
  // Fallback: schlägt die Anreicherung fehl, auf die Thread-Basisdaten zurückfallen,
  // statt den Thread stillschweigend zu verwerfen (sonst ist die Liste plötzlich leer).
  const direction = t.last_direction || t.direction;
  const sender = t.last_from || t.last_inbound_from || t.from;
  if (direction !== 'in') return false;
  if (isInternalSender(sender)) return false;
  // Als Lead übernommene Threads laufen im CRM weiter — nicht mehr in der Arbeitsliste
  if (t.crm_status === 'lead_angelegt') return false;
  const meaningfulCategory = !!t.category && t.category !== 'sonstiges';
  return t.has_outbound === true || (t.message_count || 0) > 1 || !!t.customer || meaningfulCategory;
};

// Reklamationen zuerst, danach längste Wartezeit oben
export const triageSort = (a, b) => {
  const rek = (t) => (t.category === 'reklamation' ? 0 : 1);
  if (rek(a) !== rek(b)) return rek(a) - rek(b);
  return (b._waiting_days || 0) - (a._waiting_days || 0);
};

// EINE Parameterquelle für Liste und Zähler
export const TRIAGE_LIMIT = 150;
export const TRIAGE_PARAMS = { limit: TRIAGE_LIMIT, status: 'offen', with_reply_state: 1, days: 30 };

export const buildTriageList = (threads) =>
  collapseAnsweredGroups(threads)
    .filter(needsReply)
    .map((t) => ({ ...t, _waiting_days: waitingDaysSince(t.last_message_at) }))
    .sort(triageSort);