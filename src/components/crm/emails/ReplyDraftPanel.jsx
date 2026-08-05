import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, PenLine, Mail, Copy, Check, RefreshCw } from 'lucide-react';
import VoiceFeedbackInput from '@/components/crm/emails/VoiceFeedbackInput';

// KI-Antwortvorschläge: zwei Varianten, Feedback per Text/Sprache, Öffnen im E-Mail-Programm.
export default function ReplyDraftPanel({ thread, messages }) {
  const [busy, setBusy] = useState(false);
  const [variants, setVariants] = useState(null); // [{label, text}]
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const lastInbound = messages.find((m) => m.direction === 'in') || messages[0];
  const recipient = lastInbound?.from || '';

  const generate = async (withFeedback = false) => {
    setBusy(true); setError(null);
    try {
      const convo = messages
        .slice(0, 10)
        .map((m) => `[${m.direction === 'in' ? 'KUNDE' : m.direction === 'out' ? 'WIR' : 'INTERN'}] ${m.from_name || m.from} (${m.received_at}):\n${(m.text || m.preview || '').slice(0, 2500)}`)
        .join('\n\n---\n\n');
      const feedbackBlock = withFeedback && feedback.trim()
        ? `\n\nWICHTIG — FEEDBACK DES MITARBEITERS zu den bisherigen Entwürfen (verbindlich umsetzen):\n"""${feedback.trim()}"""\n\nBisheriger Entwurf Variante A:\n"""${variants?.[0]?.text || ''}"""\nBisheriger Entwurf Variante B:\n"""${variants?.[1]?.text || ''}"""`
        : '';
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Du bist Mitarbeiter der Digitalagentur Rittler & Co (Österreich). Verfasse ZWEI unterschiedliche professionelle Antwort-E-Mails auf Deutsch (per Sie) auf die folgende Kundenkonversation. Gehe konkret auf das letzte Anliegen des Kunden ein, ohne etwas zu erfinden oder Zusagen zu machen, die nicht aus der Konversation hervorgehen.
- Variante A: kurz, direkt und lösungsorientiert (max. 100 Wörter)
- Variante B: ausführlicher, verbindlich und beziehungsorientiert (max. 180 Wörter)
Jeweils nur den E-Mail-Text — keine Betreffzeile, Signatur nur "Beste Grüße\nIhr Team von Rittler & Co".

BETREFF: ${thread.subject || '—'}
KUNDE: ${thread.customer || '—'}

KONVERSATION (neueste zuerst):
"""
${convo}
"""${feedbackBlock}`,
        response_json_schema: {
          type: 'object',
          properties: {
            variant_a: { type: 'string', description: 'Kurze, direkte Antwort' },
            variant_b: { type: 'string', description: 'Ausführliche, verbindliche Antwort' },
          },
          required: ['variant_a', 'variant_b'],
        },
      });
      const next = [
        { label: 'Variante A — kurz & direkt', text: res.variant_a || '' },
        { label: 'Variante B — ausführlich', text: res.variant_b || '' },
      ];
      setVariants(next);
      setSelected(0);
      setDraft(next[0].text);
    } catch (e) {
      setError('Vorschlag fehlgeschlagen: ' + (e?.message || ''));
    }
    setBusy(false);
  };

  const pick = (i) => { setSelected(i); setDraft(variants[i].text); };

  const mailtoHref = `mailto:${recipient}?subject=${encodeURIComponent('Re: ' + (thread.subject || ''))}&body=${encodeURIComponent(draft)}`;

  // Beim Öffnen im Mailprogramm den Entwurf in der Deal-Historie protokollieren,
  // sofern der Thread mit einem Deal verknüpft ist.
  const openInMail = async () => {
    if (thread.crm_deal_id) {
      await base44.entities.CrmActivity.create({
        deal_id: thread.crm_deal_id,
        activity_type: 'email',
        title: `Antwortentwurf an ${recipient} — Re: ${thread.subject || ''}`,
        content: draft,
        activity_date: new Date().toISOString(),
      }).catch(() => {});
    }
    window.location.href = mailtoHref;
  };

  const copyDraft = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <PenLine className="w-3.5 h-3.5 text-primary" /> Antwortvorschläge
        </p>
        <Button size="sm" variant="outline" onClick={() => generate(false)} disabled={busy || !messages.length} className="gap-2">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />}
          {busy ? 'Erstellt…' : variants ? 'Neu vorschlagen' : '2 Antworten vorschlagen'}
        </Button>
      </div>

      {variants && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {variants.map((v, i) => (
              <button
                key={i}
                type="button"
                onClick={() => pick(i)}
                className={`text-left rounded-lg border p-2.5 transition-colors ${selected === i ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent'}`}
              >
                <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                  {selected === i && <Check className="w-3 h-3 text-primary" />}
                  {v.label}
                </p>
                <p className="text-[11px] text-muted-foreground whitespace-pre-wrap line-clamp-6">{v.text}</p>
              </button>
            ))}
          </div>

          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            className="text-xs leading-relaxed"
          />

          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Feedback zur Antwort (Text oder Spracheingabe)</p>
            <VoiceFeedbackInput
              value={feedback}
              onChange={setFeedback}
              placeholder="z.B. Bitte Liefertermin nächste Woche erwähnen, Ton etwas verbindlicher…"
              disabled={busy}
            />
            {feedback.trim() && (
              <Button size="sm" variant="secondary" onClick={() => generate(true)} disabled={busy} className="gap-2">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Mit Feedback neu generieren
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] text-muted-foreground truncate">An: {recipient || '—'}</p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={copyDraft} className="gap-2">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Kopiert' : 'Kopieren'}
              </Button>
              <Button size="sm" onClick={openInMail} className="gap-2">
                <Mail className="w-3.5 h-3.5" /> Im E-Mail-Programm öffnen
              </Button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}