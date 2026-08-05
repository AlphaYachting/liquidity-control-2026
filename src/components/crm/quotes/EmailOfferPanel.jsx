import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Loader2, Mail, Copy, CheckCircle2, Eye, Pencil } from 'lucide-react';
import { toPlainText, copyFormatted } from '@/components/crm/quotes/emailBodyFormat';
import EmailBodyPreview from '@/components/crm/quotes/EmailBodyPreview';

const eur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(v || 0);

// Freigabe-Stopp des E-Mail-Angebots: Mailtext lesen, bearbeiten, freigeben.
// Bei Freigabe: status='sent', Aktivität am Deal, Deal-Phase wechseln, Mail öffnen oder kopieren.
export default function EmailOfferPanel({ quote, onUpdated }) {
  const [body, setBody] = useState(quote.email_body || '');
  const [to, setTo] = useState(quote.contact_email || '');
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(true);
  const [mailHint, setMailHint] = useState(false);
  const [hintNet, setHintNet] = useState(0);

  useEffect(() => {
    base44.entities.Setting.filter({ key: 'email_offer_hint_net' })
      .then(r => setHintNet(parseFloat(r[0]?.value ?? '5000') || 0))
      .catch(() => {});
  }, []);

  const isSent = ['sent', 'accepted', 'declined', 'expired'].includes(quote.status);
  const subject = `Angebot — ${quote.title}`;

  const release = async () => {
    await base44.entities.CrmQuote.update(quote.id, {
      email_body: body,
      contact_email: to.trim(),
      status: 'sent',
      sent_at: new Date().toISOString(),
    });
    if (quote.deal_id) {
      const deal = await base44.entities.CrmDeal.get(quote.deal_id).catch(() => null);
      if (deal) {
        await base44.entities.CrmActivity.create({
          deal_id: deal.id,
          activity_type: 'email',
          title: `E-Mail-Angebot freigegeben — ${quote.title} (${eur(quote.total_net)} netto)`,
          content: body,
          activity_date: new Date().toISOString(),
        });
        await base44.entities.CrmDeal.update(deal.id, {
          stage: deal.pipeline === 'existing_customer' ? 'estimated' : 'proposal_sent',
        }).catch(() => {});
      }
    }
    onUpdated?.();
  };

  // mailto kann kein HTML — deshalb: sauberer Klartext in die Mail,
  // formatierte Fassung parallel in die Zwischenablage (einfach einfügen).
  const openMail = async () => {
    setWorking(true);
    if (!isSent) await release();
    await copyFormatted(body).catch(() => {});
    setWorking(false);
    setMailHint(true);
    window.location.href = `mailto:${to.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(toPlainText(body))}`;
  };

  const copyText = async () => {
    setWorking(true);
    if (!isSent) await release();
    await copyFormatted(body);
    setWorking(false);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const showHint = hintNet > 0 && (quote.total_net || 0) > hintNet;

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Mail className="w-4 h-4 text-amber-600" />
          E-Mail-Angebot
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isSent ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-700'}`}>
            {isSent ? 'Freigegeben ✓' : 'Zur Freigabe'}
          </span>
          {quote.valid_until && (
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              Gültig bis {new Date(quote.valid_until).toLocaleDateString('de-AT')}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {showHint && !isSent && (
          <p className="text-xs bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-amber-800">
            Größerer Betrag — Kurzform mit Dokument erwägen.
          </p>
        )}
        {/* Ohne Adressat öffnet das Mailprogramm ins Leere — deshalb Pflichtfeld */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold w-8 shrink-0">An</label>
          <Input
            type="email"
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="empfaenger@firma.at"
            className={`h-8 text-sm ${!to.trim() ? 'border-amber-300' : ''}`}
          />
        </div>
        <div className="flex items-center justify-end">
          <button
            onClick={() => setPreview(p => !p)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          >
            {preview ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {preview ? 'Bearbeiten' : 'Vorschau'}
          </button>
        </div>
        {preview ? (
          <EmailBodyPreview body={body} />
        ) : (
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            className="text-sm min-h-[320px] font-mono"
            placeholder="Mailtext…"
          />
        )}
        {mailHint && (
          <p className="text-xs bg-sky-50 border border-sky-200 rounded-md px-3 py-2 text-sky-800">
            Die formatierte Fassung liegt in der Zwischenablage — im Mailprogramm den Text markieren und mit Einfügen (Cmd/Strg+V) ersetzen, um Hervorhebungen zu erhalten.
          </p>
        )}
        {(quote.excluded || []).length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-muted-foreground">Nicht enthalten:</span>
            {quote.excluded.map((x, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{x}</span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Summe: <span className="font-semibold text-foreground">{eur(quote.total_net)}</span> netto · {eur(quote.total_gross)} brutto
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={copyText} disabled={working || !body.trim()} className="gap-2">
              {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Kopiert' : isSent ? 'Text kopieren' : 'Freigeben & kopieren'}
            </Button>
            <Button onClick={openMail} disabled={working || !body.trim() || !to.trim()} className="gap-2">
              {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {isSent ? 'Mail öffnen' : 'Freigeben & Mail öffnen'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}