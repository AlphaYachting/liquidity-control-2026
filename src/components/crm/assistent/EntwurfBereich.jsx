import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Send } from 'lucide-react';
import VoiceFeedbackInput from '@/components/crm/emails/VoiceFeedbackInput';

const TITEL = { a: 'Variante A — kompakt und direkt', b: 'Variante B — ausführlich und beratend' };

// Varianten, Entwurf, Änderungswunsch und Abschlusszeile.
export default function EntwurfBereich({
  varianten, gewaehlt, onWaehlen, kontext, letztesFeedback,
  to, setTo, subject, setSubject, body, setBody,
  wunsch, setWunsch, onNeu, busy, onVerwerfen, onOeffnen,
}) {
  return (
    <div className="mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {['a', 'b'].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onWaehlen(k)}
            className={`text-left rounded-lg border p-3 relative overflow-hidden transition-colors ${
              gewaehlt === k ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
            }`}
          >
            {gewaehlt === k && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />}
            <p className="text-[11.5px] font-semibold text-primary mb-1.5">{TITEL[k]}</p>
            <p className="text-[11.5px] text-muted-foreground whitespace-pre-wrap line-clamp-6">{varianten[k]}</p>
          </button>
        ))}
      </div>

      {kontext?.length > 0 && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">Verwendet: {kontext.join(' · ')}</p>
      )}

      <div className="mt-3 space-y-2">
        <div>
          <Label className="text-[11.5px] font-medium text-muted-foreground">Empfänger</Label>
          <Input value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9 text-[13px]" />
        </div>
        <div>
          <Label className="text-[11.5px] font-medium text-muted-foreground">Betreff</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 h-9 text-[13px]" />
        </div>
        <div>
          <Label className="text-[11.5px] font-medium text-muted-foreground">Text</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-1 min-h-[230px] text-sm leading-7 whitespace-pre-wrap"
          />
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <p className="text-[11.5px] font-medium text-muted-foreground">Änderungswunsch — optional</p>
        <VoiceFeedbackInput
          value={wunsch}
          onChange={setWunsch}
          placeholder="z. B. Ton verbindlicher, Termine deutlicher hervorheben"
          disabled={busy}
        />
        <Button size="sm" variant="secondary" onClick={onNeu} disabled={busy || !wunsch.trim()} className="gap-2">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Mit Änderungswunsch neu erzeugen
        </Button>
        {letztesFeedback && (
          <p className="text-[11.5px] text-muted-foreground">Feedback berücksichtigt: „{letztesFeedback}"</p>
        )}
      </div>

      <div className="mt-3.5 pt-3.5 border-t border-border flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onVerwerfen}>Verwerfen</Button>
        <Button onClick={onOeffnen} disabled={!to || !subject || !body} className="bg-primary text-primary-foreground gap-2">
          <Send className="w-[15px] h-[15px]" /> Im E-Mail-Programm öffnen
        </Button>
      </div>
    </div>
  );
}