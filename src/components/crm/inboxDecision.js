import { base44 } from '@/api/base44Client';
import { emailApi } from '@/components/crm/emails/emailApi';

export const threadIdOf = (item) =>
  item?.thread_id || (String(item?.email_message_id || '').startsWith('thread:')
    ? item.email_message_id.slice(7)
    : null);

// Rückkanal in die zentrale E-Mail-Datenbank: der Thread ist als Lead erledigt.
// Nimmt die DB die Felder nicht an, darf das die Lead-Anlage nicht verhindern.
export async function markThreadAsLead(threadId, dealId) {
  if (!threadId) return { ok: true };
  try {
    await emailApi('enrich', {
      thread_id: threadId,
      fields: { crm_status: 'lead_angelegt', crm_deal_id: dealId, status: 'beantwortet' },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'unbekannter Fehler' };
  }
}

// Anfrage einem bestehenden Deal zuordnen: Thread verankern, Aktivität protokollieren,
// Eintrag verlässt den Posteingang. Wirft bei Fehlern — der Aufrufer zeigt sie an.
// Rückgabe: Ergebnis des Rückkanals ({ ok, error? }).
export async function attachInboxItemToDeal(item, deal) {
  const threadId = threadIdOf(item);
  const user = await base44.auth.me().catch(() => null);
  if (threadId && !deal.email_thread_id) {
    await base44.entities.CrmDeal.update(deal.id, { email_thread_id: threadId });
  }
  await base44.entities.CrmActivity.create({
    deal_id: deal.id,
    activity_type: 'email',
    title: `Weitere Anfrage zugeordnet — ${item.subject || 'ohne Betreff'}`,
    content: `${item.body || ''}${threadId ? `\n\nKonversation: /crm/emails?thread=${threadId}` : ''}`.trim(),
    activity_date: new Date().toISOString(),
  });
  await base44.entities.CrmInboxItem.update(item.id, {
    status: 'converted', decision: 'zugeordnet', linked_deal_id: deal.id,
    decided_by: user?.email || '', decided_at: new Date().toISOString(),
  });
  return markThreadAsLead(threadId, deal.id);
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