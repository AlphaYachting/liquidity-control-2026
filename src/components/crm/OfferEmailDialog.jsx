import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Sparkles, Send } from 'lucide-react';
import { toPlainText } from '@/components/crm/quotes/emailBodyFormat';
import { markDealContacted } from '@/components/crm/dealContact';

const TITEL = { angebot: 'Angebots-E-Mail an Kunden', nachfassen: 'Nachfass-E-Mail' };
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// Versandweg für Angebote aus dem Angebots-Studio: Entwurf erzeugen, bearbeiten,
// im E-Mail-Programm öffnen und am Deal protokollieren.
export default function OfferEmailDialog({ open, onOpenChange, deal, proposal, intent = 'angebot', onSent }) {
  const [to, setTo] = useState(deal.contact_email || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [pdfLink, setPdfLink] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const erzeugen = async () => {
    setBusy(true); setError(null);
    try {
      const res = await base44.functions.invoke('generateCrmReply', {
        threadId: deal.email_thread_id || '',
        dealId: deal.id,
        intent,
        params: {
          angebot: proposal
            ? { titel: proposal.title || 'Angebot', summe_netto: deal.value_net || 0, hat_pdf: Boolean(proposal.pdf_url) }
            : null,
        },
      });
      const d = res?.data ?? res ?? {};
      if (d.error) throw new Error(d.error);
      const text = toPlainText(d.variant_a || d.body || '');
      if (!text) throw new Error('Der Entwurf kam leer zurück — bitte erneut versuchen.');
      setSubject(d.subject || '');
      setBody(text);
      if (!to && d.recipient) setTo(d.recipient);
    } catch (e) {
      setError(e?.message || 'Entwurf fehlgeschlagen.');
    }
    setBusy(false);
  };

  const mailText = () => {
    const link = pdfLink && proposal?.pdf_url
      ? `\n\nDas vollständige Angebot finden Sie hier: ${proposal.pdf_url}`
      : '';
    return toPlainText(body) + link;
  };

  const senden = async () => {
    setSending(true); setError(null);
    const text = mailText();
    try {
      await base44.entities.CrmActivity.create({
        deal_id: deal.id, activity_type: 'email', channel: 'email', direction: 'ausgehend',
        intent,
        title: `${intent === 'angebot' ? 'Angebots-E-Mail' : 'Nachfass-E-Mail'} an ${to} — ${subject}`,
        content: text, body: text, activity_date: new Date().toISOString(),
      });
      await markDealContacted(deal.id);
      if (intent === 'angebot') {
        await base44.entities.CrmDeal.update(deal.id, {
          stage: deal.pipeline === 'new_business' ? 'proposal_sent' : 'estimated',
          next_step: 'Nachfassen, wenn keine Antwort', next_step_date: addDays(7),
        });
      } else {
        await base44.entities.CrmDeal.update(deal.id, { next_step: 'Erneut nachfassen', next_step_date: addDays(7) });
      }
      window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`, '_self');
      onOpenChange(false);
      setSubject(''); setBody('');
      onSent?.();
    } catch (e) {
      setError('Protokollieren fehlgeschlagen: ' + (e?.message || ''));
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{TITEL[intent]}</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <Button variant="outline" onClick={erzeugen} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {busy ? 'Entwurf entsteht…' : body ? 'Neu erzeugen' : 'Entwurf erzeugen'}
          </Button>

          {proposal?.pdf_url && (
            <div className="flex items-center gap-2">
              <Switch id="offer-pdf" checked={pdfLink} onCheckedChange={setPdfLink} />
              <Label htmlFor="offer-pdf" className="text-sm">PDF-Link in den Text einfügen</Label>
            </div>
          )}

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
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className="mt-1 text-sm leading-7" />
              </div>
              <div className="flex justify-end">
                <Button onClick={senden} disabled={sending || !to || !subject || !body} className="gap-2">
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Im E-Mail-Programm öffnen
                </Button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}