import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { loadJsonField } from '@/components/crm/proposals/jsonFields';

const dateLabel = (d) => new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });

const inDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

// Liest das am Deal verknüpfte Angebot — aus dem Angebots-Studio (CrmProposal)
// oder als E-Mail-Angebot (CrmQuote). Einzige Quelle für Positionen und Preise.
export function useDealAngebot(deal) {
  const proposalId = deal?.proposal_id || '';
  const quoteId = deal?.quote_id || '';

  return useQuery({
    queryKey: ['deal-angebot', proposalId, quoteId],
    enabled: Boolean(proposalId || quoteId),
    queryFn: async () => {
      if (proposalId) {
        const proposal = await base44.entities.CrmProposal.get(proposalId);
        const mapping = await loadJsonField(proposal, 'mapping_json').catch(() => null);
        const positionen = (mapping?.positions || []).map((p) => ({
          leistung: p.title,
          ergebnis: p.result || p.goal || '',
          preis_netto: p.price,
          preis_zusatz: p.price_suffix || '',
          optional: Boolean(p.optional),
        }));
        return {
          quelle: 'proposal',
          titel: proposal.title || 'Angebot',
          summe_netto: Number(mapping?.total_net) || deal.value_net || 0,
          hat_pdf: Boolean(proposal.pdf_url),
          pdf_url: proposal.pdf_url || '',
          positionen,
          nicht_enthalten: mapping?.excluded || [],
          gueltig_bis: dateLabel(inDays(14)),
        };
      }
      const quote = await base44.entities.CrmQuote.get(quoteId);
      return {
        quelle: 'quote',
        titel: quote.title || 'E-Mail-Angebot',
        summe_netto: Number(quote.total_net) || 0,
        hat_pdf: false,
        pdf_url: '',
        positionen: (quote.items || []).map((i) => ({
          leistung: i.title,
          ergebnis: i.description || '',
          preis_netto: i.total_price,
          preis_zusatz: '',
          optional: false,
        })),
        nicht_enthalten: quote.excluded || [],
        gueltig_bis: quote.valid_until ? dateLabel(quote.valid_until) : dateLabel(inDays(14)),
      };
    },
  });
}