import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Building2, Mail, Phone, User, Linkedin, RefreshCw } from 'lucide-react';
import { Box, BoxKopf, BoxInhalt } from '@/components/shared/Box';
import StatusEtikett from '@/components/shared/StatusEtikett';

const STATUS_META = {
  pending: { ton: 'attention', text: 'Prüfen' },
  complete: { ton: 'done', text: 'Vollständig' },
  enriched: { ton: 'info', text: 'Ergänzt' },
  insufficient_data: { ton: 'attention', text: 'Ohne Ergebnis' },
  error: { ton: 'critical', text: 'Fehler' },
};

const NACHFORSCHEN = ['pending', 'insufficient_data', 'error'];
const LINK = 'text-body flex items-center gap-2 text-foreground underline underline-offset-2 hover:text-primary';

// Kontakt und Stammdaten in EINER Box — der Name steht nur einmal.
export default function CompanyMasterDataCard({ deal, onChanged }) {
  const [running, setRunning] = useState(false);
  const [mehr, setMehr] = useState(false);
  const st = STATUS_META[deal.enrichment_status] || STATUS_META.pending;

  const runEnrichment = async () => {
    setRunning(true);
    try {
      await base44.functions.invoke('enrichCrmLead', { deal_id: deal.id });
      onChanged?.();
    } finally {
      setRunning(false);
    }
  };

  const gleich = deal.company_name && deal.contact_name
    && deal.company_name.trim().toLowerCase() === deal.contact_name.trim().toLowerCase();

  const website = deal.company_website ? deal.company_website.replace(/^https?:\/\//, '') : '';
  const stammzeile = [website, deal.company_industry, deal.company_size].filter(Boolean).join(' · ');

  const summary = deal.enrichment_summary || '';
  const ersteZeile = summary.split('\n')[0];
  const hatMehr = summary.length > ersteZeile.length;

  return (
    <Box>
      <BoxKopf titel="Kontakt & Stammdaten" aktion={<StatusEtikett ton={st.ton}>{st.text}</StatusEtikett>} />
      <BoxInhalt>
        <div className="space-y-2">
          {deal.company_name && (
            <p className="text-body flex items-center gap-2"><Building2 className="w-3.5 h-3.5 text-muted-foreground" /> {deal.company_name}</p>
          )}
          {deal.contact_name && !gleich && (
            <p className="text-body flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-muted-foreground" /> {deal.contact_name}
              {deal.contact_position && <span className="text-meta text-muted-foreground">· {deal.contact_position}</span>}
            </p>
          )}
          {deal.contact_linkedin_url && (
            <a href={deal.contact_linkedin_url} target="_blank" rel="noopener noreferrer" className={LINK}>
              <Linkedin className="w-3.5 h-3.5 text-muted-foreground" /> LinkedIn-Profil
            </a>
          )}
          {deal.contact_email && (
            <a href={`mailto:${deal.contact_email}`} className={LINK}>
              <Mail className="w-3.5 h-3.5 text-muted-foreground" /> {deal.contact_email}
            </a>
          )}
          {deal.contact_phone && (
            <p className="text-body flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> {deal.contact_phone}</p>
          )}
          {deal.contact_background && (
            <p className="text-meta text-muted-foreground whitespace-pre-wrap">{deal.contact_background}</p>
          )}
        </div>

        <div className="border-t pt-3 space-y-1.5">
          <p className="text-label uppercase text-muted-foreground">Stammdaten</p>
          <p className="text-meta text-muted-foreground">
            {stammzeile || 'Noch keine Unternehmens-Stammdaten erfasst.'}
          </p>
          {deal.company_address && <p className="text-meta text-muted-foreground">{deal.company_address}</p>}

          {summary && (
            <p className="text-meta text-muted-foreground whitespace-pre-wrap">
              {mehr ? summary : ersteZeile}
              {hatMehr && !mehr && (
                <button type="button" onClick={() => setMehr(true)} className="ml-1 underline underline-offset-2">mehr</button>
              )}
            </p>
          )}

          {NACHFORSCHEN.includes(deal.enrichment_status) && (
            <Button size="sm" variant="outline" onClick={runEnrichment} disabled={running}>
              <RefreshCw className={running ? 'animate-spin' : ''} />
              {running ? 'Recherchiert im Netz…' : 'Jetzt recherchieren'}
            </Button>
          )}
        </div>
      </BoxInhalt>
    </Box>
  );
}