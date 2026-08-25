import React from 'react';
import { PenLine } from 'lucide-react';

// Zweiter Einstieg im leeren Panel — der Nutzer wählt den Weg selbst.
export default function ProjektupdateEinstieg({ onStart }) {
  return (
    <div className="space-y-3">
      <button onClick={onStart}
        className="block w-full text-left px-3 py-2.5 rounded-xl border bg-card hover:bg-muted transition-colors">
        <span className="flex items-center gap-2 text-sm font-medium">
          <PenLine className="w-4 h-4 text-primary" /> Projektupdate festhalten
        </span>
        <span className="block mt-1 text-xs text-muted-foreground">
          Erzähl, was passiert ist — ich formuliere daraus einen Eintrag für den Kundenakt.
        </span>
      </button>
      <div className="border-t" />
      <p className="text-xs text-muted-foreground">oder eine Frage stellen:</p>
    </div>
  );
}