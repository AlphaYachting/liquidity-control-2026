import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import QuoteCaptureDialog from '@/components/crm/quotes/QuoteCaptureDialog';
import { QUOTE_STATUS, QUOTE_SOURCE, eur } from '@/components/crm/quotes/quoteConfig';

export default function CrmQuotes() {
  const navigate = useNavigate();
  const [captureOpen, setCaptureOpen] = useState(false);

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['crm-quotes'],
    queryFn: () => base44.entities.CrmQuote.list('-updated_date', 500),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="CRM — Angebote"
        subtitle="Angebote aus Transkripten, Kunden-E-Mails und Sprachmemos"
        actions={
          <Button className="gap-2" onClick={() => setCaptureOpen(true)}>
            <Plus className="w-4 h-4" /> Neues Angebot
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Angebote laden…</p>
      ) : quotes.length === 0 ? (
        <div className="border rounded-xl bg-card p-10 text-center space-y-2">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Noch keine Angebote. Erfasse das erste per Transkript, E-Mail oder Sprachmemo.</p>
        </div>
      ) : (
        <div className="border rounded-xl bg-card divide-y">
          {quotes.map(q => (
            <button key={q.id} onClick={() => navigate(`/crm/quotes/${q.id}`)}
              className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-semibold">{q.title}</p>
                <p className="text-xs text-muted-foreground">
                  {q.customer_name || 'Kunde offen'}
                  {q.quote_number ? ` · ${q.quote_number}` : ''}
                  {' · '}{QUOTE_SOURCE[q.source]?.label || q.source}
                </p>
              </div>
              <span className="text-sm font-bold">{eur(q.total_net)} <span className="text-xs font-normal text-muted-foreground">netto</span></span>
              <Badge className={`text-xs ${QUOTE_STATUS[q.status]?.color || ''}`}>
                {QUOTE_STATUS[q.status]?.label || q.status}
              </Badge>
              <span className="text-xs text-muted-foreground w-20 text-right">
                {q.created_date ? new Date(q.created_date).toLocaleDateString('de-AT') : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      <QuoteCaptureDialog open={captureOpen} onOpenChange={setCaptureOpen} />
    </div>
  );
}