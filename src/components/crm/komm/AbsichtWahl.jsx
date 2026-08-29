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
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap border border-input rounded-lg overflow-hidden">
          {sichtbar.map(({ key, label }, i) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`h-[30px] px-3.5 text-[12.5px] border-0 transition-colors duration-[120ms] ${
                i < sichtbar.length - 1 ? 'border-r border-input' : ''
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