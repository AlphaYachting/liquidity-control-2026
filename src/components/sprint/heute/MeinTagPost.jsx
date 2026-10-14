import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Check, Loader2, Siren, ChevronLeft, ChevronRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { Titel, KARTE } from '@/components/sprint/heute/MeinTagBausteine';
import { usePosteingang } from '@/hooks/usePosteingang';
import { emailApi } from '@/components/crm/emails/emailApi';
import EscalationThreadPreview from '@/components/crm/emails/EscalationThreadPreview';
import ZuweisungWahl, { useTeam, nameVon } from '@/components/crm/ZuweisungWahl';
import { KLASSE_LABEL } from '@/lib/crm/posteingang';

const wartezeit = (ms) => {
  const std = Math.max(0, Math.round((Date.now() - ms) / 3600000));
  if (std < 24) return `seit ${std} Std.`;
  const tage = Math.round(std / 24);
  return `seit ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`;
};

// „Meine Post“: Mails, die mir zugewiesen sind und noch auf Antwort warten (Entscheidung Alfons 12.10.2026).
// Erscheint für jede Person, unabhängig vom Zugang zum Posteingang. Endet mit der Antwort —
// dann ist die Konversation nicht mehr unbeantwortet und verschwindet von selbst.
export default function MeinTagPost() {
  const post = usePosteingang();
  const { data: team = [] } = useTeam();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [offenKey, setOffenKey] = useState(null);
  const [busy, setBusy] = useState(false);

  if (post.isLoading || post.isError) return null;
  const liste = [...post.meine].sort((a, b) => (b.eskalation - a.eskalation) || (a.eingang - b.eingang));
  if (!liste.length) return null;

  // Das geöffnete Element über seinen Schlüssel führen — so bleibt es nach dem Neuladen der Liste stabil
  const index = liste.findIndex((e) => e.key === offenKey);
  const offen = index >= 0 ? liste[index] : null;
  const gehe = (i) => setOffenKey(liste[i]?.key || null);
  // Nach Erledigen oder Umzuweisen direkt zur nächsten Mail, statt das Fenster zu schließen
  const weiter = () => {
    const naechste = liste[index + 1] || liste[index - 1];
    setOffenKey(naechste && naechste.key !== offenKey ? naechste.key : null);
  };

  const erledigt = async (e) => {
    if (!e.threadId) return;
    setBusy(true);
    try {
      await emailApi('enrich', { thread_id: Number(e.threadId), fields: { status: 'erledigt' } });
      toast({ title: 'Erledigt — kommt bei der nächsten Kundennachricht wieder zu dir' });
      queryClient.invalidateQueries({ queryKey: ['posteingang'] });
      weiter();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Nicht gespeichert', description: err?.response?.data?.error || err?.message });
    }
    setBusy(false);
  };

  return (
    <div className={KARTE}>
      <Titel className="mb-1">Meine Post ({liste.length})</Titel>
      <p className="text-[12.5px] mb-1" style={{ color: RITTLER.textSecondary }}>
        Dir zugewiesene Mails, die noch auf Antwort warten. Mit der Antwort verschwinden sie von hier.
      </p>
      {liste.map((e) => (
        <button
          key={e.key}
          type="button"
          onClick={() => setOffenKey(e.key)}
          className="w-full text-left block py-2 px-2 -mx-2 rounded border-b border-border last:border-0 hover:bg-muted"
        >
          <span className="flex items-center gap-1.5 text-sm font-semibold truncate" style={{ color: RITTLER.black }}>
            {e.eskalation && <Siren className="w-3.5 h-3.5 shrink-0" style={{ color: STATUS_COLORS.critical }} />}
            <span className="truncate">{e.betreff || '(ohne Betreff)'}</span>
          </span>
          <span className="block text-[12.5px] truncate" style={{ color: RITTLER.textSecondary }}>
            {[e.absenderName || e.absender, e.thread?.customer, KLASSE_LABEL[e.klasse]].filter(Boolean).join(' · ')}
            <span className="font-bold" style={{ color: e.ueberfaellig ? STATUS_COLORS.critical : RITTLER.textSecondary }}>
              {' '}· {wartezeit(e.eingang)}
            </span>
            {e.zuweisung?.quelle === 'automatisch' && ' · automatisch zugewiesen'}
            {e.zuweisung?.zugewiesen_von && e.zuweisung.quelle !== 'automatisch' && ` · von ${nameVon(e.zuweisung.zugewiesen_von, team)}`}
          </span>
        </button>
      ))}

      {/* Der Verlauf fährt herein — kein Seitenwechsel. Breit genug zum Lesen; Kopf mit Aktionen bleibt
          stehen, nur der Verlauf scrollt; mit Vorherige/Nächste durch die eigene Post. */}
      <Sheet open={!!offen} onOpenChange={(o) => { if (!o) setOffenKey(null); }}>
        <SheetContent
          side="right"
          overlay={false}
          className="w-full sm:max-w-none sm:w-[min(1100px,92vw)] p-0 flex flex-col gap-0 shadow-2xl"
        >
          {offen && (
            <>
              <div className="border-b bg-background px-6 pt-5 pb-4 space-y-3 shrink-0">
                <div className="flex items-center gap-2 pr-10 text-xs text-muted-foreground">
                  <Button size="sm" variant="outline" className="h-7 px-2" disabled={index <= 0} onClick={() => gehe(index - 1)}>
                    <ChevronLeft className="w-4 h-4" /> Vorherige
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2" disabled={index >= liste.length - 1} onClick={() => gehe(index + 1)}>
                    Nächste <ChevronRight className="w-4 h-4" />
                  </Button>
                  <span>{index + 1} von {liste.length}</span>
                </div>
                <SheetHeader className="space-y-1">
                  <SheetTitle className="text-left text-xl flex items-start gap-2">
                    {offen.eskalation && <Siren className="w-5 h-5 mt-1 shrink-0" style={{ color: STATUS_COLORS.critical }} />}
                    <span>{offen.betreff || '(ohne Betreff)'}</span>
                  </SheetTitle>
                  <p className="text-sm text-muted-foreground text-left">
                    {[offen.absenderName || offen.absender, offen.thread?.customer, KLASSE_LABEL[offen.klasse], wartezeit(offen.eingang)].filter(Boolean).join(' · ')}
                  </p>
                </SheetHeader>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="flex flex-wrap gap-2">
                    {offen.threadId && (
                      <Button asChild>
                        <Link to={`/crm/emails?thread=${offen.threadId}`}><ExternalLink /> Antworten</Link>
                      </Button>
                    )}
                    {offen.threadId && (
                      <Button variant="outline" disabled={busy} onClick={() => erledigt(offen)}>
                        {busy ? <Loader2 className="animate-spin" /> : <Check />} Erledigt (ohne Antwort)
                      </Button>
                    )}
                  </div>
                  <ZuweisungWahl eintrag={offen} onChanged={weiter} />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                {offen.threadId ? (
                  <div className="max-w-[960px] space-y-2">
                    <p className="text-label uppercase text-muted-foreground">Verlauf · neueste Nachricht zuerst</p>
                    <EscalationThreadPreview key={offen.threadId} threadId={offen.threadId} start={8} />
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap max-w-[960px]">{offen.item?.body || 'Kein Text erfasst.'}</p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
