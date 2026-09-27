// Frontend-Kopie von base44/shared/emailWorkQueue.js — Regel "Braucht Antwort".
import { domainOf, isInternalDomain } from '@/lib/crm/senderLists';

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