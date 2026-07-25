import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, AlertTriangle, Check, EyeOff, Loader2 } from 'lucide-react';
import { EMAIL_CATEGORIES, EMAIL_THREAD_STATUSES, formatMailDate } from '@/components/crm/emails/emailConfig';
import { emailApi } from '@/components/crm/emails/emailApi';

// Zeigt die E-Mail-Threads hinter dem Kommunikations-Status eines Kunden —
// direkt aus dem Projektcockpit abrufbar, inkl. Erledigt/Unrelevant-Markierung.
export default function CommunicationStatusDialog({ open, onClose, customer, status, threads }) {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState(null);
  const [localOverrides, setLocalOverrides] = useState({});

  const problemIds = new Set((status?.threads || []).map((t) => t.id));
  const sorted = [...(threads || [])]
    .map((t) => ({ ...t, ...(localOverrides[t.id] || {}) }))
    .sort((a, b) => {
      const ap = problemIds.has(a.id) && !localOverrides[a.id] ? 0 : 1;
      const bp = problemIds.has(b.id) && !localOverrides[b.id] ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return (b.last_message_at || '').localeCompare(a.last_message_at || '');
    });

  const markThread = async (e, thread, type) => {
    e.preventDefault();
    e.stopPropagation();
    setBusyId(thread.id);
    const fields = type === 'done'
      ? { status: 'erledigt' }
      : { status: 'erledigt', category: 'sonstiges', eskalation: 0 };
    try {
      await emailApi('enrich', { thread_id: thread.id, fields });
      setLocalOverrides((prev) => ({ ...prev, [thread.id]: fields }));
      queryClient.invalidateQueries({ queryKey: ['customer-emails', customer] });
      queryClient.invalidateQueries({ queryKey: ['email-escalations'] });
    } finally {
      setBusyId(null);
    }
  };

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
            const isProblem = problemIds.has(t.id) && !localOverrides[t.id];
            const isDone = t.status === 'erledigt';
            const isBusy = busyId === t.id;
            return (
              <Link
                key={t.id}
                to={`/crm/emails?thread=${t.id}`}
                className={`block rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
                  isProblem ? 'border-red-300 bg-red-50/50' : ''
                } ${isDone ? 'opacity-60' : ''}`}
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
                <div className="flex items-center justify-between gap-2 mt-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {Number(t.eskalation) === 1 && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-0 bg-red-100 text-red-700">Eskalation</Badge>
                    )}
                    {cat && <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-0 ${cat.color}`}>{cat.label}</Badge>}
                    {st && <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-0 ${st.color}`}>{st.label}</Badge>}
                  </div>
                  {!isDone && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px] gap-1"
                        disabled={isBusy}
                        onClick={(e) => markThread(e, t, 'done')}
                      >
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Erledigt
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] gap-1 text-muted-foreground"
                        disabled={isBusy}
                        onClick={(e) => markThread(e, t, 'irrelevant')}
                      >
                        <EyeOff className="w-3 h-3" />
                        Unrelevant
                      </Button>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Klick auf einen Thread öffnet ihn in der E-Mail-Zentrale. „Erledigt"/„Unrelevant" aktualisiert den Kommunikations-Status sofort.
        </p>
      </DialogContent>
    </Dialog>
  );
}