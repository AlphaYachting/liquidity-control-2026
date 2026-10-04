import React from 'react';
import { fmtH, fmtEUR } from '@/lib/auslastung/auslastungRechnung';

function Feld({ label, wert }) {
  return (
    <div className="bg-white rounded border border-border p-4">
      <p className="text-label uppercase text-muted-foreground">{label}</p>
      <p className="text-kpi mt-1">{wert}</p>
    </div>
  );
}

export default function AuslastungKennzahlen({ gesamt }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Feld label="Geschätzte Reststunden" wert={`${fmtH(gesamt.rest)} h`} />
      <Feld label="Tickets ohne Schätzung" wert={gesamt.ohne} />
      <Feld label="Hochrechnung" wert={`${fmtH(gesamt.hoch)} h`} />
      <Feld label="Anteil geschätzt" wert={`${Math.round(gesamt.anteil * 100)} %`} />
      <Feld label="Fixprojekte: Rest × 120 €" wert={fmtEUR(gesamt.deckung.restWert)} />
      <Feld label="Fixprojekte: noch abrechenbar" wert={fmtEUR(gesamt.deckung.abrechenbar)} />
    </div>
  );
}