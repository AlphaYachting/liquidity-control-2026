import React from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { EMAIL_CATEGORIES, EMAIL_THREAD_STATUSES, formatMailDate } from '@/components/crm/emails/emailConfig';

// Zeigt die E-Mail-Threads hinter dem Kommunikations-Status eines Kunden —
// direkt aus dem Projektcockpit abrufbar, ohne Suche in der E-Mail-Zentrale.
export default function CommunicationStatusDialog({ open, onClose, customer, status, threads }) {
  const problemIds = new Set((status?.threads || []).map((t) => t.id));
  const sorted = [...(threads || [])].sort((a, b) => {
    const ap = problemIds.has(a.id) ? 0 : 1;
    const bp = problemIds.has(b.id) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return (b.last_message_at || '').localeCompare(a.last_message_at || '');
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Kommunikation: {customer} <span className="text-muted-foreground font-normal text-sm">— {status?.label}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {sorted.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">Keine E-Mail-Threads in den letzten 90 Tagen.</p>
          )}
          {sorted.map((t) => {
            const cat = EMAIL_CATEGORIES[t.category];
            const st = EMAIL_THREAD_STATUSES[t.status];
            const isProblem = problemIds.has(t.id);
            return (
              <Link
                key={t.id}
                to={`/crm/emails?thread=${t.id}`}
                className={`block rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
                  isProblem ? 'border-red-300 bg-red-50/50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold leading-snug flex items-center gap-1.5">
                    {isProblem && <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />}
                    {t.subject || '(kein Betreff)'}
                  </p>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 flex items-center gap-1">
                    {formatMailDate(t.last_message_at)}
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
                {t.summary && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{t.summary}</p>}
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {Number(t.eskalation) === 1 && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-0 bg-red-100 text-red-700">Eskalation</Badge>
                  )}
                  {cat && <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-0 ${cat.color}`}>{cat.label}</Badge>}
                  {st && <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-0 ${st.color}`}>{st.label}</Badge>}
                </div>
              </Link>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Klick auf einen Thread öffnet ihn direkt in der E-Mail-Zentrale.
        </p>
      </DialogContent>
    </Dialog>
  );
}