import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Check, Loader2, Siren } from 'lucide-react';
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
  const [offen, setOffen] = useState(null);
  const [busy, setBusy] = useState(false);

  if (post.isLoading || post.isError) return null;
  const liste = [...post.meine].sort((a, b) => (b.eskalation - a.eskalation) || (a.eingang - b.eingang));
  if (!liste.length) return null;

  const erledigt = async (e) => {
    if (!e.threadId) return;
    setBusy(true);
    try {
      await emailApi('enrich', { thread_id: Number(e.threadId), fields: { status: 'erledigt' } });
      toast({ title: 'Erledigt — kommt bei der nächsten Kundennachricht wieder zu dir' });
      queryClient.invalidateQueries({ queryKey: ['posteingang'] });
      setOffen(null);
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
          onClick={() => setOffen(e)}
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

      {/* Der Verlauf fährt herein — kein Seitenwechsel, die Liste bleibt im Blick */}
      <Sheet open={!!offen} onOpenChange={(o) => { if (!o) setOffen(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {offen && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left pr-6">{offen.betreff || '(ohne Betreff)'}</SheetTitle>
                <p className="text-sm text-muted-foreground text-left">
                  {[offen.absenderName || offen.absender, offen.thread?.customer, wartezeit(offen.eingang)].filter(Boolean).join(' · ')}
                </p>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <ZuweisungWahl eintrag={offen} onChanged={() => setOffen(null)} />
                <div className="flex flex-wrap gap-2">
                  {offen.threadId && (
                    <Button variant="outline" asChild>
                      <Link to={`/crm/emails?thread=${offen.threadId}`}><ExternalLink /> Antworten</Link>
                    </Button>
                  )}
                  {offen.threadId && (
                    <Button variant="ghost" disabled={busy} onClick={() => erledigt(offen)}>
                      {busy ? <Loader2 className="animate-spin" /> : <Check />} Erledigt (ohne Antwort)
                    </Button>
                  )}
                </div>
                {offen.threadId ? (
                  <>
                    <p className="text-label uppercase text-muted-foreground">Verlauf · neueste Nachricht zuerst</p>
                    <EscalationThreadPreview threadId={offen.threadId} start={5} />
                  </>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{offen.item?.body || 'Kein Text erfasst.'}</p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
