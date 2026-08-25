import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronRight, CalendarClock } from 'lucide-react';

// Aufklappbarer Bereich für eine Zusage mit Frist — Vorschläge bleiben korrigierbar
export default function KundenaktZusageFelder({
  offen, onToggle, text, onTextChange, datum, onDatumChange, disabled,
}) {
  return (
    <div className="rounded border">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors">
        {offen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <CalendarClock className="w-3.5 h-3.5 text-muted-foreground" />
        Zusage
        {!offen && text && <span className="text-muted-foreground truncate font-normal">— {text}</span>}
      </button>
      {offen && (
        <div className="px-3 pb-3 space-y-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">Was wurde zugesagt</Label>
            <Input value={text} onChange={(e) => onTextChange(e.target.value)} disabled={disabled}
              placeholder="z. B. Entwurf der Startseite wird geliefert" className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Bis wann</Label>
            <Input type="date" value={datum} onChange={(e) => onDatumChange(e.target.value)}
              disabled={disabled} className="mt-1 h-8 text-xs" />
          </div>
        </div>
      )}
    </div>
  );
}