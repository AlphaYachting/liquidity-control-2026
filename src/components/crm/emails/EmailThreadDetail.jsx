import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Reply, AlertTriangle, Mail, Users, Link2 } from 'lucide-react';
import { extractRecipients, collectParticipants } from '@/components/crm/emails/messageRecipients';
import { EMAIL_CATEGORIES, EMAIL_THREAD_STATUSES, DIRECTION_META, formatMailDate, colleagueRepliedLast, deriveCustomerFromEmail } from '@/components/crm/emails/emailConfig';
import ThreadAnalysisPanel from '@/components/crm/emails/ThreadAnalysisPanel';
import ReplyDraftPanel from '@/components/crm/emails/ReplyDraftPanel';
import ReplyComposer from '@/components/crm/emails/ReplyComposer';
import ThreadDoneButton from '@/components/crm/emails/ThreadDoneButton';
import ThreadSuggestionBadge from '@/components/crm/emails/ThreadSuggestionBadge';
import ThreadActionBar from '@/components/crm/emails/ThreadActionBar';

export default function EmailThreadDetail({ thread, loading, onRefresh, onStatusChanged }) {
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
  const participants = collectParticipants(messages);
  const relatedThreads = thread.related_threads || [];

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
            <div className="flex items-start gap-2 shrink-0">
              {replyHref && (
                <Button size="sm" variant="outline" asChild className="gap-2">
                  <a href={replyHref}><Reply className="w-3.5 h-3.5" /> Antworten</a>
                </Button>
              )}
              <ThreadDoneButton
                threadId={t.id}
                status={t.status}
                onChanged={(newStatus) => (onStatusChanged ? onStatusChanged(t.id, newStatus) : onRefresh?.())}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <ThreadSuggestionBadge thread={t} />
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
            {relatedThreads.length > 0 && (
              <Badge variant="outline" className="text-[10px] border-0 bg-violet-100 text-violet-700 gap-1">
                <Link2 className="w-3 h-3" /> Zusammengeführt aus {relatedThreads.length + 1} Verläufen
              </Badge>
            )}
          </div>
          {participants.length > 1 && (
            <div className="flex items-start gap-1.5 mt-2">
              <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex items-center gap-1 flex-wrap">
                {participants.map((p) => (
                  <span
                    key={p.email}
                    title={p.email}
                    className={`text-[10px] rounded-full px-2 py-0.5 ${
                      p.direction === 'in' ? 'bg-blue-50 text-blue-700' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {p.name || p.email}
                  </span>
                ))}
              </div>
            </div>
          )}
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

      <ThreadActionBar thread={t} messages={messages} onChanged={onRefresh} />

      <ThreadAnalysisPanel thread={t} messages={messages} onSaved={onRefresh} />

      <ReplyComposer threadId={t.id} dealId={t.crm_deal_id} recipient={lastInbound?.from || ''} />

      <ReplyDraftPanel thread={t} messages={messages} />

      <div className="space-y-2">
        {messages.map((m) => {
          const dir = DIRECTION_META[m.direction] || {};
          const rec = extractRecipients(m);
          return (
            <div key={m.id} className="rounded-lg border">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{m.from_name || m.from}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{m.from}</p>
                  {rec.to && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      <span className="font-medium">An:</span> {rec.to}
                    </p>
                  )}
                  {rec.cc && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      <span className="font-medium">CC:</span> {rec.cc}
                    </p>
                  )}
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