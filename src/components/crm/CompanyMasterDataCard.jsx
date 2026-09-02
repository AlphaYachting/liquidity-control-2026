import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Building2, Mail, Phone, User, Linkedin, RefreshCw } from 'lucide-react';

const STATUS_BADGE = {
  pending: { label: 'Prüfung ausstehend', cls: 'bg-slate-100 text-slate-600' },
  complete: { label: '✓ Vollständig', cls: 'bg-emerald-100 text-emerald-600' },
  enriched: { label: '✨ Automatisch ergänzt', cls: 'bg-blue-100 text-blue-700' },
  insufficient_data: { label: 'Recherche ohne Ergebnis', cls: 'bg-amber-100 text-amber-700' },
  error: { label: 'Fehler bei Recherche', cls: 'bg-red-100 text-red-600' },
};

const NACHFORSCHEN = ['pending', 'insufficient_data', 'error'];

// Kontakt und Stammdaten in EINER Karte — der Name steht nur einmal.
export default function CompanyMasterDataCard({ deal, onChanged }) {
  const [running, setRunning] = useState(false);
  const [mehr, setMehr] = useState(false);
  const badge = STATUS_BADGE[deal.enrichment_status] || STATUS_BADGE.pending;

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
    <div className="border border-border rounded-lg bg-card p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Kontakt &amp; Stammdaten</h3>
        <span className={`text-[11px] px-2 py-0.5 rounded-sm font-medium ${badge.cls}`}>{badge.label}</span>
      </div>

      {deal.company_name && (
        <p className="text-sm flex items-center gap-2"><Building2 className="w-3.5 h-3.5 text-muted-foreground" /> {deal.company_name}</p>
      )}
      {deal.contact_name && !gleich && (
        <p className="text-sm flex items-center gap-2">
          <User className="w-3.5 h-3.5 text-muted-foreground" /> {deal.contact_name}
          {deal.contact_position && <span className="text-xs text-muted-foreground">· {deal.contact_position}</span>}
        </p>
      )}
      {deal.contact_linkedin_url && (
        <a href={deal.contact_linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sm flex items-center gap-2 text-primary hover:underline">
          <Linkedin className="w-3.5 h-3.5" /> LinkedIn-Profil
        </a>
      )}
      {deal.contact_email && (
        <a href={`mailto:${deal.contact_email}`} className="text-sm flex items-center gap-2 text-primary hover:underline">
          <Mail className="w-3.5 h-3.5" /> {deal.contact_email}
        </a>
      )}
      {deal.contact_phone && (
        <p className="text-sm flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> {deal.contact_phone}</p>
      )}
      {deal.contact_background && (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{deal.contact_background}</p>
      )}

      <div className="border-t pt-2.5 mt-2.5">
        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Stammdaten</p>
        {stammzeile ? (
          <p className="text-xs text-muted-foreground">{stammzeile}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Noch keine Unternehmens-Stammdaten erfasst.</p>
        )}
        {deal.company_address && <p className="text-xs text-muted-foreground mt-1">{deal.company_address}</p>}

        {summary && (
          <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap">
            {mehr ? summary : ersteZeile}
            {hatMehr && !mehr && (
              <button type="button" onClick={() => setMehr(true)} className="ml-1 text-primary hover:underline">mehr</button>
            )}
          </p>
        )}

        {NACHFORSCHEN.includes(deal.enrichment_status) && (
          <Button size="sm" variant="ghost" className="gap-1.5 mt-1.5 -ml-2 h-7 px-2 text-xs" onClick={runEnrichment} disabled={running}>
            <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Recherchiert im Netz…' : 'Jetzt recherchieren'}
          </Button>
        )}
      </div>
    </div>
  );
}