import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, Paperclip, Reply, Clock } from 'lucide-react';
import { EMAIL_CATEGORIES, EMAIL_THREAD_STATUSES, DIRECTION_META, formatMailDate, isInternalSender, deriveCustomerFromEmail } from '@/components/crm/emails/emailConfig';
import ThreadDoneIcon from '@/components/crm/emails/ThreadDoneIcon';

// Liste von Konversationen (mode="threads") oder Suchtreffern (mode="search").
export default function EmailThreadList({ mode, items, selectedId, onSelect, loading, error, onStatusChanged }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Wird geladen…
      </div>
    );
  }
  if (error) return <p className="text-xs text-destructive py-6 text-center">{error}</p>;
  if (!items?.length) return <p className="text-xs text-muted-foreground py-8 text-center">Keine Treffer.</p>;

  return (
    <div className="space-y-1.5 overflow-y-auto">
      {items.map((item) => {
        const threadId = mode === 'search' ? item.thread_id : item.id;
        const active = selectedId === threadId;
        const cat = EMAIL_CATEGORIES[item.category];
        const st = EMAIL_THREAD_STATUSES[item.status];
        const dir = DIRECTION_META[item.direction];
        const colleagueReplied = mode === 'threads' && (item.message_count || 0) > 1 && item.last_direction && item.last_direction !== 'in' && isInternalSender(item.last_from);
        return (
          <div
            key={`${mode}-${item.id}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(threadId)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSelect(threadId); }}
            className={`w-full text-left rounded-lg border p-3 transition-colors cursor-pointer ${
              active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold leading-snug line-clamp-2">{item.subject || '(kein Betreff)'}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {formatMailDate(mode === 'search' ? item.received_at : item.last_message_at)}
                </span>
                {mode === 'threads' && item.status !== 'erledigt' && (
                  <ThreadDoneIcon threadId={threadId} onChanged={onStatusChanged} />
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {mode === 'search'
                ? `${item.from_name || item.from || ''}`
                : `${item.customer || deriveCustomerFromEmail(item.last_inbound_from) || deriveCustomerFromEmail(item.last_from) || 'Kunde unbekannt'} · ${item.message_count || 0} Nachrichten`}
            </p>
            {(mode === 'search' ? item.to : item.last_to) && (
              <p className="text-[11px] text-muted-foreground truncate">
                <span className="font-medium">An:</span> {mode === 'search' ? item.to : item.last_to}
              </p>
            )}
            {(item.preview || item.summary) && (
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{item.preview || item.summary}</p>
            )}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {dir && <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-0 ${dir.color}`}>{dir.label}</Badge>}
              {cat && <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-0 ${cat.color}`}>{cat.label}</Badge>}
              {st && <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-0 ${st.color}`}>{st.label}</Badge>}
              {item._waiting_days != null && (
                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-0 gap-1 ${
                  item._waiting_days > 3 ? 'bg-red-100 text-red-700' : item._waiting_days >= 1 ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'
                }`}>
                  <Clock className="w-2.5 h-2.5" />
                  {item._waiting_days === 0 ? 'heute' : `wartet seit ${item._waiting_days} Tg.`}
                </Badge>
              )}
              {colleagueReplied && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-0 bg-sky-100 text-sky-700 gap-1">
                  <Reply className="w-2.5 h-2.5" /> Kollege hat geantwortet
                </Badge>
              )}
              {item.crm_status === 'lead_angelegt' && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-0 bg-violet-100 text-violet-700">
                  → Deal
                </Badge>
              )}
              {item.has_attachments && <Paperclip className="w-3 h-3 text-muted-foreground" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}