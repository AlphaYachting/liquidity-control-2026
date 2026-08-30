import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, Send, CalendarClock, Check, ChevronDown, ChevronRight } from 'lucide-react';
import ReplySlotFields from '@/components/crm/emails/ReplySlotFields';
import { toPlainText } from '@/components/crm/quotes/emailBodyFormat';
import { markDealContacted } from '@/components/crm/dealContact';
import { markThreadAnswered } from '@/components/crm/emails/markThreadAnswered';

const fmtSlot = (v) => {
  if (!v) return '';
  const d = new Date(v);
  const date = d.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
  return `${date} um ${time} Uhr`;
};

// KI-gestützte Antwort auf eine eingegangene Anfrage: Entwurf erzeugen, frei bearbeiten, senden.
// Der Versand läuft über das lokale E-Mail-Programm; protokolliert wird am Deal (CrmActivity).
export default function ReplyComposer({ threadId, dealId, recipient, onSent, onAnswered, bare = false }) {
  const [intent, setIntent] = useState('terminvorschlag');
  const [slots, setSlots] = useState(['', '', '']);
  const [format, setFormat] = useState('video');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [to, setTo] = useState(recipient || '');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(bare);

  const setSlot = (i, v) => setSlots((prev) => prev.map((s, idx) => (idx === i ? v : s)));

  const generate = async () => {
    setBusy(true); setError(null); setDone(false);
    const filled = slots.filter(Boolean).map(fmtSlot);
    if (filled.length === 0) {
      setError('Bitte mindestens einen Terminslot angeben — es werden keine Termine erfunden.');
      setBusy(false);
      return;
    }
    try {
      const res = await base44.functions.invoke('generateCrmReply', {
        threadId, intent, params: { slots: filled, format },
      });
      const d = res?.data ?? res ?? {};
      if (d.error) throw new Error(d.error);
      const text = toPlainText(d.body || d.variant_a || '');
      if (!text) throw new Error('Der Entwurf kam leer zurück — bitte erneut versuchen.');
      setSubject(d.subject || '');
      setBody(text);
      if (!to) setTo(d.recipient || '');
    } catch (e) {
      setError('Entwurf fehlgeschlagen: ' + (e?.message || ''));
    }
    setBusy(false);
  };

  const send = async () => {
    setSending(true); setError(null);
    const mailBody = toPlainText(body);
    try {
      if (dealId) {
        await base44.entities.CrmActivity.create({
          deal_id: dealId,
          activity_type: 'email',
          channel: 'email',
          direction: 'ausgehend',
          title: `Antwort an ${to || 'Kunde'} — ${subject}`,
          content: mailBody,
          body: mailBody,
          activity_date: new Date().toISOString(),
        });
        await markDealContacted(dealId);
      }
      // Der Verlauf gilt damit als beantwortet und fällt aus "Braucht Antwort"
      await markThreadAnswered(threadId);
      onAnswered?.('erledigt');
      window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`, '_self');
      setSubject(''); setBody(''); setSlots(['', '', '']); setDone(true);
      onSent?.();
    } catch (e) {
      setError('Protokollieren fehlgeschlagen: ' + (e?.message || ''));
    }
    setSending(false);
  };

  return (
    <div className={bare ? 'space-y-3' : 'rounded-xl border bg-card p-3 space-y-3'}>
      {!bare && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full text-xs font-semibold flex items-center gap-1.5 text-left"
        >
          <CalendarClock className="w-3.5 h-3.5 text-primary" /> Antwort mit Terminvorschlag erstellen
          {open ? <ChevronDown className="w-3.5 h-3.5 ml-auto text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 ml-auto text-muted-foreground" />}
        </button>
      )}

      {open && (<>
      <div className="w-full sm:w-56">
        <Label className="text-[10px] text-muted-foreground">Antworttyp</Label>
        <Select value={intent} onValueChange={setIntent} disabled={busy}>
          <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="terminvorschlag">Terminvorschlag</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ReplySlotFields slots={slots} onSlotChange={setSlot} format={format} onFormatChange={setFormat} disabled={busy} />

      <Button size="sm" variant="outline" onClick={generate} disabled={busy} className="gap-2">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {busy ? 'Entwurf entsteht…' : 'Entwurf erzeugen'}
      </Button>

      {(subject || body) && (
        <div className="space-y-2 pt-1 border-t">
          <div>
            <Label className="text-[10px] text-muted-foreground">Empfänger</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Betreff</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Text (frei bearbeitbar)</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} className="mt-1 text-sm leading-7 whitespace-pre-wrap" />
          </div>
          <div className="flex items-center justify-end">
            <Button size="sm" onClick={send} disabled={sending || !to || !subject || !body} className="gap-2">
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Senden
            </Button>
          </div>
        </div>
      )}

      {done && (
        <p className="text-xs text-emerald-700 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> Antwort im E-Mail-Programm geöffnet{dealId ? ' und im Deal-Verlauf protokolliert' : ''}.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!dealId && (
        <p className="text-[10px] text-muted-foreground">
          Kein Deal verknüpft — die Antwort wird nicht im Deal-Verlauf protokolliert.
        </p>
      )}
      </>)}
    </div>
  );
}