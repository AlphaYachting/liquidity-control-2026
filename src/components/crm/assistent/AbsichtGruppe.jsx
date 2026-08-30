import React from 'react';
import { ABSICHTEN } from './assistentConfig';

const NUR_MIT_ANGEBOT = ['angebot', 'nachfassen', 'besprechung'];

// Geschlossene Schaltergruppe, eine Zeile, zieht sich auf ihren Inhalt.
export default function AbsichtGruppe({ value, onChange, angebotVorhanden }) {
  const sichtbar = ABSICHTEN.filter((a) => angebotVorhanden || !NUR_MIT_ANGEBOT.includes(a.key));

  return (
    <div className="flex items-center gap-2">
      <div
        className="inline-flex w-fit max-w-full border border-input rounded-lg overflow-hidden overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {sichtbar.map(({ key, label }, i) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`h-[30px] px-3.5 text-[12.5px] whitespace-nowrap transition-colors ${i > 0 ? 'border-l border-input' : ''} ${
              value === key ? 'bg-foreground text-background' : 'bg-transparent hover:bg-accent'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {!angebotVorhanden && (
        <span className="text-xs text-muted-foreground">
          Angebotsbezogene Absichten erscheinen, sobald ein Angebot verknüpft oder übermittelt ist.
        </span>
      )}
    </div>
  );
}