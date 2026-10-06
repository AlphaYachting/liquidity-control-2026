import { base44 } from '@/api/base44Client';
import { emailApi } from '@/components/crm/emails/emailApi';

// Posteingangs-Einträge ändern — immer über die Server-Funktion, die das Recht prüft
// (Führung, Projektleitung, Web). Direkt dürfen nur Ersteller und Admins schreiben.
// Fehler kommen als Error mit lesbarem Text zurück.
export async function eintragAendern(itemId, patch) {
  let res;
  try {
    res = await base44.functions.invoke('posteingangEntscheiden', { item_id: itemId, patch });
  } catch (e) {
    throw new Error(e?.response?.data?.error || e?.message || 'Der Eintrag konnte nicht gespeichert werden.');
  }
  if (res?.data?.error) throw new Error(res.data.error);
  return res?.data?.item;
}

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
  // Threads aus der E-Mail-Zentrale haben keinen Posteingangs-Eintrag
  if (item.id) {
    await eintragAendern(item.id, { status: 'converted', decision: 'zugeordnet', linked_deal_id: deal.id });
  }
  return markThreadAsLead(threadId, deal.id);
}

// "Kein Lead, beantworten" bzw. "Verwerfen" — der Eintrag verlässt den Posteingang.
// "Verwerfen" markiert die Konversation zusätzlich als erledigt (kommt bei der nächsten
// Kundennachricht zurück). "Kein Lead" lässt sie offen: Sie bleibt im Posteingang,
// bis jemand antwortet.
export async function decideInboxItem(item, decision, dismissReason = '') {
  const result = await eintragAendern(item.id, {
    decision,
    dismiss_reason: dismissReason,
    status: 'dismissed',
  });
  const threadId = threadIdOf(item);
  if (threadId && decision === 'verworfen') {
    await emailApi('enrich', { thread_id: threadId, fields: { status: 'erledigt' } }).catch(() => {});
  }
  return result;
}