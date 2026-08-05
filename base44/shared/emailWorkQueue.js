// EINE gemeinsame Quelle für die Triage-Regel "Braucht Antwort".
// Backend (Index-Aufbau) und Frontend (Anzeige) benutzen dieselbe Funktion.
import { domainOf, isInternalDomain } from './senderLists.js';

/**
 * Ein Verlauf braucht eine Antwort, wenn ALLE gelten:
 *  1. letzte Nachricht ist eingehend
 *  2. Absender ist extern (kein Kollege)
 *  3. nicht bereits als Lead ins CRM übernommen
 *  4. als Geschäftskonversation BELEGT: wir haben in diesem Verlauf schon
 *     geantwortet, es gibt mehrere Nachrichten, oder ein Kunde bzw. eine
 *     inhaltliche Kategorie ist zugeordnet. Einmalige, unbewertete Nachrichten
 *     zählen NICHT — das sind Newsletter, System- und Werbemails.
 */
export function computeNeedsReply(t) {
  const direction = t.last_direction || t.direction;
  const sender = t.last_from || t.last_inbound_from || t.from;
  const domain = domainOf(sender);
  if (direction !== 'in') return false;
  if (!domain || isInternalDomain(domain)) return false;
  if (t.crm_status === 'lead_angelegt') return false;
  if (t.status && t.status !== 'offen') return false;
  const meaningfulCategory = !!t.category && t.category !== 'sonstiges';
  return t.has_outbound === true || (t.message_count || 0) > 1 || !!t.customer || meaningfulCategory;
}