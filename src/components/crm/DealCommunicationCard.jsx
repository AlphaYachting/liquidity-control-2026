import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, MessageSquare, Sparkles, Send } from 'lucide-react';
import { toPlainText, copyFormatted } from '@/components/crm/quotes/emailBodyFormat';
import { markDealContacted } from '@/components/crm/dealContact';
import { markThreadAnswered } from '@/components/crm/emails/markThreadAnswered';
import { PIPELINES } from '@/components/crm/stages';
import { angebotStille } from '@/lib/crm/angebotStille';
import { useDealAngebot } from '@/lib/crm/dealAngebot';
import AbsichtWahl from '@/components/crm/komm/AbsichtWahl';
import QuellenZeile from '@/components/crm/komm/QuellenZeile';
import StilleBand from '@/components/crm/komm/StilleBand';
import AbsichtFelder from '@/components/crm/komm/AbsichtFelder';
import VariantenWahl from '@/components/crm/komm/VariantenWahl';
import EntwurfFelder from '@/components/crm/komm/EntwurfFelder';
import AenderungsWunsch from '@/components/crm/komm/AenderungsWunsch';
import SendenDialog from '@/components/crm/komm/SendenDialog';
import AnfrageZeile from '@/components/crm/komm/AnfrageZeile';
import { Input } from '@/components/ui/input';
import { ABSICHT_TITEL, sendeFolgen, slotLabel, FORMAT_LABEL, dateLabel } from '@/components/crm/komm/kommConfig';

const LEER = { slots: ['', '', ''], format: 'video', stichworte: '', pdf_link: true, schwerpunkt: '', punkte: [''], grund: '', ergaenzung: '', persoenlich: '' };
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// EINE Karte für die gesamte Kundenkommunikation am Deal — immer sichtbar,
// auch ohne verknüpften E-Mail-Verlauf.
export default function DealCommunicationCard({ deal, activities = [], appointments = [], prefill, onChanged }) {
  const { toast } = useToast();
  const { data: angebot } = useDealAngebot(deal);
  const [intent, setIntent] = useState('antwort');
  const [felder, setFelder] = useState(LEER);
  const [varianten, setVarianten] = useState(null);
  const [gewaehlt, setGewaehlt] = useState('a');
  const [to, setTo] = useState(deal.contact_email || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [wunsch, setWunsch] = useState('');
  const [letztesFeedback, setLetztesFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [dialog, setDialog] = useState(false);
  const [sending, setSending] = useState(false);
  const [adrEntwurf, setAdrEntwurf] = useState('');
  const variantenRef = useRef(null);

  const setFeld = (k, v) => setFelder((prev) => ({ ...prev, [k]: v }));
  const hatAngebot = Boolean(deal.proposal_id || deal.quote_id);
  const stille = useMemo(() => angebotStille(deal, activities, appointments), [deal, activities, appointments]);

  const letzteGesendet = useMemo(
    () => (activities || []).find((a) => a.activity_type === 'email' && a.direction !== 'eingehend'),
    [activities],
  );
  const letzteAngebotsmail = useMemo(
    () => (activities || []).find((a) => a.intent === 'angebot' || String(a.title || '').startsWith('Angebots-E-Mail')),
    [activities],
  );
  const angebotGesendetAm = letzteAngebotsmail?.activity_date || null;
  const angebotTage = angebotGesendetAm
    ? Math.floor((Date.now() - new Date(angebotGesendetAm).getTime()) / 86400000)
    : null;

  // Vorauswahl beim Öffnen — hebt hervor, sortiert nicht um.
  useEffect(() => {
    if (angebotGesendetAm && angebotTage >= 7 && hatAngebot) setIntent('nachfassen');
    else if (hatAngebot && !angebotGesendetAm) setIntent('angebot');
    else setIntent('antwort');
  }, [deal.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sprung aus dem Terminbereich in die Karte
  useEffect(() => {
    if (!prefill?.intent) return;
    setIntent(prefill.intent);
  }, [prefill?.intent, prefill?.nonce]);

  // Nicht mögliche Absichten erscheinen gar nicht — ein Satz erklärt, wann sie kommen.
  // „Nachfrage zum Angebot“ steht immer bereit — sie braucht nur den Verlauf,
  // nicht zwingend ein im System verknüpftes Angebot.
  const ausgeblendet = !hatAngebot ? ['angebot', 'nachfassen'] : (!angebotGesendetAm ? ['nachfassen'] : []);
  const absichtHinweis = !hatAngebot
    ? '„Angebot“ und „Nachfassen“ erscheinen, sobald ein Angebot verknüpft ist.'
    : (!angebotGesendetAm ? '„Nachfassen“ erscheint, sobald ein Angebot übermittelt wurde.' : null);

  useEffect(() => {
    if (ausgeblendet.includes(intent)) setIntent('antwort');
  }, [ausgeblendet.join(','), intent]); // eslint-disable-line react-hooks/exhaustive-deps

  const adresseUebernehmen = async () => {
    const wert = adrEntwurf.trim();
    if (!wert) return;
    await base44.entities.CrmDeal.update(deal.id, { contact_email: wert });
    setTo(wert);
    setAdrEntwurf('');
    onChanged?.();
  };

  const slotsGefuellt = felder.slots.filter(Boolean);
  const sperrGrund = (() => {
    if (intent === 'terminvorschlag' && slotsGefuellt.length === 0) return 'Mindestens ein Termin nötig — es werden keine Termine erfunden.';
    if (intent === 'rueckfrage' && felder.punkte.filter((p) => p.trim()).length === 0) return 'Mindestens ein offener Punkt nötig.';
    if (intent === 'absage' && !felder.grund.trim()) return 'Ohne Grund keine Absage.';
    if (intent === 'angebot' && angebot && !angebot.hat_pdf && (angebot.positionen || []).length === 0)
      return 'Das Angebot enthält noch keine freigegebenen Positionen.';
    return null;
  })();

  const erzeugen = async (feedbackText = '') => {
    setBusy(true); setFehler(null);
    try {
      const res = await base44.functions.invoke('generateCrmReply', {
        threadId: deal.email_thread_id || '',
        dealId: deal.id,
        intent,
        feedback: feedbackText,
        previous_a: feedbackText ? varianten?.a || '' : '',
        previous_b: feedbackText ? varianten?.b || '' : '',
        params: {
          slots: slotsGefuellt.map(slotLabel),
          format: felder.format,
          stichworte: felder.stichworte,
          punkte: felder.punkte.filter((p) => p.trim()),
          grund: felder.grund,
          schwerpunkt: felder.schwerpunkt,
          ergaenzung: felder.ergaenzung,
          persoenlich: felder.persoenlich,
          pdf_link: felder.pdf_link,
          tage_seit_versand: angebotTage,
          angebot: angebot ? { ...angebot, gesendet_am: angebotGesendetAm ? dateLabel(angebotGesendetAm) : '' } : null,
        },
      });
      // Je nach Aufrufweg liegt die Antwort in res.data oder direkt in res.
      const d = res?.data ?? res ?? {};
      if (d.error) throw new Error(d.error);
      const a = toPlainText(d.variant_a || '');
      const b = toPlainText(d.variant_b || '');
      if (!a && !b) throw new Error('Die Antwort kam ohne Text zurück — bitte erneut versuchen.');
      setVarianten({ a, b });
      setLetztesFeedback(feedbackText);
      setSubject(d.subject || '');
      setGewaehlt('a');
      setBody(a);
      if (!to && d.recipient) setTo(d.recipient);
      setWunsch('');
      setTimeout(() => variantenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    } catch (e) {
      // Der Grund steht in der Antwort des Servers, nicht in der Statusmeldung.
      const grund = e?.response?.data?.error || e?.data?.error || e?.message || 'unbekannter Grund';
      setFehler(`Entwurf fehlgeschlagen — ${grund}`);
    }
    setBusy(false);
  };

  const waehleVariante = (k) => { setGewaehlt(k); setBody(varianten[k]); };

  const mailText = () => {
    const link = intent === 'angebot' && angebot?.hat_pdf && felder.pdf_link && angebot.pdf_url
      ? `\n\nDas vollständige Angebot finden Sie hier: ${angebot.pdf_url}`
      : '';
    return toPlainText(body) + link;
  };

  const oeffnen = async () => {
    const text = mailText();
    if (text.length > 1800) {
      await copyFormatted(text).catch(() => {});
      toast({ description: 'Der Text ist für das Mailprogramm zu lang und liegt zusätzlich in der Zwischenablage.' });
    }
    window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`, '_self');
    setDialog(true);
  };

  const bestaetigen = async () => {
    setSending(true);
    const text = mailText();
    const config = PIPELINES[deal.pipeline];
    try {
      await base44.entities.CrmActivity.create({
        deal_id: deal.id, activity_type: 'email', channel: 'email', direction: 'ausgehend',
        intent,
        title: `${ABSICHT_TITEL[intent]} an ${to} — ${subject}`,
        content: text, body: text, activity_date: new Date().toISOString(),
      });
      await markDealContacted(deal.id);

      if (intent === 'terminvorschlag') {
        const gruppe = `tv-${Date.now()}`;
        for (const slot of slotsGefuellt) {
          await base44.entities.CrmAppointment.create({
            deal_id: deal.id, title: 'Erstgespräch', scheduled_at: new Date(slot).toISOString(),
            location: FORMAT_LABEL[felder.format], status: 'proposed',
            proposal_group_id: gruppe, notes: 'Per E-Mail vorgeschlagen',
          });
        }
        await base44.entities.CrmActivity.create({
          deal_id: deal.id, activity_type: 'meeting', title: 'Termine per E-Mail vorgeschlagen',
          content: slotsGefuellt.map(slotLabel).join('\n'), activity_date: new Date().toISOString(),
        });
        if (deal.pipeline === 'new_business' && ['new_lead', 'contacted'].includes(deal.stage)) {
          await base44.entities.CrmDeal.update(deal.id, { stage: 'meeting_scheduled' });
        }
      } else if (intent === 'angebot') {
        await base44.entities.CrmDeal.update(deal.id, {
          stage: deal.pipeline === 'new_business' ? 'proposal_sent' : 'estimated',
          next_step: 'Nachfassen, wenn keine Antwort', next_step_date: addDays(7),
        });
      } else if (intent === 'nachfassen') {
        await base44.entities.CrmDeal.update(deal.id, { next_step_date: addDays(7) });
      } else if (intent === 'angebot_nachfrage') {
        await base44.entities.CrmDeal.update(deal.id, {
          next_step: 'Antwort auf die Nachfrage zum Angebot abwarten', next_step_date: addDays(5),
        });
      } else if (intent === 'absage') {
        await base44.entities.CrmDeal.update(deal.id, { stage: config.lostStage, lost_reason: felder.grund });
      }

      if (deal.email_thread_id) await markThreadAnswered(deal.email_thread_id).catch(() => {});

      setDialog(false);
      setVarianten(null); setBody(''); setSubject(''); setFelder(LEER);
      toast({ description: 'Gesendet — Verlauf, Phase und Wiedervorlage sind nachgezogen.' });
      onChanged?.();
    } catch (e) {
      setFehler(`Protokollieren fehlgeschlagen — ${e?.message || ''}`);
    }
    setSending(false);
  };

  const abbrechen = () => {
    setDialog(false);
    toast({ description: 'Nichts protokolliert — der Entwurf steht weiterhin bereit.' });
  };

  return (
    <div className="border border-border rounded-lg bg-card">
      <div className="px-4 py-3 border-b border-border flex items-baseline gap-2">
        <MessageSquare className="w-[15px] h-[15px] text-primary self-center" />
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Kommunikation</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {letzteGesendet ? `zuletzt gesendet am ${dateLabel(letzteGesendet.activity_date)}` : 'noch nichts gesendet'}
        </span>
      </div>

      {stille && (
        <StilleBand
          stille={stille}
          wiedervorlage={deal.next_step_date}
          onNachfassen={() => { setIntent('nachfassen'); erzeugen(); }}
        />
      )}

      <AnfrageZeile deal={deal} onChanged={onChanged} />

      <div className="p-4">
        <AbsichtWahl value={intent} onChange={setIntent} ausgeblendet={ausgeblendet} hinweis={absichtHinweis} />
        <QuellenZeile
          hatThread={Boolean(deal.email_thread_id)}
          name={deal.contact_name}
          threadId={deal.email_thread_id}
        />

        {!to && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Input
              value={adrEntwurf}
              onChange={(e) => setAdrEntwurf(e.target.value)}
              placeholder="E-Mail-Adresse des Kontakts"
              className="h-8 w-64 text-sm"
            />
            <Button size="sm" variant="outline" onClick={adresseUebernehmen} disabled={!adrEntwurf.trim()}>
              Adresse übernehmen
            </Button>
            <span className="text-xs text-muted-foreground">
              Ohne Adresse lässt sich ein Entwurf erzeugen, aber nicht senden.
            </span>
          </div>
        )}

        <AbsichtFelder
          intent={intent}
          felder={felder}
          setFeld={setFeld}
          angebot={angebot}
          angebotGesendetAm={angebotGesendetAm}
          angebotTage={angebotTage}
          disabled={busy}
        />

        <div className="mt-3.5 flex items-center gap-2">
          <Button
            onClick={() => erzeugen()}
            disabled={busy || Boolean(sperrGrund)}
            className="bg-foreground text-background gap-2"
          >
            {busy ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Sparkles className="w-[15px] h-[15px]" />}
            {busy ? 'Entwürfe entstehen …' : varianten ? 'Neu erzeugen' : 'Entwurf erzeugen'}
          </Button>
          <span className="text-xs text-muted-foreground">
            {sperrGrund || 'Zwei Varianten, danach frei bearbeitbar.'}
          </span>
        </div>

        {fehler && <p className="text-xs text-destructive mt-2">{fehler}</p>}

        {varianten && (
          <div ref={variantenRef}>
            <VariantenWahl varianten={varianten} gewaehlt={gewaehlt} onWaehlen={waehleVariante} feedback={letztesFeedback} />

            <EntwurfFelder
              to={to} setTo={setTo}
              subject={subject} setSubject={setSubject}
              body={body} setBody={setBody}
            />

            <AenderungsWunsch value={wunsch} onChange={setWunsch} onSubmit={() => erzeugen(wunsch)} disabled={busy} />

            <div className="mt-3.5 pt-3.5 border-t border-border flex items-center justify-end gap-2">
              {!to && (
                <span className="mr-auto text-xs text-muted-foreground">
                  Keine E-Mail-Adresse am Kontakt — oben ergänzen.
                </span>
              )}
              <Button variant="ghost" onClick={() => { setVarianten(null); setBody(''); setSubject(''); }}>Verwerfen</Button>
              <Button
                onClick={oeffnen}
                disabled={!to || !subject || !body}
                className="bg-primary text-primary-foreground gap-2 w-full sm:w-auto"
              >
                <Send className="w-[15px] h-[15px]" /> Im E-Mail-Programm öffnen
              </Button>
            </div>
          </div>
        )}
      </div>

      <SendenDialog
        open={dialog}
        onOpenChange={setDialog}
        empfaenger={to}
        folgen={sendeFolgen(intent, { slotCount: slotsGefuellt.length })}
        busy={sending}
        onJa={bestaetigen}
        onNein={abbrechen}
      />
    </div>
  );
}