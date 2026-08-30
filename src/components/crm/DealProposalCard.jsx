import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Presentation, ExternalLink, FileText, Mail, Clock } from 'lucide-react';
import OfferEmailDialog from '@/components/crm/OfferEmailDialog';
import DealQuoteCard from '@/components/crm/DealQuoteCard';
import ProposalHandoffButton from '@/components/crm/ProposalHandoffButton';

const STATUS_META = {
  input: { label: 'In Vorbereitung', color: 'bg-muted text-muted-foreground' },
  analysis_review: { label: 'Analyse in Prüfung', color: 'bg-amber-100 text-amber-700' },
  mapping_review: { label: 'Mapping in Prüfung', color: 'bg-amber-100 text-amber-700' },
  config_ready: { label: 'Bereit zum Rendern', color: 'bg-sky-100 text-sky-700' },
  rendered: { label: 'PDF fertig ✓', color: 'bg-emerald-100 text-emerald-600' },
  error: { label: 'Fehler', color: 'bg-red-100 text-red-700' },
};

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
  const st = proposal ? STATUS_META[proposal.status] || STATUS_META.input : null;

  return (
    <div className="border rounded-xl bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Presentation className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{proposal?.title || 'Angebot (Angebots-Studio)'}</h3>
            <p className="text-[11px] text-muted-foreground">
              Angebots-Studio
              {lastOffer && <> · Angebot übermittelt am {new Date(lastOffer.activity_date).toLocaleDateString('de-AT')}</>}
              {followups.length > 0 && <> · {followups.length}× nachgefasst</>}
            </p>
          </div>
        </div>
        {st && <Badge variant="outline" className={`text-[10px] border-0 shrink-0 ${st.color}`}>{st.label}</Badge>}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="gap-1.5" asChild>
          <Link to={`/crm/proposals/${deal.proposal_id}`}>
            <ExternalLink className="w-3.5 h-3.5" /> Im Studio öffnen
          </Link>
        </Button>
        {proposal?.pdf_url && (
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <a href={proposal.pdf_url} target="_blank" rel="noopener noreferrer">
              <FileText className="w-3.5 h-3.5" /> Angebots-PDF
            </a>
          </Button>
        )}
        {!lastOffer ? (
          <Button size="sm" className="gap-1.5" onClick={() => setMailIntent('angebot')}>
            <Mail className="w-3.5 h-3.5" /> Angebots-E-Mail an Kunden
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMailIntent('nachfassen')}>
            <Clock className="w-3.5 h-3.5" /> Nachfassen
          </Button>
        )}
        <ProposalHandoffButton deal={deal} onDone={onChanged} forceNew label="Weiteres Angebot anlegen" />
      </div>

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
    </div>
  );
}