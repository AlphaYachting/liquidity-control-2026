import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Mail, ExternalLink } from 'lucide-react';
import { Box, BoxKopf, BoxInhalt } from '@/components/shared/Box';
import StatusEtikett from '@/components/shared/StatusEtikett';
import { eur } from '@/components/crm/stages';
import ProposalHandoffButton from '@/components/crm/ProposalHandoffButton';

const STATUS_META = {
  draft: { ton: 'attention', text: 'Zur Freigabe' },
  in_review: { ton: 'attention', text: 'In Prüfung' },
  sent: { ton: 'done', text: 'Gesendet' },
  accepted: { ton: 'done', text: 'Angenommen' },
  declined: { ton: 'neutral', text: 'Abgelehnt' },
  expired: { ton: 'neutral', text: 'Abgelaufen' },
};

// Am Deal verknüpftes E-Mail-Angebot (CrmQuote) — der Weg zurück zum Angebot.
export default function DealQuoteCard({ deal, onChanged }) {
  const { data: quote } = useQuery({
    queryKey: ['crm-deal-quote', deal.quote_id],
    queryFn: () => base44.entities.CrmQuote.get(deal.quote_id),
    enabled: Boolean(deal.quote_id),
  });

  const st = quote ? STATUS_META[quote.status] || STATUS_META.draft : null;

  return (
    <Box>
      <BoxKopf
        symbol={Mail}
        titel={quote?.title || 'E-Mail-Angebot'}
        aktion={
          <>
            {st && <StatusEtikett ton={st.ton}>{st.text}</StatusEtikett>}
            <Button size="sm" variant="outline" asChild>
              <Link to={`/crm/quotes/${deal.quote_id}`}><ExternalLink className="w-3.5 h-3.5" /> Angebot öffnen</Link>
            </Button>
            <ProposalHandoffButton deal={deal} onDone={onChanged} forceNew label="Weiteres Angebot" className="" />
          </>
        }
      />
      <BoxInhalt>
        <div className="flex justify-between">
          <span className="text-body text-muted-foreground">Summe netto</span>
          <span className="text-value tabular-nums">{quote ? eur(quote.total_net) : '—'}</span>
        </div>
        {quote?.valid_until && (
          <div className="flex justify-between">
            <span className="text-body text-muted-foreground">Gültig bis</span>
            <span className="text-value">{new Date(quote.valid_until).toLocaleDateString('de-AT')}</span>
          </div>
        )}
      </BoxInhalt>
    </Box>
  );
}