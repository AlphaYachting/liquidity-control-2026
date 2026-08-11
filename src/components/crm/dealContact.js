import { base44 } from '@/api/base44Client';

// Beim ersten Kontakt (Antwort gesendet) den Deal automatisch von
// "Neuer Lead" auf "Kontaktiert" schieben — inkl. Protokolleintrag.
export async function markDealContacted(dealId) {
  if (!dealId) return;
  const deal = await base44.entities.CrmDeal.get(dealId).catch(() => null);
  if (deal?.stage !== 'new_lead') return;
  await base44.entities.CrmDeal.update(dealId, { stage: 'contacted' }).catch(() => {});
  await base44.entities.CrmActivity.create({
    deal_id: dealId,
    activity_type: 'stage_change',
    title: 'Phase automatisch auf „Kontaktiert“ gesetzt (Antwort gesendet)',
    activity_date: new Date().toISOString(),
  }).catch(() => {});
}