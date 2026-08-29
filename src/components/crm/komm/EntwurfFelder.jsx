import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import FeldTitel from './FeldTitel';

// Der Entwurf selbst — Empfänger, Betreff, Text. Alles frei bearbeitbar.
export default function EntwurfFelder({ to, setTo, subject, setSubject, body, setBody }) {
  return (
    <div className="mt-4 pt-4 border-t border-dashed border-border space-y-2.5">
      <div>
        <FeldTitel>Empfänger</FeldTitel>
        <Input value={to} onChange={(e) => setTo(e.target.value)} className="h-9 text-[13px]" />
        {!to && <p className="text-xs text-muted-foreground mt-1">Keine E-Mail-Adresse am Kontakt hinterlegt.</p>}
      </div>
      <div>
        <FeldTitel>Betreff</FeldTitel>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 text-[13px]" />
      </div>
      <div>
        <FeldTitel>Text — frei bearbeitbar</FeldTitel>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-[230px] text-[13.5px] leading-7 whitespace-pre-wrap resize-y"
        />
      </div>
    </div>
  );
}