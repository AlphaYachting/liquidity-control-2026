import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Presentation, ExternalLink, FileText, Mail, Clock } from 'lucide-react';
import { Box, BoxKopf, BoxInhalt } from '@/components/shared/Box';
import StatusEtikett from '@/components/shared/StatusEtikett';
import { PROPOSAL_TON } from '@/components/crm/AngebotEtikett';
import OfferEmailDialog from '@/components/crm/OfferEmailDialog';
import DealQuoteCard from '@/components/crm/DealQuoteCard';
import ProposalHandoffButton from '@/components/crm/ProposalHandoffButton';

// Zeigt am Deal das verknüpfte Angebot aus dem Angebots-Studio — inklusive Versandweg.
export default function DealProposalCard({ deal, activities, onChanged }) {
  const [mailIntent, setMailIntent] = React.useState(null);
  const { data: proposal } = useQuery({
    queryKey: ['crm-deal-proposal', deal.proposal_id],
    queryFn: () => base44.entities.CrmProposal.get(deal.proposal_id),
    enabled: Boolean(deal.proposal_id),
  });

  if (!deal.proposal_id && deal.quote_id) return <DealQuoteCard deal={deal} onChanged={onChanged} />;
  if (!deal.proposal_id) return null;

  // Der Zustand kommt aus der Absicht, der Titelvergleich bleibt nur Rückfallebene für Altdaten.
  const istAngebot = (a) => a.intent === 'angebot' || String(a.title || '').startsWith('Angebots-E-Mail');
  const istNachfassen = (a) => a.intent === 'nachfassen' || String(a.title || '').startsWith('Nachfass-E-Mail');
  const mails = (activities || []).filter((a) => a.activity_type === 'email');
  const lastOffer = mails.find(istAngebot);
  const followups = mails.filter(istNachfassen);
  const st = proposal ? PROPOSAL_TON[proposal.status] || PROPOSAL_TON.input : null;

  return (
    <Box>
      <BoxKopf
        symbol={Presentation}
        titel={proposal?.title || 'Angebot'}
        aktion={
          <>
            {st && <StatusEtikett ton={st.ton}>{st.text}</StatusEtikett>}
            <Button size="sm" variant="outline" asChild>
              <Link to={`/crm/proposals/${deal.proposal_id}`}><ExternalLink className="w-3.5 h-3.5" /> Im Studio öffnen</Link>
            </Button>
            {proposal?.pdf_url && (
              <Button size="sm" variant="outline" asChild>
                <a href={proposal.pdf_url} target="_blank" rel="noopener noreferrer"><FileText className="w-3.5 h-3.5" /> PDF</a>
              </Button>
            )}
            <ProposalHandoffButton deal={deal} onDone={onChanged} forceNew label="Weiteres Angebot" className="" />
          </>
        }
      />
      <BoxInhalt>
        <div className="flex justify-between">
          <span className="text-body text-muted-foreground">Übermittelt</span>
          <span className={lastOffer ? 'text-value' : 'text-meta text-muted-foreground'}>
            {lastOffer ? new Date(lastOffer.activity_date).toLocaleDateString('de-AT') : 'noch nicht'}
          </span>
        </div>
        {followups.length > 0 && (
          <div className="flex justify-between">
            <span className="text-body text-muted-foreground">Nachgefasst</span>
            <span className="text-value">{followups.length}×</span>
          </div>
        )}
        <div>
          {!lastOffer ? (
            <Button size="sm" variant="outline" onClick={() => setMailIntent('angebot')}>
              <Mail className="w-3.5 h-3.5" /> Angebots-E-Mail
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setMailIntent('nachfassen')}>
              <Clock className="w-3.5 h-3.5" /> Nachfassen
            </Button>
          )}
        </div>
      </BoxInhalt>

      {mailIntent && (
        <OfferEmailDialog
          open
          onOpenChange={(o) => { if (!o) setMailIntent(null); }}
          deal={deal}
          proposal={proposal}
          intent={mailIntent}
          onSent={onChanged}
        />
      )}
    </Box>
  );
}