import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, AlertTriangle, ExternalLink, ChevronRight } from 'lucide-react';
import { EMAIL_CATEGORIES, EMAIL_THREAD_STATUSES, formatMailDate } from '@/components/crm/emails/emailConfig';
import { useCustomerEmailThreads } from '@/hooks/useCustomerEmailThreads';

const ERSTE = 5;

// E-Mail-Konversationen eines Kunden (letzte 90 Tage). Jede Zeile öffnet die
// Konversation in der E-Mail-Zentrale; mehr als fünf werden auf Wunsch nachgezeigt.
export default function CustomerEmailSection({ customer, ohneTitel = false }) {
  const { data, isLoading, isError, isFetching, refetch } = useCustomerEmailThreads(customer);
  const [alle, setAlle] = useState(false);

  if (!customer) return null;
  const gesamt = data?.results || [];
  const threads = alle ? gesamt : gesamt.slice(0, ERSTE);
  const isSearchFallback = data?.mode === 'search';

  return (
    <Card>
      {!ohneTitel && (
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-muted-foreground" /> E-Mail-Kommunikation
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Alle Konversationen mit {customer} aus den letzten 90 Tagen — nicht nur zu diesem Projekt.
          </p>
        </CardHeader>
      )}
      <CardContent className={`space-y-2 ${ohneTitel ? 'pt-4' : ''}`}>
        {isLoading ? (
          <div className="space-y-2" aria-label="E-Mails werden geladen">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full bg-muted" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-wrap items-center gap-3 py-1">
            <p className="text-meta text-muted-foreground">E-Mail-Datenbank nicht erreichbar.</p>
            <Button size="sm" variant="outline" className="rounded" disabled={isFetching} onClick={() => refetch()}>
              {isFetching ? 'Lädt…' : 'Erneut versuchen'}
            </Button>
          </div>
        ) : gesamt.length === 0 ? (
          <p className="text-meta text-muted-foreground py-1">Keine zugeordneten E-Mails (letzte 90 Tage).</p>
        ) : (
          <>
            {isSearchFallback && (
              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                Über Namenssuche „{data.search_term}" gefunden — KI-Auswertung noch ausstehend.
              </p>
            )}
            {threads.map((t) => {
              const cat = EMAIL_CATEGORIES[t.category];
              const st = EMAIL_THREAD_STATUSES[t.status];
              return (
                <Link
                  key={t.id}
                  to={`/crm/emails?thread=${t.id}`}
                  title="Konversation in der E-Mail-Zentrale öffnen"
                  className="group flex items-start gap-2 border rounded-lg p-3 hover:bg-muted/40"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-body font-medium leading-snug line-clamp-2">{t.subject || '(kein Betreff)'}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {formatMailDate(t.last_message_at).slice(0, 10)}
                      </span>
                    </div>
                    {t.summary && <p className="text-meta text-muted-foreground line-clamp-2">{t.summary}</p>}
                    {(Number(t.eskalation) === 1 || cat || st) && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {Number(t.eskalation) === 1 && (
                          <Badge variant="outline" className="text-[11px] px-1.5 py-0 border-0 bg-red-100 text-red-700 gap-0.5">
                            <AlertTriangle className="w-3 h-3" /> Eskalation
                          </Badge>
                        )}
                        {cat && <Badge variant="outline" className={`text-[11px] px-1.5 py-0 border-0 ${cat.color}`}>{cat.label}</Badge>}
                        {st && <Badge variant="outline" className={`text-[11px] px-1.5 py-0 border-0 ${st.color}`}>{st.label}</Badge>}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                </Link>
              );
            })}
            {!alle && gesamt.length > ERSTE && (
              <Button size="sm" variant="outline" className="rounded" onClick={() => setAlle(true)}>
                Weitere {gesamt.length - ERSTE} Konversationen anzeigen
              </Button>
            )}
          </>
        )}
        <Link to="/crm/emails" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline pt-1">
          <ExternalLink className="w-3 h-3" /> Zur E-Mail-Zentrale
        </Link>
      </CardContent>
    </Card>
  );
}
