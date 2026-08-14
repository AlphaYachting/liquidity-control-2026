import React from 'react';

// Einheitliche Inhaltskarte (Ebene 3): Symbol + Titel, Aktion rechts, Trennlinie, Inhalt.
export default function Sektion({ titel, symbol: Symbol, aktion, children }) {
  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {Symbol && <Symbol className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">{titel}</p>
        </div>
        {aktion && <div className="flex-shrink-0">{aktion}</div>}
      </div>
      <div className="border-t border-border" />
      {children}
    </div>
  );
}