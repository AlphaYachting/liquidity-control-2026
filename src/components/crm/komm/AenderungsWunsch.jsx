import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Mic } from 'lucide-react';
import useSpracheingabe from '@/lib/useSpracheingabe';
import FeldTitel from './FeldTitel';

// Änderungswunsch schriftlich oder diktiert — der Entwurf wird verbindlich überarbeitet.
export default function AenderungsWunsch({ value, onChange, onSubmit, disabled }) {
  const { supported, listening, start, stop } = useSpracheingabe(onChange);

  return (
    <div className="mt-4 pt-4 border-t border-dashed border-border">
      <FeldTitel>Änderungswunsch — schriftlich oder diktiert</FeldTitel>
      <div className="flex gap-2 items-center">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="z. B. verbindlicher im Ton, Starttermin Oktober erwähnen"
          className="h-9 flex-1 text-[13px]"
        />
        {supported && (
          <button
            type="button"
            onClick={() => (listening ? stop() : start(value))}
            className={`w-[34px] h-[34px] shrink-0 rounded-lg border border-input flex items-center justify-center transition-colors duration-[120ms] ${
              listening ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:border-primary'
            }`}
          >
            <Mic className="w-[15px] h-[15px]" />
          </button>
        )}
      </div>
      {listening && <p className="text-xs text-primary mt-1">Aufnahme läuft — sprechen Sie jetzt.</p>}
      <Button variant="outline" size="sm" onClick={onSubmit} disabled={disabled || !value.trim()} className="mt-2">
        Mit Änderungswunsch neu erzeugen
      </Button>
    </div>
  );
}