import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Reply, AlertTriangle, Mail } from 'lucide-react';
import { EMAIL_CATEGORIES, EMAIL_THREAD_STATUSES, DIRECTION_META, formatMailDate, colleagueRepliedLast, deriveCustomerFromEmail } from '@/components/crm/emails/emailConfig';
import ThreadAnalysisPanel from '@/components/crm/emails/ThreadAnalysisPanel';
import ReplyDraftPanel from '@/components/crm/emails/ReplyDraftPanel';

export default function EmailThreadDetail({ thread, loading, onRefresh }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Konversation wird geladen…
      </div>
    );
  }
  if (!thread) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <Mail className="w-8 h-8 opacity-30" />
        <p className="text-sm">Konversation links auswählen</p>
      </div>
    );
  }
  if (thread.error) return <p className="text-xs text-destructive py-8 text-center">{thread.error}</p>;

  const t = thread.thread || {};
  const messages = thread.messages || [];
  const cat = EMAIL_CATEGORIES[t.category];
  const st = EMAIL_THREAD_STATUSES[t.status];
  const lastInbound = messages.find((m) => m.direction === 'in');
  const customerLabel = t.customer || deriveCustomerFromEmail(lastInbound?.from);
  const replyHref = lastInbound
    ? `mailto:${lastInbound.from}?subject=${encodeURIComponent('Re: ' + (t.subject || ''))}`
    : null;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-sm leading-snug">{t.subject || '(kein Betreff)'}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {customerLabel || 'Kunde unbekannt'} · {t.message_count || 0} Nachrichten ·{' '}
                {formatMailDate(t.first_message_at)} bis {formatMailDate(t.last_message_at)}
              </p>
            </div>
            {replyHref && (
              <Button size="sm" variant="outline" asChild className="gap-2 shrink-0">
                <a href={replyHref}><Reply className="w-3.5 h-3.5" /> Antworten</a>
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {cat && <Badge variant="outline" className={`text-[10px] border-0 ${cat.color}`}>{cat.label}</Badge>}
            {st && <Badge variant="outline" className={`text-[10px] border-0 ${st.color}`}>{st.label}</Badge>}
            {t.status === 'offen' && colleagueRepliedLast(messages) && (
              <Badge variant="outline" className="text-[10px] border-0 bg-sky-100 text-sky-700 gap-1">
                <Reply className="w-3 h-3" /> Kollege hat geantwortet
              </Badge>
            )}
            {Number(t.eskalation) === 1 && (
              <Badge variant="outline" className="text-[10px] border-0 bg-red-100 text-red-700 gap-1">
                <AlertTriangle className="w-3 h-3" /> Eskalation
              </Badge>
            )}
            {t.project_id && <Badge variant="outline" className="text-[10px]">Projekt {t.project_id}</Badge>}
          </div>
        </CardHeader>
        {t.summary && (
          <CardContent className="pt-0">
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">Zusammenfassung</p>
              <p className="text-xs leading-relaxed">{t.summary}</p>
            </div>
          </CardContent>
        )}
      </Card>

      <ThreadAnalysisPanel thread={t} messages={messages} onSaved={onRefresh} />

      <ReplyDraftPanel thread={t} messages={messages} />

      <div className="space-y-2">
        {messages.map((m) => {
          const dir = DIRECTION_META[m.direction] || {};
          return (
            <div key={m.id} className="rounded-lg border">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{m.from_name || m.from}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{m.from}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-0 ${dir.color || ''}`}>{dir.label || m.direction}</Badge>
                  <span className="text-[10px] text-muted-foreground">{formatMailDate(m.received_at)}</span>
                </div>
              </div>
              <div className="px-3 py-2 max-h-72 overflow-y-auto">
                <p className="text-xs whitespace-pre-wrap leading-relaxed">{m.text || m.preview || '—'}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}