import React from 'react';

const TITEL = {
  a: 'Variante A — kompakt und direkt',
  b: 'Variante B — ausführlich und beratend',
};

// Zwei Varianten zur Auswahl — gleicher Inhalt, andere Länge und Haltung.
export default function VariantenWahl({ varianten, gewaehlt, onWaehlen, feedback }) {
  return (
    <div className="mt-4 grid gap-2.5 grid-cols-1 sm:grid-cols-2">
      {['a', 'b'].map((k) => {
        const aktiv = gewaehlt === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onWaehlen(k)}
            style={aktiv ? { boxShadow: 'inset 3px 0 0 hsl(var(--primary))' } : undefined}
            className={`text-left border rounded-lg p-3 transition-colors duration-[120ms] ${
              aktiv ? 'border-primary bg-primary/5' : 'border-input hover:border-primary'
            }`}
          >
            <p className="text-[11.5px] font-semibold text-primary mb-1.5">
              {TITEL[k]}{feedback ? ' · überarbeitet' : ''}
            </p>
            {feedback && (
              <p className="text-[11.5px] text-status-done-text mb-1.5">Feedback berücksichtigt: „{feedback}"</p>
            )}
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-6">
              {varianten[k]}
            </p>
          </button>
        );
      })}
    </div>
  );
}