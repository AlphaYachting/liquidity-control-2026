import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Sparkles } from 'lucide-react';
import { toPlainText, copyFormatted } from '@/components/crm/quotes/emailBodyFormat';
import { markDealContacted } from '@/components/crm/dealContact';
import { markThreadAnswered } from '@/components/crm/emails/markThreadAnswered';
import { PIPELINES } from '@/components/crm/stages';
import { angebotStand } from '@/lib/crm/angebotStille';
import AssistentKopf from '@/components/crm/assistent/AssistentKopf';
import AbsichtGruppe from '@/components/crm/assistent/AbsichtGruppe';
import QuellenChip from '@/components/crm/assistent/QuellenChip';
import AssistentFelder from '@/components/crm/assistent/AssistentFelder';
import EntwurfBereich from '@/components/crm/assistent/EntwurfBereich';
import BestaetigungsDialog from '@/components/crm/assistent/BestaetigungsDialog';
import { useAngebot } from '@/components/crm/assistent/useAngebot';
import { LANGTITEL, FORMAT_LABEL, sendeFolgen } from '@/components/crm/assistent/assistentConfig';

const LEER = { slots: ['', '', ''], format: 'video', stichworte: '', schwerpunkt: '', grund: '', pdf_link: true };
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// KI-Assistent für Kunden-E-Mails am Deal — im Ruhezustand eine Zeile.
export default function KiAssistent({ deal, activities = [], appointments = [], onChanged }) {
  const { toast } = useToast();
  const { data: angebot } = useAngebot(deal);
  const [offen, setOffen] = useState(false);
  const [intent, setIntent] = useState('antwort');
  const [felder, setFelder] = useState(LEER);
  const [varianten, setVarianten] = useState(null);
  const [kontext, setKontext] = useState([]);
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

  const setFeld = (k, v) => setFelder((prev) => ({ ...prev, [k]: v }));
  const stand = useMemo(() => angebotStand(deal, activities, appointments), [deal, activities, appointments]);
  // Eine Größe für Kopf und Schaltergruppe — auch außerhalb der App verschickte Angebote zählen.
  const angebotVorhanden = Boolean(deal.proposal_id || deal.quote_id) || Boolean(stand);
  const letzteGesendet = useMemo(
    () => (activities || []).find((a) => a.activity_type === 'email' && a.direction !== 'eingehend'),
    [activities],
  );

  // Zuerst nachfragen, Termine erst wenn Interesse besteht.
  const vorschlag = stand
    ? { label: 'Nachfassen', intent: 'nachfassen', pink: stand.tage >= 7 }
    : angebotVorhanden
      ? { label: 'Angebot übermitteln', intent: 'angebot', pink: false }
      : { label: 'Antwort entwerfen', intent: 'antwort', pink: false };

  const oeffnenMit = (naechste) => { setIntent(naechste); setOffen(true); };
  const zuklappen = () => { setOffen(false); setVarianten(null); setBody(''); setSubject(''); setFehler(null); };

  const slotsGefuellt = felder.slots.filter(Boolean);
  const sperrGrund = (() => {
    if (['termin', 'besprechung'].includes(intent) && slotsGefuellt.length === 0)
      return 'Mindestens ein Termin nötig — es werden keine Termine erfunden.';
    if (intent === 'absage' && !felder.grund.trim()) return 'Ohne Grund keine Absage.';
    if (intent === 'angebot' && angebot && !angebot.hat_pdf && angebot.anzahl_positionen === 0)
      return 'Das Angebot enthält noch keine freigegebenen Positionen.';
    if (intent === 'nachfassen' && !stand?.gesendet_am)
      return 'Kein Übermittlungsdatum bekannt — bitte oben das Versanddatum des Angebots nachtragen.';
    return null;
  })();

  const erzeugen = async (feedbackText = '') => {
    setBusy(true); setFehler(null);
    try {
      const res = await base44.functions.invoke('crmEntwurf', {
        dealId: deal.id,
        intent,
        feedback: feedbackText,
        previous_a: feedbackText ? varianten?.a || '' : '',
        previous_b: feedbackText ? varianten?.b || '' : '',
        params: {
          slots: slotsGefuellt,
          format: felder.format,
          stichworte: felder.stichworte,
          schwerpunkt: felder.schwerpunkt,
          grund: felder.grund,
          pdf_link: felder.pdf_link,
        },
      });
      const d = res?.data ?? res ?? {};
      if (d.error) throw new Error(d.error);
      const a = toPlainText(d.variant_a || d.body || '');
      const b = toPlainText(d.variant_b || a);
      if (!a) throw new Error('Der Entwurf kam leer zurück — bitte erneut versuchen.');
      setVarianten({ a, b });
      setKontext(d.kontext_verwendet || []);
      setSubject(d.subject || '');
      setGewaehlt('a');
      setBody(a);
      setLetztesFeedback(feedbackText);
      if (!to && d.recipient) setTo(d.recipient);
      setWunsch('');
    } catch (e) {
      setFehler(e?.message || 'Entwurf fehlgeschlagen.');
    }
    setBusy(false);
  };

  // Der Entwurf im Textfeld IST der Mailtext — er wird auf dem Weg nach draußen nicht umgeschrieben.
  const mailText = () => {
    const link = intent === 'angebot' && angebot?.hat_pdf && felder.pdf_link && angebot.pdf_url
      ? `\n\nDas vollständige Angebot finden Sie hier: ${angebot.pdf_url}`
      : '';
    return body + link;
  };

  const oeffnenImProgramm = async () => {
    const text = mailText();
    // RFC 6068 verlangt CRLF — mit bloßem %0A verhalten sich die Programme unterschiedlich.
    const fuerMail = text.replace(/\r?\n/g, '\r\n');
    const kopf = `mailto:${to}?subject=${encodeURIComponent(subject)}`;
    const url = `${kopf}&body=${encodeURIComponent(fuerMail)}`;
    if (url.length > 1900) {
      // Eine halbe Mail ist schlimmer als gar keine.
      await copyFormatted(text).catch(() => {});
      toast({ description: 'Der Text ist zu lang für das Mailprogramm. Er liegt formatiert in der Zwischenablage — bitte im Mailfenster einfügen.' });
      window.location.href = kopf;
    } else {
      window.location.href = url;
    }
    setDialog(true);
  };

  const kopieren = async () => {
    await copyFormatted(mailText()).catch(() => {});
    toast({ description: 'Formatiert kopiert — im Mailfenster einfügen.' });
    setDialog(true);
  };

  // Versanddatum eines außerhalb der App verschickten Angebots nachtragen.
  const versandNachtragen = async (tag) => {
    await base44.entities.CrmActivity.create({
      deal_id: deal.id, activity_type: 'email', channel: 'email', direction: 'ausgehend',
      intent: 'angebot',
      title: 'Angebot übermittelt (nachgetragen)',
      activity_date: new Date(`${tag}T09:00:00`).toISOString(),
    });
    toast({ description: 'Versanddatum nachgetragen.' });
    onChanged?.();
  };

  const bestaetigen = async () => {
    setSending(true);
    const text = mailText();
    const config = PIPELINES[deal.pipeline];
    try {
      await base44.entities.CrmActivity.create({
        deal_id: deal.id, activity_type: 'email', channel: 'email', direction: 'ausgehend',
        intent,
        title: `${LANGTITEL[intent]} an ${to} — ${subject}`,
        content: text, body: text, activity_date: new Date().toISOString(),
      });
      await markDealContacted(deal.id);

      if (['termin', 'besprechung'].includes(intent)) {
        const gruppe = `${intent}-${Date.now()}`;
        for (const slot of slotsGefuellt) {
          await base44.entities.CrmAppointment.create({
            deal_id: deal.id,
            title: intent === 'besprechung' ? 'Besprechung zum Angebot' : 'Erstgespräch',
            scheduled_at: new Date(slot).toISOString(),
            location: FORMAT_LABEL[felder.format],
            status: 'proposed',
            proposal_group_id: gruppe,
            notes: 'Per E-Mail vorgeschlagen',
          });
        }
        if (intent === 'termin' && deal.pipeline === 'new_business' && ['new_lead', 'contacted'].includes(deal.stage)) {
          await base44.entities.CrmDeal.update(deal.id, { stage: 'meeting_scheduled' });
        }
        if (intent === 'besprechung') {
          await base44.entities.CrmDeal.update(deal.id, { next_step_date: addDays(7) });
        }
      } else if (intent === 'nachfassen') {
        await base44.entities.CrmDeal.update(deal.id, { next_step: 'Erneut nachfassen', next_step_date: addDays(7) });
      } else if (intent === 'angebot') {
        await base44.entities.CrmDeal.update(deal.id, {
          stage: deal.pipeline === 'new_business' ? 'proposal_sent' : 'estimated',
          next_step: 'Nachfassen, wenn keine Antwort', next_step_date: addDays(7),
        });
      } else if (intent === 'absage') {
        await base44.entities.CrmDeal.update(deal.id, { stage: config.lostStage, lost_reason: felder.grund });
      }

      if (deal.email_thread_id) await markThreadAnswered(deal.email_thread_id).catch(() => {});

      setDialog(false);
      setFelder(LEER);
      zuklappen();
      toast({ description: 'Gesendet — Verlauf, Phase und Wiedervorlage sind nachgezogen.' });
      onChanged?.();
    } catch (e) {
      setFehler(`Protokollieren fehlgeschlagen — ${e?.message || ''}`);
    }
    setSending(false);
  };

  return (
    <div className="border border-border rounded-lg bg-card">
      <AssistentKopf
        offen={offen}
        onToggle={() => (offen ? zuklappen() : setOffen(true))}
        stand={stand}
        letzteGesendet={letzteGesendet}
        kontaktName={deal.contact_name}
        vorschlag={vorschlag}
        onVorschlag={() => oeffnenMit(vorschlag.intent)}
      />

      {offen && (
        <div className="border-t border-border p-4">
          <AbsichtGruppe value={intent} onChange={setIntent} angebotVorhanden={angebotVorhanden} />
          <QuellenChip deal={deal} to={to} setTo={setTo} onChanged={onChanged} />

          <AssistentFelder
            intent={intent}
            felder={felder}
            setFeld={setFeld}
            angebot={angebot}
            gesendetAm={stand?.gesendet_am}
            tage={stand?.tage}
            disabled={busy}
            onVersandNachtragen={versandNachtragen}
          />

          {fehler && <p className="mt-3.5 text-xs text-destructive" title={fehler}>{fehler}</p>}

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => erzeugen()}
              disabled={busy || Boolean(sperrGrund)}
              className="bg-foreground text-background gap-2"
            >
              {busy ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Sparkles className="w-[15px] h-[15px]" />}
              {busy ? 'Entwürfe entstehen …' : varianten ? 'Neu erzeugen' : 'Entwurf erzeugen'}
            </Button>
            {sperrGrund && <span className="text-xs text-muted-foreground">{sperrGrund}</span>}
          </div>

          {varianten && (
            <EntwurfBereich
              varianten={varianten}
              gewaehlt={gewaehlt}
              onWaehlen={(k) => { setGewaehlt(k); setBody(varianten[k]); }}
              kontext={kontext}
              letztesFeedback={letztesFeedback}
              to={to} setTo={setTo}
              subject={subject} setSubject={setSubject}
              body={body} setBody={setBody}
              wunsch={wunsch} setWunsch={setWunsch}
              onNeu={() => erzeugen(wunsch)}
              busy={busy}
              onVerwerfen={() => { setVarianten(null); setBody(''); setSubject(''); }}
              onOeffnen={oeffnenImProgramm}
              onKopieren={kopieren}
            />
          )}
        </div>
      )}

      <BestaetigungsDialog
        open={dialog}
        onOpenChange={setDialog}
        empfaenger={to}
        folgen={sendeFolgen(intent, { slotCount: slotsGefuellt.length })}
        busy={sending}
        onJa={bestaetigen}
        onNein={() => { setDialog(false); toast({ description: 'Nichts protokolliert — der Entwurf steht weiterhin bereit.' }); }}
      />
    </div>
  );
}