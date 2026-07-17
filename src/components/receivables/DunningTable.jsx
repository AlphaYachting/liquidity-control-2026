import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, X, ExternalLink, Phone } from 'lucide-react';
import { formatCurrency } from '@/lib/liquidityUtils';

const LEVEL_STYLE = {
  1: 'bg-amber-100 text-amber-700',
  2: 'bg-orange-100 text-orange-700',
  3: 'bg-red-100 text-red-700',
};

const STATUS_LABEL = {
  draft_created: { label: 'Entwurf — wartet auf Freigabe', cls: 'bg-blue-100 text-blue-700' },
  approved: { label: '✓ Freigegeben', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Abgelehnt', cls: 'bg-gray-100 text-gray-600' },
  error: { label: 'Fehler', cls: 'bg-red-100 text-red-700' },
};

export default function DunningTable({ records, isLoading, onDecide }) {
  if (isLoading) return <p className="text-sm text-muted-foreground">Lade Mahnvorgänge...</p>;
  if (records.length === 0) return <p className="text-sm text-muted-foreground">Noch keine Mahnvorgänge vorhanden.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b">
            <th className="py-2 pr-3">Stufe</th>
            <th className="py-2 pr-3">Kunde</th>
            <th className="py-2 pr-3">RE-Nr.</th>
            <th className="py-2 pr-3 text-right">Offen</th>
            <th className="py-2 pr-3">Erstversand</th>
            <th className="py-2 pr-3">Tage</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Eskalation</th>
            <th className="py-2">Aktion</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => {
            const st = STATUS_LABEL[r.status] || STATUS_LABEL.draft_created;
            return (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <Badge className={LEVEL_STYLE[r.dunning_level] || LEVEL_STYLE[1]}>{r.level_label}</Badge>
                </td>
                <td className="py-2 pr-3 font-medium">{r.customer_name}</td>
                <td className="py-2 pr-3">{r.invoice_number}</td>
                <td className="py-2 pr-3 text-right font-medium">{formatCurrency(r.open_amount)}</td>
                <td className="py-2 pr-3">{r.reference_date}</td>
                <td className="py-2 pr-3">{r.overdue_days_at_creation}</td>
                <td className="py-2 pr-3"><Badge className={st.cls}>{st.label}</Badge></td>
                <td className="py-2 pr-3">
                  {r.call_escalation ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                      <Phone className="w-3 h-3" /> Anrufeskalation
                    </span>
                  ) : '—'}
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-1">
                    {r.sevdesk_reminder_url && (
                      <a href={r.sevdesk_reminder_url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mr-2">
                        <ExternalLink className="w-3 h-3" /> sevDesk
                      </a>
                    )}
                    {r.status === 'draft_created' && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-emerald-700"
                          onClick={() => onDecide(r.id, 'approved')}>
                          <Check className="w-3 h-3" /> Freigeben
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground"
                          onClick={() => onDecide(r.id, 'rejected')}>
                          <X className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}