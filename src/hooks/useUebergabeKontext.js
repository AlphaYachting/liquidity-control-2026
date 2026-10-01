import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ladeStudioConfig } from '@/lib/crm/studioConfig';

// Alles, was das Übergabeblatt zum Start braucht: Angebot (Studio/E-Mail), bestehender Auftrag, Team, Module.
export default function useUebergabeKontext(deal, kunde) {
  return useQuery({
    queryKey: ['uebergabe-kontext', deal.id],
    queryFn: async () => {
      const [proposal, quote, orders, dealOrders, team, modules] = await Promise.all([
        deal.proposal_id ? base44.entities.CrmProposal.get(deal.proposal_id).catch(() => null) : null,
        deal.quote_id ? base44.entities.CrmQuote.get(deal.quote_id).catch(() => null) : null,
        kunde ? base44.entities.ConfirmedOrder.filter({ customer: kunde }, '-created_date', 5) : [],
        base44.entities.ConfirmedOrder.filter({ deal_id: deal.id }, '-created_date', 20),
        base44.entities.TeamMember.filter({ active: true }, 'name', 100),
        base44.entities.ModuleTemplate.list('-created_date', 200),
      ]);
      const config = proposal ? await ladeStudioConfig(proposal) : null;
      return {
        proposal, config, quote,
        bestehenderAuftrag: (dealOrders || []).find((o) => o.status !== 'cancelled') || null,
        hasPreviousOrders: (orders || []).length > 0,
        team: team || [],
        modules: modules || [],
      };
    },
  });
}