import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, PenLine, Mail, Copy, Check } from 'lucide-react';

// KI-generierter Antwortvorschlag: editierbar, öffnet im eigenen E-Mail-Programm (mailto).
export default function ReplyDraftPanel({ thread, messages }) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const lastInbound = messages.find((m) => m.direction === 'in') || messages[0];
  const recipient = lastInbound?.from || '';

  const generate = async () => {
    setBusy(true); setError(null);
    try {
      const convo = messages
        .slice(0, 10)
        .map((m) => `[${m.direction === 'in' ? 'KUNDE' : m.direction === 'out' ? 'WIR' : 'INTERN'}] ${m.from_name || m.from} (${m.received_at}):\n${(m.text || m.preview || '').slice(0, 2500)}`)
        .join('\n\n---\n\n');
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Du bist Mitarbeiter der Digitalagentur Rittler & Co (Österreich). Verfasse eine professionelle, freundliche Antwort-E-Mail auf Deutsch (per Sie) auf die folgende Kundenkonversation. Gehe konkret auf das letzte Anliegen des Kunden ein, ohne etwas zu erfinden oder Zusagen zu machen, die nicht aus der Konversation hervorgehen. Kurz und präzise (max. 150 Wörter). Nur den E-Mail-Text ausgeben — keine Betreffzeile, keine Signatur außer "Beste Grüße\nIhr Team von Rittler & Co".

BETREFF: ${thread.subject || '—'}
KUNDE: ${thread.customer || '—'}

KONVERSATION (neueste zuerst):
"""
${convo}
"""`,
      });
      setDraft(typeof res === 'string' ? res : '');
    } catch (e) {
      setError('Vorschlag fehlgeschlagen: ' + (e?.message || ''));
    }
    setBusy(false);
  };

  const mailtoHref = `mailto:${recipient}?subject=${encodeURIComponent('Re: ' + (thread.subject || ''))}&body=${encodeURIComponent(draft)}`;

  const copyDraft = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <PenLine className="w-3.5 h-3.5 text-primary" /> Antwortvorschlag
        </p>
        <Button size="sm" variant="outline" onClick={generate} disabled={busy || !messages.length} className="gap-2">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />}
          {busy ? 'Erstellt…' : draft ? 'Neu vorschlagen' : 'Antwort vorschlagen'}
        </Button>
      </div>

      {draft && (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            className="text-xs leading-relaxed"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] text-muted-foreground truncate">An: {recipient || '—'}</p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={copyDraft} className="gap-2">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Kopiert' : 'Kopieren'}
              </Button>
              <Button size="sm" asChild className="gap-2">
                <a href={mailtoHref}><Mail className="w-3.5 h-3.5" /> Im E-Mail-Programm öffnen</a>
              </Button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}