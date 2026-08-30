import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { loadJsonField } from '@/components/crm/proposals/jsonFields';

// Anzeigeauskunft zum verknüpften Angebot — Titel, Summe, PDF-Lage, Positionsanzahl.
// Verbindlich für den Text ist immer die Fassung im Backend.
export function useAngebot(deal) {
  const proposalId = deal?.proposal_id || '';
  const quoteId = deal?.quote_id || '';

  return useQuery({
    queryKey: ['assistent-angebot', proposalId, quoteId],
    enabled: Boolean(proposalId || quoteId),
    queryFn: async () => {
      if (proposalId) {
        const p = await base44.entities.CrmProposal.get(proposalId);
        const mapping = await loadJsonField(p, 'mapping_json').catch(() => null);
        return {
          titel: p.title || 'Angebot',
          summe_netto: Number(mapping?.total_net) || Number(deal.value_net) || 0,
          hat_pdf: Boolean(p.pdf_url),
          pdf_url: p.pdf_url || '',
          anzahl_positionen: (mapping?.positions || []).length,
        };
      }
      const q = await base44.entities.CrmQuote.get(quoteId);
      return {
        titel: q.title || 'E-Mail-Angebot',
        summe_netto: Number(q.total_net) || 0,
        hat_pdf: false,
        pdf_url: '',
        anzahl_positionen: (q.items || []).length,
      };
    },
  });
}