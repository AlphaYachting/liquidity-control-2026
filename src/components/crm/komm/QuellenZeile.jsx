import React from 'react';
import { Link } from 'react-router-dom';

// Woraus der Entwurf entsteht — sichtbar, bevor etwas erzeugt wird.
// Mit Thread führt die Zeile auch in den vollständigen E-Mail-Verlauf.
export default function QuellenZeile({ hatThread, name, anzahl, threadId }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 bg-muted rounded-full px-2.5 py-1 text-[11.5px] text-muted-foreground">
        <span className={`w-[5px] h-[5px] rounded-full ${hatThread ? 'bg-status-done' : 'bg-muted-foreground'}`} />
        {hatThread
          ? `Quelle für den Entwurf: E-Mail-Verlauf mit ${name || 'dem Kontakt'}${anzahl ? ` (${anzahl} Nachrichten)` : ''}`
          : 'Kein E-Mail-Verlauf — Quelle: Anfragetext und Verlaufseinträge'}
      </span>
      {hatThread && threadId && (
        <Link to={`/crm/emails?thread=${threadId}`} className="text-xs text-primary hover:underline">
          Verlauf öffnen
        </Link>
      )}
    </div>
  );
}