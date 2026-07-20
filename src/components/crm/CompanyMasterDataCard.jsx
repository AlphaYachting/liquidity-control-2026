import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Globe, MapPin, Factory, Users, Sparkles, RefreshCw } from 'lucide-react';

const STATUS_BADGE = {
  pending: { label: 'Prüfung ausstehend', cls: 'bg-slate-100 text-slate-600' },
  complete: { label: '✓ Vollständig', cls: 'bg-emerald-100 text-emerald-600' },
  enriched: { label: '✨ Automatisch ergänzt', cls: 'bg-blue-100 text-blue-700' },
  insufficient_data: { label: 'Recherche ohne Ergebnis', cls: 'bg-amber-100 text-amber-700' },
  error: { label: 'Fehler bei Recherche', cls: 'bg-red-100 text-red-600' },
};

export default function CompanyMasterDataCard({ deal, onChanged }) {
  const [running, setRunning] = useState(false);
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

  const hasData = deal.company_website || deal.company_address || deal.company_industry || deal.company_size;

  return (
    <div className="border rounded-xl bg-card p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> Stammdaten
        </h3>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
      </div>

      {deal.company_website && (
        <a href={deal.company_website.startsWith('http') ? deal.company_website : `https://${deal.company_website}`}
          target="_blank" rel="noopener noreferrer"
          className="text-sm flex items-center gap-2 text-primary hover:underline">
          <Globe className="w-3.5 h-3.5" /> {deal.company_website.replace(/^https?:\/\//, '')}
        </a>
      )}
      {deal.company_address && <p className="text-sm flex items-start gap-2"><MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" /> {deal.company_address}</p>}
      {deal.company_industry && <p className="text-sm flex items-center gap-2"><Factory className="w-3.5 h-3.5 text-muted-foreground" /> {deal.company_industry}</p>}
      {deal.company_size && <p className="text-sm flex items-center gap-2"><Users className="w-3.5 h-3.5 text-muted-foreground" /> {deal.company_size}</p>}

      {deal.enrichment_summary && (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap pt-1 border-t mt-2">{deal.enrichment_summary}</p>
      )}
      {!hasData && !deal.enrichment_summary && (
        <p className="text-xs text-muted-foreground">Noch keine Unternehmens-Stammdaten erfasst.</p>
      )}

      <Button size="sm" variant="outline" className="w-full gap-1.5 mt-1" onClick={runEnrichment} disabled={running}>
        <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
        {running ? 'Recherchiert im Netz…' : 'Jetzt recherchieren'}
      </Button>
    </div>
  );
}