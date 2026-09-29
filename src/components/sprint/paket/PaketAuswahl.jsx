import React, { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { kurzinfo } from './paketZaehler';

// Linke Spalte: nur auswählen.
export default function PaketAuswahl({ modules, templates, projektTyp, vorhanden, gewaehlt, onToggle }) {
  const [alle, setAlle] = useState(false);
  const istContainer = projektTyp === 'container';
  const model = projektTyp === 'support' ? 'support' : 'container';
  const standard = modules.filter((m) => m.vorausgewaehlt);
  const leistungen = modules.filter((m) => !m.vorausgewaehlt && m.default_arbeitsmodell === model);
  const weitere = modules.filter((m) => !standard.includes(m) && !leistungen.includes(m));

  const zeile = (m) => {
    const imProjekt = vorhanden.includes(m.id);
    return (
      <label key={m.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
        <Checkbox checked={imProjekt || gewaehlt.includes(m.id)} disabled={imProjekt} onCheckedChange={() => onToggle(m.id)} />
        <span className="flex-1 min-w-0 truncate">{m.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">{imProjekt ? 'im Projekt' : kurzinfo(m.id, templates, istContainer)}</span>
      </label>
    );
  };
  const gruppe = (titel, liste) => liste.length > 0 && (
    <div className="mb-3">
      <p className="text-xs text-muted-foreground mb-1">{titel}</p>
      {liste.map(zeile)}
    </div>
  );

  return (
    <div className="min-[900px]:sticky min-[900px]:top-4">
      {gruppe('Standard', standard)}
      {gruppe('Leistungen', leistungen)}
      {alle ? gruppe('Weitere Module', weitere) : weitere.length > 0 && (
        <button type="button" onClick={() => setAlle(true)} className="text-xs text-muted-foreground hover:text-foreground underline">
          Weitere Module anzeigen
        </button>
      )}
    </div>
  );
}