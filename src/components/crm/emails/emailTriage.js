import { isInternalSender, waitingDaysSince, deriveCustomerFromEmail } from '@/components/crm/emails/emailConfig';

/**
 * "Braucht Antwort" — Positiv-Kriterien statt Spam-Blacklist.
 *
 * Ein Thread landet nur in der Arbeitsliste, wenn ALLE gelten:
 *  1. Die letzte Nachricht im Verlauf ist eingehend ('in')
 *  2. Der Absender ist extern (kein Kollege aus rittler.co / rico-office.at)
 *  3. Die Absender-Domain ist eine echte Firmendomain (kein Freemail-/System-/Tool-Absender)
 *  4. Der Thread ist als Geschäftskonversation belegt — d.h. mindestens eines davon:
 *     • wir haben in diesem Verlauf schon einmal geantwortet (has_outbound)
 *     • der Verlauf hat mehr als eine Nachricht (echter Dialog)
 *     • die KI-Auswertung hat einen Kunden oder eine Kategorie zugeordnet
 *
 * Punkt 4 ist der entscheidende Filter: Spam, Phishing und Newsletter sind
 * einmalige Nachrichten, die niemand beantwortet hat und die keiner Zuordnung haben.
 */
export const needsReply = (t) => {
  if (t.last_direction !== 'in') return false;
  if (isInternalSender(t.last_from)) return false;
  if (!deriveCustomerFromEmail(t.last_from)) return false; // Freemail-/System-Domains fallen raus
  const isBusinessConversation =
    t.has_outbound === true || (t.message_count || 0) > 1 || !!t.customer || !!t.category;
  return isBusinessConversation;
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