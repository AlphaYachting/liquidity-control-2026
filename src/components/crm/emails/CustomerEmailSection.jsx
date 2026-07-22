import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mail, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { emailApi } from '@/components/crm/emails/emailApi';
import { EMAIL_CATEGORIES, EMAIL_THREAD_STATUSES, formatMailDate } from '@/components/crm/emails/emailConfig';

// Zeigt die letzten E-Mail-Konversationen eines Kunden im Projekt-Cockpit.
export default function CustomerEmailSection({ customer }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['customer-emails', customer],
    queryFn: () => emailApi('threads', { params: { customer, days: 90, limit: 5 } }),
    enabled: !!customer,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!customer) return null;
  const threads = data?.results || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5 text-primary" /> E-Mail-Kommunikation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Wird geladen…
          </div>
        ) : isError ? (
          <p className="text-xs text-muted-foreground py-1">E-Mail-Datenbank nicht erreichbar.</p>
        ) : threads.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1">Keine zugeordneten E-Mails (letzte 90 Tage).</p>
        ) : (
          threads.map((t) => {
            const cat = EMAIL_CATEGORIES[t.category];
            const st = EMAIL_THREAD_STATUSES[t.status];
            return (
              <div key={t.id} className="border rounded-lg p-2 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium leading-snug line-clamp-2">{t.subject || '(kein Betreff)'}</p>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                    {formatMailDate(t.last_message_at).slice(0, 10)}
                  </span>
                </div>
                {t.summary && <p className="text-[11px] text-muted-foreground line-clamp-2">{t.summary}</p>}
                <div className="flex items-center gap-1 flex-wrap">
                  {Number(t.eskalation) === 1 && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-0 bg-red-100 text-red-700 gap-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" /> Eskalation
                    </Badge>
                  )}
                  {cat && <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-0 ${cat.color}`}>{cat.label}</Badge>}
                  {st && <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-0 ${st.color}`}>{st.label}</Badge>}
                </div>
              </div>
            );
          })
        )}
        <Link to="/crm/emails" className="flex items-center gap-1 text-xs text-primary hover:underline pt-1">
          <ExternalLink className="w-3 h-3" /> Zur E-Mail-Zentrale
        </Link>
      </CardContent>
    </Card>
  );
}