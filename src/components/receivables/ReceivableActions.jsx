import React from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink, Check, X } from 'lucide-react';

// Aktionen direkt in der Forderungsliste: Rechnung in sevDesk öffnen und
// einen vorliegenden Mahnentwurf freigeben (versenden) oder verwerfen.
export default function ReceivableActions({ row, onDecide, isPending }) {
  return (
    <div className="flex items-center gap-2">
      <a
        href={`https://my.sevdesk.de/fi/edit/type/RE/id/${row.id}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <ExternalLink className="w-3 h-3" /> sevDesk
      </a>

      {row.dunning_url && (
        <a
          href={row.dunning_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="w-3 h-3" /> Mahnung
        </a>
      )}

      {row.dunning_status === 'draft_created' && (
        <>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-emerald-700"
            disabled={isPending}
            onClick={() => {
              if (window.confirm(`${row.dunning_label || 'Mahnung'} zu Rechnung ${row.invoice_number} jetzt per E-Mail an ${row.customer_name} versenden?`)) {
                onDecide(row.dunning_id, 'approved');
              }
            }}
          >
            <Check className="w-3 h-3" /> Versenden
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-muted-foreground"
            disabled={isPending}
            title="Mahnentwurf verwerfen"
            onClick={() => onDecide(row.dunning_id, 'rejected')}
          >
            <X className="w-3 h-3" />
          </Button>
        </>
      )}
    </div>
  );
}