import React from 'react';

// Woraus der Entwurf entsteht — sichtbar, bevor etwas erzeugt wird.
export default function QuellenZeile({ hatThread, name, anzahl }) {
  return (
    <div className="inline-flex items-center gap-1.5 mt-2.5 bg-muted rounded-full px-2.5 py-1 text-[11.5px] text-muted-foreground">
      <span className={`w-[5px] h-[5px] rounded-full ${hatThread ? 'bg-status-done' : 'bg-muted-foreground'}`} />
      {hatThread
        ? `Quelle für den Entwurf: E-Mail-Verlauf mit ${name || 'dem Kontakt'}${anzahl ? ` (${anzahl} Nachrichten)` : ''}`
        : 'Kein E-Mail-Verlauf — Quelle: Anfragetext und Verlaufseinträge'}
    </div>
  );
}