// EINE gemeinsame Quelle für die Triage-Regel "Braucht Antwort".
// Backend (Index-Aufbau) und Frontend (Anzeige) benutzen dieselbe Funktion.
import { domainOf, isInternalDomain, isSystemDomain, isFreemailDomain } from './senderLists.js';

/**
 * Ein Verlauf braucht eine Antwort, wenn ALLE gelten:
 *  1. letzte Nachricht ist eingehend
 *  2. Absender ist extern (kein Kollege)
 *  3. nicht bereits als Lead ins CRM übernommen
 *  4. als Geschäftskonversation belegt (schon geantwortet / echter Dialog /
 *     Kunde bzw. inhaltliche Kategorie zugeordnet) — oder noch unbewertet
 *     und von einer Firmendomain (kein System-/Freemail-Absender).
 */
const daysSince = (s) => {
  const t = new Date(String(s || '').slice(0, 19).replace(' ', 'T') + 'Z').getTime();
  return t ? (Date.now() - t) / 86400000 : 9999;
};

export function computeNeedsReply(t) {
  const direction = t.last_direction || t.direction;
  const sender = t.last_from || t.last_inbound_from || t.from;
  const domain = domainOf(sender);
  if (direction !== 'in') return false;
  if (!domain || isInternalDomain(domain)) return false;
  if (t.crm_status === 'lead_angelegt') return false;
  if (t.status && t.status !== 'offen') return false;
  const meaningfulCategory = !!t.category && t.category !== 'sonstiges';
  if (t.has_outbound === true || (t.message_count || 0) > 1 || !!t.customer || meaningfulCategory) return true;
  // Unbewertete Einzelnachrichten nur, solange sie frisch sind — sonst würde der
  // historische Nachlauf jahrealte Newsletter in die Arbeitsliste holen.
  if (!t.status && !t.category) {
    if (daysSince(t.last_message_at) > 30) return false;
    return !isSystemDomain(domain) && !isFreemailDomain(domain);
  }
  return false;
}