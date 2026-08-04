import { base44 } from '@/api/base44Client';
import { emailApi } from '@/components/crm/emails/emailApi';

export const threadIdOf = (item) =>
  item?.thread_id || (String(item?.email_message_id || '').startsWith('thread:')
    ? item.email_message_id.slice(7)
    : null);

// Rückkanal in die zentrale E-Mail-Datenbank: der Thread ist als Lead erledigt.
// Nimmt die DB die Felder nicht an, darf das die Lead-Anlage nicht verhindern.
export async function markThreadAsLead(threadId, dealId) {
  if (!threadId) return;
  await emailApi('enrich', {
    thread_id: threadId,
    fields: { crm_status: 'lead_angelegt', crm_deal_id: dealId, status: 'beantwortet' },
  }).catch(() => {});
}

// "Kein Lead, beantworten" bzw. "Verwerfen" — der Eintrag verlässt den Posteingang.
export async function decideInboxItem(item, decision, dismissReason = '') {
  const user = await base44.auth.me().catch(() => null);
  return base44.entities.CrmInboxItem.update(item.id, {
    decision,
    decided_by: user?.email || '',
    decided_at: new Date().toISOString(),
    dismiss_reason: dismissReason,
    status: 'dismissed',
  });
}