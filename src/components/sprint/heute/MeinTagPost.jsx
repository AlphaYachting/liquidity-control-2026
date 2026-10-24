import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Siren, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { emailApi } from '@/components/crm/emails/emailApi';
import { eintragAendern } from '@/components/crm/inboxDecision';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { Titel, KARTE } from '@/components/sprint/heute/MeinTagBausteine';
import { usePosteingang } from '@/hooks/usePosteingang';
import EscalationThreadPreview from '@/components/crm/emails/EscalationThreadPreview';
import ZuweisungWahl, { useTeam, nameVon } from '@/components/crm/ZuweisungWahl';
import { KLASSE_LABEL } from '@/lib/crm/posteingang';
import { useThreadAktionen } from '@/components/crm/emails/ThreadActionBar';
import { PostAktionen, PostAbschnitt } from '@/components/post/PostBaukasten';

const wartezeit = (ms) => {
  const std = Math.max(0, Math.round((Date.now() - ms) / 3600000));
  if (std < 24) return `seit ${std} Std.`;
  const tage = Math.round(std / 24);
  return `seit ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`;
};

// Aktionsleiste im Seitenfenster — dieselbe Leiste wie im Posteingang und bei den Eskalationen
function PanelAktionen({ eintrag, onWeiter }) {
  const { aktionen, mehr, dialoge, busy } = useThreadAktionen({
    thread: {
      id: Number(eintrag.threadId),
      subject: eintrag.betreff,
      customer: eintrag.thread?.customer || '',
      suggested_action: eintrag.klasse === 'support' ? 'supportticket' : eintrag.klasse === 'neu' ? 'anfrage' : '',
      eskalation: eintrag.eskalation,
    },
    messages: [{ direction: 'in', from: eintrag.absender, from_name: eintrag.absenderName }],
    onChanged: onWeiter,
  });
  return (
    <>
      <PostAktionen
        busy={busy}
        aktionen={[aktionen.antworten, aktionen.support, aktionen.lead]}
        mehr={[mehr.deal, mehr.erledigt]}
        rechts={<ZuweisungWahl eintrag={eintrag} onChanged={onWeiter} />}
      />
      {dialoge}
    </>
  );
}

// Abhaken direkt in der Liste (Wunsch Alfons 24.10.2026): derselbe Effekt wie „Erledigt (ohne Antwort)“
// in der Aktionsleiste — die Konversation kommt bei der nächsten Kundennachricht zurück.
// Die Zeile verschwindet sofort; gespeichert wird erst nach RUECKGAENGIG_MS, damit ein Fehlklick
// mit „Rückgängig“ folgenlos bleibt. Verlässt man die Seite vorher, wird sofort gespeichert.
// Eskalationen sind ausgenommen — die werden auf der Eskalationsseite abgeschlossen.
const RUECKGAENGIG_MS = 6000;

async function alsErledigtSpeichern(e) {
  if (e.threadId) {
    await emailApi('enrich', { thread_id: Number(e.threadId), fields: { crm_status: 'kein_lead', status: 'erledigt' } });
  }
  if (e.item?.id && e.item.decision === 'offen') {
    await eintragAendern(e.item.id, { decision: 'verworfen', status: 'dismissed', dismiss_reason: 'In „Meine Post“ abgehakt' });
  }
}

const abhakbar = (e) => !e.eskalation && !!(e.threadId || e.item?.id);

// „Meine Post“: Mails, die mir zugewiesen sind und noch auf Antwort warten (Entscheidung Alfons 12.10.2026).
// Erscheint für jede Person, unabhängig vom Zugang zum Posteingang. Endet mit der Antwort —
// dann ist die Konversation nicht mehr unbeantwortet und verschwindet von selbst.
export default function MeinTagPost() {
  const post = usePosteingang();
  const { data: team = [] } = useTeam();
  const [offenKey, setOffenKey] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [abgehakt, setAbgehakt] = useState({}); // key -> true, solange Speichern aussteht oder läuft
  const wartend = useRef({}); // key -> { timer, eintrag }

  const speichern = async (e) => {
    delete wartend.current[e.key];
    try {
      await alsErledigtSpeichern(e);
      await queryClient.invalidateQueries({ queryKey: ['posteingang'] });
      // Nach dem Neuladen ist die Mail aus der Liste — Merker lösen, damit sie bei einer neuen
      // Kundennachricht wieder erscheint
      setAbgehakt((a) => { const n = { ...a }; delete n[e.key]; return n; });
    } catch (err) {
      setAbgehakt((a) => { const n = { ...a }; delete n[e.key]; return n; });
      toast({ variant: 'destructive', title: 'Nicht gespeichert', description: err?.message || 'Unbekannter Fehler' });
    }
  };

  // Seite verlassen: Ausstehendes sofort speichern, nichts geht verloren
  useEffect(() => () => {
    Object.values(wartend.current).forEach(({ timer, eintrag }) => {
      clearTimeout(timer);
      alsErledigtSpeichern(eintrag)
        .then(() => queryClient.invalidateQueries({ queryKey: ['posteingang'] }))
        .catch(() => {});
    });
    wartend.current = {};
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const abhaken = (e) => {
    setAbgehakt((a) => ({ ...a, [e.key]: true }));
    if (offenKey === e.key) setOffenKey(null);
    const timer = setTimeout(() => speichern(e), RUECKGAENGIG_MS);
    wartend.current[e.key] = { timer, eintrag: e };
    toast({
      description: `Erledigt: ${e.betreff || '(ohne Betreff)'} — kommt bei der nächsten Kundennachricht zurück.`,
      duration: RUECKGAENGIG_MS,
      action: (
        <ToastAction
          altText="Rückgängig"
          onClick={() => {
            const w = wartend.current[e.key];
            if (!w) return;
            clearTimeout(w.timer);
            delete wartend.current[e.key];
            setAbgehakt((a) => { const n = { ...a }; delete n[e.key]; return n; });
          }}
        >
          Rückgängig
        </ToastAction>
      ),
    });
  };

  if (post.isLoading || post.isError) return null;
  const liste = [...post.meine]
    .filter((e) => !abgehakt[e.key])
    .sort((a, b) => (b.eskalation - a.eskalation) || (a.eingang - b.eingang));
  if (!liste.length) return null;

  // Das geöffnete Element über seinen Schlüssel führen — so bleibt es nach dem Neuladen der Liste stabil
  const index = liste.findIndex((e) => e.key === offenKey);
  const offen = index >= 0 ? liste[index] : null;
  const gehe = (i) => setOffenKey(liste[i]?.key || null);
  // Nach Erledigen, Ticket oder Umzuweisen direkt zur nächsten Mail, statt das Fenster zu schließen
  const weiter = () => {
    const naechste = liste[index + 1] || liste[index - 1];
    setOffenKey(naechste && naechste.key !== offenKey ? naechste.key : null);
  };

  return (
    <div className={KARTE}>
      <Titel className="mb-1">Meine Post ({liste.length})</Titel>
      <p className="text-[12.5px] mb-1" style={{ color: RITTLER.textSecondary }}>
        Dir zugewiesene Mails, die noch auf Antwort warten. Mit der Antwort verschwinden sie von hier.
      </p>
      {liste.map((e) => (
        <div key={e.key} className="flex items-center gap-2 border-b border-border last:border-0">
        <button
          type="button"
          onClick={() => setOffenKey(e.key)}
          className="flex-1 min-w-0 text-left block py-2 px-2 -ml-2 rounded hover:bg-muted"
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
        {abhakbar(e) && (
          <button
            type="button"
            onClick={() => abhaken(e)}
            title="Erledigt (ohne Antwort) — kommt bei der nächsten Kundennachricht zurück"
            aria-label={`Erledigt: ${e.betreff || 'ohne Betreff'}`}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:text-white hover:bg-[#1f8a4c] hover:border-[#1f8a4c] transition-colors"
          >
            <Check className="w-4 h-4" />
          </button>
        )}
        </div>
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
                {offen.threadId
                  ? <PanelAktionen key={offen.key} eintrag={offen} onWeiter={weiter} />
                  : <ZuweisungWahl eintrag={offen} onChanged={weiter} />}
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                {offen.threadId ? (
                  <div className="max-w-[960px]">
                    <PostAbschnitt titel="Verlauf" zusatz="neueste Nachricht zuerst">
                      <EscalationThreadPreview key={offen.threadId} threadId={offen.threadId} start={8} />
                    </PostAbschnitt>
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
