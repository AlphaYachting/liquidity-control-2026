import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import StatusEtikett from '@/components/shared/StatusEtikett';
import { kiVorschlag } from '@/lib/crm/kiVorschlag';

export const PROPOSAL_TON = {
  input: { ton: 'info', text: 'In Vorbereitung' },
  analysis_review: { ton: 'attention', text: 'In Prüfung' },
  mapping_review: { ton: 'attention', text: 'In Prüfung' },
  config_ready: { ton: 'info', text: 'Bereit zum Rendern' },
  rendered: { ton: 'done', text: 'PDF fertig' },
  error: { ton: 'critical', text: 'Fehler' },
};

// Stand des Angebots in einem Etikett — für die Kennzahlleiste.
export default function AngebotEtikett({ deal, activities = [], appointments = [] }) {
  const { data: proposal } = useQuery({
    queryKey: ['crm-deal-proposal', deal.proposal_id],
    queryFn: () => base44.entities.CrmProposal.get(deal.proposal_id),
    enabled: Boolean(deal.proposal_id),
  });

  const { stand } = kiVorschlag(deal, activities, appointments);
  if (stand) {
    return stand.tage >= 7
      ? <StatusEtikett ton="attention">Übermittelt · {stand.tage} Tage still</StatusEtikett>
      : <StatusEtikett ton="done">Übermittelt</StatusEtikett>;
  }
  if (deal.proposal_id) {
    const m = PROPOSAL_TON[proposal?.status] || PROPOSAL_TON.input;
    return <StatusEtikett ton={m.ton}>{m.text}</StatusEtikett>;
  }
  if (deal.quote_id) return <StatusEtikett ton="neutral">E-Mail-Angebot</StatusEtikett>;
  return <StatusEtikett ton="neutral">Keins</StatusEtikett>;
}