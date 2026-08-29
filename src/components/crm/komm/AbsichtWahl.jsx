import React from 'react';
import FeldTitel from './FeldTitel';
import { ABSICHTEN } from './kommConfig';

// Absichten als Knopfreihe — gewählt ist dunkel, nicht pink: Pink bleibt der Hauptaktion.
export default function AbsichtWahl({ value, onChange, gesperrt = {} }) {
  return (
    <div>
      <FeldTitel>Was soll geschehen?</FeldTitel>
      <div className="flex flex-wrap gap-1.5">
        {ABSICHTEN.map(({ key, label, icon: Icon }) => {
          const grund = gesperrt[key];
          const aktiv = value === key;
          return (
            <button
              key={key}
              type="button"
              title={grund || undefined}
              disabled={Boolean(grund)}
              onClick={() => onChange(key)}
              className={`h-8 px-3 text-[12.5px] rounded-lg border inline-flex items-center gap-1.5 transition-colors duration-[120ms] ${
                aktiv
                  ? 'bg-foreground text-background font-semibold border-foreground'
                  : 'bg-transparent border-input text-muted-foreground hover:border-primary hover:text-foreground'
              } ${grund ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Icon className="w-[14px] h-[14px]" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}