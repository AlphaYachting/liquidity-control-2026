import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, ExternalLink } from 'lucide-react';
import { eur } from '@/components/crm/stages';
import ProposalHandoffButton from '@/components/crm/ProposalHandoffButton';

const STATUS_META = {
  draft: { label: 'Zur Freigabe', color: 'bg-amber-100 text-amber-700' },
  in_review: { label: 'In Prüfung', color: 'bg-amber-100 text-amber-700' },
  sent: { label: 'Gesendet ✓', color: 'bg-emerald-100 text-emerald-600' },
  accepted: { label: 'Angenommen ✓', color: 'bg-emerald-100 text-emerald-600' },
  declined: { label: 'Abgelehnt', color: 'bg-red-100 text-red-700' },
  expired: { label: 'Abgelaufen', color: 'bg-muted text-muted-foreground' },
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
    <div className="border rounded-xl bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Mail className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{quote?.title || 'E-Mail-Angebot'}</h3>
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-amber-700">E-Mail-Angebot</span>
              {quote && <> · {eur(quote.total_net)} netto</>}
              {quote?.valid_until && <> · gültig bis {new Date(quote.valid_until).toLocaleDateString('de-AT')}</>}
            </p>
          </div>
        </div>
        {st && <Badge variant="outline" className={`text-[10px] border-0 shrink-0 ${st.color}`}>{st.label}</Badge>}
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <Button size="sm" variant="outline" className="gap-1.5" asChild>
          <Link to={`/crm/quotes/${deal.quote_id}`}>
            <ExternalLink className="w-3.5 h-3.5" /> Angebot öffnen
          </Link>
        </Button>
        <ProposalHandoffButton deal={deal} onDone={onChanged} forceNew label="Weiteres Angebot anlegen" />
      </div>
    </div>
  );
}