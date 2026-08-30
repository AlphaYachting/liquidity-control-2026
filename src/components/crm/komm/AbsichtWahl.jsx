import React from 'react';
import FeldTitel from './FeldTitel';
import { ABSICHTEN } from './kommConfig';

// Eine geschlossene Schaltergruppe: die Reihe liest sich als EINE Auswahl.
// Nicht mögliche Absichten erscheinen gar nicht — ein Satz erklärt, wann sie kommen.
export default function AbsichtWahl({ value, onChange, ausgeblendet = [], hinweis }) {
  const sichtbar = ABSICHTEN.filter((a) => !ausgeblendet.includes(a.key));
  return (
    <div>
      <FeldTitel>Was soll geschehen?</FeldTitel>
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
              className={`h-[30px] px-3.5 text-[12.5px] whitespace-nowrap transition-colors duration-[120ms] ${
                i > 0 ? 'border-l border-input' : ''
              } ${
                value === key
                  ? 'bg-foreground text-background font-semibold'
                  : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {hinweis && <span className="text-[11.5px] text-muted-foreground">{hinweis}</span>}
      </div>
    </div>
  );
}